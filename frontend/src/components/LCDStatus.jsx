// =============================================================
// LCDStatus.jsx — Simulated 16×2 LCD display panel
//
// NOTE: The physical LCD display (16×2 I2C) shorted during
// construction and has not been replaced yet.
// This component is INCLUDED in the UI for completeness but
// the live-data wiring is COMMENTED OUT below.
// When the replacement LCD arrives, uncomment the props and
// the useEffect in Dashboard.jsx that passes real data here.
// =============================================================

// -- COMMENTED OUT: import of live data props --
// Props when live: { cs, temp, humidity, tamper }

export default function LCDStatus(/* { cs, temp, humidity, tamper } */) {
  // -- COMMENTED OUT: derive display strings from live data --
  // const row1 = `CS:${String(Math.round(cs)).padStart(3)} T:${temp?.toFixed(1)}C`
  // const row2 = tamper ? '!! TAMPER !!' : `H:${humidity?.toFixed(1)}%`

  // Static placeholder strings shown until LCD hardware is restored
  const row1 = 'CS:--- T:--.-C'
  const row2 = 'H:--.-% [LCD N/A]'

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label">LCD Display (on-device)</span>
        <span className="font-mono text-xs text-orange border border-orange/30 bg-orange/10 px-2 py-0.5 rounded">
          HW OFFLINE
        </span>
      </div>

      {/* 16×2 LCD visual simulation */}
      <div className="
        bg-[#1a2e1a] border border-[#2a4a2a] rounded p-3
        font-mono text-sm leading-6 tracking-widest
        shadow-[inset_0_0_12px_rgba(0,255,0,0.06)]
      ">
        {/* Row 1 */}
        <div className="text-[#4aff4a] opacity-80">
          {row1.padEnd(16).slice(0, 16)}
        </div>
        {/* Row 2 */}
        <div className="text-[#4aff4a] opacity-80">
          {row2.padEnd(16).slice(0, 16)}
        </div>
      </div>

      <p className="font-mono text-xs text-lo">
        {/* -- COMMENTED OUT: 'Live feed from Arduino Uno via UART' -- */}
        Placeholder — LCD hardware pending replacement
      </p>
    </div>
  )
}
