import Globe from 'globe.gl'
import { CanvasTexture, Color, DoubleSide, MeshBasicMaterial, SRGBColorSpace } from 'three'
import { altitudeFor, anchorOf, cityName, flagUrl, type City, type Country, type Geo } from './data/geo'
import { prefs } from './prefs'
import { cname, t } from './i18n'
import type { Theme } from './theme'
import { esc } from './ui/format'

type Pt = [number, number]
interface Line { pts: Pt[]; kind: 'region' | 'city' }
export interface LitCity { city: City; trips: number; kind?: 'city' | 'country'; dream?: boolean; friend?: boolean }

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

// Continent families: each country takes one shade, so the map reads like a printed atlas.
const FAMILY: Record<string, number[]> = {
  Africa: [0xf9cf86, 0xf5be74, 0xfbdc9c],
  Asia: [0xf7b4c2, 0xf2a2b6, 0xf9c8d2],
  Europe: [0xb7d6f2, 0xa3c7ec, 0xc8e0f7],
  'North America': [0xb2e1c0, 0x9bd5ad, 0xc4ebce],
  'South America': [0xd4c4f1, 0xc3b0ea, 0xe0d5f7],
  Oceania: [0xf8e19b, 0xf2d57e, 0xfbeab3],
}
const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }

const SKIN = {
  light: {
    ocean: '#a9dcf0', atmosphere: '#ffffff', fill: 0xffc93c,
    border: 'rgba(255,255,255,0.95)', region: 'rgba(255,255,255,0.7)', grid: 'rgba(255,255,255,0.35)', city: 'rgba(31,42,68,1)',
    base: { s: 0, l: 0 }, lit: { s: 0.1, l: -0.05 }, full: { s: 0.28, l: -0.1 },
  },
  dark: {
    ocean: '#12284a', atmosphere: '#5b8fd6', fill: 0xffc93c,
    border: 'rgba(255,255,255,0.22)', region: 'rgba(255,255,255,0.12)', grid: 'rgba(255,255,255,0.08)', city: 'rgba(255,201,60,1)',
    base: { s: -0.25, l: -0.34 }, lit: { s: -0.1, l: -0.2 }, full: { s: 0.05, l: -0.06 },
  },
}

interface Handlers {
  onCountry(c: Country): void
  onCity(c: City): void
  onView(altitude: number): void
  onHover(c: Country | null, x: number, y: number): void
  describe(c: Country): string
}

