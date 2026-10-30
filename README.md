# GeoGeeks — trilingual website (HY · EN · RU)

A rebuild of https://geogeeks.am/ with the same pages and content, redesigned as a scroll-driven, 3D experience.
Static site: no server, no bundler. **Double-click `index.html`** (it opens `hy/`, `ru/` or `en/` by browser language), or serve the folder with any static host.

```
index.html          language chooser / redirect          404.html   (uses root-absolute links: /hy/ /en/ /ru/)
hy/  en/  ru/       the 87 generated pages (29 per language, same URL structure as the original site)
assets/             css, js, vendor libs, fonts (inlined in fonts.css), optimised images, data/geo.js (terrain)
src/                everything needed to rebuild (see below)
```

## Pages (per language)
`/` · `/tools/shp-to-dxf/` · `/services/` · `/projects/` · 8 sector pages · 15 project pages · `/about/` · `/contact/`
(all 29 URLs from the original sitemap).

## Rebuild
```
python src/build.py                 # renders all pages + fonts.css, fails if any string is missing in any language
python src/tools/build_assets.py    # (optional) re-optimise photos from src/images-original, re-trace the logo
python src/tools/build_geo.py       # (optional, ~1 min) re-computes the terrain/hydrology data (downloads ~4 MB once)
python src/tools/build_contours.py  # (optional) re-traces the elevation contours used on the Services page
python src/tools/make_content.py    # (optional) re-derives site.json + hy.json from src/content/raw (the scraped originals)
```
Needs Python 3 with `jinja2`, `Pillow` (build) and `numpy scipy opencv-python` (asset/terrain tools). Nothing is needed to *view* the site.

Settings: `src/content/config.json`
* `tool_url` — where the **working** shapefile→DXF converter lives (see "Converter" below).
* `site_url` — set to your https origin to get canonical/hreflang tags, `sitemap.xml`, `robots.txt`.
* `clean_urls` — `true` links to folders (`/hy/services/`) for web servers; `false` (default) links to `…/index.html` so it also works from disk.

## Languages and where the words come from
* **Armenian** — copied programmatically from geogeeks.am (never retyped).
* **English** — the English that geogeeks.am already ships (UI, sector names, service cards, the two platforms) + **my translation** of everything that exists there only in Armenian (the 15 project texts, service details, partner/team names). `src/content/i18n/en.add.json`
* **Russian** — **my translation** of everything. `src/content/i18n/ru.json`
* **Interface microcopy** for the new design (menu, "scroll", map labels, flood slider note…) — mine, in all three languages. `src/content/i18n/extra.json`

→ EN/RU/extra Armenian text should get a native/professional proofread. Technical terms used: СНиП/ICOLD, обеспеченность, водосборный бассейн, HEC-RAS…
Armenian source typos I noticed and left untouched: «Կատավել է» (→ Կատարվել է), «սերտեֆիկացում» (→ սերտիֆիկացում), «խորհրատվություն» (→ խորհրդատվություն).

## What is in the design (v5 - one map behind every page)
Feedback on v4 was "the first map screen was great, everything after it was bad". So v5 keeps the home hero + statements exactly as they were and makes **that map the stage of the whole site**: the particle model of Armenia (real elevation) is fixed behind every page and never goes away; content sits *on* it as big type or glass panels instead of solid sections. Layout ideas come from your reference sites (ideas and interactions only - no code or assets were copied).

Every page has the same frame - header, sticky sub-navigation (esri.com/what-is-gis), the map, content - so you can always tell where you are. Each section declares the state the map should be in (`data-map="..."`), and `pages.js` turns that into a smooth camera / palette / layer path while you scroll. Going from one page to the next, the map is carried over and eases into the new page's state (a first visit assembles it from dust).

