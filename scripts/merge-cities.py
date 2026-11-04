# NOTE: build-geo.mjs writes the base cities.json from Natural Earth. This script then merges GeoNames (cities5000, countryInfo,
# admin1CodesASCII, alternateNamesV2 from download.geonames.org/export/dump, CC BY 4.0) into it and writes names-<lang>.json.
# usage: python -I scripts/merge-cities.py <cities5000 dir> public/geo/cities.json public/geo/countries.json <alternateNames dir>
"""Merge GeoNames cities5000 into public/geo/cities.json.
usage: python -I merge_cities.py <geonames_dir> <cities.json> <countries.json>
Existing rows are kept untouched (trip keys stay valid); GeoNames rows are added only when they are real places that are not already there."""
import json, math, sys, unicodedata, collections
from decimal import Decimal, ROUND_HALF_UP

def fix1(x):
    """Latitude to one decimal exactly like JavaScript's toFixed(1) (ties round away from zero), so the keys match the app's."""
    return str(Decimal(x).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))


gdir, cpath, kpath, gdir2 = sys.argv[1:5]

def fold(s):
    return ''.join(ch for ch in unicodedata.normalize('NFD', s) if unicodedata.category(ch) != 'Mn').lower().strip()

def km(a, b, c, d):
    r = math.pi / 180
    h = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

feats = json.load(open(kpath, encoding='utf8'))['features']
known = {f['properties']['i'] for f in feats}
polys = {}
for f in feats:
    g = f['geometry']
    ps = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    polys[f['properties']['i']] = [(min(q[0] for q in p[0]), min(q[1] for q in p[0]), max(q[0] for q in p[0]), max(q[1] for q in p[0]), p[0]) for p in ps]

