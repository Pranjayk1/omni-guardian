import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Map, BarChart2,
  Link2, Settings, Wifi, WifiOff,
} from 'lucide-react'

const NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/map',      icon: Map,             label: 'Live Map'    },
  { to: '/telemetry',icon: BarChart2,       label: 'Telemetry'   },
  { to: '/chain',    icon: Link2,           label: 'Chain Verify'},
  { to: '/session',  icon: Settings,        label: 'Session Mgr' },
]

export default function Sidebar({ backendOnline }) {
  return (
    <aside className="
      flex flex-col w-56 min-h-screen shrink-0
      bg-surface border-r border-border
    ">
      {/* Logo */}
      <div className="px-5 pt-7 pb-6 border-b border-border">
        <p className="font-display font-bold text-xl tracking-widest text-cyan uppercase">
          OMNI
        </p>
        <p className="font-display font-light text-xs tracking-[0.3em] text-dim uppercase mt-0.5">
          Guardian Shield
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded font-display font-medium
               text-sm tracking-wider uppercase transition-all duration-150
               ${isActive
                 ? 'bg-cyan/10 text-cyan border border-cyan/20'
                 : 'text-dim hover:text-hi hover:bg-surface border border-transparent'
               }`
            }
          >
            <Icon size={15} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Backend status */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2">
          {backendOnline
            ? <Wifi size={13} className="text-green" />
            : <WifiOff size={13} className="text-red animate-pulse2" />
          }
          <span className="font-mono text-xs text-dim">
            {backendOnline ? 'Backend online' : 'Backend offline'}
          </span>
        </div>
        <p className="font-mono text-xs text-lo mt-1">Device: OG-001</p>
      </div>
    </aside>
  )
}
