import Globe from 'globe.gl'
import { Color, DoubleSide, MeshBasicMaterial } from 'three'
import { altitudeFor, anchorOf, type City, type Country, type Geo } from './data/geo'
import type { Theme } from './theme'
import { esc } from './ui/format'

export interface Trail { startLat: number; startLng: number; endLat: number; endLng: number }
export interface LitCity { city: City; trips: number }

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const SKIN = {
  light: {
    tiles: 'World_Topo_Map', labels: false, ocean: '#bfe0f2', atmosphere: '#9fd2ee', fill: 0xff5a2c,
    arc: ['rgba(255,90,44,0.25)', 'rgba(255,90,44,0.95)'], label: '#1c3552',
    sky: null as string | null,
  },
  dark: {
    tiles: 'World_Imagery', labels: true, ocean: '#071a36', atmosphere: '#4f86c6', fill: 0xff8a5c,
    arc: ['rgba(255,138,92,0.25)', 'rgba(255,214,150,0.95)'], label: '#e8eef8',
    sky: '/geo/night-sky.png' as string | null,
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
    .globeTileEngineMaxLevel(17)
    .showAtmosphere(true)
    .atmosphereColor(skin.atmosphere)
    .atmosphereAltitude(0.18)
    .polygonsData(geo.countries)
    .polygonCapMaterial(d => matFor(d as Country))
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(0,0,0,0)')
    .polygonAltitude(0.0015)
    .polygonsTransitionDuration(0)
    .polygonLabel(d => h.describe(d as Country))
    .onPolygonHover(d => {
      hover = (d as Country) ?? null
      paint()
      el.style.cursor = hover ? 'pointer' : 'grab'
    })
    .onPolygonClick((d, _e, at) => {
      // Zoomed in, a tap on a city's spot picks that city; otherwise it picks the country.
      const city = at && at.altitude < 1 ? cityNear(at.lat, at.lng, at.altitude) : undefined
      if (city) h.onCity(city)
      else h.onCountry(d as Country)
    })
    .arcColor(() => skin.arc)
    .arcStroke(0.5)
    .arcAltitudeAutoScale(0.32)
    .arcDashLength(0.4)
    .arcDashGap(0.9)
    .arcDashInitialGap(() => Math.random())
    .arcDashAnimateTime(reduceMotion ? 0 : 4200)
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
    .labelLat(d => (d as City).lat)
    .labelLng(d => (d as City).lng)
    .labelText(d => (d as City).name)
    .labelAltitude(0.0025)
    .labelResolution(2)
    .labelIncludeDot(true)
    .onLabelClick(d => h.onCity(d as City))

  /** The biggest city within a tap-sized radius of a map point (radius shrinks as you zoom in). */
  function cityNear(lat: number, lng: number, alt: number): City | undefined {
    const tol = Math.max(0.02, alt * 3)
    const cosLat = Math.cos((lat * Math.PI) / 180)
    let best: City | undefined
    for (const c of geo.cities) {
      let dLng = Math.abs(c.lng - lng)
      if (dLng > 180) dLng = 360 - dLng
      const dx = dLng * cosLat, dy = c.lat - lat
      if (dx * dx + dy * dy > tol * tol) continue
      if (!best || c.pop > best.pop) best = c
    }
    return best
  }

  function pinEl(d: LitCity) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'pin'
    b.setAttribute('aria-label', `${d.city.name}, ${geo.byIso.get(d.city.iso)?.properties.n ?? ''}`)
    b.innerHTML = `<span class="pin-dot"></span><span class="pin-name">${esc(d.city.name)}</span>`
    b.addEventListener('click', e => { e.stopPropagation(); h.onCity(d.city) })
    return b
  }

  function applySkin() {
    skin = SKIN[theme]
    const sphere = globe.globeMaterial() as MeshBasicMaterial
    sphere.color = new Color(skin.ocean)
    globe
      .atmosphereColor(skin.atmosphere)
      .backgroundImageUrl(skin.sky ?? '')
      .arcColor(() => skin.arc)
      .labelColor(() => skin.label)
    // the tile engine keeps loaded tiles, so swap the source, clear the cache, then nudge the camera so it refetches
    globe.globeTileEngineUrl((x: number, y: number, l: number) => tileUrl(x, y, l))
    ;(globe as unknown as { globeTileEngineClearCache(): void }).globeTileEngineClearCache()
    const p = globe.pointOfView()
    globe.pointOfView({ ...p, altitude: p.altitude * 1.001 })
    paint()
    refreshLabels(true)
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
    labelTimer = window.setTimeout(() => { paint(); refreshLabels(); h.onView(altitude) }, 140)
  })

  /** Show the biggest unvisited cities around the view centre; how many depends on how close you are. */
  let lastKey = ''
  function refreshLabels(force = false) {
    const p = globe.pointOfView()
    const alt = p.altitude
    if (alt > 1.1 || !skin.labels) {
      if (lastKey !== 'none') { globe.labelsData([]); lastKey = 'none' }
      return
    }
    const minPop = alt > 0.7 ? 1500 : alt > 0.45 ? 700 : alt > 0.25 ? 250 : alt > 0.12 ? 90 : alt > 0.05 ? 25 : 0
    const radius = ((Math.acos(1 / (1 + alt)) * 180) / Math.PI) * 0.85
    const key = `${p.lat.toFixed(1)}|${p.lng.toFixed(1)}|${minPop}|${Math.round(radius)}`
    if (!force && key === lastKey) return
    lastKey = key
    const cosLat = Math.cos((p.lat * Math.PI) / 180)
    const out: City[] = []
    for (const c of geo.cities) {
      if (c.pop < minPop || litKeys.has(c.key)) continue
      let dLng = Math.abs(c.lng - p.lng)
      if (dLng > 180) dLng = 360 - dLng
      const dx = dLng * cosLat, dy = c.lat - p.lat
      if (dx * dx + dy * dy > radius * radius) continue
      out.push(c)
      if (out.length >= 110) break // cities are sorted by population, so these are the biggest
    }
    const size = Math.max(0.03, alt * 0.3)
    globe.labelSize(() => size).labelDotRadius(() => size * 0.32).labelColor(() => skin.label).labelsData(out)
  }

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
      globe.htmlElementsData(c)
      refreshLabels(true)
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
