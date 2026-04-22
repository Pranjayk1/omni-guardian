// =============================================================
// api.js — Single source of truth for all backend API calls.
//
// Base URL: all calls go through Vite's proxy at /api/*
// which strips the /api prefix and forwards to localhost:8000.
// To switch to teammate's machine, change proxy target in
// vite.config.js. No change needed here.
//
// Auth: admin endpoints use HTTP Basic Auth.
// Credentials come from .env (VITE_ADMIN_USER / VITE_ADMIN_PASS).
// =============================================================

import axios from 'axios'

const BASE = '/api'

const ADMIN_USER = import.meta.env.VITE_ADMIN_USER || 'admin'
const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || 'omni2024'

// Build the Basic Auth header value
const authHeader = () => ({
  Authorization: 'Basic ' + btoa(`${ADMIN_USER}:${ADMIN_PASS}`),
})

// ── Health ────────────────────────────────────────────────
export const getHealth = () =>
  axios.get(`${BASE}/health`).then(r => r.data)

// ── Sessions ──────────────────────────────────────────────
export const listSessions = (deviceId = null, activeOnly = false) => {
  const params = {}
  if (deviceId)   params.device_id   = deviceId
  if (activeOnly) params.active_only = true
  return axios.get(`${BASE}/sessions`, { params }).then(r => r.data)
}

export const getSession = (sessionId) =>
  axios.get(`${BASE}/session/${sessionId}`).then(r => r.data)

export const startSession = (payload) =>
  axios.post(`${BASE}/session/start`, payload, { headers: authHeader() }).then(r => r.data)

export const endSession = (sessionId) =>
  axios.post(`${BASE}/session/${sessionId}/end`, {}, { headers: authHeader() }).then(r => r.data)

// ── Active session for device ──────────────────────────────
export const getActiveSession = (deviceId) =>
  axios.get(`${BASE}/device/${deviceId}/active-session`).then(r => r.data)

// ── Telemetry ─────────────────────────────────────────────
export const getTelemetry = (sessionId, limit = 100, offset = 0) =>
  axios.get(`${BASE}/session/${sessionId}/telemetry`, { params: { limit, offset } }).then(r => r.data)

export const getScore = (sessionId) =>
  axios.get(`${BASE}/session/${sessionId}/score`).then(r => r.data)

export const getEvents = (sessionId) =>
  axios.get(`${BASE}/session/${sessionId}/events`).then(r => r.data)

export const getMapData = (sessionId) =>
  axios.get(`${BASE}/session/${sessionId}/map`).then(r => r.data)

// ── Rejected packets ──────────────────────────────────────
export const getRejected = (limit = 50) =>
  axios.get(`${BASE}/rejected`, { params: { limit } }).then(r => r.data)

// ── Chain verification ────────────────────────────────────
export const verifyChain = (sessionId) =>
  axios.get(`${BASE}/session/${sessionId}/verify`, { headers: authHeader() }).then(r => r.data)

// ── Handoff ───────────────────────────────────────────────
export const recordHandoff = (payload) =>
  axios.post(`${BASE}/handoff`, payload, { headers: authHeader() }).then(r => r.data)

// ── Remote config push ────────────────────────────────────
export const pushConfig = (deviceId, profile) =>
  axios.post(`${BASE}/config`, { device_id: deviceId, profile }, { headers: authHeader() }).then(r => r.data)

// ── Helpers ───────────────────────────────────────────────

/** Returns the band label for an Integrity Score */
export const getBand = (is) => {
  if (is === null || is === undefined) return 'UNKNOWN'
  if (is >= 80) return 'ACCEPT'
  if (is >= 60) return 'REVIEW'
  if (is >= 40) return 'INVESTIGATE'
  return 'REJECT'
}

/** Returns Tailwind colour token for a band */
export const bandColor = (band) => ({
  ACCEPT:      '#00e676',
  REVIEW:      '#ffd600',
  INVESTIGATE: '#ff9500',
  REJECT:      '#ff4444',
  UNKNOWN:     '#4a6a85',
}[band] || '#4a6a85')

export const PROFILES = ['vaccine', 'milk', 'electronics', 'organ']

export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID || 'OG-001'
