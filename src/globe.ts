import Globe from 'globe.gl'
import { Color, DoubleSide, MeshBasicMaterial } from 'three'
import { altitudeFor, anchorOf, type City, type Country, type Geo } from './data/geo'
import type { Theme } from './theme'
import { esc } from './ui/format'

export interface Trail { startLat: number; startLng: number; endLat: number; endLng: number }
type Pt = [number, number]
interface Line { pts: Pt[]; kind: 'region' | 'city' }
export interface LitCity { city: City; trips: number }

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const SKIN = {
  light: {
    tiles: 'Canvas/World_Light_Gray_Base', ocean: '#dde4e2', atmosphere: '#b9cdc6', fill: 0x17614b,
    arc: ['rgba(23,97,75,0.2)', 'rgba(23,97,75,0.9)'],
    border: 'rgba(23,33,28,0.4)', region: 'rgba(23,33,28,0.22)', city: 'rgba(23,97,75,1)',
  },
  dark: {
    tiles: 'Canvas/World_Dark_Gray_Base', ocean: '#0c1411', atmosphere: '#3f6b58', fill: 0xc9f24a,
    arc: ['rgba(201,242,74,0.15)', 'rgba(201,242,74,0.9)'],
    border: 'rgba(237,241,230,0.4)', region: 'rgba(237,241,230,0.2)', city: 'rgba(201,242,74,1)',
  },
}

interface Handlers {
  onCountry(c: Country): void
  onCity(c: City): void
  onView(altitude: number): void
  describe(c: Country): string
}

