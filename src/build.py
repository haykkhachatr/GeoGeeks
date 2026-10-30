"""
GeoGeeks static site builder.

    python src/build.py

Renders every page in Armenian / English / Russian into  hy/  en/  ru/  (+ root index.html, 404.html,
sitemap.xml / robots.txt when site_url is set) and regenerates assets/css/fonts.css (fonts inlined as
data URIs so the site also works when opened straight from disk).

The build FAILS if any string key used by a template is missing in any language.
"""
import base64, json, os, posixpath, re, sys
from urllib.parse import urlparse

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup, escape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
CONTENT = os.path.join(HERE, 'content')
LANGS = ['hy', 'en', 'ru']
LANG_LABEL = {'hy': 'ՀԱՅ', 'en': 'ENG', 'ru': 'РУС'}
OG_LOCALE = {'hy': 'hy_AM', 'en': 'en_US', 'ru': 'ru_RU'}


def jload(*p):
    return json.load(open(os.path.join(CONTENT, *p), encoding='utf8'))


cfg = jload('config.json')
site = jload('site.json')
logo = jload('logo_paths.json')
CLEAN = bool(cfg.get('clean_urls'))
SITE_URL = (cfg.get('site_url') or '').rstrip('/')

# ------------------------------------------------------------------ string tables
S = {'hy': jload('i18n', 'hy.json'), 'en': {}, 'ru': {}}
S['en'].update(jload('i18n', 'en.official.json'))
S['en'].update(jload('i18n', 'en.add.json'))
S['ru'].update(jload('i18n', 'ru.json'))
for k, v in jload('i18n', 'extra.json').items():
    if k.startswith('_'):
        continue
    for l in LANGS:
        if l not in v:
            sys.exit('extra.json: key %s has no "%s"' % (k, l))
        S[l]['x.' + k] = v[l]
for l in LANGS:
    S[l].pop('_note', None)


class Strings:
    def __init__(self, lang):
        self.lang, self.used = lang, set()

    def __call__(self, key):
        self.used.add(key)
        try:
            return S[self.lang][key]
        except KeyError:
            raise KeyError('missing string %r for language %r' % (key, self.lang))

    def x(self, key):
        return self('x.' + key)


# ------------------------------------------------------------------ routes
def dirs_of(r):
    k = r[0]
    return {'home': [], 'tools': ['tools', 'shp-to-dxf'], 'services': ['services'], 'projects': ['projects'],
            'sector': ['projects', r[1] if len(r) > 1 else ''], 'project': ['projects'] + list(r[1:3]),
            'about': ['about'], 'contact': ['contact']}[k]


def rel_url(cur_lang, cur_route, lang, route):
    cur = '/'.join([cur_lang] + dirs_of(cur_route))
    tgt = '/'.join([lang] + dirs_of(route))
    rel = posixpath.relpath(tgt, cur)
    if CLEAN:
        return './' if rel == '.' else rel + '/'
    return 'index.html' if rel == '.' else rel + '/index.html'


def abs_url(lang, route):
    return SITE_URL + '/' + '/'.join([lang] + dirs_of(route)) + ('/' if CLEAN else '/index.html')


# ------------------------------------------------------------------ language-resolved data
def plural(lang, n, T):
    if lang == 'ru':
        m10, m100 = n % 10, n % 100
        form = 'one' if m10 == 1 and m100 != 11 else ('few' if 2 <= m10 <= 4 and not 12 <= m100 <= 14 else 'many')
    elif lang == 'en':
        form = 'one' if n == 1 else 'many'
    else:
        form = 'one'
    return T.x('n.' + form).replace('{n}', str(n))


def resolve(T, v):
    return T(v[1:]) if isinstance(v, str) and v.startswith('@') else v


