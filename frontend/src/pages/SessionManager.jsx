import { useState } from 'react'
import { format } from 'date-fns'
import { Settings, Play, Square, GitMerge, Send, RefreshCw, ChevronDown } from 'lucide-react'
import usePolling from '../hooks/usePolling'
import {
  getActiveSession, listSessions,
  startSession, endSession,
  recordHandoff, pushConfig,
  DEVICE_ID, PROFILES,
} from '../api'

const DECISION_OPTS = ['ACCEPT', 'REVIEW', 'INVESTIGATE', 'REJECT']

export default function SessionManager() {
  // ── Active session ─────────────────────────────────────
  const { data: activeRaw, refresh: refreshActive } = usePolling(
    () => getActiveSession(DEVICE_ID), 8000
  )
  const active = activeRaw?.session_id ? activeRaw : null

  // ── All sessions ────────────────────────────────────────
  const { data: allSessions, refresh: refreshAll } = usePolling(
    () => listSessions(DEVICE_ID), 8000, [], []
  )

  const refreshBoth = () => { refreshActive(); refreshAll() }

  // ── Start session form ──────────────────────────────────
  const [startForm, setStartForm] = useState({
    profile:     'vaccine',
    origin:      '',
    destination: '',
    recipient:   '',
  })
  const [starting, setStarting] = useState(false)
  const [startMsg, setStartMsg] = useState(null)

  const handleStart = async (e) => {
    e.preventDefault()
    setStarting(true); setStartMsg(null)
    try {
      await startSession({ device_id: DEVICE_ID, ...startForm })
      setStartMsg({ ok: true, text: 'Session started successfully.' })
      setStartForm({ profile: 'vaccine', origin: '', destination: '', recipient: '' })
      setTimeout(refreshBoth, 800)
    } catch (err) {
      setStartMsg({ ok: false, text: err?.response?.data?.detail || err.message })
    } finally {
      setStarting(false)
    }
  }

  // ── End session ─────────────────────────────────────────
  const [ending,  setEnding]  = useState(false)
  const [endMsg,  setEndMsg]  = useState(null)

  const handleEnd = async () => {
    if (!active) return
    setEnding(true); setEndMsg(null)
    try {
      await endSession(active.session_id)
      setEndMsg({ ok: true, text: 'Session ended and locked.' })
      setTimeout(refreshBoth, 800)
    } catch (err) {
      setEndMsg({ ok: false, text: err?.response?.data?.detail || err.message })
    } finally {
      setEnding(false)
    }
  }

  // ── Handoff ─────────────────────────────────────────────
  const [handoffForm, setHandoffForm] = useState({
    session_id:   '',
    recipient_id: '',
    decision:     'ACCEPT',
    notes:        '',
  })
  const [handingOff,  setHandingOff]  = useState(false)
  const [handoffMsg,  setHandoffMsg]  = useState(null)

  const handleHandoff = async (e) => {
    e.preventDefault()
    setHandingOff(true); setHandoffMsg(null)
    try {
      const res = await recordHandoff(handoffForm)
      setHandoffMsg({ ok: true, text: `Handoff recorded. Hash: ${res.record_hash?.slice(0, 20)}…` })
      setTimeout(refreshBoth, 800)
    } catch (err) {
      setHandoffMsg({ ok: false, text: err?.response?.data?.detail || err.message })
    } finally {
      setHandingOff(false)
    }
  }

  // ── Remote config push ───────────────────────────────────
  const [configProfile, setConfigProfile] = useState('vaccine')
  const [pushing,       setPushing]       = useState(false)
  const [configMsg,     setConfigMsg]     = useState(null)

  const handleConfig = async () => {
    setPushing(true); setConfigMsg(null)
    try {
      await pushConfig(DEVICE_ID, configProfile)
      setConfigMsg({ ok: true, text: `Profile '${configProfile}' pushed to ${DEVICE_ID} via MQTT.` })
    } catch (err) {
      setConfigMsg({ ok: false, text: err?.response?.data?.detail || err.message })
    } finally {
      setPushing(false)
    }
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6 animate-slideIn">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-widest uppercase text-hi">
            Session Manager
          </h1>
          <p className="font-mono text-xs text-dim mt-0.5">
            Shipment lifecycle · {DEVICE_ID}
          </p>
        </div>
        <button onClick={refreshBoth} className="btn-ghost flex items-center gap-2">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Active session banner */}
      <div className={`card px-5 py-4 flex items-center justify-between
        ${active ? 'border-cyan/30 bg-cyan/5' : 'border-border'}`}>
        <div>
          <p className="label mb-1">Active Session</p>
          {active ? (
            <div className="flex flex-col gap-0.5">
              <p className="font-mono text-sm text-cyan font-medium">{active.session_id}</p>
              <p className="font-mono text-xs text-dim">
                {active.profile?.toUpperCase()} · {active.origin} → {active.destination}
                &nbsp;·&nbsp; started {format(new Date(active.start_time * 1000), 'dd MMM HH:mm')}
              </p>
            </div>
          ) : (
            <p className="font-mono text-xs text-dim">No active session on {DEVICE_ID}</p>
          )}
        </div>
        {active && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green animate-pulse2" />
            <span className="font-display font-semibold text-xs tracking-widest text-green uppercase">Live</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Start session ── */}
        <section className="card p-5 flex flex-col gap-4">
          <p className="label flex items-center gap-2"><Play size={11} /> Start New Session</p>
          {active && (
            <div className="font-mono text-xs text-orange border border-orange/30 bg-orange/5 px-3 py-2 rounded">
              End the current session before starting a new one.
            </div>
          )}
          <form onSubmit={handleStart} className="flex flex-col gap-3">
            <Field label="Asset Profile">
              <Select value={startForm.profile}
                onChange={v => setStartForm(f => ({ ...f, profile: v }))}
                options={PROFILES} />
            </Field>
            <Field label="Origin">
              <input className="input" placeholder="e.g. Delhi Warehouse"
                value={startForm.origin}
                onChange={e => setStartForm(f => ({ ...f, origin: e.target.value }))}
                required />
            </Field>
            <Field label="Destination">
              <input className="input" placeholder="e.g. Mumbai Hospital"
                value={startForm.destination}
                onChange={e => setStartForm(f => ({ ...f, destination: e.target.value }))}
                required />
            </Field>
            <Field label="Recipient ID">
              <input className="input" placeholder="e.g. DR-SHARMA"
                value={startForm.recipient}
                onChange={e => setStartForm(f => ({ ...f, recipient: e.target.value }))}
                required />
            </Field>
            <button type="submit" disabled={!!active || starting}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <Play size={13} /> {starting ? 'Starting…' : 'Start Session'}
            </button>
            <Msg msg={startMsg} />
          </form>
        </section>

        {/* ── End session + Remote config ── */}
        <div className="flex flex-col gap-5">

          {/* End */}
          <section className="card p-5 flex flex-col gap-4">
            <p className="label flex items-center gap-2"><Square size={11} /> End Active Session</p>
            <p className="font-mono text-xs text-dim">
              Closes the session and locks the final Integrity Score. Required before handoff.
            </p>
            <button onClick={handleEnd} disabled={!active || ending}
              className="btn-danger flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <Square size={13} /> {ending ? 'Ending…' : 'End Session'}
            </button>
            <Msg msg={endMsg} />
          </section>

          {/* Remote config push */}
          <section className="card p-5 flex flex-col gap-4">
            <p className="label flex items-center gap-2"><Send size={11} /> Remote Profile Push</p>
            <p className="font-mono text-xs text-dim">
              Push a new asset profile to the ESP8266 over MQTT. Takes effect immediately.
            </p>
            <div className="flex gap-3">
              <Select value={configProfile}
                onChange={setConfigProfile}
                options={PROFILES} className="flex-1" />
              <button onClick={handleConfig} disabled={pushing}
                className="btn-primary flex items-center gap-2 disabled:opacity-40">
                <Send size={13} /> {pushing ? 'Pushing…' : 'Push'}
              </button>
            </div>
            <Msg msg={configMsg} />
          </section>

        </div>
      </div>

      {/* ── Handoff ── */}
      <section className="card p-5 flex flex-col gap-4">
        <p className="label flex items-center gap-2"><GitMerge size={11} /> Record Handoff</p>
        <p className="font-mono text-xs text-dim">
          The final immutable chain link. Session must be ended first.
          The recipient's decision is hashed and stored permanently.
        </p>
        <form onSubmit={handleHandoff} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Field label="Session ID">
            <input className="input" placeholder="SH-XXXXXX"
              value={handoffForm.session_id}
              onChange={e => setHandoffForm(f => ({ ...f, session_id: e.target.value }))}
              required />
          </Field>
          <Field label="Recipient ID">
            <input className="input" placeholder="DR-SHARMA"
              value={handoffForm.recipient_id}
              onChange={e => setHandoffForm(f => ({ ...f, recipient_id: e.target.value }))}
              required />
          </Field>
          <Field label="Decision">
            <Select value={handoffForm.decision}
              onChange={v => setHandoffForm(f => ({ ...f, decision: v }))}
              options={DECISION_OPTS} />
          </Field>
          <Field label="Notes (optional)">
            <input className="input" placeholder="e.g. Slight temperature excursion at seq 42"
              value={handoffForm.notes}
              onChange={e => setHandoffForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="lg:col-span-2">
            <button type="submit" disabled={handingOff}
              className="btn-primary flex items-center gap-2 disabled:opacity-40">
              <GitMerge size={13} /> {handingOff ? 'Recording…' : 'Record Handoff'}
            </button>
          </div>
          <div className="lg:col-span-2"><Msg msg={handoffMsg} /></div>
        </form>
      </section>

      {/* ── Session history table ── */}
      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="label">Session History · {DEVICE_ID}</p>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-dim text-left">
                {['Session ID','Profile','Origin','Destination','Started','Status','Final IS','Decision'].map(h => (
                  <th key={h} className="px-3 py-2 font-display tracking-wider uppercase border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allSessions.map(s => (
                <tr key={s.session_id}
                  className="border-b border-border hover:bg-surface/60 transition-colors">
                  <td className="px-3 py-2 text-cyan">{s.session_id}</td>
                  <td className="px-3 py-2 text-hi uppercase">{s.profile}</td>
                  <td className="px-3 py-2 text-dim">{s.origin}</td>
                  <td className="px-3 py-2 text-dim">{s.destination}</td>
                  <td className="px-3 py-2 text-lo whitespace-nowrap">
                    {format(new Date(s.start_time * 1000), 'dd MMM HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <span className={s.is_active ? 'text-green' : 'text-dim'}>
                      {s.is_active ? '● LIVE' : '○ closed'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-cyan">
                    {s.final_is ? s.final_is.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {s.decision
                      ? <span className={
                          s.decision === 'ACCEPT'      ? 'text-green'  :
                          s.decision === 'REVIEW'      ? 'text-yellow' :
                          s.decision === 'INVESTIGATE' ? 'text-orange' : 'text-red'
                        }>{s.decision}</span>
                      : <span className="text-lo">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}

// ── Small reusable components ────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label text-[10px]">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input appearance-none pr-8 uppercase cursor-pointer"
      >
        {options.map(o => (
          <option key={o} value={o} className="bg-surface uppercase">{o}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
    </div>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  return (
    <p className={`font-mono text-xs mt-1 ${msg.ok ? 'text-green' : 'text-red'}`}>
      {msg.ok ? '✓ ' : '✗ '}{msg.text}
    </p>
  )
}
