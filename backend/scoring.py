# =============================================================
# scoring.py — Condition Score and Integrity Score computation
#
# CS  = per-packet health snapshot (reversible)
# IS  = cumulative journey score   (irreversible, only decreases)
#
# Both are computed here. The MQTT pipeline calls these after
# every verified packet. Profiles come from config.PROFILES.
# =============================================================

import math
from config import PROFILES


def compute_condition_score(
    temp:     float,
    humidity: float,
    g_net:    float,
    tamper:   bool,
    profile:  str,
) -> float:
    """
    Compute Condition Score (0–100) for a single packet.

    Formula:
        CS = 100 - penalty_T - penalty_H - penalty_I - penalty_L
        CS = max(0, CS)

    Each penalty is capped at its profile cap to prevent one
    sensor from driving CS to zero on its own.
    """
    p = PROFILES.get(profile, PROFILES["vaccine"])

    # Temperature penalty
    t_excess = max(0.0, temp - p["T_max"]) + max(0.0, p["T_min"] - temp)
    penalty_T = min(p["w_T"] * t_excess, p["cap_T"])

    # Humidity penalty
    h_excess = max(0.0, humidity - p["H_max"]) + max(0.0, p["H_min"] - humidity)
    penalty_H = min(p["w_H"] * h_excess, p["cap_H"])

    # Impact penalty
    i_excess  = max(0.0, g_net - p["G_threshold"])
    penalty_I = min(p["w_I"] * i_excess, p["cap_I"])

    # Tamper flat deduction
    penalty_L = p["w_L"] if tamper else 0.0

    cs = 100.0 - penalty_T - penalty_H - penalty_I - penalty_L
    return round(max(0.0, cs), 2)


def compute_integrity_score(
    min_cs:  float,
    sum_cs:  float,
    count:   int,
) -> float:
    """
    Compute Integrity Score (0–100) for a session.

    Formula:
        IS = (min_CS_ever * 0.5) + (avg_CS * 0.5)

    min_cs  — lowest CS recorded this session (worst-case damage)
    sum_cs  — running sum of all CS values
    count   — number of packets in session so far

    Both maintained as running variables; O(1) to update per packet.
    """
    if count == 0:
        return 100.0
    avg_cs = sum_cs / count
    is_score = (min_cs * 0.5) + (avg_cs * 0.5)
    return round(max(0.0, min(100.0, is_score)), 2)


def acceptance_band(is_score: float) -> str:
    """Return the acceptance decision label for a given IS."""
    if is_score >= 90:
        return "ACCEPT"
    elif is_score >= 70:
        return "REVIEW"
    elif is_score >= 50:
        return "INVESTIGATE"
    else:
        return "REJECT"
