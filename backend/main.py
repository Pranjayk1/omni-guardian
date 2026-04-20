# =============================================================
# main.py — Omni-Guardian Backend Startup
#
# Run with:  python main.py
#
# This starts two things concurrently:
#   1. MQTT subscriber (paho loop in a background thread)
#   2. FastAPI HTTP server (uvicorn)
#
# Both share the same process and the same in-memory state
# (session cache, IS state, breach state machine, pending buffer).
# =============================================================

import threading
import time
import uvicorn

from database    import init_db
from mqtt_client import build_mqtt_client
from api         import app
from config      import API_HOST, API_PORT, MQTT_HOST, MQTT_PORT
from session     import get_active_session, restore_is_state
from database    import get_conn


def start_mqtt() -> None:
    """
    Connect to HiveMQ Cloud and start the paho network loop
    in a blocking background thread.
    Paho handles reconnection automatically on disconnect.
    """
    client = build_mqtt_client()

    print(f"[MQTT] Connecting to {MQTT_HOST}:{MQTT_PORT} ...")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)

    # loop_forever() blocks this thread and handles reconnections.
    # It runs until the process exits.
    client.loop_forever()


def restore_session_state() -> None:
    """
    On backend restart, reload active sessions and IS state from the DB
    so in-memory state matches reality without data loss.
    """
    conn  = get_conn()
    rows  = conn.execute(
        "SELECT session_id, device_id FROM sessions WHERE is_active = 1"
    ).fetchall()

    if not rows:
        print("[STARTUP] No active sessions found in database.")
        return

    for row in rows:
        print(f"[STARTUP] Restoring session {row['session_id']} "
              f"for device {row['device_id']}")
        restore_is_state(row["session_id"])

    print(f"[STARTUP] Restored {len(rows)} active session(s).")


def main() -> None:
    print("=" * 55)
    print("  OMNI-GUARDIAN BACKEND  v1.0")
    print("=" * 55)

    # 1. Initialise database (creates tables if first run)
    init_db()

    # 2. Restore any active sessions from the database
    restore_session_state()

    # 3. Start MQTT subscriber in a background daemon thread
    mqtt_thread = threading.Thread(target=start_mqtt, daemon=True, name="mqtt-loop")
    mqtt_thread.start()

    # Give MQTT a moment to connect before API starts accepting requests
    time.sleep(2)

    # 4. Start FastAPI with uvicorn
    print(f"\n[API] Starting FastAPI on http://{API_HOST}:{API_PORT}")
    print(f"[API] Interactive docs at http://127.0.0.1:{API_PORT}/docs\n")

    uvicorn.run(
        app,
        host=API_HOST,
        port=API_PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
