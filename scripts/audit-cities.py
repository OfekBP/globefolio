"""Flag cities that sit away from their country's border. usage: python -I audit_cities.py cities.json countries.json out.json"""
import json, math, sys
cities = json.load(open(sys.argv[1], encoding='utf8'))
feats = json.load(open(sys.argv[2], encoding='utf8'))['features']
polys = {}
for f in feats:
    g = f['geometry']
    ps = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    out = []
    for p in ps:
        ring = p[0]
        xs = [q[0] for q in ring]; ys = [q[1] for q in ring]
        out.append((min(xs), min(ys), max(xs), max(ys), ring))
    polys[f['properties']['i']] = out

def inside(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c

def seg_km(x, y, a, b):
    k = 111.2; cx = math.cos(math.radians(y))
    px, py = x * cx * k, y * k
    ax, ay = a[0] * cx * k, a[1] * k; bx, by = b[0] * cx * k, b[1] * k
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def dist(x, y, ring):
    return min(seg_km(x, y, ring[i], ring[i - 1]) for i in range(len(ring)))

bad = []
for idx, (name, iso, lat, lng, pop, cap) in enumerate(cities):
    pl = polys.get(iso)
    if pl is None:
        bad.append([name, iso, lat, lng, pop, 'no country', None]); continue
    hit = False
    for x0, y0, x1, y1, ring in pl:
        if x0 <= lng <= x1 and y0 <= lat <= y1 and inside(lng, lat, ring):
            hit = True; break
    if hit:
        continue
    d = min(dist(lng, lat, r) for *_, r in pl)
    if d > 8:
        bad.append([name, iso, lat, lng, pop, 'outside', round(d)])
bad.sort(key=lambda b: -(b[6] or 9999))
json.dump(bad, open(sys.argv[3], 'w', encoding='utf8'), ensure_ascii=False)
print(len(cities), 'checked,', len(bad), 'more than 8 km outside')
for b in bad[:60]:
    print(ascii(b))