def build_data(lang):
    T = Strings(lang)
    D = {'T': T}

    # sectors + projects
    sectors, projects = [], []
    for si, sec in enumerate(site['sectors']):
        key = sec['key']
        s = {'key': key, 'idx': si + 1, 'title': T('sec.%s.title' % key), 'projs': [], 'count': len(sec['items'])}
        s['count_label'] = plural(lang, len(sec['items']), T)
        s['route'] = ('sector', key)
        sectors.append(s)
        for p in sec['items']:
            slug = p['slug']
            item = {
                'slug': slug, 'sector_key': key, 'sector_title': s['title'], 'year': p['year'],
                'title': T('prj.%s.title' % slug), 'client': T('prj.%s.client' % slug),
                'duration': T('prj.%s.duration' % slug), 'desc': T('prj.%s.desc' % slug),
                'tech': [resolve(T, t) for t in p['tech']], 'route': ('project', key, slug),
                'external': None, 'pin': None,
            }
            if slug == 'flood-information-platform':
                item['external'] = site['products'][1]['url']
            projects.append(item)
            s['projs'].append(item)
    D['sectors'], D['projects'] = sectors, projects

    # latest: newest project of every sector (except "our"), newest first, top 3 (same rule as the live site)
    def yr(p):
        m = re.search(r'(\d{4})\s*$', p['year'])
        return int(m.group(1)) if m else 0
    per = []
    for s in sectors:
        if s['key'] == 'our' or not s['projs']:
            continue
        per.append(max(s['projs'], key=yr))
    D['latest'] = sorted(per, key=lambda p: -yr(p))[:3]

    # services
    svcs = []
    colors = {'gis': ('#0c8495', '#ffffff', 'dark'), 'hydro': ('#00a97a', '#04161a', 'light'), 'edu': ('#f7db5d', '#04161a', 'light')}
    for i, sv in enumerate(site['services']):
        k = sv['key']
        bg, fg, theme = colors[k]
        subs = []
        for sub in sv['subs']:
            sk = sub['key']
            base = 'svc.%s.sub.%s' % (k, sk)
            subs.append({'key': sk, 'label': T(base + '.label'), 'desc': T(base + '.desc'),
                         'rows': [{'l': T('%s.item.%d.l' % (base, j)), 't': T('%s.item.%d.t' % (base, j))} for j in range(sub['n'])]})
        svcs.append({'key': k, 'title': T('svc.%s.title' % k), 'card': T('svc.%s.card' % k), 'desc': T('svc.%s.desc' % k),
                     'chips': [resolve(T, c) for c in sv['chips']], 'subs': subs, 'bg': bg, 'fg': fg, 'theme': theme})
    D['svcs'] = svcs
    hy_ = next(s for s in svcs if s['key'] == 'hydro')
    wm = next(sub for sub in hy_['subs'] if sub['key'] == 'water-mgmt')
    D['flood'] = {'kicker': hy_['card'], 'title': wm['label'], 'desc': wm['desc'], 'chips': ['HEC-RAS', 'HEC-HMS', 'DEM / DTM']}

    # platforms
    cta = T('ui.hero.openPlatform').replace('→', '').strip()
    D['products'] = [{'key': p['key'], 'title': T('prod.%s.title' % p['key']), 'desc': T('prod.%s.desc' % p['key']),
                      'url': p['url'], 'cta': cta, 'host': urlparse(p['url']).netloc} for p in site['products']]

    # team + partners
    D['team'] = [{'key': m['key'], 'name': T('team.%s.name' % m['key']), 'role': T('team.%s.role' % m['key']),
                  'linkedin': m['linkedin']} for m in site['team']]
    parts = []
    for p in site['partners']:
        ext = '.svg' if p['img'].lower().endswith('.svg') else '.webp'
        parts.append({'key': p['key'], 'name': T('partner.%s' % p['key']), 'url': p['url'],
                      'src': 'assets/img/partners/%s%s' % (p['key'], ext)})
    D['partners'] = parts

    # map pins (only places named in the project titles themselves)
    pin_def = [('yerevan', 'water', 'yerevan-climate-risk'), ('stepanavan', 'urban', 'stepanavan-landfill-siting'),
               ('sevan', 'water', 'sevan-vision-roadmap'), ('anpp', 'flood', 'anpp-debris-flow')]
    pins = []
    for key, sk, slug in pin_def:
        pr = next(p for p in projects if p['slug'] == slug)
        pr['pin'] = key
        pins.append({'key': key, 'label': T.x('pin.' + key), 'title': pr['title'], 'route': ('project', sk, slug), 'slug': slug,
                     'year': pr['year'], 'client': pr['client'], 'sector_title': pr['sector_title']})
    D['pins'] = pins

    D['stats'] = [
        {'label': T.x('stat.founded'), 'value': 2021, 'plain': True},
        {'label': T('ui.nav.projects'), 'value': len(projects)},
        {'label': T.x('stat.sectors'), 'value': len([s for s in sectors if s['key'] != 'our'])},
        {'label': T.x('stat.partners'), 'value': len(parts)},
    ]
    D['hero_facts'] = [D['stats'][0], D['stats'][1], D['stats'][3]]
    D['contact'] = {'email': 'geogeeksllc@gmail.com', 'tel': '+37498098006', 'phone': '+374 (98) 09-80-06'}
    D['social'] = [{'label': 'Facebook', 'url': 'https://www.facebook.com/GeoGeeksLLC'},
                   {'label': 'LinkedIn', 'url': 'https://www.linkedin.com/company/73023299/'},
                   {'label': 'Instagram', 'url': 'https://www.instagram.com/geogeeksllc/'}]
    return D


