"""
Builds assets/data/geo.js — the real-terrain data behind the 3D map.

Inputs (downloaded on first run into src/.cache/, ~4 MB):
  * Terrarium elevation tiles (zoom 9)  - AWS Open Data "Terrain Tiles"
        https://registry.opendata.aws/terrain-tiles/   (SRTM / ASTER / others, public domain-ish, attribution requested)
  * geoBoundaries ARM ADM0 / ADM1 simplified polygons - CC BY 2.5
        https://www.geoboundaries.org/

What it computes from the DEM (all offline, no libraries beyond numpy/scipy/cv2/PIL):
  * priority-flood pit filling + D8 flow directions
  * flow accumulation  -> the river network (log-scaled, stored in G)
  * HAND (height above nearest drainage) -> used by the shader as a flood-extent model (stored in B)
  * lake mask (flat surfaces such as Lake Sevan)
  * a province-id raster (0 = outside Armenia, 1..11 = marzes)

Output: window.GG_GEO = { w, h, aspect, e0, e1, hand_max, tex_h (PNG data URI: R height, G flow, B HAND),
                          tex_d (PNG data URI: R D8 dir, G lake, B province id), country, provinces, pins }
Run:  python src/tools/build_geo.py
"""
import base64, heapq, io, json, math, os, sys, urllib.request

import numpy as np
from PIL import Image
from scipy import ndimage
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(ROOT, 'src', '.cache')
OUT = os.path.join(ROOT, 'assets', 'data', 'geo.js')
os.makedirs(CACHE, exist_ok=True)

Z = 9
TX0, TX1, TY0, TY1 = 317, 322, 191, 196          # inclusive tile ranges covering Armenia + margin
LON0, LON1, LAT0, LAT1 = 43.30, 46.80, 38.65, 41.45
W = 600                                           # output grid width


def fetch(url, dest):
    if not os.path.exists(dest):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, 'wb') as f:
            f.write(r.read())
    return dest


def merc(lon, lat):
    n = 256 * 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


# ---------------------------------------------------------------- DEM mosaic
mos = np.zeros(((TY1 - TY0 + 1) * 256, (TX1 - TX0 + 1) * 256), np.float32)
for tx in range(TX0, TX1 + 1):
    for ty in range(TY0, TY1 + 1):
        p = fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png' % (Z, tx, ty),
                  os.path.join(CACHE, 't_%d_%d_%d.png' % (Z, tx, ty)))
        a = np.asarray(Image.open(p).convert('RGB'), np.float32)
        e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        mos[(ty - TY0) * 256:(ty - TY0 + 1) * 256, (tx - TX0) * 256:(tx - TX0 + 1) * 256] = e

px0, py0 = merc(LON0, LAT1)
px1, py1 = merc(LON1, LAT0)
ox, oy = TX0 * 256, TY0 * 256
crop = mos[int(round(py0 - oy)):int(round(py1 - oy)), int(round(px0 - ox)):int(round(px1 - ox))]
H = int(round(W * crop.shape[0] / crop.shape[1]))
dem_full = ndimage.gaussian_filter(crop, 1.2)
dem = ndimage.zoom(dem_full, (H / crop.shape[0], W / crop.shape[1]), order=1).astype(np.float64)
dem = np.maximum(dem, 0)
print('grid', W, H, 'elev', dem.min(), dem.max())


# ---------------------------------------------------------------- hydrology
def priority_flood(dem):
    h, w = dem.shape
    filled = dem.copy()
    closed = np.zeros((h, w), bool)
    parent = -np.ones(h * w, np.int64)
    heap = []
    for x in range(w):
        for y in (0, h - 1):
            if not closed[y, x]:
                closed[y, x] = True
                heapq.heappush(heap, (filled[y, x], y * w + x))
    for y in range(h):
        for x in (0, w - 1):
            if not closed[y, x]:
                closed[y, x] = True
                heapq.heappush(heap, (filled[y, x], y * w + x))
    nbrs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    eps = 1e-3
    while heap:
        z, c = heapq.heappop(heap)
        cy, cx = divmod(c, w)
        for dy, dx in nbrs:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not closed[ny, nx]:
                closed[ny, nx] = True
                if filled[ny, nx] <= z:
                    filled[ny, nx] = z + eps
                parent[ny * w + nx] = c
                heapq.heappush(heap, (filled[ny, nx], ny * w + nx))
    return filled, parent


