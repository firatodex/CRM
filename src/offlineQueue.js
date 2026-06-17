// ── Offline sync queue ──
// A durable, IndexedDB-backed queue for mutations made while offline.
// Scope (intentionally limited for now): logging a contact, and marking
// a task done. These are the two actions most likely to happen in the
// field with no signal. Everything else still requires connectivity.
//
// Design principles that prevent duplicates / lost writes:
//  1. Every queued action carries a client-generated UUID created BEFORE
//     it ever reaches Supabase. On sync, that UUID is used as the row's
//     primary key (insert) or the match key (update). If the same action
//     is sent twice — e.g. a retry after a flaky response, or the app
//     reloading mid-sync — the second attempt is a harmless no-op, not
//     a duplicate row.
//  2. The queue itself lives in IndexedDB, not React state or
//     localStorage, so a closed tab or killed app doesn't lose anything
//     that hasn't synced yet.
//  3. The queue drains strictly in order, one entry at a time — never in
//     parallel — so two edits to the same record apply in the order they
//     were made, not in network-race order.
//  4. A failed entry (a real error, not a network failure) is marked
//     'failed' and skipped, not silently dropped and not retried forever.
//     It stays visible until you resolve it.

import { openDB } from 'idb'

const DB_NAME = 'opscraft-offline'
const DB_VERSION = 1
const STORE = 'queue'

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'queueId' })
          store.createIndex('status', 'status')
          store.createIndex('createdAt', 'createdAt')
        }
      },
    })
  }
  return dbPromise
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for older browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Enqueue a new action. `rowId` is the client-generated UUID that will be
// used as the actual primary key (for inserts) or match key (for updates)
// in Supabase — generated here, once, before anything touches the network.
export async function enqueue(action) {
  const db = await getDB()
  const entry = {
    queueId: uuid(),
    rowId: action.rowId || uuid(),
    type: action.type,           // 'log_contact' | 'task_done'
    payload: action.payload,     // action-specific data
    status: 'pending',           // 'pending' | 'failed'
    error: null,
    createdAt: Date.now(),
  }
  await db.add(STORE, entry)
  return entry
}

export async function getQueue() {
  const db = await getDB()
  return db.getAll(STORE)
}

export async function getPendingCount() {
  const all = await getQueue()
  return all.filter(e => e.status === 'pending').length
}

export async function getFailedEntries() {
  const all = await getQueue()
  return all.filter(e => e.status === 'failed')
}

export async function removeFromQueue(queueId) {
  const db = await getDB()
  await db.delete(STORE, queueId)
}

export async function markFailed(queueId, errorMessage) {
  const db = await getDB()
  const entry = await db.get(STORE, queueId)
  if (entry) {
    entry.status = 'failed'
    entry.error = errorMessage
    await db.put(STORE, entry)
  }
}

export async function retryEntry(queueId) {
  const db = await getDB()
  const entry = await db.get(STORE, queueId)
  if (entry) {
    entry.status = 'pending'
    entry.error = null
    await db.put(STORE, entry)
  }
}

// Drain the queue strictly in order, oldest first, one at a time.
// `handlers` maps action type -> async function(payload, rowId) that
// performs the actual Supabase call. Returns a summary of what happened.
export async function drainQueue(handlers, { onProgress } = {}) {
  const all = await getQueue()
  const pending = all
    .filter(e => e.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)

  let synced = 0
  let failed = 0

  for (const entry of pending) {
    const handler = handlers[entry.type]
    if (!handler) {
      await markFailed(entry.queueId, `Unknown action type: ${entry.type}`)
      failed++
      continue
    }
    try {
      await handler(entry.payload, entry.rowId)
      await removeFromQueue(entry.queueId)
      synced++
    } catch (err) {
      // Network errors should stay 'pending' so we retry next time we're
      // online. Real errors (validation, RLS, etc.) get marked 'failed'
      // so they don't retry forever and silently block the queue.
      const isNetworkError = err?.message?.toLowerCase().includes('fetch') ||
                              err?.message?.toLowerCase().includes('network') ||
                              !navigator.onLine
      if (isNetworkError) {
        // Stop draining — we've likely lost connectivity again. Leave
        // remaining entries pending for the next online event.
        break
      }
      await markFailed(entry.queueId, err?.message || 'Unknown error')
      failed++
    }
    if (onProgress) onProgress({ synced, failed, remaining: pending.length - synced - failed })
  }

  return { synced, failed }
}
