// Builds the extra border layers from Natural Earth (public domain):
//   public/geo/regions.json  state/province lines, as arrays of [lat, lng] paths
//   public/geo/urban.json    city footprints keyed like placeKey(): { "ITA|Rome|41.9": [[lat,lng],...] }
// usage: node scripts/build-borders.mjs <raw-dir>   (needs admin1.geojson, urban.geojson, and public/geo/cities.json)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raw = process.argv[2]
if (!raw) throw new Error('usage: node scripts/build-borders.mjs <raw-dir>')
const out = 'public/geo'
const r = (n, k) => Math.round(n * k) / k

function simplify(pts, eps) {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let max = 0, idx = -1
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      let d
      if (len === 0) d = Math.hypot(px - ax, py - ay)
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      }
      if (d > max) { max = d; idx = i }
    }
    if (max > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

// --- state / province lines
const admin = JSON.parse(readFileSync(join(raw, 'admin1.geojson'), 'utf8'))
const lines = []
for (const f of admin.features) {
  const g = f.geometry
  const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  for (const p of parts) {
    const s = simplify(p.map(([x, y]) => [x, y]), 0.02).map(([x, y]) => [r(y, 50), r(x, 50)])
    if (s.length > 1) lines.push(s)
  }
}
writeFileSync(join(out, 'regions.json'), JSON.stringify(lines))

// --- city footprints
const urban = JSON.parse(readFileSync(join(raw, 'urban.geojson'), 'utf8'))
const polys = []
for (const f of urban.features) {
  const g = f.geometry
  const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  for (const rings of list) {
    const ring = rings[0]
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    polys.push({ ring, x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0) })
  }
}
const inside = (ring, x, y) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const cities = JSON.parse(readFileSync(join(out, 'cities.json'), 'utf8'))
const foot = {}
for (const [name, iso, lat, lng] of cities) {
  // smallest footprint that contains the city, else the nearest one within ~6 km
  let best = null
  for (const p of polys) {
    const pad = 0.06
    if (lng < p.x0 - pad || lng > p.x1 + pad || lat < p.y0 - pad || lat > p.y1 + pad) continue
    if (inside(p.ring, lng, lat)) { if (!best || p.area < best.area) best = p; continue }
    if (best) continue
    for (const [x, y] of p.ring) if (Math.hypot(x - lng, y - lat) < 0.06) { best = best ?? p; break }
  }
  if (!best || best.area > 9) continue
  const s = simplify(best.ring.map(([x, y]) => [x, y]), 0.004).map(([x, y]) => [r(y, 500), r(x, 500)])
  if (s.length >= 4) foot[`${iso}|${name}|${lat.toFixed(1)}`] = s
}
writeFileSync(join(out, 'urban.json'), JSON.stringify(foot))
console.log(`regions ${lines.length} lines, footprints ${Object.keys(foot).length} of ${cities.length} cities`)
