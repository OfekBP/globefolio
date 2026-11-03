import Globe from 'globe.gl'
import { Color, DoubleSide, MeshBasicMaterial, type MeshPhongMaterial } from 'three'
import { altitudeFor, anchorOf, type City, type Country, type Geo } from './data/geo'
import type { Theme } from './theme'
import { esc } from './ui/format'

export interface Trail { startLat: number; startLng: number; endLat: number; endLng: number }
type Pt = [number, number]
interface Line { pts: Pt[]; kind: 'region' | 'city' | 'grid' }
export interface LitCity { city: City; trips: number }

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
    arc: ['rgba(255,111,142,0.25)', 'rgba(255,111,142,1)'],
    border: 'rgba(255,255,255,0.95)', region: 'rgba(255,255,255,0.7)', grid: 'rgba(255,255,255,0.35)', city: 'rgba(31,42,68,1)',
    base: { s: 0, l: 0 }, lit: { s: 0.1, l: -0.05 }, full: { s: 0.28, l: -0.1 },
  },
  dark: {
    ocean: '#12284a', atmosphere: '#5b8fd6', fill: 0xffc93c,
    arc: ['rgba(255,201,60,0.2)', 'rgba(255,201,60,1)'],
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

const GRID: Line[] = (() => {
  const out: Line[] = []
  for (let lat = -60; lat <= 60; lat += 30) out.push({ kind: 'grid', pts: Array.from({ length: 73 }, (_, i) => [lat, -180 + i * 5] as Pt) })
  for (let lng = -180; lng < 180; lng += 30) out.push({ kind: 'grid', pts: Array.from({ length: 37 }, (_, i) => [-90 + i * 5, lng] as Pt) })
  return out
})()

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
  let arcW = 0.5

  // Picking by lat/lng: a bbox check plus point-in-polygon on a handful of countries is far cheaper than raycasting 177 meshes.
  type Box = { c: Country; x0: number; y0: number; x1: number; y1: number; rings: number[][][] }
  const boxes: Box[] = geo.countries.map(c => {
    const g = c.geometry as unknown as { type: string; coordinates: number[][][] | number[][][][] }
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][]
    const rings = polys.map(p => p[0])
    let x0 = 999, y0 = 999, x1 = -999, y1 = -999
    for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    return { c, x0, y0, x1, y1, rings }
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

  function paint() {
    const tmp = new Color()
    for (const c of geo.countries) {
      const iso = c.properties.i
      const fam = FAMILY[c.properties.c]
      tmp.set(fam ? fam[hash(iso) % fam.length] : 0xeef3f7)
      const tone = whole.has(iso) ? skin.full : litIso.has(iso) ? skin.lit : skin.base
      if (fam) tmp.offsetHSL(0, tone.s, tone.l)
      if (c === selected || c === hover) tmp.offsetHSL(0, 0.15, theme === 'dark' ? 0.14 : -0.1)
      matFor(c).color.copy(tmp)
    }
  }

  const lineColor = (l: Line) => (l.kind === 'city' ? skin.city : l.kind === 'grid' ? skin.grid : skin.region)

  const globe = new Globe(el, { animateIn: false })
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor(skin.atmosphere)
    .atmosphereAltitude(0.22)
    .polygonsData(geo.countries)
    .polygonCapMaterial(d => matFor(d as Country))
    .polygonSideColor(d => (whole.has((d as Country).properties.i) ? 'rgba(31,42,68,0.28)' : 'rgba(0,0,0,0)'))
    .polygonStrokeColor(() => skin.border)
    .polygonAltitude(d => (whole.has((d as Country).properties.i) ? 0.014 : litIso.has((d as Country).properties.i) ? 0.005 : 0.0015))
    .polygonsTransitionDuration(0)
    .pathPointLat((p: object) => (p as Pt)[0])
    .pathPointLng((p: object) => (p as Pt)[1])
    .pathPoints((d: object) => (d as Line).pts)
    .pathColor((d: object) => lineColor(d as Line))
    .pathStroke((d: object) => ((d as Line).kind === 'city' ? 1.4 : 0.35))
    .pathTransitionDuration(0)
    .arcColor(() => skin.arc)
    .arcStroke(0.5)
    .arcAltitudeAutoScale(0.32)
    .arcDashLength(0.5)
    .arcDashGap(0.25)
    .arcDashAnimateTime(0)
    .arcsTransitionDuration(0)
    .ringColor(() => (t: number) => `rgba(255,111,142,${0.9 * (1 - t)})`)
    .ringMaxRadius(2.2)
    .ringPropagationSpeed(1.4)
    .ringRepeatPeriod(1700)
    .htmlLat(d => (d as LitCity).city.lat)
    .htmlLng(d => (d as LitCity).city.lng)
    .htmlAltitude(0.002)
    .htmlElement(d => pinEl(d as LitCity))
    .htmlElementVisibilityModifier((node, visible) => {
      node.style.opacity = visible ? '1' : '0'
      node.style.pointerEvents = visible ? 'auto' : 'none'
    })

  function pinEl(d: LitCity) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'pin'
    b.setAttribute('aria-label', `${d.city.name}, ${geo.byIso.get(d.city.iso)?.properties.n ?? ''}`)
    b.innerHTML = `<span class="pin-dot"></span><span class="pin-name">${esc(d.city.name)}</span>`
    b.addEventListener('click', e => { e.stopPropagation(); h.onCity(d.city) })
    return b
  }

  /** Region lines show once you are close enough to care; footprints outline every city you have lit. */
  function syncPaths() {
    const out: Line[] = showRegions ? [...regions] : [...GRID]
    for (const l of lit) {
      const f = footprints[l.city.key]
      if (f) out.push({ pts: f, kind: 'city' })
    }
    globe.pathsData(out)
  }

  // heavier border data loads after first paint
  fetch('/geo/regions.json').then(r => r.json()).then((ls: Pt[][]) => { regions = ls.map(pts => ({ pts, kind: 'region' as const })); syncPaths() }).catch(() => {})
  fetch('/geo/urban.json').then(r => r.json()).then((f: Record<string, Pt[]>) => { footprints = f; syncPaths() }).catch(() => {})

  /** Lifted countries change height, which needs a geometry refresh; only do it when the sets change. */
  let liftKey = ''
  function liftRefresh() {
    const k = [...whole].sort().join() + '|' + [...litIso].sort().join()
    if (k === liftKey) return
    liftKey = k
    globe.polygonAltitude(globe.polygonAltitude()).polygonSideColor(globe.polygonSideColor())
  }

  function applySkin() {
    skin = SKIN[theme]
    const sphere = globe.globeMaterial() as unknown as MeshPhongMaterial
    sphere.color = new Color(skin.ocean)
    globe
      .atmosphereColor(skin.atmosphere)
      .arcColor(() => skin.arc)
      .polygonStrokeColor(() => skin.border)
      .pathColor((d: object) => lineColor(d as Line))
    // flat, bright ocean with just a touch of shading, so the colours stay clean
    const oc = new Color(skin.ocean)
    sphere.color = oc.clone().multiplyScalar(0.3)
    sphere.emissive = oc.clone().multiplyScalar(0.72)
    sphere.specular = new Color(0x000000)
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
  controls.autoRotate = !reduceMotion
  controls.autoRotateSpeed = 0.45
  controls.minDistance = 104 // close enough to read a city outline
  controls.maxDistance = 560
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.zoomSpeed = 1.1

  // the globe drifts for a few seconds after load, then rests so it costs nothing
  const rest = window.setTimeout(() => { controls.autoRotate = false; wake(1500) }, 9000)
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(rest); wake(60000) })
  controls.addEventListener('end', () => wake(2500))

  let labelTimer = 0
  controls.addEventListener('change', () => {
    const p = globe.pointOfView()
    altitude = p.altitude
    // finer drag the closer you are, otherwise a street-level swipe flings you across a continent
    controls.rotateSpeed = Math.min(1, Math.max(0.03, altitude * 0.7))
    clearTimeout(labelTimer)
    labelTimer = window.setTimeout(() => {
      paint(); h.onView(altitude)
      // trails are drawn in world units, so thin them as you close in or they swallow the city
      const w = altitude > 0.8 ? 0.5 : altitude > 0.3 ? 0.18 : altitude > 0.1 ? 0.05 : 0.012
      if (w !== arcW) { arcW = w; globe.arcStroke(w) }
      const near = altitude < 1.1
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
      paint()
      el.style.cursor = c ? 'pointer' : 'grab'
      wake(600)
    }
    h.onHover(c, e.clientX - r.left, e.clientY - r.top)
  })
  el.addEventListener('pointerleave', () => { if (hover) { hover = null; paint(); wake(600) } h.onHover(null, 0, 0) })
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

  return {
    setTheme(t: Theme) { theme = t; applySkin(); wake(1200) },
    setWholeCountries(v: Set<string>) { whole = v; paint(); liftRefresh(); wake() },
    setCities(c: LitCity[]) {
      litIso = new Set(c.map(x => x.city.iso))
      paint()
      lit = c
      syncPaths()
      globe.htmlElementsData(c)
      liftRefresh()
      wake()
    },
    setTrails(t: Trail[]) { globe.arcsData(t); wake() },
    setSelected(c: Country | null, ring?: { lat: number; lng: number }) {
      selected = c
      paint()
      wake(2600)
      controls.autoRotate = !reduceMotion && !c
      globe.ringsData(ring ? [ring] : c ? [{ lat: anchorOf(c).lat, lng: anchorOf(c).lng }] : [])
    },
    flyToCountry(c: Country, ms = 1500) {
      const a = anchorOf(c)
      wake(ms + 700); globe.pointOfView({ lat: a.lat, lng: a.lng, altitude: altitudeFor(a.span) }, ms)
    },
    flyToPoint(lat: number, lng: number, alt: number, ms = 1500) { wake(ms + 700); globe.pointOfView({ lat, lng, altitude: alt }, ms) },
    flyToCity(c: City, ms = 1900) {
      wake(ms + 700)
      globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 0.12 }, ms)
    },
    zoomBy(f: number) {
      const p = globe.pointOfView()
      wake(1400)
      globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.min(6, Math.max(0.04, p.altitude * f)) }, 600)
    },
    reset() { wake(2200); globe.pointOfView({ lat: 20, lng: 10, altitude: 1.7 }, 1400) },
    intro(lat: number, lng: number) {
      wake(3800)
      globe.pointOfView({ lat, lng, altitude: 1.7 }, reduceMotion ? 0 : 3000)
    },
  }
}
