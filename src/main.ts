import '@fontsource-variable/nunito'
import '@fontsource-variable/noto-sans-arabic'
import '@fontsource-variable/noto-sans-hebrew'
import './styles.css'
import { anchorOf, distanceKm, loadGeo, placeKey, type City, type Country } from './data/geo'
import type { LitCity } from './globe'
import { allTrips, allWishes, deleteTrip, deleteWish, getHome, onChange, replaceAll, saveTrip, saveWish, setHome, type Trip, type Wish } from './store'
import { initTheme, onTheme, setTheme, currentTheme, type Theme } from './theme'
import { confetti } from './ui/confetti'
import { toast } from './ui/toast'
import { createDrawer, type Focus } from './ui/drawer'
import { renderAccount } from './ui/account'
import { markWelcomed, showWelcome, welcomeSeen } from './ui/welcome'
import { renderLanguage } from './ui/language'
import { renderSettings } from './ui/settings'
import { onPrefs, prefs } from './prefs'
import { cloudEnabled } from './supabase'
import { getProfile, getSession, initAuth, onAuth } from './auth'
import { startSync, stopSync } from './sync'
import { watchFriendships, listLinks, type MapRow } from './friends'
import { renderFriends, renderPublic } from './ui/friends'
import { joinFromLink, renderShared } from './ui/shared'
import { esc, fmtRange, localToday, yearOf } from './ui/format'
import { cname, initLocale, num as fmtNum, onLocale, t as L } from './i18n'
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
  await initLocale()
  // the 3D engine is the heavy part, so it downloads alongside the data while the splash shows
  const [geo, { createGlobe }] = await Promise.all([loadGeo(), import('./globe')])
  let trips: Trip[] = []
  let wishes: Wish[] = []
  let homeKey: string | undefined
  let year: number | null = null
  let replayN: number | null = null // while replaying, only the first N trips (oldest first) are lit
  const info = new Map<string, { cities: number; whole: boolean }>()
  let friendRows: MapRow[] | null = null // a friend's places painted over my map
  let friendHandle: string | undefined

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
      else toast(L('toast.added', { place: t.place?.name ?? (c ? cname(c) : L('toast.tripFallback')) }))
    },
    remove: async id => {
      const gone = trips.find(t => t.id === id)
      await deleteTrip(id)
      if (gone) toast(L('toast.deleted'), () => { void saveTrip(gone) })
    },
    setHome: key => setHome(key),
    wishes: () => wishes,
    canShare: () => !!getProfile(),
    toggleWish: async (iso, city) => {
      const hit = wishes.find(w => w.iso === iso && (city ? !!w.place && placeKey(iso, w.place) === city.key : !w.place))
      if (hit) { await deleteWish(hit.id); toast(L('toast.wishRemoved')) }
      else { await saveWish({ iso, place: city ? { name: city.name, lat: city.lat, lng: city.lng } : undefined }); toast(L('toast.wishAdded', { place: city?.name ?? (geo.byIso.get(iso) ? cname(geo.byIso.get(iso)!) : '') })) }
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
        target = { lat: a.lat, lng: a.lng, name: cname(country) }
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
      markers.push({ kind: 'country', trips: byCountry.get(iso)!.trips, city: { key: `country|${iso}`, name: cname(c), iso, lat: a.lat, lng: a.lng, pop: 0, cap: false, fold: '' } })
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
        markers.push({ city: { key: `country|${w.iso}`, name: cname(c), iso: w.iso, lat: a.lat, lng: a.lng, pop: 0, cap: false, fold: '' }, trips: 0, kind: 'country', dream: true })
      }
    }
    // a friend's places, in their own colour, when I have chosen to compare
    const seenF = new Set<string>()
    for (const r of friendRows ?? []) {
      const c = geo.byIso.get(r.iso)
      if (!c) continue
      if (r.place) {
        const key = placeKey(r.iso, r.place)
        if (seenF.has(key)) continue
        seenF.add(key)
        const city = geo.cityByKey.get(key) ?? { key, name: r.place.name, iso: r.iso, lat: r.place.lat, lng: r.place.lng, pop: 0, cap: false, fold: '' }
        markers.push({ city, trips: 0, kind: 'city', dream: true, friend: true })
      } else if (!seenF.has(`c|${r.iso}`)) {
        seenF.add(`c|${r.iso}`)
        const a = anchorOf(c)
        markers.push({ city: { key: `country|${r.iso}`, name: cname(c), iso: r.iso, lat: a.lat, lng: a.lng, pop: 0, cap: false, fold: '' }, trips: 0, kind: 'country', dream: true, friend: true })
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
      .sort((a, b) => b.trips - a.trips || cname(a.country).localeCompare(cname(b.country)))
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
      account: cloudEnabled ? { handle: getProfile()?.handle, signedIn: !!getSession() } : undefined,
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
      glance.innerHTML = `<b>${L('glance.empty')}</b><span>${L('glance.emptySub')}</span>`
    } else {
      glance.innerHTML = `<span class="g-nums"><b>${fmtNum(countries.length)}</b> ${L('glance.countries', { n: countries.length })}<i></i><b>${fmtNum(lit.size)}</b> ${L('glance.cities', { n: lit.size })}<i></i><b>${fmtNum(Math.round((countries.length / WORLD_TOTAL) * 100))}%</b> ${L('glance.world')}</span><span class="g-go">${L('glance.go')}</span>`
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
  $('settings').onclick = () => { buzz(8); openSettings() }
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
      $('hud-name').textContent = t.place?.name ?? cname(c)
      $('hud-when').textContent = `${t.place ? cname(c) + ' · ' : ''}${fmtRange(t.startDate, undefined)}`
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
      b.setAttribute('aria-label', text ? L('map.replayStop') : L('map.replay'))
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
    else if (b.dataset.do === 'friends') openFriends()
    else if (b.dataset.do === 'log') openLog()
  })

  // big numbers tick up when they appear, once per value
  const shownNums = new Map<string, string>()
  function countUp() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.querySelectorAll<HTMLElement>('.t-big').forEach((el, idx) => {
      const node = el.firstChild
      if (!node || node.nodeType !== 3) return
      const target = parseInt((node.textContent ?? '').replace(/[^0-9]/g, ''), 10)
      const text = node.textContent ?? ''
      if (!Number.isFinite(target) || shownNums.get(String(idx)) === text) return
      shownNums.set(String(idx), text)
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 900)
        node.textContent = fmtNum(Math.round(target * (1 - Math.pow(1 - p, 3))))
        if (p < 1) requestAnimationFrame(step); else node.textContent = text
      }
      requestAnimationFrame(step)
    })
  }

  const paintTheme = (t: Theme) => document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#101b33' : '#fff8ec')
  paintTheme(theme0)
  onTheme(t => { paintTheme(t); globe.setTheme(t); view() })

  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => { el.innerHTML = icons[el.dataset.icon as keyof typeof icons] })
  document.querySelectorAll<HTMLElement>('[data-do=replay]').forEach(b => { b.innerHTML = icons.play })

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'triptrack', version: 3, home: homeKey, trips, wishes }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `globefolio-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const openAccount = () => drawer.open({ k: 'extra', render: (root, back) => renderAccount(root, { back, close: () => drawer.close() }) })

  const openLanguage = () => drawer.open({ k: 'extra', render: (root, back) => renderLanguage(root, () => { back(); openSettings() }) })
  const openSettings = () => drawer.open({ k: 'extra', render: (root, back) => renderSettings(root, {
    back, cloud: cloudEnabled, signedIn: !!getSession(), handle: getProfile()?.handle, homeName: homeCity()?.name,
    openAccount, openLanguage, openShared: () => openShared(), openHome: () => drawer.open({ k: 'search', purpose: 'home' }),
    exportData, importFile,
    eraseAll: async () => { await replaceAll([], []); toast(L('set.erased')) },
  }) })

  const overlay = (rows: MapRow[] | null, handle?: string) => {
    friendRows = rows; friendHandle = rows ? handle : undefined
    view()
    if (rows && handle) toast(L('fr.overlayOn', { handle }))
  }
  const openFriends = () => { showTab('map'); drawer.open({ k: 'extra', render: (root, back) => renderFriends(root, {
    geo, back, close: () => drawer.close(), openAccount,
    myIsos: () => new Set(trips.map(t => t.iso)), // every trip, not just what the timeline filter currently shows
    overlay, overlayOf: () => friendHandle,
  }) }) }
  const openShared = (id?: string) => drawer.open({ k: 'extra', render: (root, back) => renderShared(root, {
    geo, back, close: () => drawer.close(), openAccount,
    importStops: async stops => {
      let n = 0
      for (const s of stops) {
        const dup = trips.some(t => t.iso === s.iso && (s.place ? !!t.place && placeKey(t.iso, t.place) === placeKey(s.iso, s.place) : !t.place) && t.startDate === (s.start_date ?? undefined))
        if (dup) continue
        await saveTrip({ iso: s.iso, place: s.place ?? undefined, startDate: s.start_date ?? undefined, endDate: s.end_date ?? undefined, notes: s.notes ?? undefined } as Trip)
        n++
      }
      return n
    },
  }, id) })

  // routes: #/u/<handle> shows a public map, #/join/<token> joins a shared trip
  async function route() {
    const m = location.hash.match(/^#\/(u|join)\/([^/?#]+)/)
    if (!m) return
    let arg = ''
    try { arg = decodeURIComponent(m[2]) } catch { history.replaceState(null, '', location.pathname + location.search); return }
    history.replaceState(null, '', location.pathname + location.search)
    if (m[1] === 'u') {
      showTab('map')
      drawer.open({ k: 'extra', render: (root, back) => { void renderPublic(root, arg, { geo, close: () => drawer.close(), overlay }) } })
    } else {
      // keep the invite until it has been used, so signing in first (or a dropped connection) does not lose it
      try { sessionStorage.setItem(INVITE, arg) } catch { /* private mode */ }
      if (!getSession()) { toast(L('fr.signinNote')); openAccount() } else await resumeInvite()
    }
  }

  const INVITE = 'globefolio:invite'
  async function resumeInvite() {
    let token: string | null = null
    try { token = sessionStorage.getItem(INVITE) } catch { /* private mode */ }
    if (!token || !getSession() || !getProfile()) return
    const id = await joinFromLink(token)
    if (id === 'offline') { toast(L('sh.joinOffline')); return }
    try { sessionStorage.removeItem(INVITE) } catch { /* private mode */ }
    if (id) { toast(L('sh.joined')); openShared(id) } else toast(L('sh.joinFail'))
  }

  const goTo = (t: HTMLElement) => {
    if (t.dataset.act === 'log') openLog()
    else if (t.dataset.act === 'theme') setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
    else if (t.dataset.act === 'unwish' && t.dataset.id) { void deleteWish(t.dataset.id); toast(L('toast.wishRemoved')) }
    else if (t.dataset.act === 'plan' || t.dataset.wishgo) {
      const w = wishes.find(x => x.id === (t.dataset.id ?? t.dataset.wishgo))
      if (!w) return
      const city = w.place ? (geo.cityByKey.get(placeKey(w.iso, w.place)) ?? { key: placeKey(w.iso, w.place), name: w.place.name, iso: w.iso, lat: w.place.lat, lng: w.place.lng, pop: 0, cap: false, fold: '' }) : undefined
      showTab('map')
      if (t.dataset.act === 'plan') drawer.open({ k: 'form', iso: w.iso, city })
      else drawer.open(city ? { k: 'city', city } : { k: 'country', iso: w.iso })
    }
    else if (t.dataset.act === 'export') exportData()
    else if (t.dataset.act === 'language') openLanguage()
    else if (t.dataset.act === 'settings') openSettings()
    else if (t.dataset.act === 'account') openAccount()
    else if (t.dataset.act === 'shared') openShared()
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
  async function importFile(f: File) {
    try {
      const data = JSON.parse(await f.text())
      const list: Trip[] = Array.isArray(data) ? data : data.trips
      if (!Array.isArray(list) || list.some(t => !t.id || !t.iso)) throw new Error('shape')
      await replaceAll(list, Array.isArray(data) || !Array.isArray(data.wishes) ? [] : data.wishes)
      if (!Array.isArray(data) && data.home) await setHome(data.home)
      toast(L('toast.restored'))
    } catch {
      toast(L('toast.badFile'))
    }
  }

  // ── delight: haptics, the stamp slam, swipe-down sheet ──
  function buzz(ms: number) { try { if (prefs().haptics && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms) } catch { /* unsupported */ } }

  function slam(c: Country, since?: string) {
    const el = $('slam')
    el.innerHTML = `<div class="slam-card"><p>${L('slam.new')}</p>${countryStamp(c, since, 'slam')}<h3>${esc(cname(c))}</h3><small>${L('slam.added')}</small><button class="solid" type="button">${L('slam.ok')}</button></div>`
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
  onPrefs(() => view())
  onLocale(() => {
    setReplayLabel(replaying ? 'x' : null)
    document.querySelectorAll<HTMLElement>('[data-do=replay]').forEach(b => { if (!replaying) b.setAttribute('aria-label', L('map.replay')) })
    view()
    if (drawer.isOpen()) drawer.rerender()
  })
  await refresh()

  // accounts: optional. With no backend configured, or no sign-in, the app is exactly the local one.
  if (cloudEnabled) {
    // Friends takes the Discover slot; "Surprise me" lives in the Journal's dream list
    const slot = document.querySelector<HTMLElement>('.tab[data-do=surprise]')
    if (slot) {
      slot.dataset.do = 'friends'
      slot.querySelector('[data-icon]')!.innerHTML = icons.user
      const lbl = slot.querySelector('small')!
      lbl.dataset.i18n = 'tab.friends'
      lbl.textContent = L('tab.friends')
    }
    let unwatch = () => {}
    const paintBadge = async () => {
      let n = 0
      try { n = getSession() ? (await listLinks()).filter(l => l.state === 'incoming').length : 0 } catch { /* offline */ }
      document.querySelector('.tab[data-do=friends] .badge')?.remove()
      if (n) { const s = document.createElement('span'); s.className = 'badge'; s.textContent = fmtNum(n); document.querySelector('.tab[data-do=friends]')?.append(s) }
    }
    // supabase-js re-announces the session when the tab regains focus; only react to a real change, so a half-typed form survives
    let closeWelcome: (() => void) | null = null
    let lastUid: string | undefined = '?'
    let lastKey = ''
    onAuth(() => {
      const s = getSession()
      if (s) { closeWelcome?.(); closeWelcome = null }
      if (s?.user.id !== lastUid) {
        lastUid = s?.user.id
        unwatch(); unwatch = () => {}
        if (s) { void startSync(s.user.id); unwatch = watchFriendships(() => void paintBadge()); void paintBadge() }
        else { void stopSync({ wipe: false }); overlay(null); void paintBadge() }
      }
      const p = getProfile()
      const key = `${s?.user.id ?? ''}|${p?.handle ?? ''}|${p?.visibility ?? ''}|${p?.display_name ?? ''}`
      if (key === lastKey) return
      lastKey = key
      view()
      const m = drawer.current()
      if (m?.k === 'extra') drawer.rerender()
      if (s && p) void resumeInvite()
    })
    await initAuth()
    addEventListener('hashchange', () => void route())
    void route()
    // first launch with no account and no trips yet: offer sign-up or sign-in, with a clear way to carry on without
    if (!getSession() && !welcomeSeen() && !location.hash.slice(1)) {
      if ((await allTrips()).length) markWelcomed()
      else closeWelcome = showWelcome(() => { closeWelcome = null })
    }
  }

  const home = homeCity()
  globe.intro(home?.lat ?? 22, home?.lng ?? 10)
  const splash = document.getElementById('splash')
  splash?.classList.add('gone')
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  setTimeout(() => splash?.remove(), 500)
}

boot()
