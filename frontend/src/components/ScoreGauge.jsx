// ScoreGauge — SVG arc gauge for Condition Score / Integrity Score
import { getBand, bandColor } from '../api'

export default function ScoreGauge({ value, label, size = 140 }) {
  const band   = getBand(value)
  const color  = bandColor(band)
  const pct    = Math.min(Math.max(value ?? 0, 0), 100) / 100

  // Arc geometry
  const cx = size / 2, cy = size / 2
  const r  = size * 0.38
  // 210° sweep (from 195° to 345° i.e. -165° to -345° in SVG coords)
  const startAngle = 215
  const sweepAngle = 290
  const endAngle   = startAngle + sweepAngle * pct

  const toRad = (deg) => (deg * Math.PI) / 180
  const arcX  = (deg) => cx + r * Math.cos(toRad(deg - 90))
  const arcY  = (deg) => cy + r * Math.sin(toRad(deg - 90))

  const largeArc = sweepAngle * pct > 180 ? 1 : 0

  const trackD = describeArc(cx, cy, r, startAngle, startAngle + sweepAngle)
  const fillD  = pct > 0
    ? describeArc(cx, cy, r, startAngle, endAngle, largeArc)
    : ''

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <path d={trackD} fill="none" stroke="#1a2d42" strokeWidth={size * 0.07}
              strokeLinecap="round" />
        {/* Fill */}
        {pct > 0 && (
          <path d={fillD} fill="none" stroke={color} strokeWidth={size * 0.07}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
        )}
        {/* Value */}
        <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
              fill={color} fontSize={size * 0.22} fontFamily="JetBrains Mono"
              fontWeight="700">
          {value !== null && value !== undefined ? Math.round(value) : '--'}
        </text>
        {/* Band label */}
        <text x={cx} y={cy + size * 0.22} textAnchor="middle"
              fill="#4a6a85" fontSize={size * 0.085} fontFamily="Barlow Condensed"
              letterSpacing="3" fontWeight="600">
          {band}
        </text>
      </svg>
      <p className="label">{label}</p>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────
function toRad(deg) { return (deg * Math.PI) / 180 }

function describeArc(cx, cy, r, startDeg, endDeg) {
  const start = {
    x: cx + r * Math.cos(toRad(startDeg - 90)),
    y: cy + r * Math.sin(toRad(startDeg - 90)),
  }
  const end = {
    x: cx + r * Math.cos(toRad(endDeg - 90)),
    y: cy + r * Math.sin(toRad(endDeg - 90)),
  }
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}
