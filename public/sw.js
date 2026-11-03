// Tiny offline cache: app shell, data and flags are served from cache first, then refreshed in the background.
const CACHE = 'triptrack-v1'
self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET' || !/^https?:/.test(r.url)) return
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r)
    const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res }).catch(() => hit ?? Response.error())
    return hit || net
  }))
})