filled, parent = priority_flood(dem)
N = W * H
flat_f = filled.ravel()
order = np.argsort(-flat_f, kind='stable')           # high -> low; parent is always strictly lower
acc = np.ones(N, np.float64)
for c in order:
    p = parent[c]
    if p >= 0:
        acc[p] += acc[c]
print('max acc', acc.max())

THR = 130                                            # cells (~35 km2) that count as a river
river = acc >= THR
drain = np.arange(N)
for c in order[::-1]:                                # low -> high : downstream is already resolved
    p = parent[c]
    if river[c] or p < 0:
        drain[c] = c
    else:
        drain[c] = drain[p]
hand = (flat_f - flat_f[drain]).reshape(H, W)
hand = np.clip(hand, 0, None)

# lakes: big flat surfaces
loc_std = np.sqrt(np.maximum(ndimage.uniform_filter(dem_full ** 2, 5) - ndimage.uniform_filter(dem_full, 5) ** 2, 0))
loc_std = ndimage.zoom(loc_std, (H / crop.shape[0], W / crop.shape[1]), order=1)
flat = (loc_std < 0.6) & (dem > 1500)               # alpine/plateau lakes (Sevan 1900 m); lowland flats are farmland
lab, n = ndimage.label(flat)
sizes = ndimage.sum(flat, lab, range(1, n + 1))
lake = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 160])
lake = ndimage.binary_opening(lake, iterations=1)
print('lake px', lake.sum())

# D8 direction code (0 = none) of each cell towards its parent
dircode = np.zeros((H, W), np.uint8)
codes = {(-1, -1): 1, (-1, 0): 2, (-1, 1): 3, (0, -1): 4, (0, 1): 5, (1, -1): 6, (1, 0): 7, (1, 1): 8}
par2 = parent.reshape(H, W)
yy, xx = np.mgrid[0:H, 0:W]
py_, px_ = np.divmod(np.where(par2 >= 0, par2, 0), W)
for (dy, dx), cd in codes.items():
    m = (par2 >= 0) & (py_ - yy == dy) & (px_ - xx == dx)
    dircode[m] = cd

# ---------------------------------------------------------------- polygons / provinces
def fetch_json(url, name):
    return json.load(open(fetch(url, os.path.join(CACHE, name)), encoding='utf8'))


base = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/ARM/%s/geoBoundaries-ARM-%s_simplified.geojson'
adm0 = fetch_json(base % ('ADM0', 'ADM0'), 'adm0.geojson')
adm1 = fetch_json(base % ('ADM1', 'ADM1'), 'adm1.geojson')


