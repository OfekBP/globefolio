import '@fontsource-variable/nunito'
import './styles.css'
import { anchorOf, distanceKm, flagUrl, loadGeo, placeKey, type City, type Country } from './data/geo'
import type { LitCity } from './globe'
import { allTrips, allWishes, deleteTrip, deleteWish, getHome, onChange, replaceAll, saveTrip, saveWish, setHome, type Trip, type Wish } from './store'
import { initTheme, onTheme, setTheme, currentTheme, type Theme } from './theme'
import { confetti } from './ui/confetti'
import { toast } from './ui/toast'
import { createDrawer, type Focus } from './ui/drawer'
import { esc, fmtRange, localToday, plural, yearOf } from './ui/format'
import { icons } from './ui/icons'
import { renderStory } from './ui/story'
import { renderPassport } from './ui/passport'
import { countryStamp } from './ui/stamps'
import { createTimeline } from './ui/timeline'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const WORLD_TOTAL = 195
const CONTINENT_VIEW: Record<string, [number, number, number]> = {
  Africa: [3, 20, 1.5], Asia: [35, 90, 1.7], Europe: [52, 15, 1], 'North America': [45, -100, 1.6], 'South America': [-15, -60, 1.5], Oceania: [-25, 140, 1.3],
}

async function boot() {
  const theme0 = initTheme()
  // the 3D engine is the heavy part, so it downloads alongside the data while the splash shows
  const [geo, { createGlobe }] = await Promise.all([loadGeo(), import('./globe')])
  let trips: Trip[] = []
  let wishes: Wish[] = []
  let homeKey: string | undefined
  let year: number | null = null
  let replayN: number | null = null // while replaying, only the first N trips (oldest first) are lit
  const info = new Map<string, { cities: number; whole: boolean }>()

  // ── globe ──────────────────────────────────────────────
  const globe = createGlobe($('globe'), geo, theme0, {
    onCountry: c => drawer.open({ k: 'country', iso: c.properties.i }),
    onCity: city => drawer.open({ k: 'city', city }),
    onHover: () => {},
    onView: () => {},
    describe: () => '',
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
    save: async t => {
      const wasNew = !t.id && !info.has(t.iso) && (!t.startDate || t.startDate <= localToday())
      await saveTrip(t)
      // a place you have now been to leaves the dream list
      for (const w of wishes.filter(w => w.iso === t.iso && (t.place ? !!w.place && placeKey(w.iso, w.place) === placeKey(t.iso, t.place) : !w.place))) await deleteWish(w.id)
      buzz(18)
      if (t.id) return
      confetti()
      const c = geo.byIso.get(t.iso)
      if (wasNew && c) slam(c, t.startDate)
      else toast(`${t.place?.name ?? c?.properties.n ?? 'Trip'} added. Your world just got bigger.`)
    },
    remove: async id => {
      const gone = trips.find(t => t.id === id)
      await deleteTrip(id)
      if (gone) toast('Trip deleted.', () => { void saveTrip(gone) })
    },
    setHome: key => setHome(key),
    wishes: () => wishes,
    toggleWish: async (iso, city) => {
      const hit = wishes.find(w => w.iso === iso && (city ? !!w.place && placeKey(iso, w.place) === city.key : !w.place))
      if (hit) { await deleteWish(hit.id); toast('Removed from your dream list.') }
      else { await saveWish({ iso, place: city ? { name: city.name, lat: city.lat, lng: city.lng } : undefined }); toast(`${city?.name ?? geo.byIso.get(iso)?.properties.n ?? 'Place'} is on your dream list.`) }
      buzz(12)
    },
  })

  const timeline = createTimeline($('timeline'), y => { year = y; view() })

  // ── derived view ───────────────────────────────────────
  const homeCity = (): City | undefined => (homeKey ? geo.cityByKey.get(homeKey) : undefined)

  function view() {
    const today = localToday()
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
    const citySince = new Map<string, string | undefined>()
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
        if (t.startDate && (!citySince.get(key) || t.startDate < citySince.get(key)!)) citySince.set(key, t.startDate)
        else if (!citySince.has(key)) citySince.set(key, undefined)
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
    const wholeIso = [...byCountry].filter(([, r]) => r.whole).map(([iso]) => iso)
    const markers: LitCity[] = [...lit.values()]
    for (const iso of wholeIso) {
      const c = geo.byIso.get(iso)!
      const a = anchorOf(c)
      markers.push({ kind: 'country', trips: byCountry.get(iso)!.trips, city: { key: `country|${iso}`, name: c.properties.n, iso, lat: a.lat, lng: a.lng, pop: 0, cap: false, fold: '' } })
    }
    // dream places: dashed flags, never counted in stats, hidden once you have actually been
    const wishRows: { wish: Wish; country: Country }[] = []
    for (const w of wishes) {
      const c = geo.byIso.get(w.iso)
      if (!c) continue
      wishRows.push({ wish: w, country: c })
      if (w.place) {
        const key = placeKey(w.iso, w.place)
        if (lit.has(key)) continue
        const city = geo.cityByKey.get(key) ?? { key, name: w.place.name, iso: w.iso, lat: w.place.lat, lng: w.place.lng, pop: 0, cap: false, fold: '' }
        markers.push({ city, trips: 0, kind: 'city', dream: true })
      } else if (!byCountry.get(w.iso)?.whole) {
        const a = anchorOf(c)
        markers.push({ city: { key: `country|${w.iso}`, name: c.properties.n, iso: w.iso, lat: a.lat, lng: a.lng, pop: 0, cap: false, fold: '' }, trips: 0, kind: 'country', dream: true })
      }
    }
    globe.setCities(markers)
    globe.setWholeCountries(new Set([...byCountry].filter(([, r]) => r.whole).map(([iso]) => iso)))

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
      upcoming, wishes: wishRows,
      farthest: far, hasHome: !!home, asOf: year ?? undefined,
      homeName: home?.name, theme: currentTheme(),
    })

    const stampCountries = [...byCountry].map(([iso, r]) => ({ country: geo.byIso.get(iso)!, since: r.since }))
      .sort((a, b) => (a.since ?? '9').localeCompare(b.since ?? '9'))
    $('passport').innerHTML = renderPassport({
      countries: stampCountries,
      cities: [...lit.values()].map(l => ({ city: l.city, country: geo.byIso.get(l.city.iso), since: citySince.get(l.city.key) }))
        .sort((a, b) => (a.since ?? '9').localeCompare(b.since ?? '9')),
      continents: new Set(countries.map(c => c.country.properties.c)),
    })

    // the glance card on the map
    const glance = $('glance')
    if (!shown.length) {
      glance.innerHTML = `<b>Your map is waiting</b><span>Tap + and light up your first city</span>`
    } else {
      glance.innerHTML = `<span class="g-nums"><b>${countries.length}</b> ${countries.length === 1 ? 'country' : 'countries'}<i></i><b>${lit.size}</b> ${lit.size === 1 ? 'city' : 'cities'}<i></i><b>${Math.round((countries.length / WORLD_TOTAL) * 100)}%</b> of the world</span><span class="g-go">Open passport</span>`
    }

    const years = trips.map(t => yearOf(t.startDate)).filter((y): y is number => y !== undefined)
    timeline.setYears(years)
    const canReplay = past.filter(t => t.startDate).length >= 2
    document.querySelectorAll<HTMLElement>('[data-do=replay]').forEach(b => { b.hidden = !canReplay })
    countUp()
  }

  async function refresh() {
    ;[trips, homeKey, wishes] = await Promise.all([allTrips(), getHome(), allWishes()])
    view()
    const m = drawer.current()
    if (m && (m.k === 'country' || m.k === 'city')) drawer.rerender()
  }

  // ── controls ───────────────────────────────────────────
  const openLog = () => drawer.open({ k: 'search', purpose: 'log' })
  $('stage-search').onclick = openLog
  $('reset').onclick = () => { drawer.close(); globe.reset(); buzz(8) }

  // ── tabs: map, passport, journal ─────────────────────────
  const TABS = ['map', 'passport', 'journal'] as const
  function showTab(name: (typeof TABS)[number]) {
    for (const t of TABS) { const v = $(`view-${t}`); if (t !== 'map') v.hidden = t !== name }
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name))
    document.body.dataset.tab = name
    if (name === 'passport') $('view-passport').classList.remove('turned'), requestAnimationFrame(() => $('view-passport').classList.add('turned'))
    try { localStorage.setItem('triptrack:tab', name) } catch { /* private mode */ }
  }
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.addEventListener('click', () => { drawer.close(); buzz(8); showTab(b.dataset.tab as (typeof TABS)[number]) }))
  $('glance').onclick = () => (shownAny() ? showTab('passport') : openLog())
  const shownAny = () => trips.length > 0

  // ── journey replay: fly through every trip in order, lighting the map as you go ──
  let replaying = false
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  async function replay() {
    if (replaying) { replaying = false; return }
    const today = localToday()
    const order = trips.filter(t => t.startDate && t.startDate <= today).sort((a, b) => a.startDate!.localeCompare(b.startDate!))
    if (order.length < 2) return
    replaying = true
    drawer.close()
    showTab('map')
    setReplayLabel('Stop')
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
    setReplayLabel(null)
    globe.reset()
  }
  function setReplayLabel(text: string | null) {
    document.querySelectorAll<HTMLElement>('[data-do=replay]').forEach(b => {
      b.innerHTML = text ? icons.close : icons.play
      b.setAttribute('aria-label', text ? 'Stop replay' : 'Replay my journey')
    })
  }

  // a random country you have not been to yet: fly there and open its page
  function surprise() {
    const todo = geo.countries.filter(c => !info.has(c.properties.i) && anchorOf(c).span > 3)
    const pool = todo.length ? todo : geo.countries
    const c = pool[Math.floor(Math.random() * pool.length)]
    showTab('map')
    drawer.open({ k: 'country', iso: c.properties.i })
  }

  document.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-do]')
    if (!b) return
    if (b.dataset.do === 'replay') replay()
    else if (b.dataset.do === 'surprise') surprise()
    else if (b.dataset.do === 'log') openLog()
  })

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
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#101b33' : '#fff8ec')
    themeBtn.innerHTML = t === 'dark' ? icons.sun : icons.moon
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
  }
  paintThemeBtn(theme0)
  themeBtn.onclick = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  onTheme(t => { paintThemeBtn(t); globe.setTheme(t); view() })

  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => { el.innerHTML = icons[el.dataset.icon as keyof typeof icons] })
  document.querySelectorAll<HTMLElement>('[data-do=replay]').forEach(b => { b.innerHTML = icons.play })

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'triptrack', version: 3, home: homeKey, trips, wishes }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tripglobe-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const goTo = (t: HTMLElement) => {
    if (t.dataset.act === 'log') openLog()
    else if (t.dataset.act === 'theme') setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
    else if (t.dataset.act === 'unwish' && t.dataset.id) { void deleteWish(t.dataset.id); toast('Removed from your dream list.') }
    else if (t.dataset.act === 'plan' || t.dataset.wishgo) {
      const w = wishes.find(x => x.id === (t.dataset.id ?? t.dataset.wishgo))
      if (!w) return
      const city = w.place ? (geo.cityByKey.get(placeKey(w.iso, w.place)) ?? { key: placeKey(w.iso, w.place), name: w.place.name, iso: w.iso, lat: w.place.lat, lng: w.place.lng, pop: 0, cap: false, fold: '' }) : undefined
      showTab('map')
      if (t.dataset.act === 'plan') drawer.open({ k: 'form', iso: w.iso, city })
      else drawer.open(city ? { k: 'city', city } : { k: 'country', iso: w.iso })
    }
    else if (t.dataset.act === 'export') exportData()
    else if (t.dataset.act === 'home-search') drawer.open({ k: 'search', purpose: 'home' })
    else if (t.dataset.quick) {
      const q = t.dataset.quick
      const city = geo.cities.filter(c => c.name === q).sort((a, b) => b.pop - a.pop)[0]
      if (city) { showTab('map'); drawer.open({ k: 'city', city }) }
    } else if (t.dataset.city) {
      const city = geo.cityByKey.get(t.dataset.city)
      showTab('map')
      if (city) drawer.open({ k: 'city', city })
      else drawer.open({ k: 'country', iso: t.dataset.city.split('|')[0] })
    } else if (t.dataset.trip) {
      const trip = trips.find(x => x.id === t.dataset.trip)
      const city = trip?.place ? geo.cityByKey.get(placeKey(trip.iso, trip.place)) : undefined
      showTab('map')
      if (city) drawer.open({ k: 'city', city })
      else if (trip) drawer.open({ k: 'country', iso: trip.iso })
    } else if (t.dataset.country) {
      showTab('map')
      drawer.open({ k: 'country', iso: t.dataset.country })
    }
  }
  for (const id of ['story', 'passport']) {
    $(id).addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-country],[data-city],[data-quick],[data-trip],[data-continent],[data-wishgo]')
      if (!t) return
      buzz(8)
      if (t.dataset.continent) {
        const v = CONTINENT_VIEW[t.dataset.continent]
        if (v) { showTab('map'); globe.flyToPoint(v[0], v[1], v[2], 1800) }
        return
      }
      goTo(t)
    })
  }
  $('story').addEventListener('change', async e => {
    const input = e.target as HTMLInputElement
    if (input.id !== 'import') return
    const f = input.files?.[0]
    if (!f) return
    try {
      const data = JSON.parse(await f.text())
      const list: Trip[] = Array.isArray(data) ? data : data.trips
      if (!Array.isArray(list) || list.some(t => !t.id || !t.iso)) throw new Error('shape')
      await replaceAll(list, Array.isArray(data) || !Array.isArray(data.wishes) ? [] : data.wishes)
      if (!Array.isArray(data) && data.home) await setHome(data.home)
      toast('Backup restored.')
    } catch {
      toast('That file is not a Tripglobe export.')
    }
    input.value = ''
  })

  // ── delight: haptics, the stamp slam, swipe-down sheet ──
  function buzz(ms: number) { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms) } catch { /* unsupported */ } }

  function slam(c: Country, since?: string) {
    const el = $('slam')
    el.innerHTML = `<div class="slam-card"><p>New stamp!</p>${countryStamp(c, since, 'slam')}<h3>${esc(c.properties.n)}</h3><small>Added to your passport</small><button class="solid" type="button">Lovely</button></div>`
    el.hidden = false
    buzz([30, 40, 30] as unknown as number)
    const close = () => { el.hidden = true; el.innerHTML = '' }
    el.querySelector('button')!.addEventListener('click', close, { once: true })
    setTimeout(() => { if (!el.hidden) close() }, 6000)
  }

  const dr = $('drawer')
  let sy = 0, dy = 0, dragging = false
  dr.addEventListener('touchstart', e => {
    const top = dr.getBoundingClientRect().top
    dragging = dr.scrollTop <= 0 && e.touches[0].clientY - top < 70
    sy = e.touches[0].clientY; dy = 0
  }, { passive: true })
  dr.addEventListener('touchmove', e => {
    if (!dragging) return
    dy = Math.max(0, e.touches[0].clientY - sy)
    dr.style.transition = 'none'
    dr.style.transform = `translateY(${dy}px)`
  }, { passive: true })
  dr.addEventListener('touchend', () => {
    if (!dragging) return
    dragging = false
    dr.style.transition = ''
    dr.style.transform = ''
    if (dy > 110) drawer.close()
  })

  addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    if (e.key === '/' && !typing) { e.preventDefault(); openLog() }
    else if (e.key === 'Escape' && replaying) replaying = false
    else if (e.key === 'Escape' && drawer.isOpen()) drawer.close()
  })

  // the phone's back button closes the sheet instead of leaving the app
  new MutationObserver(() => {
    const open = dr.classList.contains('open')
    if (open && history.state?.sheet !== 1) history.pushState({ sheet: 1 }, '')
    else if (!open && history.state?.sheet === 1) history.back()
  }).observe(dr, { attributes: true, attributeFilter: ['class'] })
  addEventListener('popstate', () => { if (drawer.isOpen()) drawer.close() })

  navigator.storage?.persist?.().catch(() => {})
  let startTab = 'map'
  try { startTab = localStorage.getItem('triptrack:tab') ?? 'map' } catch { /* private mode */ }
  showTab(TABS.includes(startTab as never) ? (startTab as (typeof TABS)[number]) : 'map')

  onChange(refresh)
  await refresh()

  const home = homeCity()
  globe.intro(home?.lat ?? 22, home?.lng ?? 10)
  const splash = document.getElementById('splash')
  splash?.classList.add('gone')
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  setTimeout(() => splash?.remove(), 500)
}

boot()
