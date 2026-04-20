# =============================================================
# api.py — All FastAPI route handlers
#
# Routes are split into logical groups:
#   /session/*   — shipment lifecycle
#   /handoff     — recipient accept/reject
#   /telemetry   — data retrieval for dashboard
#   /verify      — chain verification
#   /config      — remote profile push to device
#   /device/*    — device management (tamper reset)
#   /health      — backend liveness check
#
# Auth: HTTP Basic Auth on all write/sensitive endpoints.
# Read endpoints (dashboard polling) are open — add auth
# before any public deployment.
# =============================================================

import time
import json
import hashlib
import secrets
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from database  import get_conn
from models    import (SessionStartRequest, SessionEndRequest,
                        HandoffRequest, ConfigPushRequest,
                        TamperResetRequest, StatusResponse)
from session   import start_session, end_session, get_active_session
from security  import verify_chain
from scoring   import compute_integrity_score, acceptance_band, compute_condition_score
from config    import PROFILES


# ----------------------------------------------------------
# App setup
# ----------------------------------------------------------

app = FastAPI(
    title="Omni-Guardian Backend",
    description="Blockchain-Enabled IoT Medicine & Asset Transit Shield",
    version="1.0.0",
)

# CORS — allow all origins during development.
# Restrict to your laptop IP or dashboard domain before demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP Basic Auth
security = HTTPBasic()
ADMIN_USER = "admin"
ADMIN_PASS = "omni2024"   # change before demo

def require_auth(credentials: HTTPBasicCredentials = Depends(security)):
    user_ok = secrets.compare_digest(credentials.username, ADMIN_USER)
    pass_ok = secrets.compare_digest(credentials.password, ADMIN_PASS)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Unauthorised")
    return credentials


# ----------------------------------------------------------
# Health
# ----------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "ts": int(time.time())}


# ----------------------------------------------------------
# Sessions
# ----------------------------------------------------------

@app.post("/session/start", dependencies=[Depends(require_auth)])
def api_start_session(req: SessionStartRequest):
    """
    Start a new shipment session for a device.
    The backend assigns a unique session_id — the device does not.
    """
    if req.profile not in PROFILES:
        raise HTTPException(400, f"Unknown profile '{req.profile}'. "
                                 f"Valid: {list(PROFILES.keys())}")
    result = start_session(
        device_id   = req.device_id,
        profile     = req.profile,
        origin      = req.origin,
        destination = req.destination,
        recipient   = req.recipient,
    )
    return result


@app.post("/session/{session_id}/end", dependencies=[Depends(require_auth)])
def api_end_session(session_id: str):
    """Close a session and lock the final Integrity Score."""
    conn = get_conn()
    row  = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    if not row["is_active"]:
        raise HTTPException(400, "Session is already closed")
    return end_session(session_id)


@app.get("/session/{session_id}")
def api_get_session(session_id: str):
    """Get full session details."""
    conn = get_conn()
    row  = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    return dict(row)


@app.get("/sessions")
def api_list_sessions(device_id: str = None, active_only: bool = False):
    """List all sessions, optionally filtered by device_id or active status."""
    conn  = get_conn()
    query = "SELECT * FROM sessions WHERE 1=1"
    args  = []
    if device_id:
        query += " AND device_id = ?";  args.append(device_id)
    if active_only:
        query += " AND is_active = 1"
    query += " ORDER BY start_time DESC"
    rows = conn.execute(query, args).fetchall()
    return [dict(r) for r in rows]


# ----------------------------------------------------------
# Handoff
# ----------------------------------------------------------

