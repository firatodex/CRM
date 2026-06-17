import { useState, useEffect, useCallback, useRef } from 'react'
import { drainQueue, getPendingCount, getFailedEntries, enqueue } from './offlineQueue'

// Manages: online/offline detection, the pending/failed counts for the UI
// indicator, and auto-draining the queue whenever connectivity returns.
// `handlers` maps action type -> async function(payload, rowId) that
// performs the actual Supabase write for that action type.
export function useOfflineSync(handlers) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const refreshCounts = useCallback(async () => {
    const [pending, failed] = await Promise.all([getPendingCount(), getFailedEntries()])
    setPendingCount(pending)
    setFailedCount(failed.length)
  }, [])

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return
    setSyncing(true)
    try {
      await drainQueue(handlersRef.current)
    } finally {
      setSyncing(false)
      await refreshCounts()
    }
  }, [syncing, refreshCounts])

  useEffect(() => {
    refreshCounts()
    function handleOnline() { setIsOnline(true); sync() }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    // Also try once on mount, in case there's a leftover queue from a
    // previous session that never got the chance to sync.
    if (navigator.onLine) sync()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Queue a new action: writes to durable storage immediately, then
  // attempts an immediate sync if we appear to be online (best-effort —
  // if that immediate attempt fails due to network, it just stays queued).
  const queueAction = useCallback(async (type, payload, rowId) => {
    await enqueue({ type, payload, rowId })
    await refreshCounts()
    if (navigator.onLine) sync()
  }, [refreshCounts, sync])

  return { isOnline, pendingCount, failedCount, syncing, queueAction, sync, refreshCounts }
}
