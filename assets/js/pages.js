/* ==========================================================================
   GeoGeeks — page behaviour (v5: one map behind every page).
   The particle model of Armenia (cloud.js) is the stage of the whole site. Every page declares, per section, the state the map
   should be in (data-map="name"); a small driver turns that into a smooth camera / palette / layer path while you scroll.
   Pages only add their own furniture on top: pins, sub-navigation, tabs, the 3D parcel and layer stack, filters.
   ========================================================================== */
(function () {
  'use strict';
  var App = window.GGApp, GG = window.GG || {};
  if (!App) return;
  var gsap = App.gsap, ST = App.ST, $ = App.$, $$ = App.$$, RM = App.RM, doc = document, root = doc.documentElement;
  var page = GG.page;
  var tt = GG.t || {};
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  /* ------------------------------------------------------------------ map states */
  var BASE = { cx: 0.6, cy: 6.3, cz: 9.6, tx: 0.2, ty: 0, tz: 0.4, fov: 30, morph: 1, river: 0, flood: 0, flat: 0, pal: 0, hot: 0, dim: 1, size: 2.4, spin: 1, par: 1, shiftX: 0, tone: 0, tr: 1, tg: 1, tb: 1, pins: 0 };
  var KEYS = Object.keys(BASE);
  function S(o) { return Object.assign({}, BASE, o); }
  var CYAN = { tone: 0.88, tr: 0.05, tg: 0.52, tb: 0.60 }, BLUE = { tone: 0.86, tr: 0.05, tg: 0.38, tb: 0.55 }, GREEN = { tone: 0.8, tr: 0.0, tg: 0.66, tb: 0.48 };
  var INTRO = S({ cx: 0, cy: 8.5, cz: 11, fov: 38, morph: 0, dim: 0.9 });
  var MAP = {
    // home (esri-style statements)
    hero: S({ shiftX: 0.2 }),
    about: S({ cx: 0.1, cy: 10, cz: 3.2, tx: 0.1, tz: 0.3, fov: 32, dim: 0.5, spin: 0.5, size: 2.1 }),
    gis: S({ cx: -0.4, cy: 5.8, cz: 6.4, tx: 0.2, tz: 0.3, dim: 0.8, size: 2.5 }),
    hydro: S({ cx: 0.2, cy: 4.4, cz: 5.2, tx: -1.2, tz: 0.5, fov: 32, dim: 0.9, river: 1 }),
    edu: S({ cx: 0.2, cy: 9.2, cz: 2.6, tx: 0.2, tz: 0.2, flat: 1, dim: 0.85, size: 2.3 }),
    overview: S({ cx: 0.2, cy: 8.4, cz: 6.6, tx: 0.2, tz: 0.4, dim: 0.95, size: 2.5, spin: 0.4, pins: 1, shiftX: -0.16 }),
    plat: S({ cx: 0.2, cy: 10.4, cz: 4.2, tx: 0.2, tz: 0.3, dim: 0.42, spin: 0.4, size: 2.1 }),
    numbers: S({ cx: 0.2, cy: 9.6, cz: 2.8, tx: 0.2, tz: 0.2, flat: 1, pal: 1, hot: 1, dim: 0.6, size: 2.3, spin: 0.5 }),
    // tools
    tool: S(Object.assign({ cx: 0.2, cy: 9.8, cz: 3.0, tx: 0.2, tz: 0.3, flat: 1, dim: 0.8, size: 2.3, spin: 0.5 }, CYAN)),
    toolTrack: S(Object.assign({ cx: -0.6, cy: 6.4, cz: 7.2, tx: 0.2, tz: 0.4, flat: 0, dim: 0.5, size: 2.3, spin: 1.6 }, CYAN)),
    toolQuiet: S(Object.assign({ cx: 0.2, cy: 9.8, cz: 3.0, tx: 0.2, tz: 0.3, flat: 1, dim: 0.34, size: 2.2, spin: 0.4 }, CYAN)),
    // services
    svcHero: S({ cx: 0.9, cy: 4.4, cz: 8.4, tx: 0.2, tz: 0.4, pal: 1, dim: 1, size: 2.6, shiftX: 0.2 }),
    svcLayers: S({ cx: 0.2, cy: 8.2, cz: 5.0, tx: 0.2, tz: 0.4, pal: 1, dim: 0.38, size: 2.2, spin: 0.5 }),
    svcGis: S({ cx: -0.4, cy: 5.8, cz: 6.4, tx: 0.2, tz: 0.3, pal: 1, dim: 0.85, size: 2.5, shiftX: -0.2 }),
    svcHydro: S({ cx: 0.2, cy: 4.4, cz: 5.2, tx: -1.2, tz: 0.5, fov: 32, pal: 1, dim: 0.9, river: 1, shiftX: -0.2 }),
    svcEdu: S({ cx: 0.2, cy: 9.2, cz: 2.6, tx: 0.2, tz: 0.2, flat: 1, pal: 1, hot: 1, dim: 0.85, size: 2.3, shiftX: -0.2 }),
    // projects / sector / project (a map with a side panel)
    proj: S(Object.assign({ cx: 0.1, cy: 9.6, cz: 8.6, tx: 0.1, tz: 0.5, dim: 1, size: 2.7, spin: 0.5, pins: 1, shiftX: -0.2 }, BLUE)),
    projQuiet: S(Object.assign({ cx: 0.1, cy: 9.6, cz: 8.4, tx: 0.1, tz: 0.5, dim: 0.85, size: 2.6, spin: 0.5, shiftX: -0.2 }, BLUE)),
    // about
    aboutHero: S(Object.assign({ cx: 0.1, cy: 8.8, cz: 4.6, tx: 0.1, tz: 0.3, fov: 32, dim: 1, spin: 0.6, size: 2.7 }, GREEN)),
    aboutQuiet: S(Object.assign({ cx: 0.1, cy: 9.4, cz: 4.2, tx: 0.1, tz: 0.3, fov: 32, dim: 0.42, spin: 0.5, size: 2.4 }, GREEN)),
    // contact
    contact: S({ cx: 0.5, cy: 11.4, cz: 4.2, tx: 0.2, tz: 0.2, flat: 1, pal: 1, hot: 1, dim: 1, size: 2.6, spin: 0.6, par: 1.2, shiftX: 0.16 }),
    contactQuiet: S({ cx: 0.5, cy: 11.4, cz: 4.2, tx: 0.2, tz: 0.2, flat: 1, pal: 1, hot: 1, dim: 0.45, size: 2.3, spin: 0.6, shiftX: 0 })
  };

  var C = null, drv = null;

  /* ------------------------------------------------------------------ the map */
  function makeCloud() {
    var canvas = $('#gl');
    if (!canvas || !window.GGCloud) { root.classList.add('no-gl'); return null; }
    var c = null;
    try { c = window.GGCloud.create(canvas); } catch (e) { c = null; }
    if (!c) { root.classList.add('no-gl'); return null; }
    App.cloud = c; App.pageReady(c.ready.catch(function () { root.classList.add('no-gl'); }));
    return c;
  }
  // a camera state centred on one of the named places (needs the elevation model, so it is resolved lazily)
  function pinState(key, o) {
    var p = C && C.pinWorld(key); if (!p) return null;
    return S(Object.assign({ tx: p.x, ty: p.y * 0.5, tz: p.z, cx: p.x + 0.9, cy: p.y + 3.3, cz: p.z + 3.2, fov: 30, dim: 1, size: 1.55, spin: 0.3, par: 0.6, pins: 1, shiftX: -0.2 }, o || {}));
  }
  function resolve(name) {
    if (name.indexOf('pin:') === 0) return pinState(name.slice(4)) || MAP.proj;
    return MAP[name] || MAP.hero;
  }
  function loadPrev() {
    try {
      var raw = sessionStorage.getItem('ggMap'); if (!raw) return null;
      sessionStorage.removeItem('ggMap');
      var o = JSON.parse(raw); return (Date.now() - o.t < 30000) ? o.s : null;
    } catch (e) { return null; }
  }
  function savePrev() {
    if (!C || !C.ok) return;
    try { sessionStorage.setItem('ggMap', JSON.stringify({ t: Date.now(), s: subset(C.s, KEYS) })); } catch (e) { }
  }

  // the first section's state is where the page starts; coming from another page the map is carried over and eased there,
  // a first visit assembles itself from dust
  function startMap() {
    var first = $('[data-map]'); if (!first) return null;
    C = makeCloud(); if (!C) return null;
    var base = resolve(first.getAttribute('data-map')), prev = RM ? null : loadPrev(), intro = { done: RM };
    window.addEventListener('pagehide', savePrev);
    if (prev) C.set(Object.assign({}, base, prev, { morph: 1 })); else C.set(RM ? base : INTRO);
    App.whenShown(function () {
      pinsLayer();
      var go = function () {
        base = resolve(first.getAttribute('data-map'));
        if (RM) C.set(base);
        else if (prev) { C.to(subset(base, KEYS.filter(function (k) { return k !== 'morph'; })), 2.4, 'power3.inOut'); gsap.delayedCall(2.5, function () { intro.done = true; }); }
        else {
          C.to({ morph: 1 }, page === 'home' ? 3.8 : 3.0, 'power2.inOut');
          C.to(subset(base, ['cx', 'cy', 'cz', 'fov', 'dim', 'shiftX', 'tone', 'tr', 'tg', 'tb', 'pal', 'flat', 'size', 'pins', 'tx', 'tz', 'river', 'hot']), page === 'home' ? 4.2 : 3.4, 'power3.out');
          gsap.delayedCall(page === 'home' ? 4.3 : 3.5, function () { intro.done = true; });
        }
        driver(intro);
      };
      if (C.ok) go(); else C.ready.then(go);
    });
    return C;
  }
  function subset(o, keys) { var r = {}; keys.forEach(function (k) { r[k] = o[k]; }); return r; }

  // scroll driver: [data-map] sections -> keyframes; [data-flood] makes the water rise while you read; drv.ov blends in a temporary state
  function driver(intro) {
    var secs = $$('[data-map]').map(function (el) { return { el: el, name: el.getAttribute('data-map'), flood: el.hasAttribute('data-flood') }; });
    var kf = [];
    drv = { ov: { s: null, w: 0 } };
    function absTop(el) { return el.getBoundingClientRect().top + window.scrollY; }
    function build() {
      var H = window.innerHeight; kf = [];
      secs.forEach(function (sc) {
        var top = absTop(sc.el), bot = top + sc.el.offsetHeight, st = resolve(sc.name), a = top - H * 0.35, b = Math.max(a, bot - H * 0.9);
        sc.top = top; sc.h = sc.el.offsetHeight; kf.push({ y: a, s: st }, { y: b, s: st });
      });
      var lastS = kf[kf.length - 1].s, lastEl = secs[secs.length - 1].el, lastBot = absTop(lastEl) + lastEl.offsetHeight;
      kf.push({ y: Math.max(kf[kf.length - 1].y, lastBot - H * 0.3), s: Object.assign({}, lastS, { pins: 0, dim: lastS.dim * 0.55 }) });
      for (var i = 1; i < kf.length; i++) if (kf[i].y < kf[i - 1].y) kf[i].y = kf[i - 1].y;
    }
    function sample(y) {
      if (y <= kf[0].y) return kf[0].s;
      for (var i = 1; i < kf.length; i++) if (y <= kf[i].y) {
        var a = kf[i - 1], b = kf[i], t = b.y === a.y ? 1 : smooth((y - a.y) / (b.y - a.y)), o = {};
        KEYS.forEach(function (k) { o[k] = a.s[k] + (b.s[k] - a.s[k]) * t; }); return o;
      }
      return kf[kf.length - 1].s;
    }
    build(); ST.addEventListener('refresh', build);
    gsap.ticker.add(function (time, dtms) {
      if (!C.active || !intro.done) return;
      var y = window.scrollY, tg = Object.assign({}, sample(y)), dt = Math.min((dtms || 16) / 1000, 0.05), k = 1 - Math.exp(-dt * 3.4);
      secs.forEach(function (sc) {
        if (!sc.flood) return;
        var len = Math.max(sc.h - window.innerHeight, window.innerHeight * 0.75), p = clamp((y - sc.top) / len, 0, 1);
        if (y > sc.top - window.innerHeight * 0.4 && y < sc.top + sc.h) { tg.flood = 20 * smooth(clamp((p - 0.28) / 0.6, 0, 1)); tg.river = 1 - 0.75 * smooth(clamp((p - 0.3) / 0.5, 0, 1)); }
      });
      var ov = drv.ov;
      if (ov.s && ov.w > 0.001) KEYS.forEach(function (key) { tg[key] += (ov.s[key] - tg[key]) * ov.w; });
      KEYS.forEach(function (key) { C.s[key] += (tg[key] - C.s[key]) * k; });
    });
  }
  // temporarily steer the map to one place (hover on a project row, a card of the home story)
  function focusPin(key, on, o) {
    if (!drv) return;
    var ov = drv.ov;
    if (on) { var st = pinState(key, o); if (!st) return; ov.s = st; gsap.to(ov, { w: 1, duration: 1.1, ease: 'power2.out', overwrite: 'auto' }); }
    else gsap.to(ov, { w: 0, duration: 1.2, ease: 'power2.inOut', overwrite: 'auto' });
    $$('.pin').forEach(function (p) { p.classList.toggle('is-on', !!on && p.getAttribute('data-pin') === key); });
    var layer = $('[data-pins]'); if (layer) layer.classList.toggle('has-focus', !!on);
  }

  // HTML markers that follow real places on the relief
  function pinsLayer() {
    var layer = $('[data-pins]'); if (!layer || !C) return;
    var els = $$('.pin', layer).map(function (el) { return { el: el, key: el.getAttribute('data-pin'), p: null }; });
    var narrow = window.matchMedia('(max-width:1100px)');
    C.onFrame(function () {
      var op = clamp(C.s.pins, 0, 1);
      // on a phone the panel slides over the map: the markers leave with the first screen
      if (narrow.matches && page !== 'home') op *= clamp(1 - window.scrollY / (window.innerHeight * 0.45), 0, 1);
      layer.style.opacity = op.toFixed(3); layer.style.visibility = op < 0.03 ? 'hidden' : 'visible';
      if (op < 0.03) return;
      els.forEach(function (o) {
        if (!o.p) { o.p = C.pinWorld(o.key); if (!o.p) return; }
        var s = C.project(o.p.x, o.p.y, o.p.z);
        o.el.style.transform = 'translate3d(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px,0)';
        o.el.classList.toggle('is-off', !s.vis);
      });
    });
  }

  // sticky sub-navigation (esri.com/what-is-gis) on every long page: scroll spy, smooth jump, progress line
  function subnav() {
    var nav = $('[data-subnav]'); if (!nav) return;
    var links = $$('a[href^="#"]', nav), bar = $('[data-subnav-bar]', nav);
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1), target = id === 'top' ? $('#main > section') : doc.getElementById(id);
      if (!target) return;
      a.addEventListener('click', function (e) { e.preventDefault(); App.scrollTo(id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - 70, { duration: 1.5 }); });
      ST.create({ trigger: target, start: 'top 55%', end: 'bottom 55%', onToggle: function (s) { if (s.isActive) links.forEach(function (l) { l.classList.toggle('is-on', l === a); }); } });
    });
    ST.create({ trigger: '#main', start: 'top top', end: 'bottom bottom', onUpdate: function (s) { if (bar) bar.style.width = (s.progress * 100) + '%'; } });
    ST.create({ trigger: '.ftr', start: 'top 90%', onToggle: function (s) { nav.classList.toggle('is-off', s.isActive); } });
  }

  /* ===================================================================== HOME */
  function home() {
    startMap();
    App.whenShown(function () {
      subnav();
      projectStory();
    });
  }
  // the selected projects as a camera flight over the real places: one card per marker
  function projectStory() {
    var story = $('[data-pstory]'); if (!story || !C) return;
    var cards = $$('[data-pcard]', story), dots = $$('.pst-dots li', story), cnt = $('[data-pst-n]', story), keys = cards.map(function (c) { return c.getAttribute('data-pcard'); }), cur = -1;
    function set(i) {
      if (i === cur) return; cur = i;
      cards.forEach(function (c, k) { c.classList.toggle('is-on', k === i); });
      dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); });
      if (cnt) cnt.textContent = '0' + (i + 1);
      focusPin(keys[i], true, { shiftX: -0.18 });
    }
    if (RM) { cards.forEach(function (c) { c.classList.add('is-on'); }); return; }
    ST.create({
      trigger: story, start: 'top 20%', end: 'bottom bottom',
      onToggle: function (s) { if (!s.isActive) { cur = -1; focusPin(null, false); cards.forEach(function (c) { c.classList.remove('is-on'); }); } },
      onUpdate: function (s) { set(clamp(Math.floor(s.progress * keys.length), 0, keys.length - 1)); }
    });
  }

  /* ================================================================ TOOLS */
  function toolPage() {
    startMap();
    var cv = $('#gl3'), P = null;
    if (cv && window.GGParcel) { try { P = window.GGParcel.create(cv); } catch (e) { P = null; } }
    App.whenShown(function () {
      subnav();
      if (P) {
        if (!RM) gsap.fromTo(P.s, { rise: 0, spin: -1.4 }, { rise: 1, spin: 0, duration: 2.2, ease: 'power3.out', delay: 0.2 }); else P.s.rise = 1;
        ST.create({ trigger: '.thero', start: 'top bottom', end: 'bottom top', onToggle: function (s) { P.setActive(s.isActive); } });
      }
      var tr = $('[data-track]'); if (!tr) return;
      var steps = $$('.track-step', tr), dots = $$('.track-dots li', tr), rings = $$('.tr', tr);
      rings.forEach(function (r) { var L = r.getTotalLength(); r.style.strokeDasharray = L; r.style.strokeDashoffset = RM ? 0 : L; r._L = L; });
      var cur = -1;
      function set(i) { if (i === cur) return; cur = i; steps.forEach(function (s, k) { s.classList.toggle('is-on', k === i); }); dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); }); }
      if (RM) { set(0); return; }
      ST.create({
        trigger: tr, start: 'top top', end: 'bottom bottom',
        onUpdate: function (s) {
          var p = s.progress; set(clamp(Math.floor(p * 3), 0, 2));
          rings.forEach(function (r, i) { var d = clamp(p * 3.4 - i * 0.55, 0, 1); r.style.strokeDashoffset = r._L * (1 - smooth(d)); });
        }
      });
    });
  }

  /* ================================================================ SERVICES */
  function servicesPage() {
    startMap();
    App.whenShown(function () {
      subnav();
      var cv = $('#gl2');
      if (cv && window.GGLayers) {
        var L = window.GGLayers.create(cv, { labels: tt.layers || [], labelBox: $('[data-lyr-labels]') });
        if (L) {
          L.set({ explode: 0.45, focus: -1 }); L.setActive(false);
          if (RM) { L.set({ explode: 0.8 }); L.setActive(true); }
          else {
            ST.create({ trigger: '.slayer', start: 'top bottom', end: 'bottom top', onToggle: function (s) { L.setActive(s.isActive); } });
            ST.create({ trigger: '.slayer', start: 'top 80%', end: 'bottom 30%', scrub: 0.8, onUpdate: function (self) { L.s.explode = 0.12 + 0.88 * self.progress; } });
          }
        }
      }
      $$('[data-chap]').forEach(initTabs);
      var cta = $('[data-sticky-cta]');
      if (cta) ST.create({ trigger: '.shero', start: 'bottom 60%', onToggle: function (s) { cta.classList.toggle('is-in', !s.isActive); } });
    });
  }
  function initTabs(root_) {
    var tabs = $$('[role=tab]', root_), panels = $$('[role=tabpanel]', root_);
    function select(i, focus) {
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
      panels.forEach(function (p, k) {
        if (k === i) { p.hidden = false; if (!RM) gsap.from(p, { opacity: 0, y: 14, duration: 0.6, ease: 'power2.out' }); }
        else p.hidden = true;
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var k = e.key; if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return; e.preventDefault();
        select(k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length, true);
      });
    });
  }

  /* ================================================================ PROJECTS */
  function projectsPage() {
    startMap();
    App.whenShown(function () {
      var list = $('[data-plist]'), chips = $('[data-filters]');
      var rows = $$('.prx', list || doc);
      // pointing at a project that has a place on the map sends the camera there
      rows.forEach(function (r) {
        var key = r.getAttribute('data-pin'); if (!key) return;
        r.addEventListener('pointerenter', function () { focusPin(key, true); });
        r.addEventListener('focus', function () { focusPin(key, true); });
        r.addEventListener('pointerleave', function () { focusPin(null, false); });
        r.addEventListener('blur', function () { focusPin(null, false); });
      });
      $$('.pin').forEach(function (p) {
        var key = p.getAttribute('data-pin');
        p.addEventListener('pointerenter', function () { focusPin(key, true); });
        p.addEventListener('pointerleave', function () { focusPin(null, false); });
        p.addEventListener('focus', function () { focusPin(key, true); });
        p.addEventListener('blur', function () { focusPin(null, false); });
      });
      if (chips && list) {
        chips.addEventListener('click', function (e) {
          var b = e.target.closest('[data-f]'); if (!b) return;
          var f = b.getAttribute('data-f');
          $$('[data-f]', chips).forEach(function (x) { var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          rows.forEach(function (r) { r.parentElement.classList.toggle('is-hide', !(f === 'all' || r.getAttribute('data-sector') === f)); });
          var shown = rows.filter(function (r) { return !r.parentElement.classList.contains('is-hide'); });
          if (!RM) gsap.fromTo(shown, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.035, ease: 'power2.out' });
          setTimeout(function () { ST.refresh(); }, 60);
        });
      }
    });
  }
  function projectPage() { startMap(); }
  function sectorPage() { startMap(); }

  /* ================================================================ ABOUT */
  function aboutPage() {
    startMap();
    App.whenShown(function () {
      subnav();
      var el = $('[data-year-count]'); if (!el) return;
      var end = new Date().getFullYear(), o = { v: 2021 };
      if (RM) { el.textContent = end; return; }
      el.textContent = '2021';
      gsap.to(o, { v: end, duration: 2.6, ease: 'power2.inOut', delay: 0.9, onUpdate: function () { el.textContent = Math.round(o.v); } });
    });
  }

  /* ================================================================ CONTACT */
  function contactPage() { startMap(); }

  var map = { home: home, tools: toolPage, services: servicesPage, projects: projectsPage, about: aboutPage, contact: contactPage, sector: sectorPage, project: projectPage };
  (map[page] || function () { })();
  App.boot();
})();
