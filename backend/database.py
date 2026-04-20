# =============================================================
# database.py — SQLite schema and connection helper
# All 5 tables are created here on first run.
# Import get_conn() anywhere you need a database connection.
# =============================================================

import sqlite3
import threading
from config import DB_PATH

# SQLite connections are not thread-safe across threads.
# We use a threading.local() so each thread gets its own connection.
_local = threading.local()


def get_conn() -> sqlite3.Connection:
    """Return a per-thread SQLite connection. Creates it if not yet open."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row   # rows behave like dicts
        _local.conn.execute("PRAGMA journal_mode=WAL")  # safe concurrent reads
    return _local.conn


def init_db() -> None:
    """
    Create all 5 tables if they do not already exist.
    Safe to call on every startup — uses IF NOT EXISTS.
    """
    conn = get_conn()
    cur  = conn.cursor()

    # ----------------------------------------------------------
    # 1. sessions — one row per shipment lifecycle
    # ----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id   TEXT PRIMARY KEY,
            device_id    TEXT NOT NULL,
            profile      TEXT NOT NULL DEFAULT 'vaccine',
            origin       TEXT,
            destination  TEXT,
            recipient    TEXT,
            start_time   INTEGER NOT NULL,   -- Unix timestamp
            end_time     INTEGER,
            final_is     REAL,
            decision     TEXT,               -- ACCEPT / REVIEW / INVESTIGATE / REJECT
            is_active    INTEGER NOT NULL DEFAULT 1  -- 1=open, 0=closed
        )
    """)

    # ----------------------------------------------------------
    # 2. telemetry — one row per verified sensor packet
    # ----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS telemetry (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT    NOT NULL,
            device_id    TEXT    NOT NULL,
            seq          INTEGER NOT NULL,
            ts           INTEGER NOT NULL,   -- Unix timestamp from ESP NTP
            received_at  INTEGER NOT NULL,   -- Unix timestamp backend received
            temp         REAL,
            humidity     REAL,
            ax           REAL,
            ay           REAL,
            az           REAL,
            g_net        REAL,
            dist_cm      INTEGER,
            tamper       INTEGER NOT NULL DEFAULT 0,
            lat          REAL,
            lng          REAL,
            gps_fix      INTEGER NOT NULL DEFAULT 0,
            profile      TEXT,
            cs           REAL,
            is_running   REAL,
            hmac         TEXT    NOT NULL,
            prev_hash    TEXT,
            record_hash  TEXT    NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    # ----------------------------------------------------------
    # 3. breach_events — one row per threshold violation event
    # ----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS breach_events (
            event_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id       TEXT    NOT NULL,
            sensor           TEXT    NOT NULL,  -- 'temp' | 'humidity' | 'impact' | 'tamper'
            start_time       INTEGER NOT NULL,
            end_time         INTEGER,            -- NULL while event is still open
            start_seq        INTEGER,
            end_seq          INTEGER,
            peak_value       REAL,
            duration_seconds INTEGER,
            peak_penalty     REAL,
            notified         INTEGER NOT NULL DEFAULT 0,  -- 1 = email sent
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    # ----------------------------------------------------------
    # 4. rejected_packets — one row per HMAC-failed packet
    # ----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rejected_packets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at    INTEGER NOT NULL,
            device_id      TEXT,
            raw_payload    TEXT,
            received_hmac  TEXT,
            reason         TEXT    NOT NULL DEFAULT 'HMAC_MISMATCH'
        )
    """)

    # ----------------------------------------------------------
    # 5. handoffs — one row per shipment acceptance decision
    # ----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS handoffs (
            handoff_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id    TEXT    NOT NULL UNIQUE,
            recipient_id  TEXT,
            decision      TEXT    NOT NULL,   -- ACCEPT / REVIEW / INVESTIGATE / REJECT
            notes         TEXT,
            ts            INTEGER NOT NULL,
            record_hash   TEXT    NOT NULL,   -- final link appended to chain
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    conn.commit()
    print("[DB] All tables ready.")
