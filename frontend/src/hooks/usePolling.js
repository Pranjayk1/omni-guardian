// usePolling — runs fetchFn every `intervalMs` ms.
// Returns { data, error, loading, refresh }
// The first fetch fires immediately on mount.

import { useState, useEffect, useCallback, useRef } from 'react'

export default function usePolling(fetchFn, intervalMs = 5000, deps = [], initialValue = null) {
  const [data,    setData]    = useState(initialValue)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  const run = useCallback(async () => {
    try {
      const result = await fetchFn()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    setLoading(true)
    run()
    timerRef.current = setInterval(run, intervalMs)
    return () => clearInterval(timerRef.current)
  }, [run, intervalMs])

  return { data, error, loading, refresh: run }
}
