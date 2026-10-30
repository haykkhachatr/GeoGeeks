/* ==========================================================================
   GGCloud — Armenia as a 3D particle cloud built from the real elevation model. One instance lives behind every page.
   Points sit on the relief and are coloured by altitude (teal -> green -> yellow -> white).
   State (all tweenable): morph (dust -> relief), river (only river points glow), flood (low points turn water-blue),
   flat (relief collapses to a map), pal (warm palette), hot (pulse around Yerevan), tone + tr/tg/tb (single-hue tint per page),
   pins (opacity of the HTML place markers). The cursor pushes particles away.
   Extra helpers: pinWorld() / project() put HTML markers on real places, onFrame() runs after each render.
   ========================================================================== */
(function () {
  'use strict';
  var G = window.GG_GEO, THREE = window.THREE, gsap = window.gsap, GT = window.GGTerrain;
  if (!G || !THREE || !gsap || !GT) { window.GGCloud = null; return; }
  var W = G.w, H = G.h, WORLD_W = 10, WORLD_D = WORLD_W / G.aspect, HS = 0.86;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function ramp(stops, t) {
    t = clamp(t, 0, 1);
    for (var i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
      var a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
    var l = stops[stops.length - 1]; return [l[1], l[2], l[3]];
  }
  var COOL = [[0, 0.05, 0.44, 0.56], [0.18, 0.18, 0.75, 0.83], [0.42, 0.0, 0.66, 0.48], [0.72, 0.97, 0.86, 0.36], [1, 1, 1, 1]];
  var WARM = [[0, 0.0, 0.62, 0.45], [0.3, 0.36, 0.84, 0.46], [0.6, 0.97, 0.86, 0.36], [0.85, 1.0, 0.66, 0.30], [1, 1, 0.96, 0.85]];

  var VERT = [
    'attribute vec3 aCol; attribute vec3 aCol2; attribute float aHand; attribute float aRiv; attribute float aSeed; attribute float aSz; attribute float aHot;',
    'uniform float uTime; uniform float uMorph; uniform float uRiver; uniform float uFlood; uniform float uFlat; uniform float uPx; uniform float uSize; uniform float uDim; uniform float uPal; uniform float uHot; uniform float uTone;',
    'uniform vec3 uMouse; uniform vec3 uTint;',
    'varying vec3 vCol; varying float vA;',
    'void main(){',
    '  vec3 p = position; p.y *= mix(1.0, 0.1, uFlat);',
    '  float a = aSeed*6.2831 + uTime*0.06*(0.4+aSeed);',
    '  float r = 4.5 + aSeed*5.0;',
    '  vec3 dust = vec3(cos(a)*r, (fract(aSeed*91.7)-0.5)*7.0 + sin(uTime*0.3+aSeed*30.0)*0.35, sin(a*1.3)*r*0.62);',
    '  float m = smoothstep(0.0, 1.0, clamp(uMorph*1.35 - aSeed*0.35, 0.0, 1.0));',
    '  vec3 q = mix(dust, p, m);',
    '  vec2 d = q.xz - uMouse.xz; float dist = length(d) + 1e-3;',
    '  float rep = uMouse.y * smoothstep(1.7, 0.0, dist);',
    '  q.xz += (d/dist) * rep * 0.6; q.y += rep * 0.4;',
    '  float fl = smoothstep(uFlood + 0.5, uFlood - 0.5, aHand) * step(0.01, uFlood);',
    '  vec3 col = mix(aCol, aCol2, uPal);',
    '  float lum = dot(col, vec3(0.30, 0.59, 0.11));',
    '  col = mix(col, uTint * (0.3 + lum * 1.25), uTone);',
    '  col = mix(col, vec3(0.16, 0.55, 0.98), fl);',
    '  float isR = step(0.5, aRiv);',
    '  col = mix(col, vec3(0.5, 0.96, 1.0), uRiver*isR);',
    '  float alpha = mix(1.0, mix(0.07, 1.0, isR), uRiver);',
    '  float hot = aHot * uHot;',
    '  col = mix(col, vec3(1.0, 0.95, 0.7), hot*(0.55 + 0.45*sin(uTime*3.0)));',
    '  float tw = 0.65 + 0.35*sin(uTime*1.3 + aSeed*50.0);',
    '  vCol = col; vA = alpha * tw * uDim * (0.25 + 0.75*m);',
    '  vec4 mv = modelViewMatrix * vec4(q, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float sz = uSize * aSz * (1.0 + uRiver*isR*0.9 + fl*0.5 + hot*2.4 + rep*0.9);',
    '  gl_PointSize = clamp(sz * uPx / max(-mv.z, 0.5), 1.0, 14.0);',
    '}'
  ].join('\n');
  var FRAG = [
    'precision mediump float; varying vec3 vCol; varying float vA;',
    'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.0, r); a = a*a*1.7; gl_FragColor = vec4(vCol, a*vA); }'
  ].join('\n');

  function create(canvas, opts) {
    opts = opts || {};
    var mobile = window.matchMedia('(max-width: 800px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    var N = opts.n || (mobile ? 15000 : 46000), NPIN = mobile ? 700 : 2400;
    var hq = /[?&]hq\b/.test(location.search);
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    var C = { s: { cx: 0.6, cy: 5.2, cz: 8.6, tx: 0.1, ty: 0, tz: 0.4, fov: 30, morph: 0, river: 0, flood: 0, flat: 0, pal: 0, hot: 0, dim: 1, size: 2.3, spin: 1, par: 1, shiftX: 0, tone: 0, tr: 1, tg: 1, tb: 1, pins: 0 }, active: true, frame: [] };
    var mouse = { x: 0, y: 0, sx: 0, sy: 0, wx: 0, wz: 0, str: 0, moved: 0 };
    var time = 0, last = 0, w = 1, h = 1, pts = null, mat = null, total = N, raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15), hit = new THREE.Vector3(), hAtFn = null;
    var DPRMAX = opts.dpr || (mobile ? 1.4 : 1.75), level = 0, slow = 0, seen = 0, tmpV = new THREE.Vector3();

    C.ready = GT.data().then(function (d) {
      var ph = d.ph, pd = d.pd, n = W * H, i, e = new Float32Array(n);
      for (i = 0; i < n; i++) { var q = ph[i * 4] / 255; e[i] = q * q; }
      var hf = GT.blur5(GT.blur5(e, W, H), W, H);
      function hAt(u, v) {
        var x = clamp(u, 0, 1) * (W - 1), y = clamp(v, 0, 1) * (H - 1), x0 = x | 0, y0 = y | 0, x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1), fx = x - x0, fy = y - y0;
        return (hf[y0 * W + x0] * (1 - fx) + hf[y0 * W + x1] * fx) * (1 - fy) + (hf[y1 * W + x0] * (1 - fx) + hf[y1 * W + x1] * fx) * fy;
      }
      hAtFn = hAt;
      var rnd = rng(20210601), rivers = [];
      for (i = 0; i < n; i++) if (ph[i * 4 + 1] >= 40 && pd[i * 4 + 2] > 0) rivers.push(i);
      var pinKeys = Object.keys(G.pins), EXTRA = pinKeys.length * NPIN, T = N + EXTRA;
      var pos = new Float32Array(T * 3), c1 = new Float32Array(T * 3), c2 = new Float32Array(T * 3), hand = new Float32Array(T), riv = new Float32Array(T), seed = new Float32Array(T), sz = new Float32Array(T), hot = new Float32Array(T);
      var yv = G.pins.yerevan;
      function put(k, u, v, cell, isR) {
        var hh = hAt(u, v), ins = pd[cell * 4 + 2] > 0;
        pos[k * 3] = (u - 0.5) * WORLD_W; pos[k * 3 + 1] = hh * HS; pos[k * 3 + 2] = (v - 0.5) * WORLD_D;
        var el = G.e0 + hh * (G.e1 - G.e0), t = clamp((el - 350) / 3700, 0, 1), a = ramp(COOL, t), b = ramp(WARM, t), dim = ins ? 1 : 0.35;
        c1[k * 3] = a[0] * dim; c1[k * 3 + 1] = a[1] * dim; c1[k * 3 + 2] = a[2] * dim;
        c2[k * 3] = b[0] * dim; c2[k * 3 + 1] = b[1] * dim; c2[k * 3 + 2] = b[2] * dim;
        var hb = ph[cell * 4 + 2] / 255; hand[k] = ins ? G.hand_max * hb * hb : 99;
        riv[k] = isR; seed[k] = rnd(); sz[k] = 0.55 + rnd() * 0.95;
        var dx = u - yv[0], dy = (v - yv[1]) * (H / W); hot[k] = Math.hypot(dx, dy) < 0.016 ? 1 : 0;
      }
      var NR = Math.round(N * 0.2), made = 0;
      while (made < N) {
        var cell, isR = 0;
        if (made < NR && rivers.length) { cell = rivers[(rnd() * rivers.length) | 0]; if (rnd() > ph[cell * 4 + 1] / 255 * 0.9 + 0.15) continue; isR = 1; }
        else { cell = (rnd() * n) | 0; var ins = pd[cell * 4 + 2] > 0; if (!ins && rnd() > 0.07) continue; }
        put(made, ((cell % W) + rnd()) / W, (((cell / W) | 0) + rnd()) / H, cell, isR);
        made++;
      }
      // denser clusters around the named places, so a camera close to a marker still sees a rich cloud
      pinKeys.forEach(function (key) {
        var pc = G.pins[key], got = 0, tries = 0;
        while (got < NPIN && tries++ < NPIN * 8) {
          var gx = (rnd() + rnd() + rnd() - 1.5) * 0.085, gy = (rnd() + rnd() + rnd() - 1.5) * 0.085 / G.aspect * 0.96;
          var u = clamp(pc[0] + gx, 0.001, 0.999), v = clamp(pc[1] + gy, 0.001, 0.999), cell = ((v * (H - 1)) | 0) * W + ((u * (W - 1)) | 0);
          if (pd[cell * 4 + 2] <= 0) continue;
          put(made, u, v, cell, 0); made++; got++;
        }
      });
      total = made;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(c1, 3)); g.setAttribute('aCol2', new THREE.BufferAttribute(c2, 3));
      g.setAttribute('aHand', new THREE.BufferAttribute(hand, 1)); g.setAttribute('aRiv', new THREE.BufferAttribute(riv, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aHot', new THREE.BufferAttribute(hot, 1));
      g.setDrawRange(0, total);
      mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMorph: { value: 0 }, uRiver: { value: 0 }, uFlood: { value: 0 }, uFlat: { value: 0 }, uPx: { value: 400 }, uSize: { value: 2.3 }, uDim: { value: 1 }, uPal: { value: 0 }, uHot: { value: 0 }, uTone: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uMouse: { value: new THREE.Vector3(99, 0, 99) } },
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
      C.ok = true; resize();
      return C;
    });

    function resize() {
      var cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, level > 0 ? 1 : DPRMAX);
      if (cw === w && ch === h && renderer.getPixelRatio() === dpr) return;
      w = cw; h = ch; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    C.resize = resize;
    // the cloud is always on screen, so protect slow machines: after ~1.5 s of low frame rate drop the pixel ratio and thin the cloud
    function adapt(dt) {
      if (hq || !C.ok || level >= 2 || time < 3) return;
      seen++; if (dt > 0.036) slow++;
      if (seen >= 90) {
        if (slow > 55) { level++; if (pts) pts.geometry.setDrawRange(0, Math.round(total * (level === 1 ? 0.62 : 0.4))); resize(); }
        seen = 0; slow = 0;
      }
    }
    function apply(dt) {
      var s = C.s, asp = w / h, fv = s.fov;
      if (asp < 1) fv = Math.atan(Math.tan(fv * Math.PI / 360) / asp * 0.55) * 360 / Math.PI;
      camera.fov = fv;
      var ang = time * 0.035 * s.spin + mouse.sx * 0.12 * s.par, ox = s.cx - s.tx, oz = s.cz - s.tz;
      camera.position.set(s.tx + ox * Math.cos(ang) + oz * Math.sin(ang), s.cy + mouse.sy * 0.35 * s.par, s.tz - ox * Math.sin(ang) + oz * Math.cos(ang));
      camera.lookAt(s.tx, s.ty, s.tz);
      if (s.shiftX && asp >= 0.9) camera.setViewOffset(w, h, -s.shiftX * w, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      var u = mat.uniforms;
      u.uTime.value = time; u.uMorph.value = s.morph; u.uRiver.value = s.river; u.uFlood.value = s.flood; u.uFlat.value = s.flat; u.uDim.value = s.dim; u.uPal.value = s.pal; u.uHot.value = s.hot;
      u.uTone.value = s.tone; u.uTint.value.set(s.tr, s.tg, s.tb);
      u.uSize.value = s.size; u.uPx.value = h * 0.5 / Math.tan(camera.fov * Math.PI / 360) * 0.011 * renderer.getPixelRatio();
      // cursor -> world point on a plane above the relief
      mouse.str += ((mouse.moved > 0 ? 1 : 0) - mouse.str) * Math.min(1, dt * 4); mouse.moved = Math.max(0, mouse.moved - dt);
      raycaster.setFromCamera({ x: mouse.x, y: -mouse.y }, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) { mouse.wx += (hit.x - mouse.wx) * Math.min(1, dt * 10); mouse.wz += (hit.z - mouse.wz) * Math.min(1, dt * 10); }
      u.uMouse.value.set(mouse.wx, mouse.str, mouse.wz);
    }
    function tick() {
      if (!C.ok || !C.active || document.hidden) { last = 0; return; }
      var now = performance.now() / 1000, dt = last ? Math.min(now - last, 0.05) : 0.016; last = now; time += dt;
      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 3); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 3);
      apply(dt); renderer.render(scene, camera); adapt(dt);
      for (var i = 0; i < C.frame.length; i++) C.frame[i](dt);
    }
    gsap.ticker.add(tick);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', function (e) { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1; mouse.moved = 0.6; }, { passive: true });
    C.setActive = function (v) { C.active = !!v; if (v) last = 0; };
    C.set = function (p) { Object.keys(p).forEach(function (k) { C.s[k] = p[k]; }); };
    C.to = function (p, d, ease) { return gsap.to(C.s, Object.assign({ duration: d == null ? 1.6 : d, ease: ease || 'power2.inOut', overwrite: 'auto' }, p)); };
    C.onFrame = function (fn) { C.frame.push(fn); };
    // real place -> world coordinates (on the relief) and world -> screen pixels (valid right after a render)
    C.pinWorld = function (key) {
      var p = G.pins[key]; if (!p || !hAtFn) return null;
      return { x: (p[0] - 0.5) * WORLD_W, y: hAtFn(p[0], p[1]) * HS, z: (p[1] - 0.5) * WORLD_D };
    };
    C.project = function (x, y, z) {
      tmpV.set(x, y, z).project(camera);
      return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, vis: tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15 };
    };
    return C;
  }
  window.GGCloud = { create: create, WORLD_W: WORLD_W, WORLD_D: WORLD_D };
})();
