# =============================================================
# mqtt_client.py — MQTT subscriber and packet ingestion pipeline
#
# Receives telemetry from HiveMQ Cloud, verifies HMAC,
# computes scores, stores records, runs breach state machine.
#
# This is the heart of the backend data pipeline.
# Every verified packet flows through ingest_verified_packet().
# =============================================================

import json
import time
import ssl
import paho.mqtt.client as mqtt_lib
from database      import get_conn
from config        import (MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS,
                            DEVICE_ID, PROFILES)
from security      import verify_hmac, compute_record_hash, get_previous_hash
from scoring       import compute_condition_score, compute_integrity_score
from session       import (get_active_session, buffer_pending,
                            get_is_state, update_is_state)
import breach
import notifications

# Shared MQTT client instance — used by api.py for config pushes
_mqtt_client: mqtt_lib.Client = None


# ----------------------------------------------------------
# MQTT callbacks
# ----------------------------------------------------------

def _on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] Connected to HiveMQ Cloud.")
        client.subscribe("omni/+/telemetry", qos=1)
        client.subscribe("omni/+/heartbeat", qos=0)
        print("[MQTT] Subscribed to omni/+/telemetry and omni/+/heartbeat")
    else:
        print(f"[MQTT] Connection failed with code {rc}")


def _on_disconnect(client, userdata, rc):
    if rc != 0:
        print(f"[MQTT] Unexpected disconnect (rc={rc}). Paho will auto-reconnect.")


def _on_message(client, userdata, msg):
    topic   = msg.topic
    payload = msg.payload.decode("utf-8", errors="replace")

    if topic.endswith("/heartbeat"):
        # Just log heartbeats — no processing needed
        print(f"[MQTT] Heartbeat: {payload[:80]}")
        return

    if topic.endswith("/telemetry"):
        _handle_telemetry(payload)


def _handle_telemetry(raw: str) -> None:
    """
    Full ingestion pipeline for one MQTT telemetry message.
 
    1. Parse outer JSON envelope {payload, hmac}
    2. Verify HMAC
    3. Route to active session or pending buffer
    4. Store and score
    """
    received_at = int(time.time())

    # --- Step 1: Parse envelope ---
    try:
        envelope     = json.loads(raw)
        payload_str  = envelope.get("payload")
        received_hmac = envelope.get("hmac", "")

        if not payload_str or not received_hmac:
            raise ValueError("Missing payload or hmac field")

        # Reconstruct canonical payload string exactly as ESP built it
        payload_obj = json.loads(payload_str)
        device_id = payload_obj.get("device_id", "UNKNOWN")

    except Exception as e:
        print(f"[MQTT] Malformed message, discarding: {e}")
        return

    # --- Step 2: Verify HMAC ---
    if not verify_hmac(payload_str, received_hmac):
        print(f"[MQTT] HMAC FAILED for device {device_id} — storing as rejected")
        _store_rejected(received_at, device_id, payload_str, received_hmac)
        notifications.alert_hmac_rejected(device_id, received_hmac)
        return

    print(f"[MQTT] HMAC OK | device={device_id} seq={payload_obj.get('seq')}")

    # --- Step 3: Route to session or buffer ---
    session_id = get_active_session(device_id)
    if not session_id:
        print(f"[MQTT] No active session for {device_id} — buffering packet")
        buffer_pending(device_id, {
            "payload_obj":  payload_obj,
            "payload_str":  payload_str,
            "received_hmac": received_hmac,
            "received_at":  received_at,
        })
        return

    # --- Step 4: Ingest ---
    ingest_verified_packet(session_id, {
        "payload_obj":   payload_obj,
        "payload_str":   payload_str,
        "received_hmac": received_hmac,
        "received_at":   received_at,
    })


