/* ==========================================================================
   GGFlight — a scroll-driven flight over the real relief of Armenia (opening of the Services page).
   Scroll = the camera follows the real Hrazdan river: Lake Sevan -> the Hrazdan valley -> Yerevan -> a last look at Ararat.
   Data: assets/data/geo.js (elevation + hydrology, built offline by src/tools/build_geo.py). The route is that river, traced
   along the model's own flow directions. Heights are exaggerated 6x; lighting is a baked hillshade; colours are the logo ramp
   (teal -> green -> yellow) fading into the page's milk-white mist. Written for this site; no third-party scene code.
   ========================================================================== */
(function () {
  'use strict';
  var G = window.GG_GEO, THREE = window.THREE, gsap = window.gsap, GT = window.GGTerrain;
  if (!G || !THREE || !gsap || !GT) { window.GGFlight = null; return; }

  var W = G.w, H = G.h, WW = 10, WD = WW / G.aspect, EX = 0.00021, KM = 29.6;   // world width / depth, vertical exaggeration per metre, km per world unit
  var LON0 = G.bbox[0], LAT0 = G.bbox[1], LON1 = G.bbox[2], LAT1 = G.bbox[3];
  function mercN(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }
  var Y0N = mercN(LAT1), Y1N = mercN(LAT0);
  function uvOf(lon, lat) { return [(lon - LON0) / (LON1 - LON0), (mercN(lat) - Y0N) / (Y1N - Y0N)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // the Hrazdan, from the middle of Lake Sevan to the Ararat plain beside Yerevan: [u, v] in the elevation model
  var ROUTE = [[0.6017,0.3758],[0.5917,0.3662],[0.5817,0.3631],[0.5717,0.3567],[0.5617,0.3503],[0.5517,0.3408],[0.5417,0.3312],[0.5317,0.3217],[0.5217,0.3169],[0.5117,0.3105],[0.5017,0.3057],[0.4917,0.3137],[0.4817,0.3232],[0.4717,0.3248],[0.4617,0.3248],[0.4517,0.3169],[0.4417,0.3169],[0.4317,0.3232],[0.4217,0.3296],[0.4133,0.3392],[0.41,0.3487],[0.4,0.3551],[0.39,0.3567],[0.38,0.3646],[0.37,0.3694],[0.3683,0.379],[0.3717,0.3885],[0.37,0.3981],[0.3667,0.4076],[0.3683,0.4172],[0.3617,0.4268],[0.355,0.4363],[0.345,0.4427],[0.3367,0.4522],[0.3333,0.4618],[0.3283,0.4682],[0.3183,0.4745],[0.3083,0.4841]];
  // stops along the route (fraction of its length) and the two peaks that get a label (official heights)
  var STOPS = [{ s: 0.1 }, { s: 0.5 }, { s: 0.9 }];
  var PEAKS = [{ key: 'aragats', lon: 44.2, lat: 40.53, h: 4090 }, { key: 'ararat', lon: 44.298, lat: 39.702, h: 5137 }];

  var VERT = [
    'attribute float aE;',
    'varying vec2 vUv; varying float vE; varying float vD; varying vec3 vW;',
    'void main(){ vUv = uv; vE = aE; vW = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D tS;',
    'uniform vec3 uFog, uSunCol, uSunDir;',
    'uniform float uTime, uFogK;',
    'varying vec2 vUv; varying float vE; varying float vD; varying vec3 vW;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }',
    // the logo ramp, by elevation in metres
    'vec3 ramp(float e){',
    '  vec3 a = vec3(0.10, 0.50, 0.58), b = vec3(0.12, 0.63, 0.62), c = vec3(0.10, 0.73, 0.50), d = vec3(0.74, 0.85, 0.30), f = vec3(0.98, 0.88, 0.40), g = vec3(1.0, 0.97, 0.88);',
    '  vec3 o = mix(a, b, smoothstep(300., 1000., e));',
    '  o = mix(o, c, smoothstep(1000., 1900., e));',
    '  o = mix(o, d, smoothstep(1900., 2800., e));',
    '  o = mix(o, f, smoothstep(2800., 3600., e));',
    '  return mix(o, g, smoothstep(3600., 4600., e));',
    '}',
    'void main(){',
    '  vec4 t = texture2D(tS, vUv);',
    '  float sh = t.r, flow = t.g, ins = t.b, lake = smoothstep(.38, .62, t.a);',
    '  vec3 V = normalize(vW - cameraPosition);',
    '  float f = 1. - exp(-pow(vD * uFogK, 1.7));',
    '  float near = 1. - f;',
    '  sh = clamp(sh + (vn(vW.xz * 46.) - .5) * .16 * near + (vn(vW.xz * 150.) - .5) * .07 * near, 0., 1.);',
    '  vec3 col = ramp(vE);',
    '  col = mix(col * vec3(.60, .78, .88), col * 1.12, smoothstep(.04, .7, sh));',
    '  col = mix(col, vec3(1.), smoothstep(.74, 1., sh) * .22);',
    // contours: every 100 m, stronger every 500 m; fade with distance so they never turn to noise
    '  float c1 = vE / 100., c5 = vE / 500., w1 = fwidth(c1) + 1e-5, w5 = fwidth(c5) + 1e-5;',
    '  float l1 = (1. - smoothstep(0., 1.1, abs(fract(c1 - .5) - .5) / w1)) * (1. - smoothstep(.12, .4, w1));',
    '  float l5 = (1. - smoothstep(0., 1.4, abs(fract(c5 - .5) - .5) / w5)) * (1. - smoothstep(.12, .4, w5));',
    '  col = mix(col, vec3(.03, .20, .26), (l1 * .10 + l5 * .24) * near);',
    // rivers (flow accumulation) and lakes
    '  float rv = smoothstep(.30, .40, flow) * (1. - lake) * (.55 + .45 * smoothstep(.2, 1.2, vD));',
    '  col = mix(col, vec3(.03, .40, .82), rv * .9);',
    '  float sp = pow(max(dot(reflect(V, vec3(0., 1., 0.)), uSunDir), 0.), 60.);',
    '  vec3 water = mix(vec3(.02, .40, .58), vec3(.45, .78, .86), pow(1. - abs(V.y), 2.2) * .85);',
    '  water += uSunCol * sp * .9 + (vn(vW.xz * 90. + uTime * .6) - .5) * .06 * near;',
    '  col = mix(col, water, lake);',
    // outside the border: calmer and paler; the border itself is a fine ink line
    '  col = mix(mix(col, vec3(dot(col, vec3(.3, .55, .15))), .45), uFog, (1. - smoothstep(.3, .7, ins)) * .42);',
    '  float wb = fwidth(ins) * 1.5 + 1e-4;',
    '  col = mix(col, vec3(.02, .22, .28), (1. - smoothstep(0., wb, abs(ins - .5))) * .55 * smoothstep(.0, .55, near + .15));',
    // mist: toward the sun it glows yellow
    '  float sd = max(dot(V, uSunDir), 0.);',
    '  vec3 fog = mix(uFog, uSunCol, pow(sd, 5.) * .55);',
    '  gl_FragColor = vec4(mix(col, fog, f), 1.);',
    '}'
  ].join('\n');

  function create(host, opts) {
    opts = opts || {};
    var canvas = host.querySelector('[data-fl-gl]'); if (!canvas) return null;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
    var failed = false, ctxLost = false;
    renderer.debug.onShaderError = function () { failed = true; };
    // a WebGL context can be lost (GPU reset, many tabs); three.js restores it by itself, we only pause and re-check meanwhile
    canvas.addEventListener('webglcontextlost', function () { ctxLost = true; }, false);
    canvas.addEventListener('webglcontextrestored', function () { ctxLost = false; failed = false; last = 0; }, false);
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 1, 0.02, 24);
    var F = { p: 0, active: false, ok: false, ps: 0 };
    var w = 1, h = 1, dprMax = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.25 : 1.6), dpr = dprMax, last = 0, time = 0, slow = 0;
    var N = 480, pts = [], camY = [], gnd = [], gndFine = [], L = 1, mesh = null, mats = null, marks = [], stopWorld = [];
    var el = {
      alt: host.querySelector('[data-fl-alt]'), dist: host.querySelector('[data-fl-dist]'), title: host.querySelector('[data-fl-title]'),
      hint: host.querySelector('[data-fl-hint]'), hud: host.querySelector('[data-fl-hud]'), prof: host.querySelector('[data-fl-prof]'),
      end: host.querySelector('[data-fl-end]'), marks: host.querySelector('[data-fl-marks]'), sun: host.querySelector('.flight-st'),
      cards: [].slice.call(host.querySelectorAll('[data-fl-card]'))
    };
    var sep = opts.lang === 'ru' ? ' ' : ',';
    function fmt(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, sep); }

    function sample(a, u, v) {   // bilinear, u/v in 0..1
      var x = clamp(u * (W - 1), 0, W - 1.001), y = clamp(v * (H - 1), 0, H - 1.001), x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
      return mix(mix(a[i], a[i + 1], fx), mix(a[i + W], a[i + W + 1], fx), fy);
    }
    function cssColor(name, fallback) {
      var c = new THREE.Color(); try { var s = getComputedStyle(host).getPropertyValue(name).trim(); c.set(s || fallback); } catch (e) { c.set(fallback); } return c;
    }

    F.ready = GT.data().then(function (d) {
      var n = W * H, ph = d.ph, pd = d.pd, e = new Float32Array(n), ins = new Float32Array(n), lk = new Float32Array(n), i, x, y;
      for (i = 0; i < n; i++) { var q = ph[i * 4] / 255; e[i] = G.e0 + q * q * (G.e1 - G.e0); ins[i] = pd[i * 4 + 2] > 0 ? 1 : 0; lk[i] = pd[i * 4 + 1] > 128 ? 1 : 0; }
      var es = GT.blur5(GT.blur5(e, W, H), W, H), ec = GT.blur5(GT.blur5(es, W, H), W, H);
      var insB = GT.blur5(GT.blur5(ins, W, H), W, H), lkB = GT.blur5(lk, W, H);

      // baked hillshade (sun from the north-west, 35 degrees), flow, border mask, lake mask -> one RGBA texture
      var fN = new Float32Array(n); for (i = 0; i < n; i++) fN[i] = ph[i * 4 + 1] / 255;
      var fB = GT.blur5(fN, W, H);
      var tex = new Uint8Array(n * 4), PXM = 494, ZF = 2.4, Lx = -0.579, Ly = 0.574, Lz = -0.579;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x;
        var xa = x > 0 ? i - 1 : i, xb = x < W - 1 ? i + 1 : i, ya = y > 0 ? i - W : i, yb = y < H - 1 ? i + W : i;
        var gx = (es[xb] - es[xa]) / (2 * PXM) * ZF, gy = (es[yb] - es[ya]) / (2 * PXM) * ZF, il = 1 / Math.sqrt(gx * gx + 1 + gy * gy);
        var dt = (-gx * Lx + Ly - gy * Lz) * il;
        tex[i * 4] = clamp(0.5 + (dt - 0.574) * 1.5, 0, 1) * 255;
        tex[i * 4 + 1] = clamp(fB[i] * 2.6, 0, 1) * 255;
        tex[i * 4 + 2] = clamp(insB[i], 0, 1) * 255;
        tex[i * 4 + 3] = clamp(lkB[i], 0, 1) * 255;
      }
      var tS = new THREE.DataTexture(tex, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
      tS.magFilter = tS.minFilter = THREE.LinearFilter; tS.generateMipmaps = false; tS.needsUpdate = true;

      // the terrain mesh (half resolution; the texture carries the detail)
      var gxn = W >> 1, gyn = H >> 1, nv = (gxn + 1) * (gyn + 1), pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), ea = new Float32Array(nv), j, k = 0;
      for (j = 0; j <= gyn; j++) for (i = 0; i <= gxn; i++, k++) {
        var u = i / gxn, v = j / gyn, em = sample(es, u, v);
        pos[k * 3] = (u - 0.5) * WW; pos[k * 3 + 1] = em * EX; pos[k * 3 + 2] = (v - 0.5) * WD; uv[k * 2] = u; uv[k * 2 + 1] = v; ea[k] = em;
      }
      var idx = new Uint32Array(gxn * gyn * 6), m = 0;
      for (j = 0; j < gyn; j++) for (i = 0; i < gxn; i++) {
        var a = j * (gxn + 1) + i, b = a + 1, c = a + gxn + 1, dd = c + 1;
        idx[m++] = a; idx[m++] = c; idx[m++] = b; idx[m++] = b; idx[m++] = c; idx[m++] = dd;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aE', new THREE.BufferAttribute(ea, 1));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      var fogC = cssColor('--fl-fog', '#e8efe9'), sunC = cssColor('--fl-sun', '#f7db5d'), sunDir = new THREE.Vector3(-0.62, 0.34, -0.7).normalize();
      mats = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, uniforms: { tS: { value: tS }, uFog: { value: fogC }, uSunCol: { value: sunC }, uSunDir: { value: sunDir }, uTime: { value: 0 }, uFogK: { value: 0.22 } } });
      mesh = new THREE.Mesh(geo, mats); mesh.frustumCulled = false; scene.add(mesh);

      // the route as a smooth curve, sampled evenly; camera heights stay clear of the valley walls
      var rp = ROUTE.map(function (r) { return new THREE.Vector3((r[0] - 0.5) * WW, 0, (r[1] - 0.5) * WD); });
      var curve = new THREE.CatmullRomCurve3(rp, false, 'centripetal'); L = curve.getLength(); pts = curve.getSpacedPoints(N);
      var raw = [];
      for (i = 0; i <= N; i++) {
        var pu = pts[i].x / WW + 0.5, pv = pts[i].z / WD + 0.5, g0 = sample(ec, pu, pv), g1 = sample(es, pu, pv), wall = g1;
        for (k = -3; k <= 3; k++) { wall = Math.max(wall, sample(es, pu + k * 0.006, pv), sample(es, pu, pv + k * 0.006)); }
        gnd.push(g0); gndFine.push(g1);
        raw.push(Math.max(g0 * EX + 0.17, wall * EX + 0.07));
      }
      for (i = 0; i <= N; i++) { var sm = 0, cn = 0; for (k = -24; k <= 24; k++) { var q2 = clamp(i + k, 0, N); sm += raw[q2]; cn++; } camY.push(Math.max(sm / cn, raw[i] * 0.98)); }

      // markers: the three stops and two peaks, as small labelled dots that follow the 3D positions
      function addMark(cls, text, sub, wp) {
        var d1 = document.createElement('div'); d1.className = 'fl-mk ' + cls;
        d1.innerHTML = '<i></i><span>' + text + '<b>' + sub + '</b></span>'; el.marks && el.marks.appendChild(d1); marks.push({ el: d1, p: wp, kind: cls });
      }
      STOPS.forEach(function (st, si) {
        var pi = Math.round(st.s * N), p0 = pts[pi], eM = gndFine[pi];
        // the beacon stands beside the river (to the right of the direction of travel), so the camera never flies through it
        var pa = pts[Math.max(pi - 4, 0)], pb = pts[Math.min(pi + 4, N)], tx = pb.x - pa.x, tz = pb.z - pa.z, tl = Math.hypot(tx, tz) || 1;
        var bx = p0.x + (-tz / tl) * 0.22, bz = p0.z + (tx / tl) * 0.22, bg = sample(es, bx / WW + 0.5, bz / WD + 0.5);
        st.el = eM; stopWorld.push(new THREE.Vector3(bx, bg * EX, bz));
        var card = el.cards[si]; if (card) { var tgt = card.querySelector('[data-fl-el]'); if (tgt) tgt.textContent = fmt(eM) + ' ' + (opts.unitM || 'm'); }
        var base = new THREE.Vector3(bx, bg * EX, bz);
        var beacon = new THREE.Group();
        var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.42, 0)]), new THREE.LineBasicMaterial({ color: 0xf2c200, transparent: true, opacity: 0.9 }));
        var dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), new THREE.MeshBasicMaterial({ color: 0xf7db5d })); dot.position.y = 0.42;
        var ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 40), new THREE.MeshBasicMaterial({ color: 0xf2c200, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 5;
        beacon.add(ln, dot, ring); beacon.position.copy(base); scene.add(beacon); st.ring = ring;
      });
      PEAKS.forEach(function (pk) {
        var q3 = uvOf(pk.lon, pk.lat), ey = sample(es, q3[0], q3[1]);
        pk.world = new THREE.Vector3((q3[0] - 0.5) * WW, ey * EX + 0.02, (q3[1] - 0.5) * WD);
        addMark('is-peak', (opts.peaks && opts.peaks[pk.key]) || pk.key, fmt(pk.h) + ' ' + (opts.unitM || 'm'), pk.world);
      });
      var names = opts.stops || [];
      STOPS.forEach(function (st, si) { addMark('is-stop', names[si] || '', fmt(st.el) + ' ' + (opts.unitM || 'm'), stopWorld[si].clone().setY(stopWorld[si].y + 0.45)); });

      // elevation profile along the route
      if (el.prof) {
        var svg = el.prof.querySelector('svg'), lo = 1e9, hi = -1e9, VW = 800, VH = 80, line = '', ppts = 96;
        for (i = 0; i <= ppts; i++) { var gv = gndFine[Math.round(i / ppts * N)]; lo = Math.min(lo, gv); hi = Math.max(hi, gv); }
        for (i = 0; i <= ppts; i++) { var gv2 = gndFine[Math.round(i / ppts * N)]; line += (i ? 'L' : 'M') + (i / ppts * VW).toFixed(1) + ' ' + (6 + (1 - (gv2 - lo) / (hi - lo + 1)) * (VH - 12)).toFixed(1); }
        var pl = svg.querySelector('.fp-l'), pa = svg.querySelector('.fp-a');
        if (pl) pl.setAttribute('d', line); if (pa) pa.setAttribute('d', line + 'L' + VW + ' ' + VH + 'L0 ' + VH + 'Z');
        F.prof = { lo: lo, hi: hi, VH: VH, dot: el.prof.querySelector('.fp-dot'), lo_el: el.prof.querySelector('[data-fp-lo]'), hi_el: el.prof.querySelector('[data-fp-hi]') };
        if (F.prof.lo_el) F.prof.lo_el.textContent = fmt(lo) + ' ' + (opts.unitM || 'm'); if (F.prof.hi_el) F.prof.hi_el.textContent = fmt(hi) + ' ' + (opts.unitM || 'm');
        STOPS.forEach(function (st, si) { var tk = el.prof.querySelector('[data-fp-st="' + si + '"]'); if (tk) tk.style.left = (st.s * 100) + '%'; });
      }
      resize(); place(0);
      return firstFrame();
    });

    // the first picture decides whether the scene is usable: if the context was lost meanwhile, wait for its restore and try again
    function firstFrame() {
      return new Promise(function (res) {
        var tries = 0;
        (function go() {
          failed = false; renderer.render(scene, camera);
          setTimeout(function () {
            if (!failed && !ctxLost) { F.ok = true; return res(true); }
            if (++tries > 5) return res(false);
            setTimeout(go, ctxLost ? 500 : 150);
          }, 220);
        })();
      });
    }

    // ---------------------------------------------------------------- camera
    var tmp = new THREE.Vector3(), cp = new THREE.Vector3(), ct = new THREE.Vector3(), ar = null;
    function at(arr, f) { var i0 = Math.floor(f), i1 = Math.min(i0 + 1, N), fr = f - i0; return mix(arr[i0], arr[i1], fr); }
    function pt(f, out) { var i0 = Math.floor(f), i1 = Math.min(i0 + 1, N), fr = f - i0; return out.set(mix(pts[i0].x, pts[i1].x, fr), 0, mix(pts[i0].z, pts[i1].z, fr)); }
    function yaw(s) { var a = pt(clamp(s, 0, 1) * N, new THREE.Vector3()), b = pt(clamp(s + 0.02, 0, 1) * N, new THREE.Vector3()); return Math.atan2(b.x - a.x, -(b.z - a.z)); }
    var HV = new THREE.Vector3(), FW = new THREE.Vector3(), AD = new THREE.Vector3();
    function place(p) {
      var s = mix(p, p * p * (3 - 2 * p), 0.3), f = s * N;
      pt(f, cp); cp.y = at(camY, f) + (1 - sstep(0, 0.2, p)) * 0.85 + (1 - sstep(0.0, 0.05, p)) * 0.1;
      // heading: along the river a little ahead (frozen at the very end), pitch: eased from a high oblique view to a low glide
      var s0 = Math.min(s, 0.93); pt(s0 * N, tmp); pt(Math.min(s0 + 0.07, 1) * N, HV); HV.sub(tmp); HV.y = 0; if (HV.lengthSq() < 1e-8) HV.set(0, 0, -1); HV.normalize();
      var dy = (at(gndFine, Math.min(s + 0.05, 1) * N) - at(gndFine, f)) * EX / (0.05 * L);
      var pitch = -mix(0.31, 0.15, sstep(0, 0.28, p)) + clamp(Math.atan(dy) * 0.5, -0.1, 0.1);
      FW.set(HV.x * Math.cos(pitch), Math.sin(pitch), HV.z * Math.cos(pitch));
      // at the very end the view turns from the river toward Ararat
      var tw = sstep(0.86, 1, p);
      if (tw > 0 && PEAKS[1].world) { AD.copy(PEAKS[1].world).sub(cp).normalize(); FW.lerp(AD, tw).normalize(); }
      camera.position.copy(cp); ct.copy(cp).add(FW); camera.lookAt(ct);
      var roll = clamp(-(yaw(s + 0.03) - yaw(s - 0.03)) * 0.9, -0.14, 0.14) * (1 - tw);
      camera.rotateZ(roll);
      camera.fov = mix(46, 56, sstep(0.05, 0.3, p) * (1 - tw * 0.5)); camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      F.s = s; F.camAlt = cp.y / EX;
    }

    // ---------------------------------------------------------------- per-frame UI
    var lastAlt = -1, lastDist = -1;
    function ui(p) {
      var s = F.s;
      if (el.alt) { var a = Math.round(F.camAlt / 10) * 10; if (a !== lastAlt) { lastAlt = a; el.alt.textContent = fmt(a); } }
      if (el.dist) { var dk = Math.round(s * L * KM); if (dk !== lastDist) { lastDist = dk; el.dist.textContent = dk; } }
      if (el.title) { var o = 1 - sstep(0.015, 0.1, p); el.title.style.opacity = o; el.title.style.transform = 'translateY(' + (-p * 260).toFixed(1) + 'px)'; el.title.style.visibility = o < 0.01 ? 'hidden' : ''; }
      if (el.hint) el.hint.style.opacity = 1 - sstep(0.0, 0.035, p);
      if (el.hud) { var hv = sstep(0.04, 0.11, p) * (1 - sstep(0.93, 0.985, p)); el.hud.style.opacity = hv; el.prof && (el.prof.style.opacity = hv); }
      if (el.end) { var ev = sstep(0.9, 0.975, p); el.end.style.opacity = ev; el.end.style.visibility = ev < 0.01 ? 'hidden' : 'visible'; el.end.style.transform = 'translateY(' + ((1 - ev) * 24).toFixed(1) + 'px)'; }
      el.cards.forEach(function (c, i) { c.classList.toggle('is-on', Math.abs(s - STOPS[i].s) < 0.075 && p < 0.935); });
      if (F.prof && F.prof.dot) { F.prof.dot.style.left = (s * 100) + '%'; F.prof.dot.style.top = ((6 + (1 - (at(gndFine, s * N) - F.prof.lo) / (F.prof.hi - F.prof.lo + 1)) * (F.prof.VH - 12)) / F.prof.VH * 100) + '%'; }
      if (el.sun) { el.sun.style.setProperty('--sx', mix(72, 58, p).toFixed(1) + '%'); el.sun.style.setProperty('--sy', mix(60, 34, sstep(0, 0.9, p)).toFixed(1) + '%'); }
      // labels follow their 3D points
      marks.forEach(function (m) {
        tmp.copy(m.p).project(camera);
        var dist = camera.position.distanceTo(m.p), vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && dist > 0.25;
        var al = vis ? clamp(1 - (dist - 1.8) / 3.2, 0, 1) * clamp((dist - 0.25) / 0.6, 0, 1) : 0;
        if (m.kind === 'is-peak') al *= 0.9;
        m.el.style.opacity = al.toFixed(2); m.el.style.visibility = al < 0.02 ? 'hidden' : 'visible';
        if (al >= 0.02) m.el.style.transform = 'translate(' + ((tmp.x * 0.5 + 0.5) * w).toFixed(0) + 'px,' + ((-tmp.y * 0.5 + 0.5) * h).toFixed(0) + 'px)';
      });
    }

    function resize() {
      var cw = host.querySelector('.flight-st').clientWidth || window.innerWidth, ch = host.querySelector('.flight-st').clientHeight || window.innerHeight;
      if (cw === w && ch === h && renderer.getPixelRatio() === dpr) return;
      w = cw; h = ch; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    F.resize = resize;

    function tick() {
      if (!F.ok || !F.active || ctxLost || document.hidden) { last = 0; return; }
      var now = performance.now() / 1000, dt = last ? Math.min(now - last, 0.08) : 0.016; last = now; time += dt;
      F.ps += (F.p - F.ps) * Math.min(1, dt * 7);
      if (mats) mats.uniforms.uTime.value = time;
      place(F.ps); ui(F.ps);
      STOPS.forEach(function (st, si) { if (st.ring) { var k = (time * 0.5 + si * 0.3) % 1; st.ring.scale.setScalar(1 + k * 4); st.ring.material.opacity = (1 - k) * 0.7; } });
      renderer.render(scene, camera);
      // adaptive quality: if frames are slow for a while, draw fewer pixels
      if (dt > 0.034) slow++; else slow = Math.max(0, slow - 1);
      if (slow > 40 && dpr > 0.8) { dpr = Math.max(0.8, dpr - 0.25); slow = 0; resize(); }
    }
    gsap.ticker.add(tick);
    window.addEventListener('resize', function () { resize(); }, { passive: true });
    F.setActive = function (v) { F.active = !!v; if (v) { last = 0; resize(); } };
    F.setProgress = function (p) { F.p = clamp(p, 0, 1); };
    F.jump = function (p) { F.p = F.ps = clamp(p, 0, 1); };
    F.dispose = function () { gsap.ticker.remove(tick); try { renderer.dispose(); } catch (e) { } };
    return F;
  }
  window.GGFlight = { create: create };
})();
