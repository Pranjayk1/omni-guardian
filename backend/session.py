# =============================================================
# session.py — Session lifecycle management
#
# The backend owns session IDs — not the device.
# The ESP sends its device_id; the backend finds the active
# session for that device and tags every packet with it.
#
# Pending buffer: packets that arrive before a session is
# started are held for PENDING_BUFFER_SECONDS. If a session
# opens in that window they are retroactively assigned.
# =============================================================

import time
import uuid
from typing import Optional, List, Dict
from database import get_conn
from config   import PENDING_BUFFER_SECONDS


# ----------------------------------------------------------
# In-memory session state
# ----------------------------------------------------------

# device_id → session_id of the currently active session
_active_sessions: Dict[str, str] = {}

# Running IS components per session to avoid full table scans
# session_id → {"min_cs": float, "sum_cs": float, "count": int}
_is_state: Dict[str, dict] = {}

# Pending packet buffer
# List of dicts: {received_at, device_id, raw_packet_data}
_pending_buffer: List[dict] = []


# ----------------------------------------------------------
# Session lookup
# ----------------------------------------------------------

def get_active_session(device_id: str) -> Optional[str]:
    """Return the session_id of the open session for this device, or None."""
    # Check in-memory cache first
    if device_id in _active_sessions:
        return _active_sessions[device_id]

    # Fall back to DB (e.g. after a backend restart)
    conn = get_conn()
    row  = conn.execute(
        "SELECT session_id FROM sessions "
        "WHERE device_id = ? AND is_active = 1 "
        "ORDER BY start_time DESC LIMIT 1",
        (device_id,)
    ).fetchone()

    if row:
        _active_sessions[device_id] = row["session_id"]
        return row["session_id"]
    return None


def restore_is_state(session_id: str) -> None:
    """
    Recompute IS state from the database.
    Called on backend restart so running scores are not lost.
    """
    conn = get_conn()
    rows = conn.execute(
        "SELECT cs FROM telemetry WHERE session_id = ?",
        (session_id,)
    ).fetchall()

    if not rows:
        _is_state[session_id] = {"min_cs": 100.0, "sum_cs": 0.0, "count": 0}
        return

    cs_values = [r["cs"] for r in rows if r["cs"] is not None]
    _is_state[session_id] = {
        "min_cs": min(cs_values) if cs_values else 100.0,
        "sum_cs": sum(cs_values),
        "count":  len(cs_values),
    }


def get_is_state(session_id: str) -> dict:
    if session_id not in _is_state:
        restore_is_state(session_id)
    return _is_state[session_id]


def update_is_state(session_id: str, cs: float) -> None:
    state = get_is_state(session_id)
    state["min_cs"] = min(state["min_cs"], cs)
    state["sum_cs"] += cs
    state["count"]  += 1


# ----------------------------------------------------------
# Session start / end
# ----------------------------------------------------------

def start_session(device_id: str, profile: str = "vaccine",
                  origin: str = None, destination: str = None,
                  recipient: str = None) -> dict:
    """
    Open a new shipment session for a device.
    Closes any previously open session for the same device first.
    Returns the new session dict.
    """
    conn = get_conn()
    ts   = int(time.time())

    # Close any currently open session for this device
    conn.execute(
        "UPDATE sessions SET is_active = 0, end_time = ? "
        "WHERE device_id = ? AND is_active = 1",
        (ts, device_id),
    )

    # Generate a unique session ID
    session_id = "SH-" + uuid.uuid4().hex[:6].upper()

    conn.execute(
        """INSERT INTO sessions
           (session_id, device_id, profile, origin, destination,
            recipient, start_time, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
        (session_id, device_id, profile, origin, destination, recipient, ts),
    )
    conn.commit()

    _active_sessions[device_id]  = session_id
    _is_state[session_id]        = {"min_cs": 100.0, "sum_cs": 0.0, "count": 0}

    # Drain any pending packets for this device into the new session
    _drain_pending(device_id, session_id)

    print(f"[SESSION] Started {session_id} for {device_id} | profile={profile}")
    return {"session_id": session_id, "device_id": device_id,
            "profile": profile, "start_time": ts}


def end_session(session_id: str) -> dict:
    """
    Close a session. Computes and locks the final IS.
    Returns the closed session dict.
    """
    from scoring import compute_integrity_score, acceptance_band
    import breach as breach_mod

    conn = get_conn()
    ts   = int(time.time())

    state    = get_is_state(session_id)
    final_is = compute_integrity_score(
        state["min_cs"], state["sum_cs"], state["count"]
    )
    decision = acceptance_band(final_is)

    conn.execute(
        """UPDATE sessions
           SET is_active = 0, end_time = ?, final_is = ?, decision = ?
           WHERE session_id = ?""",
        (ts, final_is, decision, session_id),
    )
    conn.commit()

    # Close any still-open breach events
    breach_mod.close_all_open_events(session_id, ts)

    # Remove from active map
    row = conn.execute(
        "SELECT device_id FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()
    if row and row["device_id"] in _active_sessions:
        del _active_sessions[row["device_id"]]

    print(f"[SESSION] Ended {session_id} | IS={final_is} | {decision}")
    return {"session_id": session_id, "final_is": final_is, "decision": decision}


# ----------------------------------------------------------
# Pending packet buffer
# ----------------------------------------------------------

def buffer_pending(device_id: str, packet_data: dict) -> None:
    """
    Store a packet in the pending buffer when no active session exists.
    Evict packets older than PENDING_BUFFER_SECONDS automatically.
    """
    now = time.time()
    _pending_buffer.append({
        "received_at": now,
        "device_id":   device_id,
        "data":        packet_data,
    })
    # Evict expired entries
    cutoff = now - PENDING_BUFFER_SECONDS
    _pending_buffer[:] = [p for p in _pending_buffer if p["received_at"] > cutoff]
    print(f"[PENDING] Buffered packet for {device_id}. Buffer size: {len(_pending_buffer)}")


def _drain_pending(device_id: str, session_id: str) -> None:
    """
    When a session opens, retroactively process any buffered packets
    for this device that are still within the time window.
    """
    from mqtt_client import ingest_verified_packet  # local import avoids circular

    to_drain = [
        p for p in _pending_buffer
        if p["device_id"] == device_id
    ]
    if not to_drain:
        return

    print(f"[PENDING] Draining {len(to_drain)} buffered packets into {session_id}")
    for entry in to_drain:
        try:
            ingest_verified_packet(session_id, entry["data"])
        except Exception as e:
            print(f"[PENDING] Failed to drain packet: {e}")

    # Remove drained packets from buffer
    _pending_buffer[:] = [
        p for p in _pending_buffer if p["device_id"] != device_id
    ]
