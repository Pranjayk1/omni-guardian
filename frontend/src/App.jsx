import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Sidebar       from './components/Sidebar'
import Dashboard     from './pages/Dashboard'
import MapView       from './pages/MapView'
import Telemetry     from './pages/Telemetry'
import ChainVerify   from './pages/ChainVerify'
import SessionManager from './pages/SessionManager'
import { getHealth } from './api'

export default function App() {
  const [backendOnline, setBackendOnline] = useState(false)

  // Lightweight health-check every 10s
  useEffect(() => {
    const check = async () => {
      try {
        await getHealth()
        setBackendOnline(true)
      } catch {
        setBackendOnline(false)
      }
    }
    check()
    const t = setInterval(check, 10000)
    return () => clearInterval(t)
  }, [])

  return (
    <BrowserRouter>
      {/* Subtle scanline overlay for the aesthetic */}
      <div className="scanline-overlay" aria-hidden />

      <div className="flex min-h-screen bg-bg">
        <Sidebar backendOnline={backendOnline} />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-h-screen">
          <Routes>
            <Route path="/"         element={<Dashboard />}      />
            <Route path="/map"      element={<MapView />}         />
            <Route path="/telemetry"element={<Telemetry />}       />
            <Route path="/chain"    element={<ChainVerify />}     />
            <Route path="/session"  element={<SessionManager />}  />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