export function createGlobe(el: HTMLElement, geo: Geo, initial: Theme, h: Handlers) {
  let theme = initial
  let skin = SKIN[theme]
  let whole = new Set<string>()
  let litKeys = new Set<string>()
  let hover: Country | null = null
  let selected: Country | null = null
  let altitude = 2.1
  let lit: LitCity[] = []
  let regions: Line[] = []
  let footprints: Record<string, Pt[]> = {}
  let showRegions = false
  let arcW = 0.5

  // One material per country, mutated in place so state changes never rebuild geometry.
  const mats = new Map<string, MeshBasicMaterial>()
  const matFor = (c: Country) => {
    let m = mats.get(c.properties.i)
    if (!m) {
      m = new MeshBasicMaterial({ color: skin.fill, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide })
      mats.set(c.properties.i, m)
    }
    return m
  }

  function paint() {
    // whole-country fills fade as you zoom in, so the map's own detail takes over
    const fade = altitude < 0.6 ? Math.max(0.16, altitude / 0.6) : 1
    for (const c of geo.countries) {
      const m = matFor(c)
      const full = whole.has(c.properties.i)
      const hot = c === hover || c === selected
      m.color.set(full ? skin.fill : theme === 'dark' ? 0xffffff : 0x1c3552)
      m.opacity = full ? (hot ? 0.62 : 0.46) * fade : hot ? 0.1 : 0
    }
  }

  const tileUrl = (x: number, y: number, l: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/${skin.tiles}/MapServer/tile/${l}/${y}/${x}`

  const globe = new Globe(el, { animateIn: false })
    .backgroundColor('rgba(0,0,0,0)')
    .globeTileEngineUrl(tileUrl)
    .globeTileEngineMaxLevel(16)
    .showAtmosphere(true)
    .atmosphereColor(skin.atmosphere)
    .atmosphereAltitude(0.18)
    .polygonsData(geo.countries)
    .polygonCapMaterial(d => matFor(d as Country))
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => skin.border)
    .polygonAltitude(0.0015)
    .polygonsTransitionDuration(0)
    .onPolygonClick(d => h.onCountry(d as Country))
    .pathPointLat((p: object) => (p as Pt)[0])
    .pathPointLng((p: object) => (p as Pt)[1])
    .pathPoints((d: object) => (d as Line).pts)
    .pathColor((d: object) => ((d as Line).kind === 'city' ? skin.city : skin.region))
    .pathStroke((d: object) => ((d as Line).kind === 'city' ? 1.4 : 0.35))
    .pathTransitionDuration(0)
    .arcColor(() => skin.arc)
    .arcStroke(0.5)
    .arcAltitudeAutoScale(0.32)
    .arcDashLength(0.5)
    .arcDashGap(0.25)
    .arcDashAnimateTime(0)
    .arcsTransitionDuration(0)
    .ringColor(() => (t: number) => `rgba(255,120,70,${0.9 * (1 - t)})`)
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
    const out: Line[] = showRegions ? [...regions] : []
    for (const l of lit) {
      const f = footprints[l.city.key]
      if (f) out.push({ pts: f, kind: 'city' })
    }
    globe.pathsData(out)
  }

  // heavier border data loads after first paint
  fetch('/geo/regions.json').then(r => r.json()).then((ls: Pt[][]) => { regions = ls.map(pts => ({ pts, kind: 'region' as const })); syncPaths() }).catch(() => {})
  fetch('/geo/urban.json').then(r => r.json()).then((f: Record<string, Pt[]>) => { footprints = f; syncPaths() }).catch(() => {})

  function applySkin() {
    skin = SKIN[theme]
    const sphere = globe.globeMaterial() as MeshBasicMaterial
    sphere.color = new Color(skin.ocean)
    globe
      .atmosphereColor(skin.atmosphere)
      .arcColor(() => skin.arc)
      .polygonStrokeColor(() => skin.border)
      .pathColor((d: object) => ((d as Line).kind === 'city' ? skin.city : skin.region))
    // the tile engine keeps loaded tiles, so swap the source, clear the cache, then nudge the camera so it refetches
    globe.globeTileEngineUrl((x: number, y: number, l: number) => tileUrl(x, y, l))
    ;(globe as unknown as { globeTileEngineClearCache(): void }).globeTileEngineClearCache()
    const p = globe.pointOfView()
    globe.pointOfView({ ...p, altitude: p.altitude * 1.001 })
    paint()
  }

  // ── controls ─────────────────────────────────────────
  const controls = globe.controls()
  controls.autoRotate = !reduceMotion
  controls.autoRotateSpeed = 0.3
  controls.minDistance = 100.35 // street-level
  controls.maxDistance = 560
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.zoomSpeed = 1.1

  let idle = 0
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idle) })
  controls.addEventListener('end', () => {
    clearTimeout(idle)
    idle = window.setTimeout(() => (controls.autoRotate = !reduceMotion && !selected && altitude > 1), 7000)
  })

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
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  // wheel scrolls the page until you click into the globe, so the page never gets trapped
  controls.enableZoom = false
  el.addEventListener('pointerdown', () => { controls.enableZoom = true })
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') controls.enableZoom = false })

  const resize = () => globe.width(el.clientWidth).height(el.clientHeight)
  new ResizeObserver(resize).observe(el)
  resize()
  globe.pointOfView({ lat: 22, lng: 10, altitude: 6 })
  applySkin()

  return {
    setTheme(t: Theme) { theme = t; applySkin() },
    setWholeCountries(v: Set<string>) { whole = v; paint() },
    setCities(c: LitCity[]) {
      litKeys = new Set(c.map(x => x.city.key))
      lit = c
      syncPaths()
      globe.htmlElementsData(c)
    },
    setTrails(t: Trail[]) { globe.arcsData(t) },
    setSelected(c: Country | null, ring?: { lat: number; lng: number }) {
      selected = c
      paint()
      controls.autoRotate = !reduceMotion && !c
      globe.ringsData(ring ? [ring] : c ? [{ lat: anchorOf(c).lat, lng: anchorOf(c).lng }] : [])
    },
    flyToCountry(c: Country, ms = 1500) {
      const a = anchorOf(c)
      globe.pointOfView({ lat: a.lat, lng: a.lng, altitude: altitudeFor(a.span) }, ms)
    },
    flyToPoint(lat: number, lng: number, alt: number, ms = 1500) { globe.pointOfView({ lat, lng, altitude: alt }, ms) },
    flyToCity(c: City, ms = 1900) {
      globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: 0.07 }, ms)
    },
    zoomBy(f: number) {
      const p = globe.pointOfView()
      globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.min(6, Math.max(0.004, p.altitude * f)) }, 600)
    },
    reset() { globe.pointOfView({ lat: 20, lng: 10, altitude: 1.7 }, 1400) },
    intro(lat: number, lng: number) {
      globe.pointOfView({ lat, lng, altitude: 1.7 }, reduceMotion ? 0 : 3000)
    },
  }
}
