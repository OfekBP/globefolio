// Builds the lightweight geo data Wayfarer ships from Natural Earth (public domain).
//   node scripts/build-geo.mjs <dir with ne_50m_admin_0_countries.geojson as countries.geojson and ne_10m_populated_places_simple.geojson as places.geojson>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const raw = process.argv[2]
if (!raw) throw new Error('usage: node scripts/build-geo.mjs <raw-dir>')
const out = 'public/geo'
mkdirSync(out, { recursive: true })

const round = n => Math.round(n * 20) / 20 // 0.05 degrees: borders only need to be pickable, the map tiles draw the detail
const area = ring => {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return Math.abs(a / 2)
}
function simplify(ring) {
  const o = []
  let last
  for (const [x, y] of ring) {
    const q = [round(x), round(y)]
    if (!last || last[0] !== q[0] || last[1] !== q[1]) o.push(q)
    last = q
  }
  return o.length >= 4 ? o : null
}

const countries = JSON.parse(readFileSync(join(raw, 'countries.geojson'), 'utf8'))
const kept = []
for (const f of countries.features) {
  const p = f.properties
  if (p.ADM0_A3 === 'ATA') continue
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const rings = polys.map(poly => simplify(poly[0])).filter(Boolean)
  const big = rings.filter(r => area(r) > 0.02)
  const use = big.length ? big : [rings.sort((a, b) => area(b) - area(a))[0]].filter(Boolean)
  if (!use.length) continue
  const a2 = [p.ISO_A2, p.ISO_A2_EH].find(v => v && v !== '-99') ?? ''
  kept.push({
    type: 'Feature',
    properties: { n: p.NAME, i: p.ADM0_A3, a: a2.toLowerCase(), c: p.CONTINENT },
    geometry: { type: 'MultiPolygon', coordinates: use.map(r => [r]) },
  })
}
writeFileSync(join(out, 'countries.json'), JSON.stringify({ type: 'FeatureCollection', features: kept }))

const known = new Set(kept.map(f => f.properties.i))
const places = JSON.parse(readFileSync(join(raw, 'places.geojson'), 'utf8'))
const cities = []
for (const f of places.features) {
  const p = f.properties
  if (!known.has(p.adm0_a3)) continue
  cities.push([p.name, p.adm0_a3, +(+p.latitude).toFixed(3), +(+p.longitude).toFixed(3), Math.round((p.pop_max || 0) / 1000), p.adm0cap ? 1 : 0])
}
cities.sort((a, b) => b[4] - a[4])
writeFileSync(join(out, 'cities.json'), JSON.stringify(cities))

// flags (country-flag-icons, MIT)
mkdirSync('public/flags', { recursive: true })
let flags = 0
for (const f of kept) {
  const a = f.properties.a.toUpperCase()
  const src = join('node_modules/country-flag-icons/3x2', `${a}.svg`)
  if (a && existsSync(src)) { copyFileSync(src, join('public/flags', `${a.toLowerCase()}.svg`)); flags++ }
}
console.log(`countries ${kept.length}, cities ${cities.length}, flags ${flags}`)
