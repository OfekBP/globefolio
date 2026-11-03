import './styles.css'
import { anchorOf, distanceKm, loadCountries } from './data/countries'
import { createGlobe, type Pin, type Trail } from './globe'
import { allTrips, deleteTrip, getHome, onChange, replaceAll, saveTrip, setHome, type Trip } from './store'
import { createDrawer } from './ui/drawer'
import { esc, plural, yearOf } from './ui/format'
import { createTimeline } from './ui/timeline'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const WORLD_TOTAL = 195

async function boot() {
  const countries = await loadCountries()
  const byIso = new Map(countries.map(c => [c.properties.i, c]))
  let trips: Trip[] = []
  let home: string | undefined
  let year: number | null = null
  let askedHome = false

  const globe = createGlobe($('globe'), countries, {
    onSelect: c => drawer.open({ k: 'country', iso: c.properties.i }),
    onHover: () => {},
  })

  const drawer = createDrawer({
    root: $('drawer'),
    countries, byIso,
    trips: () => trips,
    home: () => home,
    focus: c => {
      globe.setSelected(c)
      if (c) globe.flyToCountry(c)
    },
    save: t => saveTrip(t),
    remove: id => deleteTrip(id),
    setHome: iso => setHome(iso),
  })
  const timeline = createTimeline($('timeline'), y => { year = y; view() })

  const visibleTrips = () => (year === null ? trips : trips.filter(t => { const y = yearOf(t.startDate); return y === undefined || y <= year! }))

  function view() {
    const shown = visibleTrips()
    const lit = new Set(shown.map(t => t.iso))
    globe.setVisited(lit)

    const homeC = home ? byIso.get(home) : undefined
    const origin = homeC ? anchorOf(homeC) : undefined
    const dest = new Map<string, { lat: number; lng: number }>()
    const pins: Pin[] = []
    for (const t of shown) {
      if (t.place) pins.push({ lat: t.place.lat, lng: t.place.lng })
      if (t.iso === home || dest.has(t.iso)) continue
      const c = byIso.get(t.iso)
      if (!c) continue
      const a = t.place ?? anchorOf(c)
      dest.set(t.iso, { lat: a.lat, lng: a.lng })
    }
    const trails: Trail[] = origin
      ? [...dest.values()].map(p => ({ startLat: origin.lat, startLng: origin.lng, endLat: p.lat, endLng: p.lng }))
      : []
    globe.setTrails(trails)
    globe.setPins(pins)

    const n = lit.size
    const pct = Math.round((n / WORLD_TOTAL) * 100)
    let line: string
    if (!trips.length) line = 'Nothing is lit yet.<small>Click any country, or press <kbd>/</kbd> to log your first trip.</small>'
    else if (!n) line = `Before ${year}, nothing was lit yet.`
    else {
      const lead = year === null ? 'You have lit' : `By ${year} you had lit`
      let extra = plural(shown.length, 'trip')
      if (origin) {
        let far: { name: string; km: number } | undefined
        for (const iso of lit) {
          const c = byIso.get(iso)
          if (!c || iso === home) continue
          const a = anchorOf(c)
          const km = distanceKm(origin.lat, origin.lng, a.lat, a.lng)
          if (!far || km > far.km) far = { name: c.properties.n, km }
        }
        if (far) extra += ` · farthest from home: ${esc(far.name)}, ${Math.round(far.km).toLocaleString('en')} km`
      }
      line = `${lead} <b>${n}</b> ${n === 1 ? 'country' : 'countries'}, <b>${pct}%</b> of the world.<small>${extra}</small>`
    }
    $('line').innerHTML = line

    timeline.setYears(trips.map(t => yearOf(t.startDate)).filter((y): y is number => y !== undefined))
  }

  async function refresh() {
    ;[trips, home] = await Promise.all([allTrips(), getHome()])
    view()
    if (drawer.current()?.k === 'country') drawer.rerender()
  }

  // ── controls ───────────────────────────────────────────
  $('log').onclick = () => drawer.open({ k: 'search', purpose: 'log' })
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'wayfarer', version: 1, home, trips }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wayfarer-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  $<HTMLInputElement>('import').onchange = async e => {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      const list: Trip[] = Array.isArray(data) ? data : data.trips
      if (!Array.isArray(list) || list.some(t => !t.id || !t.iso)) throw new Error('shape')
      await replaceAll(list)
      if (!Array.isArray(data) && data.home) await setHome(data.home)
    } catch {
      alert('That file is not a Wayfarer export.')
    }
    input.value = ''
  }

  addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    if (e.key === '/' && !typing) { e.preventDefault(); drawer.open({ k: 'search', purpose: 'log' }) }
    else if (e.key === 'Escape' && drawer.isOpen()) drawer.close()
  })

  onChange(refresh)
  await refresh()

  const homeC = home ? byIso.get(home) : undefined
  const start = homeC ? anchorOf(homeC) : { lat: 22, lng: 10, span: 0 }
  globe.intro(start.lat, start.lng)
  if (!home && !trips.length && !askedHome) {
    askedHome = true
    setTimeout(() => drawer.open({ k: 'search', purpose: 'home' }), 1800)
  }
}

boot()
