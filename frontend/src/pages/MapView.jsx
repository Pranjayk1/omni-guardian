import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet'
import usePolling from '../hooks/usePolling'
import { getActiveSession, getMapData, DEVICE_ID, bandColor, getBand } from '../api'
import { MapPin, Layers } from 'lucide-react'

// Auto-fit map to markers when data changes
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [40, 40] })
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14)
    }
  }, [points, map])
  return null
}

export default function MapView() {
  const { data: sessionData } = usePolling(() => getActiveSession(DEVICE_ID), 5000)
  const session = sessionData?.session_id ? sessionData : null

  const { data: mapPoints, loading } = usePolling(
    () => session ? getMapData(session.session_id) : Promise.resolve([]),
    5000, [session?.session_id], []
  )

  const validPoints = mapPoints.filter(p => p.lat && p.lng)
  const polyline    = validPoints.map(p => [p.lat, p.lng])
  const latest      = validPoints[validPoints.length - 1]

  return (
    <div className="flex flex-col gap-5 p-6 h-full animate-slideIn">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl tracking-widest uppercase text-hi">
            Live Map
          </h1>
          <p className="font-mono text-xs text-dim mt-0.5">
            {session
              ? `${session.origin} → ${session.destination} · ${validPoints.length} points`
              : 'No active session'}
          </p>
        </div>
        <Legend />
      </div>

      {/* Map */}
      <div className="card overflow-hidden flex-1" style={{ minHeight: 480 }}>
        {!session ? (
          <div className="flex items-center justify-center h-full text-dim font-mono text-sm">
            Start a session to see the route map.
          </div>
        ) : (
          <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            style={{ height: '100%', width: '100%', background: '#060c12' }}
            zoomControl
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution=""
            />

            {validPoints.length > 0 && <FitBounds points={validPoints} />}

            {/* Route polyline */}
            {polyline.length > 1 && (
              <Polyline
                positions={polyline}
                pathOptions={{ color: '#00d4ff', weight: 2, opacity: 0.4, dashArray: '6 6' }}
              />
            )}

            {/* Markers — colour-coded by CS */}
            {validPoints.map((p, i) => {
              const band   = getBand(p.cs)
              const color  = bandColor(band)
              const isLast = i === validPoints.length - 1
              return (
                <CircleMarker
                  key={p.seq ?? i}
                  center={[p.lat, p.lng]}
                  radius={isLast ? 10 : p.tamper ? 7 : 5}
                  pathOptions={{
                    color:       p.tamper ? '#ff4444' : color,
                    fillColor:   p.tamper ? '#ff4444' : color,
                    fillOpacity: isLast ? 0.95 : 0.6,
                    weight:      isLast ? 2 : 1,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, lineHeight: 1.6,
                                  background: '#0d1822', color: '#e8f4fc', padding: '6px 10px',
                                  border: '1px solid #1a2d42', borderRadius: 4 }}>
                      <div>Seq <strong>{p.seq}</strong></div>
                      <div>CS&nbsp;&nbsp;
                        <span style={{ color }}>{p.cs?.toFixed(1)}</span>
                        &nbsp;({band})
                      </div>
                      {p.tamper && <div style={{ color: '#ff4444' }}>⚠ TAMPER</div>}
                      {!p.gps_fix && <div style={{ color: '#ff9500' }}>~Simulated GPS</div>}
                    </div>
                  </Tooltip>
                </CircleMarker>
              )
            })}
          </MapContainer>
        )}
      </div>

      {/* Stats bar */}
      {session && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Points', value: validPoints.length },
            { label: 'Tamper Events', value: validPoints.filter(p => p.tamper).length,
              color: validPoints.some(p => p.tamper) ? 'text-red' : 'text-green' },
            { label: 'GPS Real Fix',  value: validPoints.filter(p => p.gps_fix).length },
            { label: 'Latest CS',
              value: latest ? `${latest.cs?.toFixed(1)} (${getBand(latest.cs)})` : '--',
              color: latest ? '' : 'text-dim' },
          ].map(s => (
            <div key={s.label} className="card px-4 py-3">
              <p className="label mb-1">{s.label}</p>
              <p className={`font-mono text-lg font-bold ${s.color || 'text-cyan'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Legend() {
  const items = [
    { color: '#00e676', label: 'ACCEPT'      },
    { color: '#ffd600', label: 'REVIEW'      },
    { color: '#ff9500', label: 'INVESTIGATE' },
    { color: '#ff4444', label: 'REJECT'      },
  ]
  return (
    <div className="card px-4 py-2 flex items-center gap-4">
      <Layers size={12} className="text-dim" />
      {items.map(i => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: i.color }} />
          <span className="font-mono text-xs text-dim">{i.label}</span>
        </div>
      ))}
    </div>
  )
}
