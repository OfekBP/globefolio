// Offline cache for the app itself: scripts, map data and flags are served from cache first and refreshed in the background; pages go to the network first.
// Only same-origin files are cached. Anything else (the cloud API, sign-in, other sites) goes straight to the network and is never stored.
const CACHE = 'globefolio-v1'
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET') return
  const url = new URL(r.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r)
    // pages are fetched fresh first, so a new release shows on the next open; the cache is the offline fallback
    if (r.mode === 'navigate') return fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res }).catch(() => hit ?? Response.error())
    const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res }).catch(() => hit ?? Response.error())
    return hit || net
  }))
})
