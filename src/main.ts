import './styles.css'
import { anchorOf, distanceKm, flagUrl, loadGeo, placeKey, type City } from './data/geo'
import { createGlobe, type LitCity, type Trail } from './globe'
import { allTrips, deleteTrip, getHome, onChange, replaceAll, saveTrip, setHome, type Trip } from './store'
import { initTheme, onTheme, setTheme, currentTheme, type Theme } from './theme'
import { confetti } from './ui/confetti'
import { createDrawer, type Focus } from './ui/drawer'
import { esc, fmtRange, plural, yearOf } from './ui/format'
import { icons } from './ui/icons'
import { renderStory } from './ui/story'
import { createTimeline } from './ui/timeline'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const WORLD_TOTAL = 195
const CONTINENT_VIEW: Record<string, [number, number, number]> = {
  Africa: [3, 20, 1.5], Asia: [35, 90, 1.7], Europe: [52, 15, 1], 'North America': [45, -100, 1.6], 'South America': [-15, -60, 1.5], Oceania: [-25, 140, 1.3],
}

async function boot() {
  const theme0 = initTheme()
  const geo = await loadGeo()
  let trips: Trip[] = []
  let homeKey: string | undefined
  let year: number | null = null
  let replayN: number | null = null // while replaying, only the first N trips (oldest first) are lit
  const info = new Map<string, { cities: number; whole: boolean }>()

  // ── globe ──────────────────────────────────────────────
  const globe = createGlobe($('globe'), geo, theme0, {
    onCountry: c => drawer.open({ k: 'country', iso: c.properties.i }),
    onCity: city => drawer.open({ k: 'city', city }),
    onView: alt => $('stage').classList.toggle('near', alt < 1.6),
    describe: c => {
      const i = info.get(c.properties.i)
      const status = i ? (i.cities ? plural(i.cities, 'city', 'cities') + ' lit' : 'Whole country') : ''
      const f = flagUrl(c)
      return `<div class="tip">${f ? `<img class="flag" src="${f}" alt="" />` : ''}<b>${esc(c.properties.n)}</b>${status ? `<span>${status}</span>` : ''}</div>`
    },
  })

  const onFocus = (f: Focus) => {
    if (!f) return globe.setSelected(null)
    if (f.city) {
      globe.setSelected(geo.byIso.get(f.city.iso) ?? null, { lat: f.city.lat, lng: f.city.lng })
      globe.flyToCity(f.city)
    } else if (f.country) {
      globe.setSelected(f.country)
      globe.flyToCountry(f.country)
    }
  }

  const drawer = createDrawer({
    root: $('drawer'), geo,
    trips: () => trips,
    homeKey: () => homeKey,
    focus: onFocus,
    save: async t => { await saveTrip(t); if (!t.id) confetti() },
    remove: id => deleteTrip(id),
    setHome: key => setHome(key),
  })

  const timeline = createTimeline($('timeline'), y => { year = y; view() })

  // ── derived view ───────────────────────────────────────
  const homeCity = (): City | undefined => (homeKey ? geo.cityByKey.get(homeKey) : undefined)

  function view() {
    const today = new Date().toISOString().slice(0, 10)
    // trips dated in the future are plans: they never light the map or count in stats
    const past = trips.filter(t => !t.startDate || t.startDate <= today)
    const chrono = [...past].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    const shown = replayN !== null ? chrono.slice(0, replayN).reverse()
      : year === null ? past : past.filter(t => { const y = yearOf(t.startDate); return y === undefined || y <= year! })
    const upcoming = trips.filter(t => t.startDate && t.startDate > today).sort((a, b) => a.startDate!.localeCompare(b.startDate!))
      .map(trip => ({ trip, country: geo.byIso.get(trip.iso)!, days: Math.ceil((Date.parse(trip.startDate!) - Date.parse(today)) / 864e5) }))
      .filter(u => u.country)
    const home = homeCity()

    const lit = new Map<string, LitCity>()
    const byCountry = new Map<string, { cities: Set<string>; trips: number; whole: boolean; since?: string }>()
    const dest = new Map<string, { lat: number; lng: number; name: string }>()
    let km = 0

    for (const t of shown) {
      const country = geo.byIso.get(t.iso)
      if (!country) continue
      const row = byCountry.get(t.iso) ?? { cities: new Set<string>(), trips: 0, whole: false }
      row.trips++
      if (t.startDate && (!row.since || t.startDate < row.since)) row.since = t.startDate
      let target: { lat: number; lng: number; name: string }
      if (t.place) {
        const key = placeKey(t.iso, t.place)
        const city = geo.cityByKey.get(key) ?? { key, name: t.place.name, iso: t.iso, lat: t.place.lat, lng: t.place.lng, pop: 0, cap: false, fold: '' }
        const hit = lit.get(key)
        if (hit) hit.trips++
        else lit.set(key, { city, trips: 1 })
        row.cities.add(key)
        target = { lat: city.lat, lng: city.lng, name: city.name }
      } else {
        row.whole = true
        const a = anchorOf(country)
        target = { lat: a.lat, lng: a.lng, name: country.properties.n }
      }
      byCountry.set(t.iso, row)
      if (home) {
        const d = distanceKm(home.lat, home.lng, target.lat, target.lng)
        km += d * 2
        if (d > 30 && !dest.has(`${target.lat},${target.lng}`)) dest.set(`${target.lat},${target.lng}`, target)
      }
    }

    // map
    globe.setCities([...lit.values()])
    globe.setWholeCountries(new Set([...byCountry].filter(([, r]) => r.whole).map(([iso]) => iso)))
    const trails: Trail[] = home ? [...dest.values()].map(p => ({ startLat: home.lat, startLng: home.lng, endLat: p.lat, endLng: p.lng })) : []
    globe.setTrails(trails)

    info.clear()
    for (const [iso, r] of byCountry) info.set(iso, { cities: r.cities.size, whole: r.whole })

    // story
    let far: { name: string; km: number } | undefined
    if (home) for (const p of dest.values()) {
      const d = distanceKm(home.lat, home.lng, p.lat, p.lng)
      if (!far || d > far.km) far = { name: p.name, km: d }
    }
    const countries = [...byCountry].map(([iso, r]) => ({ country: geo.byIso.get(iso)!, cities: r.cities.size, trips: r.trips, whole: r.whole, since: r.since }))
      .sort((a, b) => b.trips - a.trips || a.country.properties.n.localeCompare(b.country.properties.n))
    $('story').innerHTML = renderStory({
      countries,
      cityCount: lit.size,
      tripCount: shown.length,
      continents: new Set(countries.map(c => c.country.properties.c)),
      km, worldTotal: WORLD_TOTAL,
      recent: shown.slice(0, 8).map(trip => ({ trip, country: geo.byIso.get(trip.iso)! })).filter(r => r.country),
      upcoming,
      farthest: far, hasHome: !!home, asOf: year ?? undefined,
    })

    const years = trips.map(t => yearOf(t.startDate)).filter((y): y is number => y !== undefined)
    timeline.setYears(years)
    $('stage').classList.toggle('empty', !trips.length)
    $('replay').hidden = past.filter(t => t.startDate).length < 2
    countUp()
  }

  async function refresh() {
    ;[trips, homeKey] = await Promise.all([allTrips(), getHome()])
    view()
    const m = drawer.current()
    if (m && (m.k === 'country' || m.k === 'city')) drawer.rerender()
  }

  // ── controls ───────────────────────────────────────────
  const openLog = () => drawer.open({ k: 'search', purpose: 'log' })
  $('log').onclick = openLog
  $('stage-search').onclick = openLog
  $('zoom-in').onclick = () => globe.zoomBy(0.45)
  $('zoom-out').onclick = () => globe.zoomBy(2.2)
  $('reset').onclick = () => { drawer.close(); globe.reset() }

  // ── journey replay: fly through every trip in order, lighting the map as you go ──
  let replaying = false
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  async function replay() {
    if (replaying) { replaying = false; return }
    const today = new Date().toISOString().slice(0, 10)
    const order = trips.filter(t => t.startDate && t.startDate <= today).sort((a, b) => a.startDate!.localeCompare(b.startDate!))
    if (order.length < 2) return
    replaying = true
    drawer.close()
    $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' })
    $('replay-label').textContent = 'Stop'
    $('hud').hidden = false
    replayN = 0; view()
    globe.reset(); await wait(1200)
    for (let i = 0; i < order.length && replaying; i++) {
      const t = order[i]
      const c = geo.byIso.get(t.iso)
      if (!c) continue
      const a = t.place ?? anchorOf(c)
      $('hud-name').textContent = t.place?.name ?? c.properties.n
      $('hud-when').textContent = `${t.place ? c.properties.n + ' · ' : ''}${fmtRange(t.startDate, undefined)}`
      globe.flyToPoint(a.lat, a.lng, t.place ? 0.35 : 0.9, 1700)
      await wait(1500)
      if (!replaying) break
      replayN = i + 1; view()
      await wait(1300)
    }
    replaying = false
    replayN = null; view()
    $('hud').hidden = true
    $('replay-label').textContent = 'Replay my journey'
    globe.reset()
  }
  $('replay').onclick = replay

  // big numbers tick up when they appear, once per value
  const shownNums = new Map<string, string>()
  function countUp() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.querySelectorAll<HTMLElement>('.t-big').forEach((el, idx) => {
      const node = el.firstChild
      if (!node || node.nodeType !== 3) return
      const target = parseInt((node.textContent ?? '').replace(/,/g, ''), 10)
      const text = node.textContent ?? ''
      if (!Number.isFinite(target) || shownNums.get(String(idx)) === text) return
      shownNums.set(String(idx), text)
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 900)
        node.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en')
        if (p < 1) requestAnimationFrame(step); else node.textContent = text
      }
      requestAnimationFrame(step)
    })
  }

  const themeBtn = $('theme')
  const paintThemeBtn = (t: Theme) => {
    document.querySelectorAll<HTMLImageElement>('.brand-logo').forEach(i => { i.src = t === 'dark' ? '/brand/logo-horizontal-dark.svg' : '/brand/logo-horizontal.svg' })
    themeBtn.innerHTML = t === 'dark' ? icons.sun : icons.moon
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
  }
  paintThemeBtn(theme0)
  themeBtn.onclick = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  onTheme(t => { paintThemeBtn(t); globe.setTheme(t) })

  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => { el.innerHTML = icons[el.dataset.icon as keyof typeof icons] })

  $('story').addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-country],[data-continent]')
    if (!t) return
    if (t.dataset.continent) {
      const v = CONTINENT_VIEW[t.dataset.continent]
      if (v) { document.getElementById('stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); globe.flyToPoint(v[0], v[1], v[2], 1800) }
      return
    }
    if (t.dataset.act === 'log') openLog()
    else if (t.dataset.act === 'home-search') drawer.open({ k: 'search', purpose: 'home' })
    else if (t.dataset.trip) {
      const trip = trips.find(x => x.id === t.dataset.trip)
      const city = trip?.place ? geo.cityByKey.get(placeKey(trip.iso, trip.place)) : undefined
      if (city) drawer.open({ k: 'city', city })
      else if (trip) drawer.open({ k: 'country', iso: trip.iso })
      document.getElementById('stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (t.dataset.country) {
      drawer.open({ k: 'country', iso: t.dataset.country })
      document.getElementById('stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })

  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'triptrack', version: 2, home: homeKey, trips }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trip-track-${new Date().toISOString().slice(0, 10)}.json`
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
      alert('That file is not a Trip Track export.')
    }
    input.value = ''
  }

  addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    if (e.key === '/' && !typing) { e.preventDefault(); openLog() }
    else if (e.key === 'Escape' && replaying) replaying = false
    else if (e.key === 'Escape' && drawer.isOpen()) drawer.close()
  })

  onChange(refresh)
  await refresh()

  const home = homeCity()
  globe.intro(home?.lat ?? 22, home?.lng ?? 10)
}

boot()
