import { useMemo } from 'react'
import {
  Thermometer, Droplets, Zap, Ruler,
  MapPin, Clock, RefreshCw, Package,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import usePolling from '../hooks/usePolling'
import { getActiveSession, getTelemetry, getScore, getEvents, DEVICE_ID } from '../api'
import ScoreGauge   from '../components/ScoreGauge'
import SensorCard   from '../components/SensorCard'
import TamperBanner from '../components/TamperBanner'
import AlertBanner  from '../components/AlertBanner'
// LCD import removed — hardware offline, component excluded until replacement arrives
// import LCDStatus from '../components/LCDStatus'

export default function Dashboard() {
  // -- Active session -----------------------------------------------
  const { data: sessionData } = usePolling(
    () => getActiveSession(DEVICE_ID), 5000
  )
  const session = sessionData?.session_id ? sessionData : null

  // -- Latest telemetry (most recent 1 row) -------------------------
  const { data: telRows, loading: telLoading, refresh } = usePolling(
    () => session ? getTelemetry(session.session_id, 1) : Promise.resolve([]),
    5000, [session?.session_id]
  )
  const latest = telRows?.[0] ?? null

  // -- Score --------------------------------------------------------
  const { data: score } = usePolling(
    () => session ? getScore(session.session_id) : Promise.resolve(null),
    5000, [session?.session_id]
  )

  // -- Events -------------------------------------------------------
  const { data: events } = usePolling(
    () => session ? getEvents(session.session_id) : Promise.resolve([]),
    5000, [session?.session_id]
  )

  // -- Derived values -----------------------------------------------
  const tamperActive = latest?.tamper === 1 || latest?.tamper === true

  // Sensor thresholds per profile (from config.py)
  const THRESHOLDS = {
    vaccine:     { T_min:2,  T_max:8,  H_min:30, H_max:60, G:2.5 },
    milk:        { T_min:1,  T_max:6,  H_min:40, H_max:80, G:3.0 },
    electronics: { T_min:10, T_max:40, H_min:10, H_max:70, G:1.8 },
    organ:       { T_min:0,  T_max:6,  H_min:40, H_max:70, G:1.5 },
  }
  const profile = session?.profile || 'vaccine'
  const thresh  = THRESHOLDS[profile] || THRESHOLDS.vaccine

  const tempAlert = latest && (latest.temp < thresh.T_min || latest.temp > thresh.T_max)
  const humAlert  = latest && (latest.humidity < thresh.H_min || latest.humidity > thresh.H_max)
  const gAlert    = latest && latest.g_net > thresh.G

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full animate-slideIn">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-widest uppercase text-hi">
            Live Dashboard
          </h1>
          {session ? (
            <p className="font-mono text-xs text-dim mt-0.5">
              Session&nbsp;
              <span className="text-cyan">{session.session_id}</span>
              &nbsp;·&nbsp;{session.profile?.toUpperCase()}
              &nbsp;·&nbsp;{session.origin} → {session.destination}
            </p>
          ) : (
            <p className="font-mono text-xs text-dim mt-0.5">
              No active session — start one in Session Manager
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {latest && (
            <span className="font-mono text-xs text-dim flex items-center gap-1.5">
              <Clock size={11} />
              {formatDistanceToNow(new Date(latest.ts * 1000), { addSuffix: true })}
            </span>
          )}
          <button onClick={refresh} className="btn-ghost flex items-center gap-2">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Tamper banner ──────────────────────────────── */}
      <TamperBanner active={tamperActive} />

      {/* ── Breach alert banners ────────────────────────── */}
      <AlertBanner events={events || []} />

      {/* ── Score row ──────────────────────────────────── */}
      <div className="card p-5 flex items-center justify-around gap-4">
        <ScoreGauge value={score?.cs ?? null}         label="Condition Score"  />
        <div className="w-px h-24 bg-border" />
        <ScoreGauge value={score?.is_running ?? null} label="Integrity Score"  size={160} />
        <div className="w-px h-24 bg-border" />
        {/* Session stats */}
        <div className="flex flex-col gap-3 min-w-36">
          <StatRow label="Profile"    value={profile.toUpperCase()} />
          <StatRow label="Device"     value={DEVICE_ID} />
          <StatRow label="Seq #"      value={latest?.seq ?? '--'} />
          <StatRow label="GPS Fix"
            value={latest?.gps_fix ? 'YES' : 'NO'}
            valueClass={latest?.gps_fix ? 'text-green' : 'text-orange'} />
          <StatRow label="HMAC"       value="OK" valueClass="text-green" />
        </div>
      </div>

      {/* ── Sensor cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SensorCard
          icon={Thermometer}
          label="Temperature"
          value={latest?.temp?.toFixed(1) ?? '--'}
          unit="°C"
          alert={tempAlert}
        />
        <SensorCard
          icon={Droplets}
          label="Humidity"
          value={latest?.humidity?.toFixed(1) ?? '--'}
          unit="% RH"
          alert={humAlert}
        />
        <SensorCard
          icon={Zap}
          label="G-Force Net"
          value={latest?.g_net?.toFixed(3) ?? '--'}
          unit="G"
          alert={gAlert}
        />
        <SensorCard
          icon={Ruler}
          label="Lid Distance"
          value={latest?.dist_cm ?? '--'}
          unit="cm"
          alert={tamperActive}
        />
      </div>

      {/* ── Bottom row: GPS + Events ────────────────────── */}
      {/* LCD Display removed — hardware offline (shorted unit, replacement pending)   */}
      {/* To restore: re-import LCDStatus, add it back here, uncomment props below     */}
      {/* <LCDStatus cs={score?.cs} temp={latest?.temp} humidity={latest?.humidity} tamper={tamperActive} /> */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* GPS card */}
        <div className="card p-4 flex flex-col gap-3">
          <span className="label flex items-center gap-2">
            <MapPin size={11} /> GPS Coordinates
          </span>
          {latest?.lat && latest?.lng ? (
            <>
              <div className="space-y-1">
                <StatRow label="Lat" value={latest.lat.toFixed(5)} />
                <StatRow label="Lng" value={latest.lng.toFixed(5)} />
              </div>
              <span className={`font-mono text-xs px-2 py-0.5 rounded border w-fit
                ${latest.gps_fix
                  ? 'text-green border-green/30 bg-green/10'
                  : 'text-orange border-orange/30 bg-orange/10'}`}>
                {latest.gps_fix ? 'Real GPS fix' : 'Simulated waypoint'}
              </span>
            </>
          ) : (
            <p className="font-mono text-xs text-lo">Awaiting GPS data…</p>
          )}
        </div>

        {/* Recent breach events */}
        <div className="card p-4 flex flex-col gap-3">
          <span className="label flex items-center gap-2">
            <Package size={11} /> Breach Events
          </span>
          {!events?.length ? (
            <p className="font-mono text-xs text-lo">No breach events recorded.</p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-40">
              {events.slice(-5).reverse().map(e => (
                <div key={e.event_id}
                  className="flex items-start gap-2 text-xs font-mono border-b border-border pb-1.5">
                  <span className={`mt-0.5 uppercase font-display font-bold tracking-wider
                    ${e.end_time ? 'text-dim' : 'text-orange'}`}>
                    {e.sensor}
                  </span>
                  <span className="text-lo">
                    peak&nbsp;{e.peak_value?.toFixed(2)}
                    {e.end_time ? ' · closed' : ' · OPEN'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function StatRow({ label, value, valueClass = 'text-cyan' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label text-[10px]">{label}</span>
      <span className={`font-mono text-xs font-medium ${valueClass}`}>{value}</span>
    </div>
  )
}
