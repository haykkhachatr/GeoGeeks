/* ==========================================================================
   GGLayers — an interactive 3D stack of "GIS layers" built from the real Armenia data:
   relief (hillshade) · contours · hydrology (flow accumulation) · flood extent (HAND).
   Drag to rotate; `explode` spreads the plates apart; `focus` highlights some of them.
   ========================================================================== */
(function () {
  'use strict';
  var G = window.GG_GEO, THREE = window.THREE, gsap = window.gsap, GT = window.GGTerrain;
  if (!G || !THREE || !gsap || !GT) { window.GGLayers = null; return; }
  var W = G.w, H = G.h, PW = 7.4, PH = PW / G.aspect;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) { return a + (b - a) * t; }

  function paintLayers(d) {
    var n = W * H, ph = d.ph, pd = d.pd, i, x, y;
    var inside = new Uint8Array(n), e = new Float32Array(n), flow = new Uint8Array(n), hand = new Float32Array(n), lake = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      var q = ph[i * 4] / 255; e[i] = G.e0 + q * q * (G.e1 - G.e0);
      inside[i] = pd[i * 4 + 2] > 0 ? 1 : 0; flow[i] = ph[i * 4 + 1];
      var hb = ph[i * 4 + 2] / 255; hand[i] = G.hand_max * hb * hb; lake[i] = pd[i * 4 + 1] > 128 ? 1 : 0;
    }
    var es = GT.blur5(GT.blur5(e, W, H), W, H);
    var out = [];
    function canvas() { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
    function outline(ctx, strong) {
      ctx.lineJoin = 'round';
      G.provinces.forEach(function (pr) { pr.rings.forEach(function (r) { ctx.beginPath(); for (var k = 0; k < r.length; k += 2) ctx[k ? 'lineTo' : 'moveTo'](r[k] * W, r[k + 1] * H); ctx.closePath(); ctx.strokeStyle = 'rgba(210,235,240,.22)'; ctx.lineWidth = 1; ctx.stroke(); }); });
      G.country.forEach(function (r) { ctx.beginPath(); for (var k = 0; k < r.length; k += 2) ctx[k ? 'lineTo' : 'moveTo'](r[k] * W, r[k + 1] * H); ctx.closePath(); ctx.strokeStyle = strong ? 'rgba(235,248,250,.95)' : 'rgba(235,248,250,.7)'; ctx.lineWidth = strong ? 2.4 : 1.8; ctx.stroke(); });
    }
    function plate(ctx, alpha) { ctx.fillStyle = 'rgba(12,38,48,' + alpha + ')'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgba(210,235,240,.25)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2); }

    // 1 relief: hillshade, only inside the country
    var c1 = canvas(), x1 = c1.getContext('2d'); plate(x1, 0.55);
    var im1 = x1.getImageData(0, 0, W, H), a1 = im1.data;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x; if (!inside[i]) continue;
      var dx = es[i + 1] - es[i - 1], dy = es[i + W] - es[i - W];
      var sh = clamp(0.52 + (-dx * 0.7 - dy * 0.7) / 130, 0, 1), el = clamp((es[i] - 400) / 4200, 0, 1), t = clamp(sh * 0.85 + el * 0.25, 0, 1);
      a1[i * 4] = mix(8, 150, t); a1[i * 4 + 1] = mix(40, 222, t); a1[i * 4 + 2] = mix(52, 236, t); a1[i * 4 + 3] = 255;
    }
    x1.putImageData(im1, 0, 0); outline(x1, true); out.push(c1);

    // 2 contours
    var c2 = canvas(), x2 = c2.getContext('2d'); plate(x2, 0.28);
    var im2 = x2.getImageData(0, 0, W, H), a2 = im2.data;
    for (y = 0; y < H - 1; y++) for (x = 0; x < W - 1; x++) {
      i = y * W + x; if (!inside[i]) continue;
      var v = es[i], f100 = Math.floor(v / 100), f500 = Math.floor(v / 500);
      var edge100 = f100 !== Math.floor(es[i + 1] / 100) || f100 !== Math.floor(es[i + W] / 100);
      var edge500 = f500 !== Math.floor(es[i + 1] / 500) || f500 !== Math.floor(es[i + W] / 500);
      if (edge100 || edge500) { a2[i * 4] = 140; a2[i * 4 + 1] = 228; a2[i * 4 + 2] = 244; a2[i * 4 + 3] = edge500 ? 255 : 150; }
    }
    x2.putImageData(im2, 0, 0); outline(x2, false); out.push(c2);

    // 3 hydrology
    var c3 = canvas(), x3 = c3.getContext('2d'); plate(x3, 0.22);
    var im3 = x3.getImageData(0, 0, W, H), a3 = im3.data;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x; if (!inside[i]) continue;
      var fl = Math.max(flow[i], flow[i - 1], flow[i + 1], flow[i - W], flow[i + W]) * 1;
      if (lake[i]) { a3[i * 4] = 40; a3[i * 4 + 1] = 150; a3[i * 4 + 2] = 190; a3[i * 4 + 3] = 210; }
      else if (fl >= 40) { var a = clamp(0.35 + fl / 255 * 0.65, 0, 1) * 255; a3[i * 4] = 90; a3[i * 4 + 1] = 225; a3[i * 4 + 2] = 248; a3[i * 4 + 3] = a; }
    }
    x3.putImageData(im3, 0, 0); outline(x3, false); out.push(c3);

    // 4 flood extent
    var c4 = canvas(), x4 = c4.getContext('2d'); plate(x4, 0.22);
    var im4 = x4.getImageData(0, 0, W, H), a4 = im4.data;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x; if (!inside[i]) continue;
      if (hand[i] < 10 || lake[i]) {
        var shore = hand[i] > 8.2 && !lake[i];
        a4[i * 4] = shore ? 150 : 28; a4[i * 4 + 1] = shore ? 232 : 140; a4[i * 4 + 2] = shore ? 250 : 200; a4[i * 4 + 3] = shore ? 230 : 175;
      }
    }
    x4.putImageData(im4, 0, 0); outline(x4, false); out.push(c4);
    return out;
  }

  function create(canvas, opts) {
    opts = opts || {};
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); } catch (e) { return null; }
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    var L = { s: { explode: 0.35, az: -0.62, pol: 0.98, focus: -1, spin: 1, zoom: 1, shiftX: 0 }, active: true, plates: [], labels: [] };
    var tgt = { az: L.s.az, pol: L.s.pol }, drag = null, time = 0, last = 0, w = 1, h = 1, group = new THREE.Group();
    scene.add(group);
    var names = opts.labels || [];
    var labelBox = opts.labelBox || null;

    L.ready = GT.data().then(function (d) {
      var cvs = paintLayers(d);
      cvs.forEach(function (c, i) {
        var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
        var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
        var m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat); m.rotation.x = -Math.PI / 2; m.renderOrder = i;
        group.add(m); L.plates.push(m);
        // thin frame lines + corner posts
        var ed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PW, PH)), new THREE.LineBasicMaterial({ color: 0xbfe9f2, transparent: true, opacity: 0.35 }));
        ed.rotation.x = -Math.PI / 2; m.userData.edge = ed; group.add(ed);
        if (labelBox && names[i]) {
          var el = document.createElement('div'); el.className = 'lyr-lbl'; el.innerHTML = '<i></i><span>' + names[i] + '</span>'; labelBox.appendChild(el); L.labels.push(el);
        }
      });
      // vertical guides at the corners
      var gm = new THREE.LineBasicMaterial({ color: 0xbfe9f2, transparent: true, opacity: 0.16 });
      L.guides = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
        var g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c[0] * PW / 2, 0, c[1] * PH / 2), new THREE.Vector3(c[0] * PW / 2, 1, c[1] * PH / 2)]);
        var ln = new THREE.Line(g, gm); group.add(ln); L.guides.push(ln);
      });
      L.ok = true; resize();
    });

    var tmp = new THREE.Vector3(), pr = { x: 0, y: 0 };
    function apply() {
      var s = L.s, n = L.plates.length, gap = mix(0.18, 1.7, clamp(s.explode, 0, 1));
      var i, p;
      for (i = 0; i < n; i++) {
        p = L.plates[i]; var y = i * gap; p.position.y = y; p.userData.edge.position.y = y;
        var f = s.focus, target = (f < 0 || (typeof f === 'number' && f === i) || (Array.isArray(f) && f.indexOf(i) >= 0)) ? 1 : 0.16;
        p.material.opacity += (target - p.material.opacity) * 0.12; p.userData.edge.material.opacity = 0.12 + 0.3 * p.material.opacity;
      }
      var top = (n - 1) * gap;
      if (L.guides) L.guides.forEach(function (ln) { var pos = ln.geometry.attributes.position; pos.setY(1, top); pos.needsUpdate = true; });
      var cy = top / 2, asp = w / Math.max(h, 1), R = Math.max(17, 5.1 / (Math.tan(14 * Math.PI / 180) * asp)) / s.zoom;
      var az = s.az, pol = s.pol;
      camera.position.set(Math.sin(az) * Math.sin(pol) * R, cy + Math.cos(pol) * R, Math.cos(az) * Math.sin(pol) * R);
      camera.lookAt(0, cy, 0);
      if (s.shiftX) camera.setViewOffset(w, h, -s.shiftX * w, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      for (i = 0; i < L.labels.length; i++) {
        tmp.set(PW / 2, i * gap, PH * 0.08).project(camera);
        var x = (tmp.x * 0.5 + 0.5) * w, yy = (-tmp.y * 0.5 + 0.5) * h;
        L.labels[i].style.transform = 'translate(' + (x | 0) + 'px,' + (yy | 0) + 'px)';
        L.labels[i].classList.toggle('is-dim', p && L.plates[i].material.opacity < 0.5);
      }
    }
    function resize() {
      var cw = canvas.clientWidth || 600, ch = canvas.clientHeight || 600, dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      if (cw === w && ch === h && renderer.getPixelRatio() === dpr) return;
      w = cw; h = ch; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    L.resize = resize;
    function tick() {
      if (!L.ok || !L.active || document.hidden) { last = 0; return; }
      var now = performance.now() / 1000, dt = last ? Math.min(now - last, 0.05) : 0.016; last = now; time += dt;
      if (!drag) tgt.az += Math.sin(time * 0.35) * 0.0016 * L.s.spin;
      L.s.az += (tgt.az - L.s.az) * Math.min(1, dt * 5); L.s.pol += (tgt.pol - L.s.pol) * Math.min(1, dt * 5);
      apply(); renderer.render(scene, camera);
    }
    gsap.ticker.add(tick);
    window.addEventListener('resize', resize, { passive: true });
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, az: tgt.az, pol: tgt.pol }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-drag'); });
    canvas.addEventListener('pointermove', function (e) { if (!drag) return; tgt.az = drag.az - (e.clientX - drag.x) * 0.006; tgt.pol = clamp(drag.pol - (e.clientY - drag.y) * 0.004, 0.35, 1.45); });
    function end() { drag = null; canvas.classList.remove('is-drag'); }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    L.setActive = function (v) { L.active = !!v; if (v) last = 0; };
    L.set = function (p) { Object.keys(p).forEach(function (k) { L.s[k] = p[k]; }); };
    L.to = function (p, d, ease) { return gsap.to(L.s, Object.assign({ duration: d == null ? 1.2 : d, ease: ease || 'power2.inOut', overwrite: 'auto' }, p)); };
    L.nudge = function (az, pol) { tgt.az = az; if (pol != null) tgt.pol = pol; };
    return L;
  }
  window.GGLayers = { create: create };
})();
