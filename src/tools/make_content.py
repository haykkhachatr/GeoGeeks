"""
Turns the raw data scraped from geogeeks.am (src/content/raw/*) into:

  src/content/site.json              language-neutral structure (slugs, images, years, links)
  src/content/i18n/hy.json           every translatable string, Armenian, VERBATIM from the live site
  src/content/i18n/en.official.json  the English the live site already ships (UI, sectors, service cards, platforms)

Hand-written translations live next to them (en.add.json, ru.json) and are merged by build.py.
Strings are never retyped: they are copied programmatically from the scraped data.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.path.join(ROOT, 'src', 'content', 'raw')
OUT = os.path.join(ROOT, 'src', 'content')
os.makedirs(os.path.join(OUT, 'i18n'), exist_ok=True)

ui = json.load(open(os.path.join(RAW, 'ui.json'), encoding='utf8'))
services = json.load(open(os.path.join(RAW, 'services.json'), encoding='utf8'))
sectors = json.load(open(os.path.join(RAW, 'projects.json'), encoding='utf8'))
products = json.load(open(os.path.join(RAW, 'products.json'), encoding='utf8'))
about = open(os.path.join(RAW, 'about.txt'), encoding='utf8').read().split('\n')

hy, en = {}, {}
for k, v in ui['hy'].items():
    hy['ui.' + k] = v
for k, v in ui['en'].items():
    en['ui.' + k] = v

# ---------------------------------------------------------------- sectors / projects
site = {'sectors': [], 'services': [], 'products': [], 'team': [], 'partners': []}
LATIN = re.compile(r'^[\x00-\x7f]+$')
for s in sectors:
    key = s['key']
    hy['sec.%s.title' % key] = s['title']
    en['sec.%s.title' % key] = s['titleEn']
    sec = {'key': key, 'tile': s['tile'], 'items': []}
    for p in s['items']:
        slug = p['slug']
        for f in ('title', 'client', 'duration', 'desc'):
            hy['prj.%s.%s' % (slug, f)] = p[f]
        tech = []
        for i, t in enumerate(p['tech']):
            if LATIN.match(t):
                tech.append(t)
            else:
                hy['prj.%s.tech.%d' % (slug, i)] = t
                tech.append('@prj.%s.tech.%d' % (slug, i))
        sec['items'].append({'slug': slug, 'card': p['card'], 'img': p['img'], 'year': p['year'], 'tech': tech})
    site['sectors'].append(sec)

# ---------------------------------------------------------------- services
for s in services:
    k = s['key']
    hy['svc.%s.title' % k] = s['title']
    hy['svc.%s.card' % k] = s['cardTitle']
    hy['svc.%s.desc' % k] = s['cardDesc']
    en['svc.%s.card' % k] = s['cardTitleEn']
    en['svc.%s.desc' % k] = s['cardDescEn']
    chips = []
    for i, c in enumerate(s['chips']):
        if LATIN.match(c['label']) and c['label'] != 'Web քարտեզներ':
            chips.append(c['label'])
        else:
            hy['svc.%s.chip.%d' % (k, i)] = c['label']
            chips.append('@svc.%s.chip.%d' % (k, i))
    color = re.search(r'rgba\((\d+),(\d+),(\d+)', s['scrim'])
    svc = {'key': k, 'img': '/assets/img/serv_img/' + s['cardImg'].split('/')[-1], 'chips': chips,
           'rgb': [int(color.group(i)) for i in (1, 2, 3)], 'subs': []}
    for sub in s['subs']:
        sk = sub['key']
        hy['svc.%s.sub.%s.label' % (k, sk)] = sub['label']
        hy['svc.%s.sub.%s.desc' % (k, sk)] = sub['desc']
        for i, (a, b) in enumerate(sub['items']):
            hy['svc.%s.sub.%s.item.%d.l' % (k, sk, i)] = a
            hy['svc.%s.sub.%s.item.%d.t' % (k, sk, i)] = b
        svc['subs'].append({'key': sk, 'img': sub['img'], 'n': len(sub['items'])})
    site['services'].append(svc)

# ---------------------------------------------------------------- platforms on the home hero
pk = ['berqategh', 'flood-platform']
for key, p in zip(pk, products):
    hy['prod.%s.title' % key] = p['title']
    hy['prod.%s.desc' % key] = p['desc']
    en['prod.%s.title' % key] = p['titleEn']
    en['prod.%s.desc' % key] = p['descEn']
    site['products'].append({'key': key, 'img': p['img'], 'url': p['url']})

# ---------------------------------------------------------------- team + partners parsed from the About page text
lines = [l.strip() for l in about if l.strip()]
i0 = lines.index('Մեր թիմը')
i1 = lines.index('Մեզ վստահել են')
team_lines = lines[i0 + 1:i1]
j = 0
n = 1
while j < len(team_lines):
    if team_lines[j].startswith('[BG '):
        img = team_lines[j][4:-1]
        name, role = team_lines[j + 1], team_lines[j + 2]
        link = None
        if j + 3 < len(team_lines) and team_lines[j + 3].startswith('[A '):
            link = team_lines[j + 3][3:-1]
            j += 5      # [A] + [IMG]
        else:
            j += 3
        key = 'team%d' % n
        hy['team.%s.name' % key] = name
        hy['team.%s.role' % key] = role
        site['team'].append({'key': key, 'img': img, 'linkedin': link})
        n += 1
    else:
        j += 1

part_lines = lines[i1 + 1:]
part_lines = part_lines[:next(i for i, l in enumerate(part_lines) if l.startswith('[IMG '))]
j = 0
n = 1
while j < len(part_lines):
    if part_lines[j].startswith('[A '):
        url = part_lines[j][3:-1]
        img = part_lines[j + 1][4:-1]
        name = part_lines[j + 2]
        key = 'p%02d' % n
        hy['partner.%s' % key] = name
        site['partners'].append({'key': key, 'img': img, 'url': url})
        n += 1
        j += 3
    else:
        j += 1

json.dump(site, open(os.path.join(OUT, 'site.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
json.dump(hy, open(os.path.join(OUT, 'i18n', 'hy.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
json.dump(en, open(os.path.join(OUT, 'i18n', 'en.official.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('hy keys', len(hy), '| en official', len(en), '| missing en', len([k for k in hy if k not in en]))
print('sectors', len(site['sectors']), 'projects', sum(len(s['items']) for s in site['sectors']),
      'team', len(site['team']), 'partners', len(site['partners']))
