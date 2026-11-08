// Offline cache for the app itself. Only same-origin files are cached; anything else (the cloud API, sign-in, other sites) goes straight to the network and is never stored.
// - The build lists every code file in PRECACHE, and they are all stored when the service worker installs, so the app opens instantly and works offline from the second visit on.
// - Pages are served from the cache at once and refreshed in the background (the next open shows a new release); files named by a content hash never change, so they are not re-fetched.
// - Two caches: the app's code is named after the build, so every release drops the old files; map data, flags and brand files rarely change and stay.
const APP = 'globefolio-app-__BUILD__'
const DATA = 'globefolio-data-v1'
const PRECACHE = __PRECACHE__
const DATA_PRECACHE = ['geo/countries.json', 'geo/cities.json']
const STABLE = /\/(geo|flags|brand)\//
const HASHED = /\/assets\/.+-[\w-]{8}\.\w+$/

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const quiet = (c, urls) => Promise.allSettled(urls.map(u => c.add(new Request(u, { cache: 'reload' }))))
    await quiet(await caches.open(APP), PRECACHE)
    await quiet(await caches.open(DATA), DATA_PRECACHE)
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim())))

self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET') return
  const url = new URL(r.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(caches.open(STABLE.test(url.pathname) ? DATA : APP).then(async c => {
    const nav = r.mode === 'navigate'
    const hit = await c.match(r, { ignoreSearch: nav })
    const net = () => fetch(r).then(res => { if (res.ok && res.status === 200) c.put(nav ? new Request(r.url.split(/[?#]/)[0]) : r, res.clone()).catch(() => {}); return res })
    if (hit) {
      if (!HASHED.test(url.pathname)) e.waitUntil(net().catch(() => {})) // refresh quietly for next time
      return hit
    }
    return net().catch(() => Response.error())
  }))
})