@app.post("/handoff", dependencies=[Depends(require_auth)])
def api_handoff(req: HandoffRequest):
    """
    Record the recipient's accept/reject decision.
    This is written as the final immutable link in the chain.
    """
    valid_decisions = {"ACCEPT", "REVIEW", "INVESTIGATE", "REJECT"}
    if req.decision not in valid_decisions:
        raise HTTPException(400, f"decision must be one of {valid_decisions}")

    conn = get_conn()
    row  = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (req.session_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Session not found")
    if row["is_active"]:
        raise HTTPException(400, "Session must be ended before handoff")

    # Check not already handed off
    existing = conn.execute(
        "SELECT handoff_id FROM handoffs WHERE session_id = ?",
        (req.session_id,)
    ).fetchone()
    if existing:
        raise HTTPException(400, "Handoff already recorded for this session")

    ts = int(time.time())

    # Compute final chain link: hash of (session summary + decision + ts)
    summary_str = json.dumps({
        "session_id":   req.session_id,
        "decision":     req.decision,
        "recipient_id": req.recipient_id,
        "ts":           ts,
        "final_is":     row["final_is"],
    }, separators=(",", ":"))
    record_hash = hashlib.sha256(summary_str.encode()).hexdigest()

    conn.execute(
        """INSERT INTO handoffs
           (session_id, recipient_id, decision, notes, ts, record_hash)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (req.session_id, req.recipient_id, req.decision, req.notes, ts, record_hash),
    )
    # Also update the sessions table with the decision
    conn.execute(
        "UPDATE sessions SET decision = ? WHERE session_id = ?",
        (req.decision, req.session_id),
    )
    conn.commit()

    return {
        "session_id":  req.session_id,
        "decision":    req.decision,
        "record_hash": record_hash,
        "ts":          ts,
    }


# ----------------------------------------------------------
# Telemetry (dashboard read endpoints)
# ----------------------------------------------------------

@app.get("/session/{session_id}/telemetry")
def api_telemetry(session_id: str, limit: int = 100, offset: int = 0):
    """
    Return telemetry records for a session, newest first.
    Paginate using limit/offset for large sessions.
    """
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM telemetry WHERE session_id = ? "
        "ORDER BY seq DESC LIMIT ? OFFSET ?",
        (session_id, limit, offset)
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/session/{session_id}/score")
def api_score(session_id: str):
    """Return the latest CS and running IS for a session."""
    conn = get_conn()
    row  = conn.execute(
        "SELECT cs, is_running FROM telemetry "
        "WHERE session_id = ? ORDER BY seq DESC LIMIT 1",
        (session_id,)
    ).fetchone()
    if not row:
        return {"cs": 100.0, "is_running": 100.0, "band": "ACCEPT"}
    return {
        "cs":        row["cs"],
        "is_running": row["is_running"],
        "band":      acceptance_band(row["is_running"]),
    }


@app.get("/session/{session_id}/events")
def api_events(session_id: str):
    """Return all breach events for a session."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM breach_events WHERE session_id = ? "
        "ORDER BY start_time ASC",
        (session_id,)
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/session/{session_id}/map")
def api_map(session_id: str):
    """
    Return lat/lng/cs/tamper for every record — used by Leaflet.js.
    Lightweight: only the fields the map needs.
    """
    conn = get_conn()
    rows = conn.execute(
        "SELECT seq, lat, lng, cs, tamper, gps_fix FROM telemetry "
        "WHERE session_id = ? ORDER BY seq ASC",
        (session_id,)
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/rejected")
def api_rejected(limit: int = 50):
    """Return the most recent rejected (HMAC-failed) packets."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM rejected_packets ORDER BY received_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


# ----------------------------------------------------------
# Chain verification
# ----------------------------------------------------------

@app.get("/session/{session_id}/verify", dependencies=[Depends(require_auth)])
def api_verify(session_id: str):
    """
    Walk the full linked hash chain for a session.
    Returns intact status and the first broken link if found.
    """
    conn   = get_conn()
    result = verify_chain(session_id, conn)
    return result


# ----------------------------------------------------------
# Remote config push
# ----------------------------------------------------------

@app.post("/config", dependencies=[Depends(require_auth)])
def api_push_config(req: ConfigPushRequest):
    """
    Push a new profile config to the device via MQTT.
    The ESP8266 receives it on its /config topic and updates
    threshold variables in RAM immediately.
    """
    from mqtt_client import get_mqtt_client

    if req.profile not in PROFILES:
        raise HTTPException(400, f"Unknown profile '{req.profile}'")

    p       = PROFILES[req.profile]
    payload = json.dumps({
        "profile":     req.profile,
        "T_min":       p["T_min"],
        "T_max":       p["T_max"],
        "H_min":       p["H_min"],
        "H_max":       p["H_max"],
        "G_threshold": p["G_threshold"],
        "w_T": p["w_T"], "w_H": p["w_H"],
        "w_I": p["w_I"], "w_L": p["w_L"],
    })

    client = get_mqtt_client()
    if not client or not client.is_connected():
        raise HTTPException(503, "MQTT client not connected")

    topic = f"omni/{req.device_id}/config"
    client.publish(topic, payload, qos=1)

    # Also update the active session's profile in DB
    conn = get_conn()
    conn.execute(
        "UPDATE sessions SET profile = ? "
        "WHERE device_id = ? AND is_active = 1",
        (req.profile, req.device_id),
    )
    conn.commit()

    return {"ok": True, "pushed_to": topic, "profile": req.profile}


# ----------------------------------------------------------
# Device management
# ----------------------------------------------------------

@app.post("/device/{device_id}/reset-tamper", dependencies=[Depends(require_auth)])
def api_reset_tamper(device_id: str):
    """
    Send an authenticated MQTT command to clear the EEPROM
    tamper flag on the Uno. The ESP must forward this to the Uno
    (not yet implemented in ESP firmware — placeholder for Phase 4 extension).
    """
    from mqtt_client import get_mqtt_client
    client = get_mqtt_client()
    if not client or not client.is_connected():
        raise HTTPException(503, "MQTT client not connected")

    client.publish(f"omni/{device_id}/reset-tamper", "RESET_TAMPER", qos=1)
    return {"ok": True, "message": f"Reset command sent to {device_id}"}


@app.get("/device/{device_id}/active-session")
def api_active_session(device_id: str):
    """Return the currently active session for a device."""
    session_id = get_active_session(device_id)
    if not session_id:
        return {"session_id": None, "message": "No active session"}
    conn = get_conn()
    row  = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    return dict(row)
