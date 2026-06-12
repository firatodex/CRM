// Service Worker — required for PWA installability
// Minimal implementation: just makes the CRM installable,
// no aggressive caching that could serve stale data.

const CACHE = 'opscraft-v2'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  )
})

// Network-first strategy — always fetch fresh data from Supabase
self.addEventListener('fetch', e => {
  // Don't intercept Supabase API calls or Gemini calls
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('generativelanguage')) {
    return
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
})
