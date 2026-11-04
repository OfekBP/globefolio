// Offline cache for the app itself: scripts, map data and flags are served from cache first and refreshed in the background; pages go to the network first.
// Only same-origin files are cached. Anything else (the cloud API, sign-in, other sites) goes straight to the network and is never stored.
// Two caches: the app's code is named after the build, so every release drops the old files; map data, flags and brand files rarely change and stay.
const APP = 'globefolio-app-__BUILD__'
const DATA = 'globefolio-data-v1'
const STABLE = /\/(geo|flags|brand)\//
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET') return
  const url = new URL(r.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(caches.open(STABLE.test(url.pathname) ? DATA : APP).then(async c => {
    const hit = await c.match(r)
    const store = res => { if (res.ok && res.status === 200) c.put(r, res.clone()).catch(() => {}); return res }
    // pages are fetched fresh first, so a new release shows on the next open; the cache is the offline fallback
    if (r.mode === 'navigate') return fetch(r).then(store).catch(() => hit ?? Response.error())
    const net = fetch(r).then(store).catch(() => hit ?? Response.error())
    return hit || net
  }))
})
