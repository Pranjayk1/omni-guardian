// TamperBanner — full-width red alert when tamper flag is set
import { ShieldAlert } from 'lucide-react'

export default function TamperBanner({ active }) {
  if (!active) return null
  return (
    <div className="
      flex items-center gap-3 px-5 py-3 rounded border
      bg-red/10 border-red/50 animate-slideIn
    ">
      <ShieldAlert size={18} className="text-red shrink-0" />
      <div>
        <p className="font-display font-bold text-sm tracking-widest uppercase text-red">
          ⚠ TAMPER DETECTED
        </p>
        <p className="font-mono text-xs text-red/70 mt-0.5">
          Enclosure was opened during transit. Flag is permanent and written to EEPROM.
        </p>
      </div>
      <span className="ml-auto w-2 h-2 rounded-full bg-red animate-pulse2" />
    </div>
  )
}
