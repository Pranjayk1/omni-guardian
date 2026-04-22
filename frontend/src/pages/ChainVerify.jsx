import { useState } from 'react'
import { format } from 'date-fns'
import { Link2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, AlertTriangle } from 'lucide-react'
import usePolling from '../hooks/usePolling'
import { getActiveSession, verifyChain, getRejected, DEVICE_ID } from '../api'

export default function ChainVerify() {
  const { data: sessionData } = usePolling(() => getActiveSession(DEVICE_ID), 10000)
  const session = sessionData?.session_id ? sessionData : null

  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying,    setVerifying]    = useState(false)
  const [verifyError,  setVerifyError]  = useState(null)

  const { data: rejected, loading: rejLoading } = usePolling(getRejected, 10000, [], [])

  const handleVerify = async () => {
    if (!session) return
    setVerifying(true)
    setVerifyError(null)
    try {
      const res = await verifyChain(session.session_id)
      setVerifyResult(res)
    } catch (e) {
      setVerifyError(e?.response?.data?.detail || e.message)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 animate-slideIn">

      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl tracking-widest uppercase text-hi">
          Chain Verification
        </h1>
        <p className="font-mono text-xs text-dim mt-0.5">
          Walk the full linked hash chain to detect any post-storage tampering
        </p>
      </div>

      {/* Verify panel */}
      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <p className="label flex items-center gap-2">
            <Link2 size={11} /> Hash Chain Integrity
          </p>
          <button
            onClick={handleVerify}
            disabled={!session || verifying}
            className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={13} className={verifying ? 'animate-spin' : ''} />
            {verifying ? 'Verifying…' : 'Run Verification'}
          </button>
        </div>

        {!session && (
          <p className="font-mono text-xs text-dim">No active session.</p>
        )}

        {verifyError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded border bg-red/10 border-red/40">
            <AlertTriangle size={14} className="text-red" />
            <p className="font-mono text-xs text-red">{verifyError}</p>
          </div>
        )}

        {verifyResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className={`flex items-center gap-4 px-5 py-4 rounded border
              ${verifyResult.intact
                ? 'bg-green/10 border-green/30'
                : 'bg-red/10 border-red/30'}`}>
              {verifyResult.intact
                ? <ShieldCheck size={24} className="text-green" />
                : <ShieldX     size={24} className="text-red"   />
              }
              <div>
                <p className={`font-display font-bold text-lg tracking-wider uppercase
                  ${verifyResult.intact ? 'text-green' : 'text-red'}`}>
                  {verifyResult.intact ? 'Chain Intact ✓' : 'Chain Broken ✗'}
                </p>
                <p className="font-mono text-xs text-dim mt-0.5">
                  {verifyResult.records_checked ?? 0} records checked
                  {!verifyResult.intact && verifyResult.first_broken_seq
                    ? ` · First break at seq #${verifyResult.first_broken_seq}`
                    : ''}
                </p>
              </div>
            </div>

            {/* Chain links table */}
            {verifyResult.links?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-surface">
                    <tr className="text-dim text-left">
                      {['Seq', 'Record Hash (truncated)', 'Prev Hash', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2 font-display tracking-wider uppercase border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {verifyResult.links.map((link, i) => (
                      <tr key={i} className={`border-b border-border hover:bg-surface/60 transition-colors
                        ${!link.ok ? 'bg-red/5' : ''}`}>
                        <td className="px-3 py-2 text-cyan">{link.seq}</td>
                        <td className="px-3 py-2 text-lo">{link.record_hash?.slice(0, 20)}…</td>
                        <td className="px-3 py-2 text-lo">{link.prev_hash?.slice(0, 20) ?? 'GENESIS'}</td>
                        <td className="px-3 py-2">
                          {link.ok
                            ? <span className="text-green flex items-center gap-1">
                                <ShieldCheck size={11} /> OK
                              </span>
                            : <span className="text-red flex items-center gap-1">
                                <ShieldAlert size={11} /> BROKEN
                              </span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rejected packets */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <p className="label flex items-center gap-2">
            <ShieldAlert size={11} className="text-red" />
            HMAC-Rejected Packets
          </p>
          <span className={`font-mono text-xs px-2 py-0.5 rounded border
            ${rejected.length > 0
              ? 'text-red border-red/30 bg-red/10'
              : 'text-green border-green/30 bg-green/10'}`}>
            {rejected.length} rejected
          </span>
        </div>
        {rejLoading ? (
          <p className="p-4 font-mono text-xs text-dim">Loading…</p>
        ) : !rejected.length ? (
          <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
            <ShieldCheck size={24} className="text-green opacity-60" />
            <p className="font-mono text-xs text-dim">No rejected packets. All HMACs verified clean.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-dim text-left">
                  {['Time', 'Device', 'Reason', 'HMAC (truncated)', 'Payload (truncated)'].map(h => (
                    <th key={h} className="px-3 py-2 font-display tracking-wider uppercase border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rejected.map((r, i) => (
                  <tr key={i} className="border-b border-border hover:bg-red/5 transition-colors">
                    <td className="px-3 py-2 text-lo whitespace-nowrap">
                      {format(new Date(r.received_at * 1000), 'HH:mm:ss dd/MM')}
                    </td>
                    <td className="px-3 py-2 text-orange">{r.device_id}</td>
                    <td className="px-3 py-2 text-red">{r.reason}</td>
                    <td className="px-3 py-2 text-lo">{r.received_hmac?.slice(0, 16)}…</td>
                    <td className="px-3 py-2 text-lo max-w-xs truncate">{r.raw_payload?.slice(0, 40)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Explainer */}
      <div className="card px-5 py-4 flex flex-col gap-2">
        <p className="label">How the Chain Works</p>
        <p className="font-mono text-xs text-dim leading-5">
          Each telemetry record stores a <span className="text-cyan">record_hash</span> = SHA-256(payload + hmac + prev_hash).
          The prev_hash links it to the previous record, forming a chain.
          Any database edit changes the record_hash, which breaks every subsequent link.
          The verifier walks every record and recomputes hashes — a mismatch pinpoints the exact tampered record.
        </p>
      </div>
    </div>
  )
}