MENU = [('home', 'ui.nav.home', 'assets/img/sectors/flood.webp'), ('tools', 'ui.nav.tools', 'assets/img/services/gis.webp'),
        ('services', 'ui.nav.services', 'assets/img/services/hydro.webp'), ('projects', 'ui.nav.projects', 'assets/img/sectors/hydro.webp'),
        ('about', 'ui.nav.about', 'assets/img/sectors/edu.webp'), ('contact', 'ui.nav.contact', 'assets/img/sectors/urban.webp')]
TEAL, GREEN, YELLOW = '#0c8495', '#00a97a', '#f7db5d'
# one colour identity per page: (curtain/portal colour = that page's deep background, text/accent on it, theme-color meta)
PAGE_COLOR = {'home': ('#06222c', '#e8f3f4'), 'tools': ('#06323b', '#7fe3f0'), 'services': ('#0a2b1f', '#f7db5d'),
              'projects': ('#0a1830', '#f7db5d'), 'about': ('#06302a', '#5fe6b4'), 'contact': ('#06231e', '#f7db5d')}
THEME = {'home': 'home', 'tools': 'tools', 'services': 'services', 'projects': 'projects', 'sector': 'projects',
         'project': 'projects', 'about': 'about', 'contact': 'contact'}
THEME_META = {'home': '#03121a', 'tools': '#031a20', 'services': '#04160f', 'projects': '#060f1d', 'about': '#04140f', 'contact': '#05201b'}
HDR0 = {}
CHAIN = {'home': 'services', 'tools': 'services', 'services': 'projects', 'projects': 'about', 'about': 'contact', 'contact': 'home'}
CONTOURS = open(os.path.join(ROOT, 'assets', 'img', 'contours.svg'), encoding='utf8').read() if os.path.exists(os.path.join(ROOT, 'assets', 'img', 'contours.svg')) else ''


# ------------------------------------------------------------------ rendering
env = Environment(loader=FileSystemLoader(os.path.join(HERE, 'templates')), autoescape=True, undefined=StrictUndefined,
                  trim_blocks=False, lstrip_blocks=False)
written, link_checks = [], []


def page_name(route, D, T):
    k = route[0]
    if k == 'home':
        return T('ui.h1.home')
    if k == 'tools':
        return T('ui.tool.shpdxf.name')
    if k == 'services':
        return T('ui.h1.services')
    if k == 'projects':
        return T('ui.h1.projects')
    if k == 'about':
        return T('ui.nav.about')
    if k == 'contact':
        return T('ui.h1.contact')
    if k == 'sector':
        return next(s for s in D['sectors'] if s['key'] == route[1])['title']
    return next(p for p in D['projects'] if p['slug'] == route[2])['title']


def short(s, n=158):
    s = re.sub(r'\s+', ' ', s).strip()
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0] + '…'


