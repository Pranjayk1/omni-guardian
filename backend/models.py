# =============================================================
# models.py — Pydantic models for all API request/response bodies
# FastAPI uses these for automatic validation and docs.
# =============================================================

from pydantic import BaseModel
from typing   import Optional


# --- Session ---

class SessionStartRequest(BaseModel):
    device_id:   str
    profile:     str = "vaccine"
    origin:      Optional[str] = None
    destination: Optional[str] = None
    recipient:   Optional[str] = None


class SessionEndRequest(BaseModel):
    session_id: str


class SessionResponse(BaseModel):
    session_id:  str
    device_id:   str
    profile:     str
    origin:      Optional[str]
    destination: Optional[str]
    start_time:  int
    end_time:    Optional[int]
    final_is:    Optional[float]
    decision:    Optional[str]
    is_active:   int


# --- Handoff ---

class HandoffRequest(BaseModel):
    session_id:   str
    recipient_id: Optional[str] = None
    decision:     str           # ACCEPT | REVIEW | INVESTIGATE | REJECT
    notes:        Optional[str] = None


# --- Config push ---

class ConfigPushRequest(BaseModel):
    device_id: str
    profile:   str


# --- Tamper reset ---

class TamperResetRequest(BaseModel):
    device_id: str


# --- Generic response ---

class StatusResponse(BaseModel):
    ok:      bool
    message: str
