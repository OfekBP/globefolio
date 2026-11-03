export interface Country {
  type: 'Feature'
  properties: { n: string; i: string }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

export interface Anchor { lat: number; lng: number; span: number }

export async function loadCountries(): Promise<Country[]> {
  const res = await fetch('/geo/countries.json')
  return (await res.json()).features
}

const anchors = new WeakMap<Country, Anchor>()

/** Centre and angular size of a country's largest landmass (so the US centres on the mainland, not Alaska). */
export function anchorOf(c: Country): Anchor {
  const hit = anchors.get(c)
  if (hit) return hit
  let best = c.geometry.coordinates[0][0], bestArea = -1
  for (const poly of c.geometry.coordinates) {
    const ring = poly[0]
    const [x0, y0, x1, y1] = bbox(ring)
    const area = (x1 - x0) * (y1 - y0)
    if (area > bestArea) { best = ring; bestArea = area }
  }
  const [x0, y0, x1, y1] = bbox(best)
  const a = { lat: (y0 + y1) / 2, lng: (x0 + x1) / 2, span: Math.max(x1 - x0, y1 - y0) }
  anchors.set(c, a)
  return a
}

function bbox(ring: number[][]): [number, number, number, number] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90
  for (const [x, y] of ring) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/** Camera altitude (globe radii) that frames a country of the given angular span. */
export const altitudeFor = (span: number) => Math.min(2.4, Math.max(0.55, span / 55 + 0.45))

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function searchCountries(countries: Country[], q: string, limit = 8): Country[] {
  const needle = fold(q.trim())
  if (!needle) return []
  const starts: Country[] = [], within: Country[] = []
  for (const c of countries) {
    const name = fold(c.properties.n)
    if (name.startsWith(needle)) starts.push(c)
    else if (name.includes(needle)) within.push(c)
  }
  return [...starts, ...within].slice(0, limit)
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