def render(lang, route, D, tpl, extra=None):
    T = D['T']
    cur = route
    root = '../' * (1 + len(dirs_of(route)))
    href = lambda *r: rel_url(lang, cur, lang, tuple(r))
    k = route[0]
    pname = page_name(route, D, T)

    # menu
    menu = []
    for mk, label, img in MENU:
        r = (mk,)
        menu.append({'key': mk, 'label': T(label), 'href': href(*r), 'img': img, 'on': k == mk or (mk == 'projects' and k in ('sector', 'project')),
                     'route': r})
    # language switch
    langs = [{'code': l, 'label': LANG_LABEL[l], 'href': rel_url(lang, cur, l, cur), 'abs': abs_url(l, cur) if SITE_URL else ''} for l in LANGS]

    # description / title
    if k == 'home':
        title, desc = T('ui.h1.home'), T('ui.h1.home') + '. ' + short(T('svc.gis.desc'), 120)
    elif k in ('project',):
        p = next(p for p in D['projects'] if p['slug'] == route[2])
        title, desc = p['title'] + ' | GeoGeeks', short(p['desc'])
    elif k == 'about':
        title, desc = T('ui.nav.about') + ' | GeoGeeks', short(T('ui.about.intro'))
    elif k == 'tools':
        title, desc = T('ui.tool.shpdxf.name') + ' | GeoGeeks', T('ui.tool.shpdxf.summary')
    else:
        title, desc = pname + ' | GeoGeeks', short(pname + '. ' + (T('svc.gis.desc') if k == 'services' else ''))
    if k == 'services':
        desc = short(T('ui.h1.services') + ': ' + ' · '.join(s['card'] for s in D['svcs']), 200)
    if k == 'contact':
        desc = T('ui.h1.contact') + '. ' + T('ui.contact.addressValue')
    if k == 'projects':
        desc = T('ui.h1.projects') + ' — ' + ', '.join(s['title'] for s in D['sectors'])

    # portal (next page)
    nxt = None
    if k in CHAIN:
        nk = CHAIN[k]
        nxt = {'route': (nk,), 'color': PAGE_COLOR[nk][0], 'fg': PAGE_COLOR[nk][1], 'kicker': T.x('next'), 'title': T('ui.nav.' + nk)}
    elif k == 'sector':
        i = next(i for i, s in enumerate(D['sectors']) if s['key'] == route[1])
        s2 = D['sectors'][(i + 1) % len(D['sectors'])]
        nxt = {'route': ('sector', s2['key']), 'color': PAGE_COLOR['projects'][0], 'fg': PAGE_COLOR['projects'][1], 'kicker': T.x('next.sector'), 'title': s2['title']}
    elif k == 'project':
        i = next(i for i, p in enumerate(D['projects']) if p['slug'] == route[2])
        p2 = D['projects'][(i + 1) % len(D['projects'])]
        nxt = {'route': p2['route'], 'color': PAGE_COLOR['projects'][0], 'fg': PAGE_COLOR['projects'][1], 'kicker': T.x('next.project'), 'title': p2['title']}
    if nxt:
        nxt['href'] = href(*nxt['route'])

    def link_for(r):
        return rel_url(lang, cur, lang, r)

    # attach hrefs lazily to data objects
    for s in D['sectors']:
        s['href'] = link_for(s['route'])
        for p in s['projs']:
            p['href'] = link_for(p['route'])
            p['sector_href'] = s['href']
    for p in D['projects']:
        p['href'] = link_for(p['route'])
    for p in D['pins']:
        p['href'] = link_for(p['route'])

    js_strings = {
        'menu': T.x('menu'), 'close': T('ui.services.close'), 'openMenu': T('ui.nav.openMenu'), 'closeMenu': T('ui.nav.closeMenu'),
        'copied': T.x('copied'), 'copy': T.x('copy'), 'stage': T.x('stage'), 'all': T.x('all'), 'view': T('ui.projects.view'),
        'open': T.x('open'), 'mail': T.x('mailLabel'),
        'pins': {p['key']: p['label'] for p in D['pins']},
        'layers': [T.x('view.relief'), T.x('layer.contours'), T.x('view.hydro'), D['flood']['title']],
    }
    page_data = None

    about_heading = Markup(escape(T('ui.about.heading')).replace('2021', Markup('<span class="hl">2021</span>')))
    back_label = T('ui.common.back').replace('←', '').strip()
    client_label = T('ui.project.client').strip().rstrip(':։').strip()
    hero_desc = T('ui.h1.home').split('—', 1)[1].strip()

    ctx = dict(D)
    ctx.update(
        lang=lang, page=k, root=root, route=route, title=title, description=desc, og_locale=OG_LOCALE[lang],
        og_image=(SITE_URL + '/assets/img/logo-512.webp') if SITE_URL else '', canonical=abs_url(lang, cur) if SITE_URL else '',
        xdefault=abs_url('hy', cur) if SITE_URL else '', langs=langs, menu=menu, next=nxt, logo_paths=logo['paths'],
        t=T, x=T.x, href=href, clean_urls=CLEAN, js_strings=js_strings, page_data=page_data,
        theme=THEME[k], theme_color=THEME_META[THEME[k]], hdr0=HDR0.get(k, 'on-dark'), contours_svg=Markup(CONTOURS),
        use_three=True, use_geo=True,
        extra_js=['cloud'] + {'services': ['layers'], 'tools': ['parcel']}.get(k, []), about_heading=about_heading, back_label=back_label,
        client_label=client_label, hero_desc=hero_desc, tool_url=cfg['tool_url'], jsonld=None,
    )
    if k == 'home':
        ctx['jsonld'] = json.dumps({
            '@context': 'https://schema.org', '@type': ['Organization', 'ProfessionalService'], 'name': 'GeoGeeks', 'legalName': 'GeoGeeks LLC',
            'foundingDate': '2021', 'email': 'geogeeksllc@gmail.com', 'telephone': '+374-98-09-80-06',
            'address': {'@type': 'PostalAddress', 'streetAddress': T('ui.contact.addressValue'), 'addressCountry': 'AM'},
            'areaServed': {'@type': 'Country', 'name': 'Armenia'}, 'knowsLanguage': ['hy', 'en', 'ru'],
            'sameAs': [s['url'] for s in D['social']]}, ensure_ascii=False)
    if k == 'sector':
        ctx['sector'] = next(s for s in D['sectors'] if s['key'] == route[1])
    if k == 'project':
        ctx['p'] = next(p for p in D['projects'] if p['slug'] == route[2])
        ctx['pin_label'] = T.x('pin.' + ctx['p']['pin']) if ctx['p']['pin'] else ''
        from PIL import Image
        with Image.open(os.path.join(ROOT, 'assets', 'img', 'projects', route[2] + '-fig.webp')) as im:
            ctx['fig_dim'] = im.size
    if extra:
        ctx.update(extra)

    html = env.get_template(tpl).render(**ctx)
    out = os.path.join(ROOT, lang, *dirs_of(route), 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf8', newline='\n') as f:
        f.write(html)
    written.append(out)


def all_routes(D):
    r = [('home',), ('tools',), ('services',), ('projects',), ('about',), ('contact',)]
    for s in D['sectors']:
        r.append(('sector', s['key']))
    for p in D['projects']:
        r.append(p['route'])
    return r


TPL = {'home': 'home.html', 'tools': 'tool.html', 'services': 'services.html', 'projects': 'projects.html',
       'about': 'about.html', 'contact': 'contact.html', 'sector': 'sector.html', 'project': 'project.html'}


def build_fonts():
    fd = os.path.join(ROOT, 'assets', 'fonts')

    def b64(n):
        return base64.b64encode(open(os.path.join(fd, n), 'rb').read()).decode()
    R_LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
    R_CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'
    R_ARM = 'U+0308,U+0530-058F,U+2010,U+2024,U+25CC,U+FB13-FB17'
    css = ['/* generated by src/build.py — Noto Sans (OFL), Noto Sans Armenian (OFL), Iosevka Charon Mono (OFL); inlined for file:// use */']
    for fam, file, rng in [('GG Sans', 'noto-sans-latin-wght-normal.woff2', R_LAT), ('GG Sans', 'noto-sans-cyrillic-wght-normal.woff2', R_CYR),
                           ('GG Sans', 'noto-sans-armenian-armenian-wght-normal.woff2', R_ARM)]:
        css.append("@font-face{font-family:'%s';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (fam, b64(file), rng))
    for fam, file, rng in [('GG Serif', 'noto-serif-latin-wght-normal.woff2', R_LAT), ('GG Serif', 'noto-serif-cyrillic-wght-normal.woff2', R_CYR),
                           ('GG Serif', 'noto-serif-armenian-armenian-wght-normal.woff2', R_ARM)]:
        css.append("@font-face{font-family:'%s';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (fam, b64(file), rng))
    for w in (400, 700):
        for sub, rng in (('latin', R_LAT), ('cyrillic', R_CYR), ('armenian', R_ARM)):
            css.append("@font-face{font-family:'GG Mono';font-style:normal;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (w, b64('iosevka-charon-mono-%s-%d-normal.woff2' % (sub, w)), rng))
    open(os.path.join(ROOT, 'assets', 'css', 'fonts.css'), 'w', encoding='utf8').write('\n'.join(css) + '\n')


def build_root():
    tpl = env.get_template('root.html')
    html = tpl.render(langs=[{'code': l, 'label': LANG_LABEL[l], 'href': '%s/%s' % (l, 'index.html' if not CLEAN else ''),
                              'name': {'hy': 'Հայերեն', 'en': 'English', 'ru': 'Русский'}[l]} for l in LANGS],
                      logo_paths=logo['paths'], clean_urls=CLEAN)
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf8', newline='\n').write(html)
    open(os.path.join(ROOT, '404.html'), 'w', encoding='utf8', newline='\n').write(env.get_template('404.html').render(
        langs=[{'code': l, 'label': LANG_LABEL[l]} for l in LANGS]))
    if SITE_URL:
        urls = [SITE_URL + '/']
        for l in LANGS:
            for r in ROUTES:
                urls.append(abs_url(l, r))
        open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf8').write(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            ''.join('<url><loc>%s</loc></url>\n' % u for u in urls) + '</urlset>\n')
        open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf8').write('User-agent: *\nAllow: /\nSitemap: %s/sitemap.xml\n' % SITE_URL)


def check_links():
    bad = 0
    for path in written + [os.path.join(ROOT, 'index.html')]:
        html = open(path, encoding='utf8').read()
        base = os.path.dirname(path)
        for m in re.finditer(r'(?:href|src)="([^"#?]+)"', html):
            u = m.group(1)
            if re.match(r'^(https?:|mailto:|tel:|data:|javascript:)', u) or u.startswith('{'):
                continue
            tgt = os.path.normpath(os.path.join(base, u))
            if CLEAN and u.endswith('/'):
                tgt = os.path.join(tgt, 'index.html')
            if not os.path.exists(tgt):
                bad += 1
                print('  BROKEN', os.path.relpath(path, ROOT), '->', u)
    return bad


if __name__ == '__main__':
    build_fonts()
    used = {l: set() for l in LANGS}
    ROUTES = None
    for lang in LANGS:
        D = build_data(lang)
        ROUTES = all_routes(D)
        for r in ROUTES:
            render(lang, r, D, TPL[r[0]])
        used[lang] = D['T'].used
    build_root()
    # every string present in hy must exist in en and ru as well (even if a template does not use it today)
    miss = [(l, k) for l in ('en', 'ru') for k in S['hy'] if k.startswith(('prj.', 'svc.', 'sec.', 'team.', 'partner.', 'prod.', 'x.')) and k not in S[l]]
    if miss:
        print('MISSING TRANSLATIONS:', len(miss))
        for l, k in miss[:40]:
            print('  ', l, k)
        sys.exit(1)
    bad = check_links()
    print('pages written:', len(written), '| languages:', len(LANGS), '| broken links:', bad)
    sys.exit(1 if bad else 0)
