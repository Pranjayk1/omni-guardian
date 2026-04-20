# =============================================================
# config.py — All credentials, constants, and profile weights
# Update credentials here only. Nothing else needs to change.
# =============================================================

# --- MQTT (HiveMQ Cloud) ---
MQTT_HOST     = "358c33952fb74641acedb604d00d246a.s1.eu.hivemq.cloud"
MQTT_PORT     = 8883          # TLS
MQTT_USER     = "omni_backend"
MQTT_PASS     = "LetsGo@21"

# --- Security ---
# Must match HMAC_KEY in ESP8266 firmware exactly
HMAC_KEY      = "246f765e7e875ad9e64a495133313fdb"

# --- Device ---
DEVICE_ID     = "OG-001"

# --- Database ---
DB_PATH       = "omni_guardian.db"

# --- FastAPI ---
API_HOST      = "0.0.0.0"
API_PORT      = 8000

# --- Email (Gmail SMTP) ---
EMAIL_SENDER    = "pranjaykapoor@gmail.com"
EMAIL_APP_PASS  = "abtmvufhmlihyiml"   # <-- replace with your Gmail App Password
EMAIL_RECIPIENT = "pranjay.kapoor.ug23@nsut.ac.in"

# --- Session pending-packet buffer (seconds) ---
# Packets that arrive before a session is started are held for this long.
# If a session starts within this window they are assigned retroactively.
PENDING_BUFFER_SECONDS = 60

# --- Predictive alert ---
PREDICT_WINDOW_PACKETS  = 5    # number of recent readings to fit trend on
PREDICT_HORIZON_PACKETS = 5    # how many future packets to project forward

# =============================================================
# Asset Profiles — scoring weights and thresholds
# All 4 profiles are defined here. Add new profiles by adding
# a new key to this dict. No other file needs to change.
# =============================================================
PROFILES = {
    "vaccine": {
        "T_min": 2.0,   "T_max": 8.0,
        "H_min": 30.0,  "H_max": 60.0,
        "G_threshold": 2.5,
        "w_T": 3.5,     "w_H": 0.4,   "w_I": 8.0,  "w_L": 25,
        "cap_T": 35,    "cap_H": 10,  "cap_I": 30,
    },
    "milk": {
        "T_min": 1.0,   "T_max": 6.0,
        "H_min": 40.0,  "H_max": 80.0,
        "G_threshold": 3.0,
        "w_T": 1.5,     "w_H": 0.8,   "w_I": 4.0,  "w_L": 15,
        "cap_T": 20,    "cap_H": 15,  "cap_I": 20,
    },
    "electronics": {
        "T_min": 10.0,  "T_max": 40.0,
        "H_min": 10.0,  "H_max": 70.0,
        "G_threshold": 1.8,
        "w_T": 0.3,     "w_H": 0.6,   "w_I": 12.0, "w_L": 20,
        "cap_T": 10,    "cap_H": 12,  "cap_I": 35,
    },
    "organ": {
        "T_min": 0.0,   "T_max": 6.0,
        "H_min": 40.0,  "H_max": 70.0,
        "G_threshold": 1.5,
        "w_T": 5.0,     "w_H": 0.2,   "w_I": 15.0, "w_L": 25,
        "cap_T": 40,    "cap_H": 8,   "cap_I": 40,
    },
}