| Page | Modelled on | Map state / tint | What sits on the map |
|---|---|---|---|
| Home | esri.com/what-is-gis | natural teal -> green -> yellow | (unchanged) hero, word-lighting statements, rivers glow, flood rises. New: **selected projects as a camera flight** over the real places (Yerevan, Stepanavan, Lake Sevan, Armenian NPP), one glass card per marker; platforms as glass cards; numbers + partners on a glass slab |
| Tools | cnrres.co.kr | flat cadastral plan, cyan tint -> relief | glass card with a live 3D **parcel**; concentric "tracks" that draw as you scroll; specs and legal on glass |
| Services | abatable.com + piergorelli.com | warm palette, rivers + rising flood in the water chapter | numbered index, glass card with the interactive 3D **layer stack**, giant 01/02/03 numerals on the map with the content in a glass panel and tabs |
| Projects / sectors / project | apricode.agency + roomandpillar.com | blue tint, **place markers** | a map with a side panel: the map stays on the left and flies to a place when you point at its project (or a marker); filter chips; sector and project pages use the same frame; a place-based project opens zoomed on its location |
| About | jenamdvacetpet.cz + theoryvc.com + ojiholdings brandbook | green tint, top-down | giant counting years (2021 -> today), serif statement with word reveal, glass team cards, brand-book partner index |
| Contact | myshaky.com + anima.ai | warm, flat, glowing Yerevan, follows the cursor | soft glass pills |
| Menu (all pages) | dark-moon.org | - | full-screen sheet menu, blurred backdrop, letter-roll hover, live preview |

Shared: the curtain/portal between pages carries the colour of the page it leads to (scroll past the footer to continue, or click); reduced-motion renders everything static; one h1 per page; the map thins itself (pixel ratio, point count) if the frame rate stays low - add `?hq` to a URL to switch that off when testing.
trek.cards and dark-moon.org were unreachable when the references were studied (dark-moon's menu markup was read earlier); future-human.de, oji and a few others sit behind loaders/cookie walls, so only their visible structure was used.

Tech: GSAP + ScrollTrigger, Lenis, three.js r158 (UMD builds, so everything also works from `file://`). `assets/js/`: `cloud.js` (the particle map: states, tint, markers, quality), `pages.js` (map states per page, scroll driver, markers, sub-navigation, per-page behaviour), `layers.js` (3D layer stack), `parcel.js` (3D parcel), `terrain.js` (shared real-data decoder; its relief-mesh renderer is no longer used by any page), `app.js` (runtime). `assets/css/`: `main.css` (shared) + `pages.css` (per-page identities, glass surfaces). Fonts: Noto Sans / Noto Serif / Noto Sans Armenian / Noto Serif Armenian / Iosevka Charon Mono (all three scripts).

## Things you should know
* **Converter (`/tools/shp-to-dxf/`)** — the live tool includes a paid unlock (Idram, manual confirmation) that runs on your server. I did **not** recreate that. The page describes the tool and its button opens `tool_url` (default: the old live address). **If you deploy this site on geogeeks.am itself, that default would point back at the new page** — move the working tool to another path and set `tool_url`.
* The flood overlay is an *illustrative* model (HAND on SRTM-class terrain), labelled as such on the page; it is not a hydraulic study. Pins exist only for places named in project titles (Yerevan, Stepanavan, Lake Sevan, the Armenian NPP).
* Google Analytics (`G-84V1L77P4S` on the old site) is **not** included. Add the snippet in `src/templates/base.html` if wanted.
* Team photos, partner logos and project images are the originals from geogeeks.am (originals kept in `src/images-original`).
* I could not open the "attached examples"/files mentioned in the brief (only the links arrived); the references were interpreted from their public pages and the dark-moon.org menu markup.

## Credits / licences
three.js (MIT) · GSAP free “no-charge” licence · Lenis (MIT) · Noto Sans, Noto Sans Armenian, Iosevka Charon Mono (SIL OFL)
Terrain: AWS Open Data *Terrain Tiles* (SRTM/ASTER and others) · Boundaries: **geoBoundaries, CC BY 2.5** (credited in every footer).
