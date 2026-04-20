# =============================================================
# breach.py — Breach event state machine + predictive alerts
#
# The state machine tracks whether each sensor is currently in
# a breached state. On safe→breach transition it opens an event
# record and fires one email. On breach→safe it closes the record.
#
# Predictive alerts use numpy linear regression on the last N
# temperature readings to project when a breach will occur.
# =============================================================

import time
import numpy as np
from typing import Dict, Optional
from database import get_conn
from config   import PROFILES, PREDICT_WINDOW_PACKETS, PREDICT_HORIZON_PACKETS
import notifications


# ----------------------------------------------------------
# In-memory state — one dict per active session
# Key: session_id
# Value: dict of sensor_name → open event_id (or None)
# ----------------------------------------------------------
_open_events: Dict[str, Dict[str, Optional[int]]] = {}

# Recent temperature readings per session for predictive alert
# Key: session_id → list of (seq, temp) tuples, capped at window size
_temp_history: Dict[str, list] = {}

# Track whether a predictive alert has recently fired to avoid spam
# Key: session_id → last seq at which predictive alert was sent
_predict_last_fired: Dict[str, int] = {}


def _ensure_session(session_id: str) -> None:
    if session_id not in _open_events:
        _open_events[session_id]      = {
            "temp": None, "humidity": None,
            "impact": None, "tamper": None,
        }
    if session_id not in _temp_history:
        _temp_history[session_id] = []


def process_breach_state(
    session_id: str,
    device_id:  str,
    seq:        int,
    ts:         int,
    temp:       float,
    humidity:   float,
    g_net:      float,
    tamper:     bool,
    cs:         float,
    profile:    str,
) -> None:
    """
    Called once per verified packet after CS is computed.
    Updates breach event records and fires emails as needed.
    """
    _ensure_session(session_id)
    p = PROFILES.get(profile, PROFILES["vaccine"])

    # Determine which sensors are currently in breach
    breached = {
        "temp":     (temp < p["T_min"] or temp > p["T_max"]),
        "humidity": (humidity < p["H_min"] or humidity > p["H_max"]),
        "impact":   (g_net > p["G_threshold"]),
        "tamper":   tamper,
    }

    conn = get_conn()

    for sensor, is_breached in breached.items():
        open_id = _open_events[session_id][sensor]

        if is_breached and open_id is None:
            # safe → breach: open a new event
            cur = conn.execute(
                """INSERT INTO breach_events
                   (session_id, sensor, start_time, start_seq, peak_value, notified)
                   VALUES (?, ?, ?, ?, ?, 0)""",
                (session_id, sensor, ts, seq, _sensor_value(sensor, temp, humidity, g_net)),
            )
            conn.commit()
            event_id = cur.lastrowid
            _open_events[session_id][sensor] = event_id

            # Fire one email per event open
            _send_breach_email(sensor, session_id, device_id,
                               temp, humidity, g_net, p, event_id, conn)

        elif is_breached and open_id is not None:
            # Still in breach: update peak value if this reading is worse
            current_val = _sensor_value(sensor, temp, humidity, g_net)
            conn.execute(
                """UPDATE breach_events
                   SET peak_value = MAX(peak_value, ?)
                   WHERE event_id = ?""",
                (current_val, open_id),
            )
            conn.commit()

        elif not is_breached and open_id is not None:
            # breach → safe: close the event
            conn.execute(
                """UPDATE breach_events
                   SET end_time = ?, end_seq = ?,
                       duration_seconds = ? - start_time,
                       peak_penalty = ?
                   WHERE event_id = ?""",
                (ts, seq, ts, cs, open_id),
            )
            conn.commit()
            _open_events[session_id][sensor] = None

    # Update temperature history for predictive alert
    hist = _temp_history[session_id]
    hist.append((seq, temp))
    if len(hist) > PREDICT_WINDOW_PACKETS:
        hist.pop(0)

    _run_predictive_alert(session_id, device_id, seq, temp, p)


def _sensor_value(sensor: str, temp: float,
                  humidity: float, g_net: float) -> float:
    if sensor == "temp":     return temp
    if sensor == "humidity": return humidity
    if sensor == "impact":   return g_net
    return 1.0  # tamper is binary; peak_value = 1


def _send_breach_email(sensor, session_id, device_id,
                        temp, humidity, g_net, p, event_id, conn) -> None:
    """Send a breach-opened email and mark the event as notified."""
    units     = {"temp": "°C", "humidity": "%RH", "impact": "G", "tamper": ""}
    threshold = {
        "temp":     f"{p['T_min']}–{p['T_max']} °C",
        "humidity": f"{p['H_min']}–{p['H_max']} %RH",
        "impact":   f">{p['G_threshold']} G",
        "tamper":   "N/A",
    }

    if sensor == "tamper":
        notifications.alert_tamper(session_id, device_id)
    else:
        value = _sensor_value(sensor, temp, humidity, g_net)
        notifications.alert_breach_opened(
            session_id, sensor, value,
            units[sensor], threshold[sensor], device_id,
        )

    conn.execute(
        "UPDATE breach_events SET notified = 1 WHERE event_id = ?",
        (event_id,)
    )
    conn.commit()


def _run_predictive_alert(session_id: str, device_id: str,
                           seq: int, temp: float, p: dict) -> None:
    """
    Fit a linear trend to the last N temperature readings.
    If the projected value will cross T_max or T_min within
    PREDICT_HORIZON_PACKETS, fire a predictive alert email.

    One alert per 10 packets to avoid flooding.
    """
    hist = _temp_history[session_id]
    if len(hist) < 3:
        return  # not enough data to fit a trend

    last_fired = _predict_last_fired.get(session_id, -999)
    if seq - last_fired < 10:
        return  # cooldown: don't fire more than once per 10 packets

    xs     = np.array([h[0] for h in hist], dtype=float)
    ys     = np.array([h[1] for h in hist], dtype=float)
    slope, intercept = np.polyfit(xs, ys, 1)

    for i in range(1, PREDICT_HORIZON_PACKETS + 1):
        projected = intercept + slope * (seq + i)
        if projected > p["T_max"]:
            _predict_last_fired[session_id] = seq
            notifications.alert_predictive(
                session_id, device_id, "temp",
                temp, projected, i,
            )
            return
        if projected < p["T_min"]:
            _predict_last_fired[session_id] = seq
            notifications.alert_predictive(
                session_id, device_id, "temp",
                temp, projected, i,
            )
            return


def close_all_open_events(session_id: str, ts: int) -> None:
    """
    Called when a session ends. Close any breach events that are
    still open (sensor was in breach when shipment was ended).
    """
    if session_id not in _open_events:
        return

    conn = get_conn()
    for sensor, event_id in _open_events[session_id].items():
        if event_id is not None:
            conn.execute(
                """UPDATE breach_events
                   SET end_time = ?, duration_seconds = ? - start_time
                   WHERE event_id = ?""",
                (ts, ts, event_id),
            )
    conn.commit()
    del _open_events[session_id]
