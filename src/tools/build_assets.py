"""
Builds optimised images + the vector logo.

  python src/tools/build_assets.py

Reads the original photos from src/images-original/ (mirrors geogeeks.am/assets/img/...)
and writes WebP files into assets/img/, plus assets/img/logo.svg traced from the PNG logo
and src/content/logo_paths.json (the four facets, used inline by the page templates).
"""
import json, os, re
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'src', 'images-original')
OUT = os.path.join(ROOT, 'assets', 'img')


def save_webp(src, dst, max_w, q=80, square=None):
    im = Image.open(src)
    if im.mode in ('P', 'LA'):
        im = im.convert('RGBA')
    has_a = im.mode == 'RGBA'
    im = im.convert('RGBA' if has_a else 'RGB')
    if square:
        w, h = im.size
        s = min(w, h)
        im = im.crop(((w - s) // 2, 0, (w - s) // 2 + s, s)) if square == 'top' else im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, 'WEBP', quality=q, method=6)
    return im.size


# ---------------------------------------------------------------- logo -> SVG facets
def trace_logo():
    im = Image.open(os.path.join(SRC, 'assets', 'img', 'GeoGeeks_logo.png')).convert('RGBA')
    a = np.asarray(im)
    rgb, alpha = a[..., :3].astype(np.int32), a[..., 3]
    palette = {
        'yellow': (245, 220, 94), 'graphite': (96, 92, 91), 'teal': (13, 132, 150), 'green': (0, 168, 120),
    }
    paths = {}
    for name, col in palette.items():
        d = np.abs(rgb - np.array(col)).sum(axis=2)
        mask = ((d < 60) & (alpha > 128)).astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)
        ap = cv2.approxPolyDP(c, 1.1, True)[:, 0, :]
        paths[name] = 'M' + 'L'.join('%d %d' % (x, y) for x, y in ap) + 'Z'
        print(name, 'pts', len(ap), 'area', cv2.contourArea(c))
    cols = {'yellow': '#f7db5d', 'graphite': '#605c5c', 'teal': '#0c8495', 'green': '#00a97a'}
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1181 1181">' + ''.join(
        '<path fill="%s" d="%s"/>' % (cols[k], paths[k]) for k in ('yellow', 'graphite', 'teal', 'green')) + '</svg>'
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'logo.svg'), 'w', encoding='utf8').write(svg)
    json.dump({'paths': paths, 'colors': cols}, open(os.path.join(ROOT, 'src', 'content', 'logo_paths.json'), 'w'), indent=1)
    save_webp(os.path.join(SRC, 'assets', 'img', 'GeoGeeks_logo.png'), os.path.join(OUT, 'logo-512.webp'), 512, 90)
    Image.open(os.path.join(SRC, 'assets', 'img', 'GeoGeeks_logo.png')).convert('RGBA').resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'))


# ---------------------------------------------------------------- photos
def build_photos():
    data = json.load(open(os.path.join(ROOT, 'src', 'content', 'site.json'), encoding='utf8'))
    n = 0
    for sec in data['sectors']:
        save_webp(os.path.join(SRC, sec['tile'].lstrip('/')), os.path.join(OUT, 'sectors', sec['key'] + '.webp'), 1100, 78); n += 1
        for p in sec['items']:
            save_webp(os.path.join(SRC, p['card'].lstrip('/')), os.path.join(OUT, 'projects', p['slug'] + '-card.webp'), 1100, 78); n += 1
            save_webp(os.path.join(SRC, p['img'].lstrip('/')), os.path.join(OUT, 'projects', p['slug'] + '-fig.webp'), 1500, 80); n += 1
    # the live site illustrates some services with cartoons; the serious redesign uses real photos / maps instead
    override = {
        'gis': 'assets/img/projects_img/urban_projects.png', 'hydro': 'assets/img/projects_img/hydro_projects.jpg',
        'edu': 'assets/img/projects_img/edu_projects.jpg', 'hydro-modeling': 'assets/img/ind_project_img/hydro_proj_01.jpg',
        'water-mgmt': 'assets/img/serv_img/serv_flood_01.png', 'gis-edu': 'assets/img/serv_img/serv_edu_01.jpg',
    }
    for s in data['services']:
        src = override.get(s['key'], s['img'].lstrip('/'))
        save_webp(os.path.join(SRC, src), os.path.join(OUT, 'services', s['key'] + '.webp'), 1100, 78); n += 1
        for sub in s['subs']:
            src = override.get(sub['key'], sub['img'].lstrip('/'))
            save_webp(os.path.join(SRC, src), os.path.join(OUT, 'services', sub['key'] + '.webp'), 1100, 78); n += 1
    for p in data['products']:
        save_webp(os.path.join(SRC, p['img'].lstrip('/')), os.path.join(OUT, 'products', p['key'] + '.webp'), 1700, 80); n += 1
    for t in data['team']:
        save_webp(os.path.join(SRC, t['img'].lstrip('/')), os.path.join(OUT, 'team', t['key'] + '.webp'), 800, 82, square='top'); n += 1
    for pt in data['partners']:
        srcp = os.path.join(SRC, pt['img'].lstrip('/'))
        if srcp.lower().endswith('.svg'):
            import shutil
            os.makedirs(os.path.join(OUT, 'partners'), exist_ok=True)
            shutil.copy(srcp, os.path.join(OUT, 'partners', pt['key'] + '.svg'))
        else:
            save_webp(srcp, os.path.join(OUT, 'partners', pt['key'] + '.webp'), 420, 86)
        n += 1
    print('photos written', n)


if __name__ == '__main__':
    trace_logo()
    if os.path.exists(os.path.join(ROOT, 'src', 'content', 'site.json')):
        build_photos()
