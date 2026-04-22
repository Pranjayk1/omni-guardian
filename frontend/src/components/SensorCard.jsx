// SensorCard — displays a single live sensor reading
export default function SensorCard({ icon: Icon, label, value, unit, alert = false, dim = false }) {
  return (
    <div className={`card p-4 flex flex-col gap-2 transition-all duration-300
      ${alert ? 'border-red/50 bg-red/5' : dim ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <Icon size={14} className={alert ? 'text-red' : 'text-dim'} strokeWidth={1.8} />
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`font-mono text-2xl font-bold leading-none
          ${alert ? 'text-red' : 'text-hi'}`}>
          {value !== null && value !== undefined ? value : '--'}
        </span>
        <span className="font-mono text-xs text-dim mb-0.5">{unit}</span>
      </div>
      {alert && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red animate-pulse2 inline-block" />
          <span className="font-display text-xs text-red font-semibold tracking-wider uppercase">Breach</span>
        </div>
      )}
    </div>
  )
}
