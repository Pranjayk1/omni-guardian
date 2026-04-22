import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { format } from 'date-fns'
import usePolling from '../hooks/usePolling'
import { getActiveSession, getTelemetry, getEvents, DEVICE_ID } from '../api'
import { BarChart2 } from 'lucide-react'

const CHART_LIMIT = 120  // last 120 readings

export default function Telemetry() {
  const { data: sessionData } = usePolling(() => getActiveSession(DEVICE_ID), 5000)
  const session = sessionData?.session_id ? sessionData : null

  const { data: rows, loading } = usePolling(
    () => session ? getTelemetry(session.session_id, CHART_LIMIT) : Promise.resolve([]),
    5000, [session?.session_id], []
  )

  const { data: events } = usePolling(
    () => session ? getEvents(session.session_id) : Promise.resolve([]),
    5000, [session?.session_id], []
  )

  // Recharts expects oldest → newest; API returns newest first
  const chartData = [...rows].reverse().map(r => ({
    ts:       r.ts,
    time:     format(new Date(r.ts * 1000), 'HH:mm:ss'),
    temp:     r.temp,
    humidity: r.humidity,
    g_net:    parseFloat(r.g_net?.toFixed(3)),
    cs:       parseFloat(r.cs?.toFixed(1)),
    is:       parseFloat(r.is_running?.toFixed(1)),
    tamper:   r.tamper ? 1 : 0,
    seq:      r.seq,
  }))

  // Breach start timestamps for reference lines
  const breachLines = events.flatMap(e => [
    { ts: e.start_time, label: `${e.sensor} breach`, color: '#ff4444' },
    ...(e.end_time ? [{ ts: e.end_time, label: `${e.sensor} closed`, color: '#4a6a85' }] : []),
  ])

  if (!session) return (
    <div className="flex items-center justify-center h-full text-dim font-mono p-6">
      No active session — start one in Session Manager.
    </div>
  )

  return (
    <div className="flex flex-col gap-6 p-6 animate-slideIn">
      <div>
        <h1 className="font-display font-bold text-2xl tracking-widest uppercase text-hi">
          Telemetry Charts
        </h1>
        <p className="font-mono text-xs text-dim mt-0.5">
          Last {CHART_LIMIT} packets · Session {session.session_id} · 5-second refresh
        </p>
      </div>

      {loading && !chartData.length ? (
        <p className="font-mono text-xs text-dim">Loading…</p>
      ) : (
        <>
          {/* Temperature */}
          <ChartCard title="Temperature (°C)" color="#00d4ff" breachLines={breachLines}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d42" />
              <XAxis dataKey="time" tick={tick} interval="preserveStartEnd" />
              <YAxis tick={tick} width={40} />
              <Tooltip content={<CustomTooltip unit="°C" />} />
              {breachLines.map((b, i) =>
                <ReferenceLine key={i} x={format(new Date(b.ts * 1000), 'HH:mm:ss')}
                  stroke={b.color} strokeDasharray="4 4" label={{ value: b.label, fill: b.color, fontSize: 10 }} />
              )}
              <Line type="monotone" dataKey="temp" stroke="#00d4ff"
                    dot={false} strokeWidth={1.8} activeDot={{ r: 4 }} />
            </LineChart>
          </ChartCard>

          {/* Humidity */}
          <ChartCard title="Humidity (% RH)" color="#7fa8c4" breachLines={breachLines}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d42" />
              <XAxis dataKey="time" tick={tick} interval="preserveStartEnd" />
              <YAxis tick={tick} width={40} />
              <Tooltip content={<CustomTooltip unit="% RH" />} />
              <Line type="monotone" dataKey="humidity" stroke="#7fa8c4"
                    dot={false} strokeWidth={1.8} activeDot={{ r: 4 }} />
            </LineChart>
          </ChartCard>

          {/* G-Force */}
          <ChartCard title="G-Force Net (G)" color="#ff9500" breachLines={breachLines}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d42" />
              <XAxis dataKey="time" tick={tick} interval="preserveStartEnd" />
              <YAxis tick={tick} width={40} />
              <Tooltip content={<CustomTooltip unit=" G" />} />
              <Line type="monotone" dataKey="g_net" stroke="#ff9500"
                    dot={false} strokeWidth={1.8} activeDot={{ r: 4 }} />
            </LineChart>
          </ChartCard>

          {/* CS + IS */}
          <ChartCard title="Condition Score & Integrity Score" color="#00e676">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d42" />
              <XAxis dataKey="time" tick={tick} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={tick} width={40} />
              <Tooltip content={<CustomTooltip unit="" />} />
              <Legend wrapperStyle={{ color: '#7fa8c4', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
              {/* Band zones */}
              <ReferenceLine y={80} stroke="#00e676" strokeDasharray="4 4" strokeOpacity={0.3} />
              <ReferenceLine y={60} stroke="#ffd600" strokeDasharray="4 4" strokeOpacity={0.3} />
              <ReferenceLine y={40} stroke="#ff9500" strokeDasharray="4 4" strokeOpacity={0.3} />
              <Line type="monotone" dataKey="cs" stroke="#00d4ff" name="CS"
                    dot={false} strokeWidth={2} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="is" stroke="#00e676" name="IS"
                    dot={false} strokeWidth={2} strokeDasharray="6 3" activeDot={{ r: 4 }} />
            </LineChart>
          </ChartCard>

          {/* Raw telemetry table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p className="label">Raw Telemetry Feed</p>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-dim text-left">
                    {['Seq','Time','Temp','Hum','G_net','Dist','Tamper','CS','IS','GPS'].map(h => (
                      <th key={h} className="px-3 py-2 font-display tracking-wider uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...rows].slice(0, 50).map(r => (
                    <tr key={r.seq} className="border-t border-border hover:bg-surface/60 transition-colors">
                      <td className="px-3 py-1.5 text-cyan">{r.seq}</td>
                      <td className="px-3 py-1.5 text-lo">{format(new Date(r.ts * 1000), 'HH:mm:ss')}</td>
                      <td className="px-3 py-1.5">{r.temp?.toFixed(1)}</td>
                      <td className="px-3 py-1.5">{r.humidity?.toFixed(1)}</td>
                      <td className="px-3 py-1.5">{r.g_net?.toFixed(3)}</td>
                      <td className="px-3 py-1.5">{r.dist_cm}</td>
                      <td className="px-3 py-1.5">
                        <span className={r.tamper ? 'text-red' : 'text-green'}>
                          {r.tamper ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-cyan">{r.cs?.toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-green">{r.is_running?.toFixed(1)}</td>
                      <td className="px-3 py-1.5">
                        <span className={r.gps_fix ? 'text-green' : 'text-orange'}>
                          {r.gps_fix ? 'REAL' : 'SIM'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

function ChartCard({ title, color, children }) {
  return (
    <div className="card p-5">
      <p className="label mb-4" style={{ color }}>{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

const tick = { fill: '#3d6480', fontSize: 10, fontFamily: 'JetBrains Mono' }

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded px-3 py-2 font-mono text-xs">
      <p className="text-dim mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name || p.dataKey}: {p.value}{unit}
        </p>
      ))}
    </div>
  )
}