def ingest_verified_packet(session_id: str, packet: dict) -> None:
    """
    Store a verified packet, compute CS/IS, run breach state machine.
    Called both from _handle_telemetry and from session._drain_pending.
    """
    payload_obj   = packet["payload_obj"]
    payload_str   = packet["payload_str"]
    received_hmac = packet["received_hmac"]
    received_at   = packet.get("received_at", int(time.time()))

    conn = get_conn()

    # Retrieve profile for this session
    row = conn.execute(
        "SELECT profile FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()
    profile = row["profile"] if row else "vaccine"

    # Extract sensor values
    temp     = float(payload_obj.get("temp",     20.0))
    humidity = float(payload_obj.get("humidity", 50.0))
    ax       = float(payload_obj.get("ax",       0.0))
    ay       = float(payload_obj.get("ay",       0.0))
    az       = float(payload_obj.get("az",       1.0))
    g_net    = float(payload_obj.get("g_net",    0.0))
    dist_cm  = int(payload_obj.get("dist",       0))
    tamper   = bool(payload_obj.get("tamper",    False))
    lat      = float(payload_obj.get("lat",      0.0))
    lng      = float(payload_obj.get("lng",      0.0))
    gps_fix  = bool(payload_obj.get("gps_fix",   False))
    seq      = int(payload_obj.get("seq",        0))
    ts       = int(payload_obj.get("ts",         received_at))
    device_id = payload_obj.get("device_id", "UNKNOWN")

    # --- Compute Condition Score ---
    cs = compute_condition_score(temp, humidity, g_net, tamper, profile)

    # --- Update Integrity Score state ---
    update_is_state(session_id, cs)
    state    = get_is_state(session_id)
    is_score = compute_integrity_score(
        state["min_cs"], state["sum_cs"], state["count"]
    )

    # --- Hash chain ---
    prev_hash   = get_previous_hash(session_id, conn)
    record_hash = compute_record_hash(payload_str, received_hmac, prev_hash)

    # --- Store in telemetry ---
    conn.execute(
        """INSERT INTO telemetry
           (session_id, device_id, seq, ts, received_at,
            temp, humidity, ax, ay, az, g_net, dist_cm, tamper,
            lat, lng, gps_fix, profile,
            cs, is_running, hmac, prev_hash, record_hash)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (session_id, device_id, seq, ts, received_at,
         temp, humidity, ax, ay, az, g_net, dist_cm, int(tamper),
         lat, lng, int(gps_fix), profile,
         cs, is_score, received_hmac, prev_hash, record_hash),
    )
    conn.commit()
    print(f"[INGEST] seq={seq} CS={cs} IS={is_score} | {session_id}")

    # --- Breach event state machine ---
    breach.process_breach_state(
        session_id, device_id, seq, ts,
        temp, humidity, g_net, tamper, cs, profile,
    )

    # --- Publish STATUS back to ESP via MQTT ---
    # The ESP forwards this over hardware UART to the Uno
    # which drives the LED and buzzer accordingly.
    if tamper:
        status = "STATUS:TAMPER"
    elif cs < 70:
        status = f"STATUS:ALERT:{int(cs)}"
    else:
        status = f"STATUS:OK:{int(cs)}"

    if _mqtt_client and _mqtt_client.is_connected():
        _mqtt_client.publish(
            f"omni/{device_id}/status", status, qos=1
        )


def _store_rejected(received_at: int, device_id: str,
                    raw_payload: str, received_hmac: str) -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO rejected_packets
           (received_at, device_id, raw_payload, received_hmac, reason)
           VALUES (?, ?, ?, ?, 'HMAC_MISMATCH')""",
        (received_at, device_id, raw_payload, received_hmac),
    )
    conn.commit()


# ----------------------------------------------------------
# Client setup — called from main.py file
# ----------------------------------------------------------

def build_mqtt_client() -> mqtt_lib.Client:
    """
    Build, configure, and return the MQTT client.
    Does NOT call connect() — main.py does that so the event
    loop can be started in a background thread.
    """
    global _mqtt_client

    client = mqtt_lib.Client(
        client_id="omni_backend_001",
        protocol=mqtt_lib.MQTTv311,
    )
    client.username_pw_set(MQTT_USER, MQTT_PASS)

    # TLS for HiveMQ Cloud (port 8883)
    tls_ctx = ssl.create_default_context()
    client.tls_set_context(tls_ctx)

    client.on_connect    = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message    = _on_message

    _mqtt_client = client
    return client


def get_mqtt_client() -> mqtt_lib.Client:
    """Return the shared MQTT client (used by api.py for publishing)."""
    return _mqtt_client