export function createGlobe(el: HTMLElement, geo: Geo, initial: Theme, h: Handlers) {
  let theme = initial
  let skin = SKIN[theme]
  let whole = new Set<string>()
  let litIso = new Set<string>()
  let hover: Country | null = null
  let selected: Country | null = null
  let altitude = 2.1
  let lit: LitCity[] = []
  let regions: Line[] = []
  let footprints: Record<string, Pt[]> = {}
  let showRegions = false
  let polysBuilt = false
  let polysOn = false
  const pins = new Map<string, { el: HTMLElement; d: LitCity }>()

  // Picking by lat/lng: a bbox check plus point-in-polygon on a handful of countries is far cheaper than raycasting 177 meshes.
  type Box = { c: Country; x0: number; y0: number; x1: number; y1: number; rings: number[][][]; polys: number[][][][] }
  const boxes: Box[] = geo.countries.map(c => {
    const g = c.geometry as unknown as { type: string; coordinates: number[][][] | number[][][][] }
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][]
    const rings = polys.map(p => p[0])
    let x0 = 999, y0 = 999, x1 = -999, y1 = -999
    for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    return { c, x0, y0, x1, y1, rings, polys }
  })
  const inRing = (r: number[][], x: number, y: number) => {
    let ins = false
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins
    }
    return ins
  }
  function pick(lat: number, lng: number): Country | null {
    for (const b of boxes) {
      if (lng < b.x0 || lng > b.x1 || lat < b.y0 || lat > b.y1) continue
      for (const r of b.rings) if (inRing(r, lng, lat)) return b.c
    }
    return null
  }

  // One material per country, mutated in place so state changes never rebuild geometry.
  const mats = new Map<string, MeshBasicMaterial>()
  const matFor = (c: Country) => {
    let m = mats.get(c.properties.i)
    if (!m) { m = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }); mats.set(c.properties.i, m) }
    return m
  }

  // the far view is one painted texture on one sphere (a single draw call); real polygons only appear up close
  const probe = document.createElement('canvas').getContext('webgl')
  const texW = Math.min(4096, (probe?.getParameter(probe.MAX_TEXTURE_SIZE) as number | undefined) ?? 2048)
  const paintCv = document.createElement('canvas')
  paintCv.width = texW; paintCv.height = texW / 2
  const pctx = paintCv.getContext('2d')!
  const tex = new CanvasTexture(paintCv)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const mapMat = new MeshBasicMaterial({ map: tex })
  const gx = (lng: number) => ((lng + 180) / 360) * texW
  const gy = (lat: number) => ((90 - lat) / 180) * (texW / 2)

  const tmp = new Color()
  function colorOf(c: Country) {
    const iso = c.properties.i
    const fam = FAMILY[c.properties.c]
    tmp.set(fam ? fam[hash(iso) % fam.length] : 0xeef3f7)
    const tone = whole.has(iso) ? skin.full : litIso.has(iso) ? skin.lit : skin.base
    if (fam) tmp.offsetHSL(0, tone.s, tone.l)
    if (c === selected) tmp.offsetHSL(0, 0.15, theme === 'dark' ? 0.14 : -0.1)
    return tmp
  }

  function bake() {
    const W = texW, H = texW / 2
    pctx.fillStyle = skin.ocean
    pctx.fillRect(0, 0, W, H)
    pctx.strokeStyle = skin.grid
    pctx.lineWidth = W / 1500
    pctx.beginPath()
    for (let lat = -60; lat <= 60; lat += 30) { pctx.moveTo(0, gy(lat)); pctx.lineTo(W, gy(lat)) }
    for (let lng = -180; lng <= 180; lng += 30) { pctx.moveTo(gx(lng), 0); pctx.lineTo(gx(lng), H) }
    pctx.stroke()
    pctx.strokeStyle = skin.border
    pctx.lineWidth = W / 1000
    pctx.lineJoin = 'round'
    for (const b of boxes) {
      pctx.fillStyle = `#${colorOf(b.c).getHexString()}`
      pctx.beginPath()
      for (const poly of b.polys) for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) { const x = gx(ring[i][0]), y = gy(ring[i][1]); if (i) pctx.lineTo(x, y); else pctx.moveTo(x, y) }
        pctx.closePath()
      }
      pctx.fill('evenodd')
      pctx.stroke()
    }
    tex.needsUpdate = true
    wake(500)
  }
  let bakeT = 0
  const queueBake = () => { clearTimeout(bakeT); bakeT = window.setTimeout(bake, 30) }

  function paint() {
    if (polysBuilt) for (const c of geo.countries) matFor(c).color.copy(colorOf(c))
    queueBake()
  }

  const lineColor = (l: Line) => (l.kind === 'city' ? skin.city : skin.region)

  const globe = new Globe(el, { animateIn: false })
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor(skin.atmosphere)
    .atmosphereAltitude(0.22)
    .globeMaterial(mapMat)
    .polygonCapMaterial(d => matFor(d as Country))
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => skin.border)
    .polygonAltitude(0.0015)
    .polygonsTransitionDuration(0)
    .pathPointLat((p: object) => (p as Pt)[0])
    .pathPointLng((p: object) => (p as Pt)[1])
    .pathPoints((d: object) => (d as Line).pts)
    .pathColor((d: object) => lineColor(d as Line))
    .pathStroke((d: object) => ((d as Line).kind === 'city' ? 1.4 : 0.35))
    .pathTransitionDuration(0)
    .ringColor(() => (t: number) => `rgba(255,111,142,${0.9 * (1 - t)})`)
    .ringMaxRadius(2.2)
    .ringPropagationSpeed(1.4)
    .ringRepeatPeriod(1700)
    .htmlLat(d => (d as LitCity).city.lat)
    .htmlLng(d => (d as LitCity).city.lng)
    .htmlAltitude(0.002)
    .htmlElement(d => pinEl(d as LitCity))
    .htmlElementVisibilityModifier((node, visible) => {
      // a flag fades out as it nears the buttons, timeline, passport card or tab bar, instead of sliding over them
      const o = visible ? clearance(node) : 0
      node.style.opacity = String(o)
      node.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
    })

  // screen areas the interface covers; measured at most a few times a second, not on every frame
  const COVER = ['#stage-search', '#settings', '.map-fabs', '#timeline', '#glance', '#hud', '.tabs', '.tab-add']
  let covers: DOMRect[] = []
  let coversAt = 0
  const FADE = 36 // px over which a flag fades before it touches a card
  function clearance(node: HTMLElement): number {
    const now = performance.now()
    if (now - coversAt > 250) {
      coversAt = now
      covers = COVER.flatMap(q => { const el = document.querySelector<HTMLElement>(q); return el && !el.hidden && el.offsetParent !== null ? [el.getBoundingClientRect()] : [] })
    }
    const r = node.getBoundingClientRect()
    // the flag stands above its anchor: about 22px to each side, 50px up
    const x0 = r.left - 22, x1 = r.left + 22, y0 = r.top - 50, y1 = r.top + 4
    let o = 1
    for (const c of covers) {
      const dx = Math.max(c.left - x1, x0 - c.right, 0)
      const dy = Math.max(c.top - y1, y0 - c.bottom, 0)
      o = Math.min(o, Math.hypot(dx, dy) / FADE)
    }
    return Math.round(Math.min(1, o) * 20) / 20
  }

  /** A lit place wears its flag: a round badge on a stem for cities, a small flag banner for whole countries. */
  function pinEl(d: LitCity) {
    const country = geo.byIso.get(d.city.iso)
    const f = country ? flagUrl(country) : ''
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `pin ${d.kind === 'country' ? 'pin-country' : 'pin-city'}${d.dream ? ' pin-dream' : ''}${d.friend ? ' pin-friend' : ''}`
    const label = d.kind === 'country' ? cityName(d.city) : `${cityName(d.city)}, ${[d.city.region, country ? cname(country) : ''].filter(Boolean).join(', ')}`
    b.setAttribute('aria-label', d.friend ? t('fr.pin', { name: label }) : d.dream ? t('map.dream', { name: label }) : label)
    b.innerHTML = `<span class="pin-glow"></span><span class="pin-body">${f ? `<img src="${f}" alt="" draggable="false" />` : '<i></i>'}</span><span class="pin-name">${esc(cityName(d.city))}</span>`
    b.addEventListener('click', e => {
      e.stopPropagation()
      if (d.kind === 'country' && country) h.onCountry(country)
      else h.onCity(d.city)
    })
    pins.set(`${d.friend ? 'f' : d.dream ? 'w' : 'v'}|${d.city.key}`, { el: b, d })
    return b
  }

  /** Region lines show once you are close enough to care; footprints outline every city you have lit. */
  function syncPaths() {
    const out: Line[] = showRegions ? [...regions] : []
    if (showRegions) for (const l of lit) {
      const f = footprints[l.city.key]
      if (f) out.push({ pts: f, kind: 'city' })
    }
    globe.pathsData(out)
  }

  // the heavy detail (region borders, city outlines) only matters up close, so it loads the first time you get there
  let detailLoaded = false
  function loadDetail() {
    if (detailLoaded) return
    detailLoaded = true
    fetch(`${import.meta.env.BASE_URL}geo/regions.json`).then(r => r.json()).then((ls: Pt[][]) => { regions = ls.map(pts => ({ pts, kind: 'region' as const })); syncPaths() }).catch(() => { detailLoaded = false })
    fetch(`${import.meta.env.BASE_URL}geo/urban.json`).then(r => r.json()).then((f: Record<string, Pt[]>) => { footprints = f; syncPaths() }).catch(() => {})
  }

  /** Real polygons (crisp edges at city zoom) are built the first time you get close, then just shown or hidden. */
  const showPolys = () => globe.scene().traverse(o => { if ((o as { __globeObjType?: string }).__globeObjType === 'polygon') o.visible = polysOn })
  function setPolys(on: boolean) {
    polysOn = on
    if (on && !polysBuilt) { polysBuilt = true; paint(); globe.polygonsData(geo.countries); setTimeout(showPolys, 300) }
    showPolys()
    wake(600)
  }

  // aim a little south of the target so it sits in the visible strip above the bottom sheet
  const lift = (alt: number) => Math.min(20, alt * 15)

  // portrait phones are narrow, so the globe sits further back to show whole
  const homeAlt = () => (el.clientWidth < 600 ? 2.7 : 1.7)

  /** Pins shrink as you pull away so a whole continent of them stays readable. */
  function setScale() {
    el.style.setProperty('--ps', altitude > 2.4 ? '0.72' : altitude > 1.3 ? '0.86' : '1')
    el.classList.toggle('near', altitude < 1)
  }

  /**
   * Flags that would sit on top of each other are folded into the most important one,
   * which then shows a small "+N". Zoom in and they separate on their own.
   */
  function declutter() {
    const p = globe.pointOfView()
    const horizon = ((Math.acos(1 / (1 + p.altitude)) * 180) / Math.PI) * 0.98
    const cosLat = Math.cos((p.lat * Math.PI) / 180)
    const items: { key: string; el: HTMLElement; d: LitCity; x: number; y: number; rank: number }[] = []
    for (const [key, { el: pe, d }] of pins) {
      pe.classList.remove('hid')
      pe.removeAttribute('data-more')
      let dLng = Math.abs(d.city.lng - p.lng)
      if (dLng > 180) dLng = 360 - dLng
      const dx = dLng * cosLat, dy = d.city.lat - p.lat
      if (Math.hypot(dx, dy) > horizon) continue
      const sc = globe.getScreenCoords(d.city.lat, d.city.lng, 0.002)
      if (!sc) continue
      const far = p.altitude >= 1.2
      const rank = (d.friend ? 400 : d.dream ? 0 : 1000) + (d.kind === 'country' ? (far ? 500 : 0) : far ? 0 : 500) + Math.min(d.trips, 99)
      items.push({ key, el: pe, d, x: sc.x, y: sc.y, rank })
    }
    // up close, a country's banner just repeats its city pins, so it steps aside
    if (p.altitude < 0.6) {
      const withCity = new Set(items.filter(i => i.d.kind !== 'country' && !i.d.dream).map(i => i.d.city.iso))
      for (let n = items.length - 1; n >= 0; n--) {
        const i = items[n]
        if (i.d.kind === 'country' && !i.d.dream && withCity.has(i.d.city.iso)) { i.el.classList.add('hid'); items.splice(n, 1) }
      }
    }
    items.sort((a, b) => b.rank - a.rank)
    const scale = p.altitude > 2.4 ? 0.72 : p.altitude > 1.3 ? 0.86 : 1
    const gap = 42 * scale
    const kept: typeof items = []
    const more = new Map<string, number>()
    for (const it of items) {
      const host = kept.find(k => Math.abs(k.x - it.x) < gap && Math.abs(k.y - it.y) < gap)
      if (host) { it.el.classList.add('hid'); more.set(host.key, (more.get(host.key) ?? 0) + 1) } else kept.push(it)
    }
    for (const [k, n] of more) pins.get(k)?.el.setAttribute('data-more', `+${n}`)
  }

  function applySkin() {
    skin = SKIN[theme]
    globe
      .atmosphereColor(skin.atmosphere)
      .polygonStrokeColor(() => skin.border)
      .pathColor((d: object) => lineColor(d as Line))
    paint()
    wake(900)
  }

  // ── rendering on demand: the loop only runs while something is moving ──
  let sleepT = 0
  function wake(ms = 1800) {
    globe.resumeAnimation()
    clearTimeout(sleepT)
    sleepT = window.setTimeout(() => { if (!controls.autoRotate) globe.pauseAnimation() }, ms)
  }

  // ── controls ─────────────────────────────────────────
  const controls = globe.controls()
  controls.autoRotate = !reduceMotion && prefs().spin
  controls.autoRotateSpeed = 0.3
  controls.minDistance = 104 // close enough to read a city outline
  controls.maxDistance = 560
  controls.enableDamping = true
  controls.dampingFactor = 0.09
  controls.zoomSpeed = 1.1

  // the globe drifts for a few seconds after load, then rests so it costs nothing
  const rest = window.setTimeout(() => { controls.autoRotate = false; wake(1500) }, 9000)
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(rest); wake(60000) })
  controls.addEventListener('end', () => { wake(2500); setTimeout(declutter, 200) })

  let labelTimer = 0
  controls.addEventListener('change', () => {
    const p = globe.pointOfView()
    altitude = p.altitude
    // finer drag the closer you are, otherwise a street-level swipe flings you across a continent
    controls.rotateSpeed = Math.min(0.4, Math.max(0.03, altitude * 0.22))
    clearTimeout(labelTimer)
    const closeUp = altitude < 0.9
    if (closeUp !== polysOn) setPolys(closeUp)
    labelTimer = window.setTimeout(() => {
      h.onView(altitude)
      setScale()
      declutter()
      const near = altitude < 1.1
      if (near) loadDetail()
      if (near !== showRegions) { showRegions = near; syncPaths() }
    }, 140)
  })

  // cap the pixel ratio: retina canvases are 4x the fill cost for no visible gain on a map
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(max-width: 800px)').matches ? 1.25 : 1.5))
  // wheel scrolls the page until you click into the globe, so the page never gets trapped
  controls.enableZoom = false
  el.addEventListener('pointerdown', () => { controls.enableZoom = true })
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') controls.enableZoom = false })

  // hover tooltip and tap-to-pick, both through the cheap lat/lng lookup
  const toCoords = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    return globe.toGlobeCoords(e.clientX - r.left, e.clientY - r.top)
  }
  let hoverT = 0
  el.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return
    const now = performance.now()
    if (now - hoverT < 70) return
    hoverT = now
    const at = toCoords(e)
    const c = at ? pick(at.lat, at.lng) : null
    const r = el.getBoundingClientRect()
    if (c !== hover) {
      hover = c
      el.style.cursor = c ? 'pointer' : 'grab'
      wake(600)
    }
    h.onHover(c, e.clientX - r.left, e.clientY - r.top)
  })
  el.addEventListener('pointerleave', () => { hover = null; h.onHover(null, 0, 0) })
  let down: { x: number; y: number; t: number } | null = null
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() } })
  el.addEventListener('pointerup', e => {
    if (!down || (e.target as HTMLElement).closest('.pin')) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const quick = performance.now() - down.t < 450
    down = null
    if (moved > 7 || !quick) return
    const at = toCoords(e)
    const c = at ? pick(at.lat, at.lng) : null
    if (c) h.onCountry(c)
  })

  const resize = () => { globe.width(el.clientWidth).height(el.clientHeight); wake(600) }
  new ResizeObserver(resize).observe(el)
  resize()
  globe.pointOfView({ lat: 22, lng: 10, altitude: 6 })
  applySkin()
  setScale()

  return {
    setTheme(t: Theme) { theme = t; applySkin(); wake(1200) },
    setWholeCountries(v: Set<string>) { whole = v; paint(); wake() },
    setCities(c: LitCity[]) {
      litIso = new Set(c.filter(x => !x.dream).map(x => x.city.iso))
      paint()
      lit = c.filter(x => !x.dream)
      syncPaths()
      pins.clear()
      globe.htmlElementsData(c)
      setTimeout(declutter, 120)
      wake()
    },
    setSelected(c: Country | null, ring?: { lat: number; lng: number }) {
      selected = c
      paint()
      wake(2600)
      controls.autoRotate = !reduceMotion && prefs().spin && !c
      globe.ringsData(ring ? [ring] : c ? [{ lat: anchorOf(c).lat, lng: anchorOf(c).lng }] : [])
    },
    flyToCountry(c: Country, ms = 1500) {
      const a = anchorOf(c)
      const alt = altitudeFor(a.span)
      wake(ms + 700); globe.pointOfView({ lat: a.lat - lift(alt), lng: a.lng, altitude: alt }, ms)
    },
    flyToPoint(lat: number, lng: number, alt: number, ms = 1500) { wake(ms + 700); globe.pointOfView({ lat, lng, altitude: alt }, ms) },
    flyToCity(c: City, ms = 1900) {
      wake(ms + 700)
      globe.pointOfView({ lat: c.lat - lift(0.12), lng: c.lng, altitude: 0.12 }, ms)
    },
    zoomBy(f: number) {
      const p = globe.pointOfView()
      wake(1400)
      globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.min(6, Math.max(0.04, p.altitude * f)) }, 600)
    },
    reset() { wake(2200); globe.pointOfView({ lat: 20, lng: 10, altitude: homeAlt() }, 1400) },
    intro(lat: number, lng: number) {
      wake(3800)
      globe.pointOfView({ lat, lng, altitude: homeAlt() }, reduceMotion ? 0 : 3000)
    },
  }
}
