# =============================================================
# security.py — HMAC verification and linked hash chain
#
# Layer 1: HMAC-SHA256 proves in-transit authenticity
# Layer 2: Linked hash chain detects post-storage tampering
# =============================================================

import hmac
import hashlib
import json
from config import HMAC_KEY


# ----------------------------------------------------------
# Layer 1 — HMAC-SHA256 verification
# ----------------------------------------------------------

def verify_hmac(payload_str: str, received_hmac: str) -> bool:
    """
    Recompute HMAC-SHA256 of payload_str using the shared secret key.
    Compare against received_hmac using constant-time comparison.

    CRITICAL: Never use == for HMAC comparison.
    hmac.compare_digest() prevents timing-based forgery attacks.
    """
    expected = hmac.new(
        key=HMAC_KEY.encode("utf-8"),
        msg=payload_str.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    # Both must be str for compare_digest to work correctly
    return hmac.compare_digest(expected, received_hmac.lower())


# ----------------------------------------------------------
# Layer 2 — Linked hash chain
# ----------------------------------------------------------

def compute_record_hash(payload_str: str, hmac_hex: str, prev_hash: str) -> str:
    """
    Compute the record_hash for this packet.

    record_hash = SHA-256(payload_str + hmac_hex + prev_hash)

    This fingerprints the entire record including the HMAC and
    the previous link, so any edit to any field is detectable.
    """
    data = payload_str + hmac_hex + (prev_hash or "")
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def get_previous_hash(session_id: str, conn) -> str:
    """
    Fetch the record_hash of the most recent verified packet
    in this session. Returns empty string for the first packet.
    """
    row = conn.execute(
        "SELECT record_hash FROM telemetry "
        "WHERE session_id = ? ORDER BY seq DESC LIMIT 1",
        (session_id,)
    ).fetchone()
    return row["record_hash"] if row else ""


def verify_chain(session_id: str, conn) -> dict:
    """
    Walk every telemetry record in this session in sequence order.
    Recompute each record_hash from stored fields and compare.

    Returns:
        { "intact": True }
        { "intact": False, "broken_at_seq": N, "message": "..." }
    """
    rows = conn.execute(
        "SELECT seq, hmac, prev_hash, record_hash, "
        "       temp, humidity, ax, ay, az, g_net, dist_cm, "
        "       tamper, lat, lng, gps_fix, profile, ts, "
        "       device_id, session_id "
        "FROM telemetry WHERE session_id = ? ORDER BY seq ASC",
        (session_id,)
    ).fetchall()

    if not rows:
        return {"intact": True, "message": "No records in session."}

    expected_prev = ""

    for row in rows:
        # Reconstruct the canonical payload string exactly as the ESP built it.
        # Field order MUST match buildAndPublish() in ESP firmware.
        payload_dict = {
            "device_id":  row["device_id"],
            "session_id": row["session_id"],
            "seq":        row["seq"],
            "ts":         row["ts"],
            "temp":       row["temp"],
            "humidity":   row["humidity"],
            "ax":         row["ax"],
            "ay":         row["ay"],
            "az":         row["az"],
            "g_net":      row["g_net"],
            "dist":       row["dist_cm"],
            "tamper":     bool(row["tamper"]),
            "lat":        row["lat"],
            "lng":        row["lng"],
            "gps_fix":    bool(row["gps_fix"]),
            "profile":    row["profile"],
        }
        # Use separators to match ESP's compact JSON string exactly
        payload_str  = json.dumps(payload_dict, separators=(",", ":"))
        recomputed   = compute_record_hash(payload_str, row["hmac"], expected_prev)

        if recomputed != row["record_hash"]:
            return {
                "intact":       False,
                "broken_at_seq": row["seq"],
                "message": (
                    f"Chain broken at sequence {row['seq']}. "
                    f"Record hash mismatch — data has been altered after storage."
                ),
            }

        # Verify prev_hash linkage
        if row["prev_hash"] != expected_prev:
            return {
                "intact":        False,
                "broken_at_seq": row["seq"],
                "message": (
                    f"Chain broken at sequence {row['seq']}. "
                    f"prev_hash does not match previous record_hash."
                ),
            }

        expected_prev = row["record_hash"]

    return {"intact": True, "message": f"Chain intact. {len(rows)} records verified."}
