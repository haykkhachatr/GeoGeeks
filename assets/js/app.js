/* ==========================================================================
   GeoGeeks — core runtime: smooth scroll, page transitions, menu, reveals, scroll-to-next portal.
   Calm by design: one ink curtain for transitions, short fade-ups for content, no scroll-jacking.
   Works from file:// and from a server. Needs GSAP, ScrollTrigger and Lenis only.
   ========================================================================== */
(function () {
  'use strict';
  var gsap = window.gsap, ST = window.ScrollTrigger, Lenis = window.Lenis;
  var doc = document, root = doc.documentElement, body = doc.body;
  var GG = window.GG || {};
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }

  if (!gsap || !ST) { root.classList.add('pt-failsafe'); window.__ggReady = true; return; }
  gsap.registerPlugin(ST);
  ST.config({ ignoreMobileResize: true });
  if (RM) root.classList.add('rm');

  var App = window.GGApp = { gsap: gsap, ST: ST, RM: RM, $: $, $$: $$, lenis: null, revealed: false };
  var T = (GG.t || {});

  /* ------------------------------------------------------------ smooth scroll (gentle) */
  var lenis = null;
  if (!RM && Lenis) {
    lenis = new Lenis({ lerp: 0.14, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.3 });
    lenis.on('scroll', ST.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  App.lenis = lenis;
  App.scrollTo = function (y, o) { if (lenis) lenis.scrollTo(y, o || { duration: 1.2 }); else window.scrollTo(0, typeof y === 'number' ? y : 0); };

  /* ------------------------------------------------------------ page transition + loader */
  var pt = $('.pt');
  var ink = pt ? $('.pt-ink', pt) : null;
  var core = pt ? $('.pt-core', pt) : null;
  var ptLogo = pt ? $('.pt-logo', pt) : null;
  var ptWord = pt ? $('.pt-word', pt) : null;
  var ptCount = pt ? $('[data-pt-n]', pt) : null;
  var ptBar = pt ? $('.pt-bar i', pt) : null;
  var arrival = null;
  try { var raw = sessionStorage.getItem('ggPt'); if (raw) { arrival = JSON.parse(raw); sessionStorage.removeItem('ggPt'); } } catch (e) { }
  var leaving = false;

  function inkColor(c) { if (ink) ink.style.background = c || ''; }

  function ptCover(opts) {
    return new Promise(function (res) {
      if (!pt || RM) { res(); return; }
      pt.classList.remove('is-off'); gsap.set(pt, { visibility: 'visible', pointerEvents: 'auto' });
      var portal = !!(opts && opts.kind === 'portal');
      pt.classList.toggle('is-portal', portal);
      inkColor(portal ? opts.color : '');
      pt.style.setProperty('--pt-fg', portal ? (opts.fg || '#fff') : '#e8f3f4');
      ptWord.textContent = portal ? (opts.title || '') : '';
      gsap.set(core, { opacity: 0 });
      gsap.set(ink, { yPercent: 100 });
      var tl = gsap.timeline({ onComplete: res });
      tl.to(ink, { yPercent: 0, duration: 0.7, ease: 'power3.inOut' });
      tl.to(core, { opacity: 1, duration: 0.25, ease: 'power1.out' }, '-=0.2');
    });
  }

  function ptReveal() {
    var first = !arrival;
    if (arrival && arrival.kind === 'portal') { pt.classList.add('is-portal'); ptWord.textContent = arrival.title || ''; inkColor(arrival.color); pt.style.setProperty('--pt-fg', arrival.fg || '#fff'); }
    var tl = gsap.timeline({ onComplete: function () { if (pt) { pt.classList.add('is-off'); gsap.set(pt, { visibility: 'hidden', pointerEvents: 'none' }); } } });
    tl.to(core, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0);
    tl.call(function () { App.show(); }, null, first ? 0.3 : 0.25);
    tl.to(ink, { yPercent: -100, duration: 0.85, ease: 'power3.inOut' }, first ? 0.15 : 0.12);
  }

  function loaderSequence(readyPromise) {
    var counter = { n: 0 };
    function paint() { ptCount.textContent = Math.round(counter.n); ptBar.style.transform = 'scaleX(' + (counter.n / 100) + ')'; }
    gsap.from(ptLogo, { opacity: 0, y: 8, duration: 0.8, ease: 'power2.out' });
    var minT = gsap.to(counter, { n: 86, duration: 1.1, ease: 'power2.out', onUpdate: paint });
    return new Promise(function (res) {
      var ok = false, t0 = performance.now();
      readyPromise.then(function () { ok = true; });
      var iv = setInterval(function () {
        if ((ok && performance.now() - t0 > 900) || performance.now() - t0 > 4200) {
          clearInterval(iv); minT.kill();
          gsap.to(counter, { n: 100, duration: 0.3, ease: 'none', onUpdate: paint, onComplete: res });
        }
      }, 60);
    });
  }

  App.go = function (url, o) {
    if (leaving) return; leaving = true; o = o || {};
    try { sessionStorage.setItem('ggPt', JSON.stringify({ kind: o.kind || 'std', color: o.color || '', title: o.title || '', fg: o.fg || '' })); } catch (e) { }
    if (lenis) lenis.stop();
    ptCover(o).then(function () { window.location.href = url; });
    setTimeout(function () { if (leaving && !document.hidden) window.location.href = url; }, 2500);
  };

  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) { leaving = false; if (pt) pt.classList.add('is-off'); if (lenis) lenis.start(); }
  });

  doc.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.hasAttribute('data-no-pt')) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    var u; try { u = new URL(a.href, location.href); } catch (e) { return; }
    if (u.origin !== location.origin && location.protocol !== 'file:') return;
    if (location.protocol === 'file:' && u.protocol !== 'file:') return;
    if (u.pathname === location.pathname && u.search === location.search) { if (u.hash) return; ev.preventDefault(); App.scrollTo(0); return; }
    ev.preventDefault();
    if (a.hasAttribute('data-lang')) { try { localStorage.setItem('ggLang', a.getAttribute('data-lang')); } catch (e) { } }
    if (body.classList.contains('menu-open')) closeMenu(true);
    App.go(a.href, { kind: 'std' });
  });

  /* ------------------------------------------------------------ show (after the reveal starts) */
  var showQ = [];
  App.whenShown = function (fn) { if (App.revealed) fn(); else showQ.push(fn); };
  App.show = function () {
    if (App.revealed) return; App.revealed = true;
    root.classList.remove('pt-in');
    if (lenis) lenis.start();
    // ScrollTrigger order matters: page-specific triggers first (top to bottom), then generic ones
    showQ.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    initHeader();
    initPortal();
    initReveals();
    ST.refresh();
  };

  /* ------------------------------------------------------------ header: theme + solid-on-scroll */
  var hdr = $('[data-hdr-el]');
  function initHeader() {
    $$('section[data-hdr],footer[data-hdr]').forEach(function (sec) {
      var tone = sec.getAttribute('data-hdr');
      ST.create({ trigger: sec, start: 'top 44px', end: 'bottom 44px', onToggle: function (self) { if (self.isActive) body.setAttribute('data-hdr-now', tone); } });
    });
    function onScroll(y) { if (hdr) hdr.classList.toggle('is-solid', y > 24); }
    onScroll(window.scrollY);
    if (lenis) lenis.on('scroll', function (e) { onScroll(e.scroll); });
    else window.addEventListener('scroll', function () { onScroll(window.scrollY); }, { passive: true });
  }

  /* ------------------------------------------------------------ language indicator */
  function initLang() {
    var nav = $('.lang'); if (!nav) return;
    var ind = $('.lang-ind', nav), on = $('.lang-a.is-on', nav);
    function place(el, animate) {
      if (!el || !ind) return;
      if (!animate) ind.style.transition = 'none';
      ind.style.width = el.offsetWidth + 'px'; ind.style.transform = 'translateX(' + el.offsetLeft + 'px)';
      nav.classList.add('has-ind');
      if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
    }
    place(on, false);
    window.addEventListener('resize', function () { place(on, false); }, { passive: true });
    $$('.lang-a', nav).forEach(function (a) {
      a.addEventListener('pointerenter', function () { place(a, true); });
      a.addEventListener('focus', function () { place(a, true); });
    });
    nav.addEventListener('pointerleave', function () { place(on, true); });
  }

  /* ------------------------------------------------------------ menu (sheet, dark-moon style) */
  var menu = $('#menu'), menuBtn = $('[data-menu-btn]'), menuOpen = false, menuTl = null;
  function setupMenu() {
    if (!menu || !menuBtn) return;
    var panel = $('.menu-panel', menu);
    var links = $$('.menu-link', menu), shots = $$('.menu-shot', menu), info = $$('.menu-info > *', menu), sr = $('[data-menu-sr]');
    function showShot(i) { shots.forEach(function (s, k) { s.classList.toggle('is-on', k === i); }); }
    var cur = links.findIndex(function (l) { return l.classList.contains('is-on'); }); showShot(cur < 0 ? 0 : cur);
    links.forEach(function (l, i) {
      l.addEventListener('mouseenter', function () { showShot(i); });
      l.addEventListener('focus', function () { showShot(i); });
    });
    menuBtn.addEventListener('click', function () { menuOpen ? closeMenu() : openMenu(); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) { closeMenu(); menuBtn.focus(); }
      if (e.key === 'Tab' && menuOpen) {
        var f = $$('a[href],button', menu).filter(function (x) { return x.offsetParent !== null; }).concat([menuBtn]);
        var first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && doc.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    });
    menuTl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });
    menuTl.set(menu, { visibility: 'visible' }, 0)
      .fromTo(panel, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7 }, 0)
      .fromTo(links, { yPercent: 105 }, { yPercent: 0, duration: 0.9, stagger: 0.05, ease: 'power3.out' }, 0.25)
      .fromTo($('.menu-shots', menu), { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power1.out' }, 0.35)
      .fromTo(info, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power3.out' }, 0.45);
    menu._sr = sr;
  }
  function openMenu() {
    if (menuOpen || !menu) return; menuOpen = true;
    menu.classList.add('is-open'); menu.removeAttribute('inert'); body.classList.add('menu-open');
    menuBtn.setAttribute('aria-expanded', 'true'); if (menu._sr) menu._sr.textContent = T.closeMenu || 'Close';
    if (lenis) lenis.stop(); else body.classList.add('is-locked');
    if (RM || !menuTl) { menu.style.visibility = 'visible'; $('.menu-panel', menu).style.clipPath = 'none'; }
    else menuTl.timeScale(1).play(0);
    setTimeout(function () { var f = $('.menu-link', menu); if (f) f.focus({ preventScroll: true }); }, 450);
  }
  function closeMenu(instant) {
    if (!menuOpen) return; menuOpen = false;
    body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); if (menu._sr) menu._sr.textContent = T.openMenu || 'Menu';
    var fin = function () { menu.classList.remove('is-open'); menu.setAttribute('inert', ''); menu.style.visibility = ''; if (lenis) lenis.start(); else body.classList.remove('is-locked'); };
    if (RM || !menuTl || instant) { fin(); if (menuTl) menuTl.pause(0); return; }
    menuTl.timeScale(1.8).reverse().eventCallback('onReverseComplete', fin);
  }

  /* ------------------------------------------------------------ reveals (short fade-ups only) */
  function splitWords(el) {
    if (el._split) return el._split;
    var text = el.textContent.replace(/\s+/g, ' ').trim(), hl = el.getAttribute('data-hl'), words = text.split(' '), out = [];
    el.textContent = '';
    var sr = doc.createElement('span'); sr.className = 'sr-only'; sr.textContent = text; el.appendChild(sr);
    var vis = doc.createElement('span'); vis.setAttribute('aria-hidden', 'true'); el.appendChild(vis);
    words.forEach(function (w, i) {
      var s1 = doc.createElement('span'); s1.className = 'w' + (hl && w.indexOf(hl) > -1 ? ' hl' : '');
      var wi = doc.createElement('span'); wi.className = 'wi'; wi.textContent = w; s1.appendChild(wi); vis.appendChild(s1); out.push(wi);
      if (i < words.length - 1) vis.appendChild(doc.createTextNode(' '));
    });
    el._split = out; return out;
  }
  App.splitWords = splitWords;

  function initReveals() {
    if (RM) { $$('.sh').forEach(function (e) { e.classList.add('is-drawn'); }); return; }
    var vh = window.innerHeight;
    function inView(el) { return el.getBoundingClientRect().top < vh * 0.96; }
    function once(el, start) { return { trigger: el, start: start || 'top 90%', once: true }; }

    // headings: masked word rise (hero ones start after the curtain)
    $$('[data-split]').forEach(function (el) {
      var mode = el.getAttribute('data-split'), hero = !!el.closest('.hero,.shero,.thero,.ahero,.chero,.mapapp');
      if (mode === 'words') {
        var parts = splitWords(el), v = { yPercent: 112, duration: 1.15, ease: 'power4.out', stagger: 0.07, delay: hero ? 0.15 : 0 };
        if (inView(el)) gsap.from(parts, v); else gsap.from(parts, Object.assign(v, { scrollTrigger: once(el, 'top 88%') }));
      } else {
        var vars = { y: 24, opacity: 0, duration: 1, ease: 'power3.out', delay: hero ? 0.15 : 0 };
        if (inView(el)) gsap.from(el, vars); else gsap.from(el, Object.assign(vars, { scrollTrigger: once(el, 'top 90%') }));
      }
    });
    // fades, staggered across siblings
    var groups = new Map();
    $$('[data-fx="fade"]').forEach(function (el) { var k = el.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el); });
    groups.forEach(function (els) {
      els.forEach(function (el, i) {
        var vars = { y: 36, opacity: 0, duration: 1.05, ease: 'power3.out', delay: Math.min(i, 3) * 0.09 };
        if (inView(el)) gsap.from(el, vars); else gsap.from(el, Object.assign(vars, { scrollTrigger: once(el, 'top 92%') }));
      });
    });
    // hero furniture
    var hi = 0;
    $$('.hero-kick,.hero-cta,.hero-facts,.hud,.hero-cue').forEach(function (el) { gsap.from(el, { opacity: 0, y: 16, duration: 1, ease: 'power2.out', delay: 0.5 + (hi++) * 0.1 }); });
    // hairlines draw themselves
    $$('.sh').forEach(function (el) { ST.create({ trigger: el, start: 'top 94%', once: true, onEnter: function () { el.classList.add('is-drawn'); } }); });
    // images open like blinds
    $$('.pcard-img,.prx-img,.sec-fig,.panel-fig,.tcard-img').forEach(function (el) {
      var img = $('img', el);
      gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power3.inOut', scrollTrigger: once(el, 'top 92%') });
      if (img) gsap.fromTo(img, { scale: 1.22 }, { scale: 1, duration: 1.8, ease: 'power3.out', scrollTrigger: once(el, 'top 92%') });
    });
    $$('[data-reveal="clip"]').forEach(function (el) {
      gsap.from(el, { opacity: 0, y: 28, duration: 1, ease: 'power3.out', scrollTrigger: once(el, 'top 88%') });
    });
    // statements: the words light up as you scroll (esri.com/what-is-gis)
    $$('[data-scrub]').forEach(function (el) {
      var text = el.textContent.replace(/\s+/g, ' ').trim(), words = text.split(' ');
      el.textContent = '';
      var sr = doc.createElement('span'); sr.className = 'sr-only'; sr.textContent = text; el.appendChild(sr);
      var vis = doc.createElement('span'); vis.setAttribute('aria-hidden', 'true'); el.appendChild(vis);
      var spans = words.map(function (w, i) { var sp = doc.createElement('span'); sp.className = 'sw'; sp.textContent = w; vis.appendChild(sp); if (i < words.length - 1) vis.appendChild(doc.createTextNode(' ')); return sp; });
      var say = el.closest('.say');
      gsap.to(spans, { opacity: 1, ease: 'none', stagger: { each: 1 / spans.length, amount: 1 },
        scrollTrigger: say ? { trigger: say, start: 'top 72%', end: 'top -30%', scrub: true } : { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: true } });
    });
    // parallax on oversized hero images
    $$('[data-parallax]').forEach(function (img) {
      var k = (parseFloat(img.getAttribute('data-parallax')) || 0.15) * 0.8;
      gsap.fromTo(img, { yPercent: -k * 50 }, { yPercent: k * 50, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // counters
    $$('[data-count]').forEach(function (el) {
      var end = parseFloat(el.getAttribute('data-count')) || 0, plain = el.hasAttribute('data-plain'), o = { v: 0 };
      var fmt = function (v) { v = Math.round(v); return plain ? String(v) : v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009'); };
      el.textContent = fmt(0);
      gsap.to(o, { v: end, duration: 2, ease: 'power2.out', onUpdate: function () { el.textContent = fmt(o.v); }, scrollTrigger: once(el, 'top 92%') });
    });
    // gentle 3D tilt on cards and screenshots (fine pointers only)
    if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) $$('[data-tilt]').forEach(function (el) {
      var k = el.classList.contains('plat-shot') ? 7 : 5;
      el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); el.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * k + 'deg'); el.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5)) * k + 'deg'); });
      el.addEventListener('pointerleave', function () { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ------------------------------------------------------------ portal: keep scrolling to go to the next page */
  function initPortal() {
    var portal = $('[data-portal]'); if (!portal) return;
    var fill = $('.portal-fill', portal), st = $('.portal-st', portal), a = $('.portal-a', portal), titleEl = $('.portal-t', portal);
    var url = portal.getAttribute('data-href'), title = portal.getAttribute('data-title'), color = portal.getAttribute('data-color'), fgc = portal.getAttribute('data-fg') || '#fff';
    var fired = false, prog = { p: 0 };
    if (title.length > 34) titleEl.classList.add('is-long');
    function paint(p) { fill.style.height = (p * 100) + '%'; st.style.setProperty('--pfg', p > 0.46 ? fgc : '#fff'); }
    ST.create({
      trigger: portal, start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) {
        if (fired) return; prog.p = self.progress; paint(self.progress);
        if (self.progress >= 0.985) { fired = true; App.go(url, { kind: 'portal', color: color, title: title, fg: fgc }); }
      }
    });
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); if (fired) return; fired = true;
      if (RM) { window.location.href = url; return; }
      gsap.to(prog, { p: 1, duration: 0.7, ease: 'power2.in', onUpdate: function () { paint(prog.p); }, onComplete: function () { App.go(url, { kind: 'portal', color: color, title: title, fg: fgc }); } });
    });
  }

  /* ------------------------------------------------------------ misc */
  function initMisc() {
    $$('[data-totop]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); App.scrollTo(0, { duration: 1.6 }); }); });
    // in-page anchors glide instead of jumping
    $$('a[href^="#"]').forEach(function (a) {
      if (a.closest('[data-subnav]') || a.hasAttribute('data-totop') || a.classList.contains('skip') || a.classList.contains('pin')) return;
      var id = a.getAttribute('href').slice(1); if (!id) return;
      a.addEventListener('click', function (e) {
        var t = doc.getElementById(id); if (!t) return;
        e.preventDefault(); App.scrollTo(t.getBoundingClientRect().top + window.scrollY - 70, { duration: 1.4 });
      });
    });
    $$('[data-copy]').forEach(function (b) {
      var span = $('span', b), orig = span.textContent;
      b.addEventListener('click', function () {
        var txt = b.getAttribute('data-copy');
        var done = function () { span.textContent = b.getAttribute('data-copied') || 'OK'; b.classList.add('is-done'); setTimeout(function () { span.textContent = orig; b.classList.remove('is-done'); }, 1800); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, done);
        else { var ta = doc.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; body.appendChild(ta); ta.select(); try { doc.execCommand('copy'); } catch (e) { } ta.remove(); done(); }
      });
    });
    var rt; window.addEventListener('load', function () { ST.refresh(); });
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { ST.refresh(); }, 250); }, { passive: true });
    $$('img[loading=lazy]').forEach(function (im) { if (!im.complete) im.addEventListener('load', function () { clearTimeout(rt); rt = setTimeout(function () { ST.refresh(); }, 200); }, { once: true }); });
  }

  /* ------------------------------------------------------------ boot */
  setupMenu();
  initLang();
  initMisc();

  var pageReady = Promise.resolve();
  App.pageReady = function (p) { pageReady = Promise.all([pageReady, p]); };

  App.boot = function () {
    var fontsReady = (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : Promise.resolve();
    var all = Promise.all([fontsReady, pageReady]);
    if (RM || !pt) { App.show(); window.__ggReady = true; if (pt) pt.classList.add('is-off'); return; }
    var go = function () { window.__ggReady = true; ptReveal(); };
    if (arrival) {
      // came through a transition: the curtain is already covering; wait briefly for assets, then lift it
      var tmo = new Promise(function (r) { setTimeout(r, 2600); });
      if (arrival.kind === 'portal') { ptWord.textContent = arrival.title || ''; pt.classList.add('is-portal'); inkColor(arrival.color); pt.style.setProperty('--pt-fg', arrival.fg || '#fff'); }
      gsap.set(core, { opacity: 1 });
      Promise.race([all, tmo]).then(function () { setTimeout(go, arrival.kind === 'portal' ? 240 : 80); });
    } else {
      loaderSequence(all).then(go);
    }
  };
})();
