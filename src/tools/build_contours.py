"""
Builds assets/img/contours.svg - real elevation contours of Armenia (and surroundings) traced from the
same DEM that drives the 3D scenes. Used as the line-art backdrop of the Services page.

    python src/tools/build_contours.py       (needs assets/data/geo.js from build_geo.py)
"""
import base64, io, json, os
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
src = open(os.path.join(ROOT, 'assets', 'data', 'geo.js'), encoding='utf8').read()
G = json.loads(src[src.index('{'):].rstrip().rstrip(';'))
png = base64.b64decode(G['tex_h'].split(',', 1)[1])
h8 = np.asarray(Image.open(io.BytesIO(png)).convert('RGB'))[..., 0].astype(np.float32)
W0, H0 = G['w'], G['h']
e = G['e0'] + (G['e1'] - G['e0']) * (h8 / 255.0) ** 2
e = ndimage.gaussian_filter(e, 1.6)
# half resolution keeps the file small
W, H = W0 // 2, H0 // 2
e = cv2.resize(e, (W, H), interpolation=cv2.INTER_AREA)

paths = []
levels = list(range(500, 4800, 250))
for lv in levels:
    mask = (e > lv).astype(np.uint8) * 255
    cs, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    d = []
    for c in cs:
        if len(c) < 14:
            continue
        ap = cv2.approxPolyDP(c, 0.9, False)[:, 0, :]
        if len(ap) < 3:
            continue
        d.append('M' + 'L'.join('%.1f %.1f' % (x, y) for x, y in ap))
    if d:
        paths.append((lv, ''.join(d)))

# country outline
rings = []
for r in G['country']:
    pts = ['%.1f %.1f' % (r[i] * W, r[i + 1] * H) for i in range(0, len(r), 2)]
    rings.append('M' + 'L'.join(pts) + 'Z')

svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" class="contours-svg">' % (W, H), '<g class="cl">']
for lv, d in paths:
    svg.append('<path class="%s" d="%s"/>' % ('cm' if lv % 1000 == 0 else 'cn', d))
svg.append('</g><path class="co" d="%s"/></svg>' % ''.join(rings))
out = os.path.join(ROOT, 'assets', 'img', 'contours.svg')
open(out, 'w', encoding='utf8').write(''.join(svg))
print('contours.svg', os.path.getsize(out) // 1024, 'KB', len(paths), 'levels')
