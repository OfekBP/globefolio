import Globe from 'globe.gl'
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial } from 'three'
import { anchorOf, altitudeFor, type Country } from './data/countries'

export interface Trail { startLat: number; startLng: number; endLat: number; endLng: number }
export interface Pin { lat: number; lng: number }

const SODIUM = 0xff8c1a
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

interface Handlers { onSelect(c: Country): void; onHover(c: Country | null): void }

export function createGlobe(el: HTMLElement, countries: Country[], h: Handlers) {
  let visited = new Set<string>()
  let hover: Country | null = null
  let selected: Country | null = null

  // One material per country, mutated in place so state changes never rebuild geometry.
  const mats = new Map<string, MeshBasicMaterial>()
  const matFor = (c: Country) => {
    let m = mats.get(c.properties.i)
    if (!m) {
      m = new MeshBasicMaterial({
        color: SODIUM, transparent: true, opacity: 0, depthWrite: false,
        blending: AdditiveBlending, side: DoubleSide,
      })
      mats.set(c.properties.i, m)
    }
    return m
  }

  function paint() {
    for (const c of countries) {
      const m = matFor(c)
      const lit = visited.has(c.properties.i)
      const hot = c === hover || c === selected
      m.color.set(hot && lit ? 0xffd89b : SODIUM)
      m.opacity = lit ? (hot ? 0.7 : 0.48) : hot ? 0.1 : 0
      if (!lit && hot) m.color.set(0xb8c6e8)
    }
  }

  const globe = new Globe(el, { animateIn: false })
    .backgroundColor('#04060b')
    .globeImageUrl('/geo/earth-night.jpg')
    .bumpImageUrl('/geo/earth-topology.png')
    .backgroundImageUrl('/geo/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('#5f93d4')
    .atmosphereAltitude(0.16)
    .polygonsData(countries)
    .polygonCapMaterial(d => matFor(d as Country))
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(170, 190, 225, 0.075)')
    .polygonAltitude(0.003)
    .polygonsTransitionDuration(0)
    .polygonLabel(d => {
      const c = d as Country
      return `<div class="tip">${c.properties.n}${visited.has(c.properties.i) ? '<i></i>' : ''}</div>`
    })
    .onPolygonHover(d => {
      hover = (d as Country) ?? null
      paint()
      el.style.cursor = hover ? 'pointer' : 'grab'
      h.onHover(hover)
    })
    .onPolygonClick(d => h.onSelect(d as Country))
    .arcColor(() => ['rgba(255,166,64,0.05)', 'rgba(255,216,155,0.95)'])
    .arcStroke(0.32)
    .arcAltitudeAutoScale(0.34)
    .arcDashLength(0.38)
    .arcDashGap(0.9)
    .arcDashInitialGap(() => Math.random())
    .arcDashAnimateTime(reduceMotion ? 0 : 4200)
    .arcsTransitionDuration(0)
    .pointColor(() => '#ffd89b')
    .pointAltitude(0.004)
    .pointRadius(0.16)
    .pointsMerge(true)
    .ringColor(() => (t: number) => `rgba(255,190,100,${1 - t})`)
    .ringMaxRadius(3.4)
    .ringPropagationSpeed(1.6)
    .ringRepeatPeriod(1800)

  // The planet's own surface: dim the city-light texture so lit land is the brightest thing on Earth.
  const surface = globe.globeMaterial() as MeshBasicMaterial & { emissive?: Color }
  surface.color = new Color(0xb4bad0)

  const controls = globe.controls()
  controls.autoRotate = !reduceMotion
  controls.autoRotateSpeed = 0.28
  controls.minDistance = 118
  controls.maxDistance = 560
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  let idle = 0
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idle) })
  controls.addEventListener('end', () => {
    clearTimeout(idle)
    idle = window.setTimeout(() => (controls.autoRotate = !reduceMotion && !selected), 7000)
  })

  const resize = () => globe.width(innerWidth).height(innerHeight)
  addEventListener('resize', resize)
  resize()
  globe.pointOfView({ lat: 22, lng: 10, altitude: 7 })
  paint()

  return {
    setVisited(v: Set<string>) { visited = v; paint() },
    setSelected(c: Country | null) {
      selected = c
      paint()
      controls.autoRotate = !reduceMotion && !c
      if (c) {
        const a = anchorOf(c)
        globe.ringsData([{ lat: a.lat, lng: a.lng }])
      } else globe.ringsData([])
    },
    setTrails(t: Trail[]) {
      globe.arcsData(t)
    },
    setPins(p: Pin[]) { globe.pointsData(p) },
    flyToCountry(c: Country, ms = 1400) {
      const a = anchorOf(c)
      // leave room for the journal drawer on wide screens by aiming slightly east of centre
      const shift = innerWidth > 800 ? a.span * 0.1 : 0
      globe.pointOfView({ lat: a.lat, lng: a.lng + shift, altitude: altitudeFor(a.span) }, ms)
    },
    flyTo(lat: number, lng: number, altitude = 0.9, ms = 1400) {
      globe.pointOfView({ lat, lng, altitude }, ms)
    },
    intro(lat: number, lng: number) {
      globe.pointOfView({ lat, lng, altitude: 2.05 }, reduceMotion ? 0 : 3200)
    },
  }
}