def rings_of(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    out = []
    for poly in polys:
        for i, ring in enumerate(poly):
            out.append((i == 0, ring))
    return out


def norm(ring):
    pts = []
    for lon, lat in ring:
        x, y = merc(lon, lat)
        pts.append(((x - px0) / (px1 - px0), (y - py0) / (py1 - py0)))
    return pts


ISO = ['AM-AG', 'AM-AR', 'AM-AV', 'AM-ER', 'AM-GR', 'AM-KT', 'AM-LO', 'AM-SH', 'AM-SU', 'AM-TV', 'AM-VD']
ID = {k: i + 1 for i, k in enumerate(ISO)}
NAMES = {
    'AM-AG': ('Aragatsotn', 'Արագածոտն', 'Арагацотн'), 'AM-AR': ('Ararat', 'Արարատ', 'Арарат'),
    'AM-AV': ('Armavir', 'Արմավիր', 'Армавир'), 'AM-ER': ('Yerevan', 'Երևան', 'Ереван'),
    'AM-GR': ('Gegharkunik', 'Գեղարքունիք', 'Гегаркуник'), 'AM-KT': ('Kotayk', 'Կոտայք', 'Котайк'),
    'AM-LO': ('Lori', 'Լոռի', 'Лори'), 'AM-SH': ('Shirak', 'Շիրակ', 'Ширак'),
    'AM-SU': ('Syunik', 'Սյունիք', 'Сюник'), 'AM-TV': ('Tavush', 'Տավուշ', 'Тавуш'),
    'AM-VD': ('Vayots Dzor', 'Վայոց ձոր', 'Вайоц-Дзор'),
}
pid = np.zeros((H, W), np.uint8)
provinces = []
for ft in adm1['features']:
    iso = ft['properties']['shapeISO']
    pid_val = ID[iso]
    rings = rings_of(ft['geometry'])
    for is_outer, ring in rings:
        pts = np.array([[x * W, y * H] for x, y in norm(ring)], np.float32)
        cv2.fillPoly(pid, [np.round(pts).astype(np.int32)], pid_val if is_outer else 0)
    outer = max((r for o, r in rings if o), key=lambda r: len(r))
    nr = norm(outer)
    cx = sum(p[0] for p in nr) / len(nr)
    cy = sum(p[1] for p in nr) / len(nr)
    # use the rasterised mask for a nicer label anchor (centre of mass of the province pixels)
    ys, xs = np.nonzero(pid == pid_val)
    if len(xs):
        cx, cy = xs.mean() / W, ys.mean() / H
    en, hy, ru = NAMES[iso]
    provinces.append({'id': pid_val, 'iso': iso, 'en': en, 'hy': hy, 'ru': ru,
                      'c': [round(cx, 4), round(cy, 4)],
                      'rings': [[round(v, 4) for p in norm(r) for v in p] for o, r in rings if o]})
provinces.sort(key=lambda p: p['id'])
country = [[round(v, 4) for p in norm(r) for v in p] for o, r in rings_of(adm0['features'][0]['geometry']) if o]

inside = pid > 0
# rivers only inside Armenia count for the texture; HAND/flow outside is still stored (the map shows a dim neighbourhood)
accg = acc.reshape(H, W)

# ---------------------------------------------------------------- encode textures
e0 = float(max(dem.min(), 0))
e1 = float(math.ceil(dem.max() / 50.0) * 50)
h8 = np.round(255 * np.sqrt(np.clip((dem - e0) / (e1 - e0), 0, 1))).astype(np.uint8)
lg = np.log2(np.maximum(accg, 1))
g8 = np.where(accg >= THR, 40 + 215 * (lg - math.log2(THR)) / (lg.max() - math.log2(THR)), 0)
g8 = np.clip(np.round(g8), 0, 255).astype(np.uint8)
HAND_MAX = 80.0
b8 = np.round(255 * np.sqrt(np.clip(hand / HAND_MAX, 0, 1))).astype(np.uint8)
tex_h = np.dstack([h8, g8, b8])
tex_d = np.dstack([dircode * 28, np.where(lake, 255, 0).astype(np.uint8), pid * 20]).astype(np.uint8)


def png_uri(arr):
    buf = io.BytesIO()
    Image.fromarray(arr, 'RGB').save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


uri_h, sz_h = png_uri(tex_h)
uri_d, sz_d = png_uri(tex_d)
print('png bytes', sz_h, sz_d)

pins_ll = {
    'yerevan': (44.5126, 40.1811), 'stepanavan': (44.3833, 41.0), 'sevan': (45.30, 40.33), 'anpp': (44.1444, 40.0722),
}
pins = {}
for k, (lon, lat) in pins_ll.items():
    x, y = merc(lon, lat)
    pins[k] = [round((x - px0) / (px1 - px0), 4), round((y - py0) / (py1 - py0), 4)]

geo = {'w': W, 'h': H, 'aspect': round((px1 - px0) / (py1 - py0), 5), 'e0': round(e0, 1), 'e1': e1, 'hand_max': HAND_MAX,
       'bbox': [LON0, LAT0, LON1, LAT1], 'tex_h': uri_h, 'tex_d': uri_d,
       'country': country, 'provinces': provinces, 'pins': pins}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf8') as f:
    f.write('/* Generated by src/tools/build_geo.py - terrain: AWS Open Data Terrain Tiles (SRTM/ASTER/...); '
            'boundaries: geoBoundaries (CC BY 2.5) */\nwindow.GG_GEO=')
    json.dump(geo, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')

# debug previews (not shipped)
dbg = CACHE
os.makedirs(dbg, exist_ok=True)
Image.fromarray(tex_h).save(os.path.join(dbg, 'dbg_h.png'))
Image.fromarray(tex_d).save(os.path.join(dbg, 'dbg_d.png'))
