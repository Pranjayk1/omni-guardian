import { TrendingDown, X } from 'lucide-react'
import { useState } from 'react'

export default function AlertBanner({ events = [] }) {
  const [dismissed, setDismissed] = useState([])

  // Show open (no end_time) breach events that haven't been dismissed
  const active = events.filter(e => !e.end_time && !dismissed.includes(e.event_id))

  if (!active.length) return null

  return (
    <div className="space-y-2">
      {active.map(evt => (
        <div key={evt.event_id}
          className="flex items-start gap-3 px-5 py-3 rounded border
                     bg-orange/10 border-orange/40 animate-slideIn">
          <TrendingDown size={16} className="text-orange shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-display font-bold text-sm tracking-widest uppercase text-orange">
              Active Breach — {evt.sensor?.toUpperCase()}
            </p>
            <p className="font-mono text-xs text-orange/70 mt-0.5">
              Peak: {evt.peak_value?.toFixed(2)} · Duration: {evt.duration_seconds ?? 'ongoing'}s ·
              Started seq #{evt.start_seq}
            </p>
          </div>
          <button onClick={() => setDismissed(d => [...d, evt.event_id])}
                  className="text-orange/50 hover:text-orange transition-colors ml-2">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
