# =============================================================
# notifications.py — Email alert sender via Gmail SMTP
#
# send_alert() is called by breach.py and mqtt_client.py.
# One email per event, not one per packet. Deduplication is
# handled by the breach event state machine in breach.py.
# =============================================================

import smtplib
import ssl
import traceback
from email.message import EmailMessage
from config import EMAIL_SENDER, EMAIL_APP_PASS, EMAIL_RECIPIENT


def send_alert(subject: str, body: str, to: str = EMAIL_RECIPIENT) -> bool:
    """
    Send an alert email via Gmail SMTP over TLS (port 465).

    Returns True on success, False on failure.
    Never raises — email failure must not crash the pipeline.

    If you get an authentication error:
      1. Make sure 2-Step Verification is ON for your Gmail account.
      2. Generate an App Password at myaccount.google.com/apppasswords.
      3. Paste the 16-char password (no spaces) into config.EMAIL_APP_PASS.
    """
    try:
        msg = EmailMessage()
        msg["From"]    = EMAIL_SENDER
        msg["To"]      = to
        msg["Subject"] = subject
        msg.set_content(body)

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(EMAIL_SENDER, EMAIL_APP_PASS)
            server.send_message(msg)

        print(f"[EMAIL] Sent: {subject}")
        return True

    except Exception:
        print(f"[EMAIL] FAILED to send '{subject}':")
        traceback.print_exc()
        return False


# ----------------------------------------------------------
# Pre-built alert templates
# ----------------------------------------------------------

def alert_breach_opened(session_id: str, sensor: str,
                         value: float, unit: str,
                         threshold: str, device_id: str) -> None:
    subject = f"[OMNI-GUARDIAN] Breach Alert — {sensor.upper()} | {device_id}"
    body = (
        f"A threshold breach has been detected.\n\n"
        f"  Device   : {device_id}\n"
        f"  Session  : {session_id}\n"
        f"  Sensor   : {sensor}\n"
        f"  Value    : {value:.2f} {unit}\n"
        f"  Threshold: {threshold}\n\n"
        f"This event has been logged in the breach event register.\n"
        f"Check the dashboard for the full session timeline."
    )
    send_alert(subject, body)


def alert_tamper(session_id: str, device_id: str) -> None:
    subject = f"[OMNI-GUARDIAN] !! TAMPER DETECTED !! | {device_id}"
    body = (
        f"A tamper event has been detected on device {device_id}.\n\n"
        f"  Session : {session_id}\n\n"
        f"The tamper flag is now PERMANENT for this session.\n"
        f"It cannot be reset by a power cycle — only by an "
        f"authenticated backend command.\n\n"
        f"Review the session immediately on the dashboard."
    )
    send_alert(subject, body)


def alert_predictive(session_id: str, device_id: str,
                      sensor: str, current_value: float,
                      projected_value: float, packets_away: int) -> None:
    seconds_away = packets_away * 2  # 2-second sampling interval
    subject = f"[OMNI-GUARDIAN] Predictive Warning — {sensor.upper()} | {device_id}"
    body = (
        f"A breach is predicted before it occurs.\n\n"
        f"  Device         : {device_id}\n"
        f"  Session        : {session_id}\n"
        f"  Sensor         : {sensor}\n"
        f"  Current value  : {current_value:.2f}\n"
        f"  Projected value: {projected_value:.2f}\n"
        f"  Time to breach : ~{seconds_away} seconds "
        f"({packets_away} readings at current rate)\n\n"
        f"Take corrective action now to prevent a confirmed breach."
    )
    send_alert(subject, body)


def alert_hmac_rejected(device_id: str, received_hmac: str) -> None:
    subject = f"[OMNI-GUARDIAN] SECURITY — HMAC Rejected | {device_id}"
    body = (
        f"A packet from device {device_id} failed HMAC verification.\n\n"
        f"  Received HMAC: {received_hmac}\n\n"
        f"This packet has been stored in the rejected_packets table "
        f"and flagged as COMPROMISED.\n"
        f"This may indicate in-transit data tampering or a rogue device."
    )
    send_alert(subject, body)