def inside(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c

def owner(lat, lng):
    """The app's country whose outline holds this point, if any."""
    for k, pl in polys.items():
        if any(x0 <= lng <= x1 and y0 <= lat <= y1 and inside(lng, lat, r) for x0, y0, x1, y1, r in pl):
            return k
    return None

# places the app draws as their own country, though GeoNames files them under the parent
SPLIT = {'SOM': 'SOL', 'CYP': 'CYN'}
def fix_iso(iso, lat, lng):
    if iso in SPLIT and SPLIT[iso] in polys and owner(lat, lng) == SPLIT[iso]:
        return SPLIT[iso]
    return iso

a2 = {}
for ln in open(gdir + '/countryInfo.txt', encoding='utf8'):
    if ln.startswith('#') or not ln.strip():
        continue
    p = ln.split('\t')
    a2[p[0]] = p[1]

import re
# not places a traveller would pick: camps, bases, airports, city districts counted by number
DROP = re.compile(r"refugee camp|air force base|air base|naval|airport|base.*(hawaii|mcbh)|\(historical\)|central business district|^(paris|marseille|lyon) \d|^seremban \d|^bandar \d|settlement camp|military", re.I)
NONLAT = re.compile(r'[Ѐ-ӿ֐-ۿ一-鿿぀-ヿऀ-ॿ฀-๿]')
def clean(n):
    return re.sub(r'\s+', ' ', n).strip()

rows = json.load(open(cpath, encoding='utf8'))
orig = len(rows)
grid = collections.defaultdict(list)  # (iso, lat bucket, lng bucket) -> rows, for fast neighbour checks
def cell(iso, lat, lng):
    return (iso, int(lat // 0.5), int(lng // 0.5))
def add_grid(r):
    grid[cell(r[1], r[2], r[3])].append(r)
def near(iso, lat, lng):
    ci, cy, cx = cell(iso, lat, lng)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            yield from grid.get((ci, cy + dy, cx + dx), [])
keys = set()
for r in rows:
    add_grid(r)
    keys.add(f'{r[1]}|{r[0]}|{fix1(r[2])}')

KEEP = {'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS'}
skipped = collections.Counter()
added = []
for ln in open(gdir + '/cities5000.txt', encoding='utf8'):
    f = ln.rstrip('\n').split('\t')
    name, ascii_name, lat, lng, fc, cc, pop = f[1], f[2], float(f[4]), float(f[5]), f[7], f[8], int(f[14] or 0)
    if f[6] != 'P' or fc not in KEEP:
        skipped['feature'] += 1; continue
    iso = a2.get(cc)
    if iso not in known:
        iso = owner(lat, lng)  # countries the app names differently (Kosovo, Monaco, ...): go by where the point lies
        if iso is None:
            skipped['country'] += 1; continue
    iso = fix_iso(iso, lat, lng)
    if not name or pop <= 0:
        skipped['empty'] += 1; continue
    key = f'{iso}|{name}|{fix1(lat)}'
    if key in keys:
        skipped['dup key'] += 1; continue
    fn, fa = fold(name), fold(ascii_name)
    dup = False
    for r in near(iso, lat, lng):
        d = km(lat, lng, r[2], r[3])
        if d < 3 or (d < 40 and fold(r[0]) in (fn, fa)):
            dup = True; break
    if dup:
        skipped['near existing'] += 1; continue
    if NONLAT.search(name) and ascii_name:
        name = ascii_name
    row = [name, iso, round(lat, 3), round(lng, 3), round(pop / 1000), 1 if fc == 'PPLC' else 0]
    rows.append(row); add_grid(row); keys.add(key); added.append(row)

before_n = len(rows)
rows = [r for r in rows if not DROP.search(r[0])]
print('dropped', before_n - len(rows))
for r in rows:
    r[0] = clean(r[0])
    r[1] = fix_iso(r[1], r[2], r[3])

# a state or region on rows that share a name with another city in the same country, so "Springfield" can be told apart
adm = {}
for ln in open(gdir + '/admin1CodesASCII.txt', encoding='utf8'):
    f = ln.rstrip(chr(10)).split(chr(9))
    adm[f[0]] = f[1]
gn = collections.defaultdict(list)
for ln in open(gdir + '/cities5000.txt', encoding='utf8'):
    f = ln.rstrip(chr(10)).split(chr(9))
    reg = adm.get(f[8] + '.' + f[10])
    if reg:
        gn[(int(float(f[4]) // 0.5), int(float(f[5]) // 0.5))].append((float(f[4]), float(f[5]), reg))
groups = collections.defaultdict(list)
for r in rows:
    del r[6:]
    groups[(r[1], fold(r[0]))].append(r)
tagged = 0
for g in groups.values():
    if len(g) < 2:
        continue
    for r in g:
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for la, lo, reg in gn.get((int(r[2] // 0.5) + dy, int(r[3] // 0.5) + dx), []):
                    d = km(r[2], r[3], la, lo)
                    if d < 25 and (best is None or d < best[0]):
                        best = (d, reg)
        if best:
            r.append(best[1]); tagged += 1
print('regions added', tagged)




# City names in the app's languages, one small file per language so only that language's users download it.
# Source: GeoNames alternateNamesV2 (tagged by language); for the non-Latin scripts the untagged names of cities5000 are the fallback.
import os
LANGS = {'es': {'es'}, 'fr': {'fr'}, 'de': {'de'}, 'pt': {'pt', 'pt-BR', 'pt-PT'}, 'ru': {'ru'}, 'ar': {'ar'}, 'he': {'he', 'iw'}, 'zh': {'zh', 'zh-CN', 'zh-Hans'}, 'ja': {'ja'}}
TAG2LANG = {t: l for l, ts in LANGS.items() for t in ts}
HAN = re.compile(r'^[一-鿿·]+$')
KANA = re.compile(r'[぀-ヿ]')
PERSIAN = re.compile(r'[پچگکیٹڈںےہڑژھۃ،]')
SCRIPT_OK = {
    'he': lambda n: re.match(r'^[֐-׿ \-]+$', n),
    'ar': lambda n: re.match(r'^[؀-ۿ \-]+$', n) and not PERSIAN.search(n),
    'ru': lambda n: re.match(r'^[Ѐ-ӿ \-]+$', n),
    'zh': lambda n: HAN.match(n),
    'ja': lambda n: re.match(r'^[぀-ヿ一-鿿・]+$', n),
}
def ok(lang, n):
    n = n.strip()
    if not (1 < len(n) < 40):
        return False
    f = SCRIPT_OK.get(lang)
    return bool(f(n)) if f else True

geo_rows = collections.defaultdict(list)  # grid -> (lat, lng, geonameid, latin names)
untagged = {}
for ln in open(gdir + '/cities5000.txt', encoding='utf8'):
    f = ln.rstrip(chr(10)).split(chr(9))
    names = [n.strip() for n in f[3].split(',') if n.strip()]
    latin = {fold(f[1]), fold(f[2])} | {fold(n) for n in names if n.isascii()}
    geo_rows[(int(float(f[4]) // 0.5), int(float(f[5]) // 0.5))].append((float(f[4]), float(f[5]), f[0], latin))
    untagged[f[0]] = names

tagged = collections.defaultdict(lambda: collections.defaultdict(list))  # geonameid -> lang -> [(preferred, name)]
for ln in open(gdir2 + '/alternateNamesV2.txt', encoding='utf8'):
    f = ln.rstrip(chr(10)).split(chr(9))
    if len(f) < 8 or f[2] not in TAG2LANG:
        continue
    if f[6] == '1' or f[7] == '1':  # colloquial or historic
        continue
    lang = TAG2LANG[f[2]]
    if ok(lang, f[3]):
        tagged[f[1]][lang].append((f[4] == '1', f[3].strip()))

def pick_untagged(lang, names):
    if lang in ('es', 'fr', 'de', 'pt'):
        return []
    c = [n for n in names if ok(lang, n)]
    if lang == 'ja':
        c = [n for n in c if KANA.search(n)] or [n for n in c if HAN.match(n)]
    return sorted(set(c), key=len)[:2]

local = {k: {} for k in LANGS}
for r in rows:
    fr = fold(r[0])
    best = None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for la, lo, gid, latin in geo_rows.get((int(r[2] // 0.5) + dy, int(r[3] // 0.5) + dx), []):
                if fr in latin:
                    d = km(r[2], r[3], la, lo)
                    if d < 25 and (best is None or d < best[0]):
                        best = (d, gid)
    if not best:
        continue
    gid = best[1]
    key = f'{r[1]}|{r[0]}|{fix1(r[2])}'
    for lang in LANGS:
        c = sorted(tagged[gid].get(lang, []), key=lambda x: not x[0])  # preferred first, file order after
        names = []
        for _, n in c:
            if n not in names:
                names.append(n)
        if not names:
            names = pick_untagged(lang, untagged[gid])
        names = names[:3]
        if not names:
            continue
        if len(names) == 1 and fold(names[0]) == fr:
            continue  # same as the English name, nothing to add
        local[lang][key] = '|'.join(names)
out = os.path.dirname(cpath)
for lang, store in local.items():
    json.dump(store, open(f'{out}/names-{lang}.json', 'w', encoding='utf8', newline='\n'), ensure_ascii=False, separators=(',', ':'))
    print('names', lang, len(store), os.path.getsize(f'{out}/names-{lang}.json'))
rows.sort(key=lambda r: -r[4])  # stable: existing order is kept among equal populations
json.dump(rows, open(cpath, 'w', encoding='utf8', newline='\n'), ensure_ascii=False, separators=(',', ':'))
print('before', orig, 'added', len(added), 'after', len(rows), dict(skipped))
