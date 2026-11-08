import { cname, getLocale } from '../i18n'
import type { Place } from '../store'

export interface Country {
  type: 'Feature'
  properties: { n: string; i: string; a: string; c: string }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

export interface City {
  key: string
  name: string
  iso: string
  lat: number
  lng: number
  pop: number // thousands
  cap: boolean
  fold: string
  region?: string // only where another city in the country shares the name
  local?: string // the name in the chosen language, when GeoNames has one that differs from the English name
  alts?: string[] // every local spelling, folded, so a city can be found by typing it in the reader's language
}

export interface Geo {
  countries: Country[]
  byIso: Map<string, Country>
  cities: City[]
  citiesByIso: Map<string, City[]>
  cityByKey: Map<string, City>
  /** The 58,000 cities arrive after the globe is up (they are the biggest download); until then the lists above fill up from the biggest city down. */
  citiesReady: Promise<void>
}

export interface Anchor { lat: number; lng: number; span: number }

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']

const fold = (s: string) => s.normalize('NFD').replace(/[̀-֑ͯ-ׇً-ٟ]/g, '').toLowerCase()

/** A city is identified by country + name + rounded latitude, so trips can find it again from the saved place. */
export const placeKey = (iso: string, p: Pick<Place, 'name' | 'lat'>) => `${iso}|${p.name}|${p.lat.toFixed(1)}`

/** index.html starts these two downloads before any script has loaded; use that head start when it is there. */
type Early = Partial<Record<'countries' | 'cities', Promise<Response>>>
function geoJson<T>(name: 'countries' | 'cities'): Promise<T> {
  const fresh = () => fetch(`${import.meta.env.BASE_URL}geo/${name}.json`).then(r => r.json() as Promise<T>)
  const early = (window as unknown as { __early?: Early }).__early?.[name]
  return early ? early.then(r => { if (!r.ok) throw new Error(name); return r.json() as Promise<T> }).catch(fresh) : fresh()
}

type Row = [string, string, number, number, number, number, string?]
const tick = () => new Promise<void>(r => setTimeout(r))

export async function loadGeo(): Promise<Geo> {
  const cities: City[] = []
  const citiesByIso = new Map<string, City[]>()
  const cityByKey = new Map<string, City>()
  const cj = await geoJson<{ features: Country[] }>('countries')
  const countries: Country[] = cj.features
  const byIso = new Map(countries.map(c => [c.properties.i, c]))
  const geo: Geo = { countries, byIso, cities, citiesByIso, cityByKey, citiesReady: Promise.resolve() }
  // the cities are turned into objects in slices, so the globe keeps animating while they arrive
  geo.citiesReady = geoJson<Row[]>('cities').then(async rows => {
    for (let i = 0; i < rows.length; i++) {
      const [name, iso, lat, lng, pop, cap, region] = rows[i]
      const city: City = { key: placeKey(iso, { name, lat }), name, iso, lat, lng, pop, cap: !!cap, fold: fold(name), region }
      if (!cityByKey.has(city.key)) {
        cities.push(city)
        cityByKey.set(city.key, city)
        const list = citiesByIso.get(iso)
        if (list) list.push(city)
        else citiesByIso.set(iso, [city])
      }
      if (i % 6000 === 5999) await tick()
    }
  }).catch(err => { console.warn('cities did not load', err) })
  return geo
}

const ALT_LANGS = ['es', 'fr', 'de', 'pt', 'ru', 'ar', 'he', 'zh', 'ja']
let altFor = ''
const localByKey = new Map<string, string>()

/** A city's name in the chosen language (English when we have no translation). */
export const cityName = (c: City) => c.local ?? localByKey.get(c.key) ?? c.name
/** The same for a saved trip's place, which only keeps the English name. */
export const placeName = (iso: string, p: Pick<Place, 'name' | 'lat'>) => localByKey.get(placeKey(iso, p)) ?? p.name

/** Fetches this language's city names (one small file per language, only the one in use). The first name is shown; all of them are searchable. */
export async function loadAltNames(geo: Geo, lang = getLocale()) {
  if (altFor === lang) return
  // the file downloads while the city list is still being built; the names are applied once both are in
  const file = ALT_LANGS.includes(lang) ? fetch(`${import.meta.env.BASE_URL}geo/names-${lang}.json`).then(r => r.json() as Promise<Record<string, string>>) : null
  file?.catch(() => {})
  await geo.citiesReady
  localByKey.clear()
  for (const c of geo.cities) { c.local = undefined; c.alts = undefined }
  if (!file) { altFor = lang; return }
  try {
    const names = await file
    for (const [key, n] of Object.entries(names)) {
      const parts = n.split('|')
      localByKey.set(key, parts[0])
      const c = geo.cityByKey.get(key)
      if (c) { c.local = parts[0]; c.alts = parts.map(fold) }
    }
    altFor = lang
  } catch { /* offline and not cached yet: English names still work */ }
}

const anchors = new WeakMap<Country, Anchor>()

/** Centre and angular size of a country's largest landmass (so the US centres on the mainland, not Alaska). */
export function anchorOf(c: Country): Anchor {
  const hit = anchors.get(c)
  if (hit) return hit
  let best = c.geometry.coordinates[0][0], bestArea = -1
  for (const poly of c.geometry.coordinates) {
    const [x0, y0, x1, y1] = bbox(poly[0])
    const area = (x1 - x0) * (y1 - y0)
    if (area > bestArea) { best = poly[0]; bestArea = area }
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
export const altitudeFor = (span: number) => Math.min(2.2, Math.max(0.12, span / 70 + 0.1))

export const flagUrl = (c: Country) => (c.properties.a ? `${import.meta.env.BASE_URL}flags/${c.properties.a}.svg` : '')

export type Hit = { kind: 'city'; city: City } | { kind: 'country'; country: Country }

/** One box for both: cities rank by population, countries slot in when their name matches. */
export function search(geo: Geo, q: string, opts: { iso?: string; citiesOnly?: boolean; limit?: number } = {}): Hit[] {
  const needle = fold(q.trim())
  if (!needle) return []
  const limit = opts.limit ?? 9
  const countryStarts: Hit[] = [], cityStarts: Hit[] = [], within: Hit[] = []
  if (!opts.citiesOnly && !opts.iso) {
    for (const country of geo.countries) {
      // match the English name and the name in the chosen language
      const names = [fold(country.properties.n), fold(cname(country))]
      if (names.some(n => n.startsWith(needle))) countryStarts.push({ kind: 'country', country })
      else if (names.some(n => n.includes(needle))) within.push({ kind: 'country', country })
    }
  }
  const pool = opts.iso ? geo.citiesByIso.get(opts.iso) ?? [] : geo.cities
  for (const city of pool) {
    if (city.fold.startsWith(needle) || city.alts?.some(a => a.startsWith(needle))) cityStarts.push({ kind: 'city', city })
    else if (within.length < 200 && (city.fold.includes(needle) || city.alts?.some(a => a.includes(needle)))) within.push({ kind: 'city', city })
  }
  // Big cities lead, but a matching country is never buried under a pile of small towns.
  const exact = (h: Hit) => (h.kind === 'city' ? h.city.fold === needle || !!h.city.alts?.includes(needle) : [fold(h.country.properties.n), fold(cname(h.country))].includes(needle))
  const lead = [...countryStarts, ...cityStarts].filter(exact)
  const rest = [...cityStarts.slice(0, 3), ...countryStarts, ...cityStarts.slice(3)].filter(h => !lead.includes(h))
  const starts = [...lead, ...rest]
  return [...starts, ...within].slice(0, limit)
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
