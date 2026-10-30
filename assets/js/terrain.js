/* ==========================================================================
   GGTerrain — real-terrain WebGL scene (Armenia).
   Data: assets/data/geo.js (elevation tiles + hydrology computed offline by src/tools/build_geo.py)
   Features: hillshade, contour lines, graticule, rivers (flow accumulation), flood stage (HAND model),
             hydrology particles flowing down the real river network, province picking, 3D pins.
   ========================================================================== */
(function () {
  'use strict';
  var G = window.GG_GEO, THREE = window.THREE, gsap = window.gsap;
  if (!G || !THREE || !gsap) { window.GGTerrain = null; return; }

  var WORLD_W = 10, WORLD_D = WORLD_W / G.aspect, HS = 0.86;
  var W = G.w, H = G.h;
  var CODE = [[0, 0], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]; // [dy,dx]
  var LON0 = G.bbox[0], LAT0 = G.bbox[1], LON1 = G.bbox[2], LAT1 = G.bbox[3];
  function mercN(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }
  var Y0N = mercN(LAT1), Y1N = mercN(LAT0);
  function latOf(v) { var y = Y0N + v * (Y1N - Y0N); return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI; }
  function lonOf(u) { return LON0 + u * (LON1 - LON0); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function loadImg(uri) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = uri; });
  }
  function pixels(im) {
    var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  }
  function blur5(src, w, h) {
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = [1, 4, 6, 4, 1], x, y, i, s;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = -2; i <= 2; i++) s += k[i + 2] * src[y * w + clamp(x + i, 0, w - 1)];
      tmp[y * w + x] = s / 16;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = -2; i <= 2; i++) s += k[i + 2] * tmp[clamp(y + i, 0, h - 1) * w + x];
      out[y * w + x] = s / 16;
    }
    return out;
  }

  var VERT = [
    'varying vec2 vUv; varying float vDepth;',
    'void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D tH, tF, tI;',
    'uniform vec2 uTexel, uStep, uC;',
    'uniform float uE0, uE1, uHS, uTime, uStage, uContour, uColor, uDim, uRiver, uGrid, uHot, uHandMax, uAlpha, uHover, uReveal, uScan;',
    'uniform vec4 uLL;',
    'uniform vec3 uFog;',
    'varying vec2 vUv; varying float vDepth;',
    'float hg(vec2 p){ return texture2D(tH,p).r; }',
    'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
    'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }',
    'vec3 natural(float e){',
    '  vec3 c = vec3(.04,.13,.16);',
    '  c = mix(c, vec3(.07,.27,.32), smoothstep(500.,1300.,e));',
    '  c = mix(c, vec3(.12,.42,.50), smoothstep(1300.,2100.,e));',
    '  c = mix(c, vec3(.18,.50,.58), smoothstep(2100.,3000.,e));',
    '  c = mix(c, vec3(.46,.72,.78), smoothstep(3000.,3700.,e));',
    '  c = mix(c, vec3(.86,.95,.97), smoothstep(3700.,4600.,e));',
    '  return c; }',
    'vec3 mono(float e){',
    '  vec3 c = mix(vec3(.03,.11,.14), vec3(.10,.40,.47), smoothstep(300.,3000.,e));',
    '  return mix(c, vec3(.60,.82,.86), smoothstep(3200.,4800.,e)); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float h = hg(uv); float e = uE0 + h*(uE1-uE0);',
    '  float dx = hg(uv+vec2(uTexel.x,0.)) - hg(uv-vec2(uTexel.x,0.));',
    '  float dz = hg(uv+vec2(0.,uTexel.y)) - hg(uv-vec2(0.,uTexel.y));',
    '  vec3 n = normalize(vec3(-dx*uHS/(2.*uStep.x), 1., -dz*uHS/(2.*uStep.y)));',
    '  vec3 L = normalize(vec3(-.55,.62,-.5));',
    '  float sh = clamp(dot(n,L),0.,1.);',
    '  float slope = 1. - n.y;',
    '  vec4 f = texture2D(tF,uv);',
    '  float inside = f.a;',
    '  float rev = 1. - smoothstep(uReveal*1.55-.2, uReveal*1.55, length((uv-uC)*vec2(1.,1.04)));',
    '  float sc = smoothstep(.035,.0,abs(uv.x + uv.y*.45 - uScan));',
    '  vec3 col = mix(mono(e), natural(e), uColor);',
    '  col *= (.42 + 1.05*sh) * mix(.4,1.,rev);',
    '  col = mix(col, col*.55, clamp(slope*3.,0.,.6));',
    // province hover
    '  float pid = floor(texture2D(tI,uv).r*255./20.+.5);',
    '  float hot = (uHot>.5) ? step(abs(pid-uHot),.5) : 0.;',
    '  col += hot * vec3(.4,.8,.9) * .18;',
    // contour lines
    '  float fw = max(fwidth(e),1e-4);',
    '  float c1 = 1. - clamp(abs(fract(e/100.-.5)-.5)*100./fw*.9, 0., 1.);',
    '  float c5 = 1. - clamp(abs(fract(e/500.-.5)-.5)*500./fw*1.1, 0., 1.);',
    '  float lines = (c1*.28 + c5*.5) * uContour * (.35 + .65*inside) * smoothstep(60.,14.,fw*.5) * rev * (1. + sc*2.4);',
    '  col = mix(col, vec3(.50,.88,.95), clamp(lines*.8,0.,1.));',
    // graticule (0.5 deg)
    '  float lon = uLL.x + uv.x*(uLL.y-uLL.x);',
    '  float ym = uLL.z + uv.y*(uLL.w-uLL.z);',
    '  float lat = degrees(atan(sinh(3.14159265*(1.-2.*ym))));',
    '  float gl = abs(fract(lon*2.-.5)-.5)/(fwidth(lon)*2.);',
    '  float ga = abs(fract(lat*2.-.5)-.5)/(fwidth(lat)*2.);',
    '  float grid = (1.-clamp(min(gl,ga)*1.6,0.,1.)) * uGrid * rev;',
    '  col = mix(col, vec3(.8,.92,.94), grid*.14);',
    // rivers
    '  float rv = smoothstep(.10,.42,f.r) * uRiver * (.3+.7*inside) * rev * (1. + sc*1.8);',
    '  col = mix(col, vec3(.30,.85,.97), rv*.85);',
    // flood (HAND model)
    '  float hand = uHandMax * f.g * f.g;',
    '  float depth = uStage - hand;',
    '  float fl = smoothstep(-.15,.55,depth) * (.25+.75*inside);',
    '  float dd = clamp(depth/16.,0.,1.);',
    '  vec3 water = mix(vec3(.12,.58,.78), vec3(.02,.16,.30), dd);',
    '  float rip = vnoise(uv*vec2(520.,520.) + vec2(uTime*.16, -uTime*.11));',
    '  rip += .5*vnoise(uv*vec2(1100.,1100.) - vec2(uTime*.2, uTime*.08));',
    '  water += (rip-.75)*.16;',
    '  col = mix(col, water, fl*.86*step(.01,uStage));',
    '  float shore = (1.-smoothstep(0.,1.4,abs(depth))) * step(.01,uStage) * (.3+.7*inside);',
    '  col += vec3(.35,.8,.95)*shore*.26;',
    // scan glow
    '  col += vec3(.10,.55,.65) * sc * .09 * inside;',
    // lakes (always water)
    '  float lk = smoothstep(.35,.65,f.b);',
    '  vec3 lake = vec3(.10,.42,.58) + (vnoise(uv*vec2(420.,420.)+vec2(uTime*.05,0.))-.5)*.1;',
    '  col = mix(col, lake*(.7+.5*sh), lk*.92);',
    // outside Armenia: dim + desaturate
    '  float lum = dot(col,vec3(.299,.587,.114));',
    '  col = mix(vec3(lum)*.8, col, mix(.35,1.,inside));',
    '  col *= mix(.5,1.,inside);',
    // vignette / distance fog
    '  float edge = smoothstep(0.,.10,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));',
    '  float fog = smoothstep(7.,19.,vDepth);',
    '  col = mix(col, uFog, fog*.8);',
    '  col *= uDim;',
    '  gl_FragColor = vec4(col, edge*uAlpha);',
    '}'
  ].join('\n');

  var PVERT = [
    'attribute float aA; attribute float aS; uniform float uPx; uniform float uSize; varying float vA;',
    'void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = clamp(uSize * aS * uPx / max(-mv.z, .5), 1.5, 14.); }'
  ].join('\n');
  var PFRAG = [
    'precision mediump float; varying float vA; uniform float uOp;',
    'void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if(r>.5) discard;',
    '  float a = smoothstep(.5,.0,r); gl_FragColor = vec4(mix(vec3(.2,.85,1.), vec3(.9,1.,1.), a*a), a*vA*uOp); }'
  ].join('\n');

  var _data = null;
  function data() {
    if (!_data) _data = Promise.all([loadImg(G.tex_h), loadImg(G.tex_d)]).then(function (ims) { return { ph: pixels(ims[0]), pd: pixels(ims[1]), W: W, H: H, G: G }; });
    return _data;
  }

  function create(canvas, opts) {
    opts = opts || {};
    var mobile = window.matchMedia('(max-width: 800px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    var T = { s: null, ready: false, active: true, onPick: null, pins: [], hotPid: 0 };
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
    } catch (err) { return null; }
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    var DPRMAX = opts.dpr || (mobile ? 1.25 : 1.6);

    // live, tweenable state ---------------------------------------------------
    T.s = {
      cx: 0.4, cy: 6.4, cz: 8.6, tx: 0, ty: 0, tz: 0.4, fov: 32,
      stage: 0, contour: 1, color: 0, dim: 1, river: 1, grid: 0.6, borders: 0.6, pins: 0, particles: 1,
      labels: 0, shiftX: 0, par: 1, orbit: 1, alpha: 1, pulse: 1, reveal: 1, scan: 0
    };
    var mouse = { x: 0, y: 0, sx: 0, sy: 0, cx: -1, cy: -1, moved: false };
    var time = 0, last = 0, w = 1, h = 1;
    var hf = null, uniforms, mesh, pts, ptsPos, ptsA, ptsS, pdata, lines = [], pinObjs = [], labelEls = [], labelBox = null;
    var dirArr, flowArr, insideArr, pidArr, rivers = [];
    var raycaster = new THREE.Raycaster(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
    var NP = mobile ? 900 : 2400;

    function heightAt(u, v) { // normalized 0..1
      var x = clamp(u, 0, 1) * (W - 1), y = clamp(v, 0, 1) * (H - 1);
      var x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1), fx = x - x0, fy = y - y0;
      var a = hf[y0 * W + x0], b = hf[y0 * W + x1], c = hf[y1 * W + x0], d = hf[y1 * W + x1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
    function world(u, v, lift) { return new THREE.Vector3((u - 0.5) * WORLD_W, heightAt(u, v) * HS + (lift || 0), (v - 0.5) * WORLD_D); }

    T.elevationAt = function (u, v) { return G.e0 + heightAt(u, v) * (G.e1 - G.e0); };
    T.lonLat = function (u, v) { return { lon: lonOf(u), lat: latOf(v) }; };

    // ---- build ---------------------------------------------------------------
    T.ready = data().then(function (d) {
      var ph = d.ph, pd = d.pd, n = W * H, i;
      // elevation (m) -> smoothed -> normalised
      var e = new Float32Array(n);
      for (i = 0; i < n; i++) { var q = ph[i * 4] / 255; e[i] = q * q; }
      var sm = blur5(blur5(e, W, H), W, H);       // normalised (e - e0)/(e1 - e0), terraces smoothed away
      hf = sm;
      var u16 = new Uint16Array(n);
      for (i = 0; i < n; i++) u16[i] = THREE.DataUtils.toHalfFloat(sm[i]);
      var tH = new THREE.DataTexture(u16, W, H, THREE.RedFormat, THREE.HalfFloatType);
      tH.minFilter = tH.magFilter = THREE.LinearFilter; tH.wrapS = tH.wrapT = THREE.ClampToEdgeWrapping; tH.generateMipmaps = false; tH.needsUpdate = true;

      // flow / hand / lake / mask
      pidArr = new Uint8Array(n); dirArr = new Uint8Array(n); flowArr = new Uint8Array(n);
      var inside = new Float32Array(n), fdata = new Uint8Array(n * 4), idata = new Uint8Array(n * 4);
      for (i = 0; i < n; i++) {
        pidArr[i] = Math.round(pd[i * 4 + 2] / 20); dirArr[i] = Math.round(pd[i * 4] / 28); flowArr[i] = ph[i * 4 + 1];
        inside[i] = pidArr[i] > 0 ? 1 : 0;
      }
      var insB = blur5(blur5(inside, W, H), W, H);
      for (i = 0; i < n; i++) {
        fdata[i * 4] = ph[i * 4 + 1]; fdata[i * 4 + 1] = ph[i * 4 + 2]; fdata[i * 4 + 2] = pd[i * 4 + 1]; fdata[i * 4 + 3] = Math.round(clamp(insB[i], 0, 1) * 255);
        idata[i * 4] = pd[i * 4 + 2]; idata[i * 4 + 3] = 255;
      }
      var tF = new THREE.DataTexture(fdata, W, H, THREE.RGBAFormat); tF.minFilter = tF.magFilter = THREE.LinearFilter; tF.generateMipmaps = false; tF.needsUpdate = true;
      var tI = new THREE.DataTexture(idata, W, H, THREE.RGBAFormat); tI.minFilter = tI.magFilter = THREE.NearestFilter; tI.generateMipmaps = false; tI.needsUpdate = true;

      uniforms = {
        tH: { value: tH }, tF: { value: tF }, tI: { value: tI }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
        uStep: { value: new THREE.Vector2(WORLD_W / W, WORLD_D / H) }, uE0: { value: G.e0 }, uE1: { value: G.e1 }, uHS: { value: HS },
        uTime: { value: 0 }, uStage: { value: 0 }, uContour: { value: 1 }, uColor: { value: 0 }, uDim: { value: 1 }, uRiver: { value: 1 },
        uGrid: { value: 0.6 }, uHot: { value: 0 }, uHandMax: { value: G.hand_max }, uAlpha: { value: 1 }, uHover: { value: 0 },
        uLL: { value: new THREE.Vector4(LON0, LON1, Y0N, Y1N) }, uReveal: { value: 1 }, uScan: { value: -2 }, uC: { value: new THREE.Vector2(0.56, 0.47) }, uFog: { value: new THREE.Color(0x04161a) }
      };

      // terrain mesh (heights on the CPU so picking / pins / particles agree with what is drawn)
      var SX = Math.min(W - 1, mobile ? 220 : 380), SY = Math.round(SX * H / W), vx = SX + 1, vy = SY + 1;
      var pos = new Float32Array(vx * vy * 3), uvs = new Float32Array(vx * vy * 2), idx = new Uint32Array(SX * SY * 6), p = 0, t = 0, gx, gy;
      for (gy = 0; gy < vy; gy++) for (gx = 0; gx < vx; gx++) {
        var u = gx / SX, v = gy / SY, o = gy * vx + gx;
        pos[o * 3] = (u - 0.5) * WORLD_W; pos[o * 3 + 1] = heightAt(u, v) * HS; pos[o * 3 + 2] = (v - 0.5) * WORLD_D;
        uvs[o * 2] = u; uvs[o * 2 + 1] = v;
      }
      for (gy = 0; gy < SY; gy++) for (gx = 0; gx < SX; gx++) {
        var a = gy * vx + gx, b = a + 1, c = a + vx, d = c + 1;
        idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      var mat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: THREE.DoubleSide, extensions: { derivatives: true } });
      mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 1;
      mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);

      // border lines (draped)
      function drape(ring, mat2, loop) {
        var pts2 = [], k, steps, a1, b1, j;
        for (k = 0; k < ring.length / 2; k++) {
          var k2 = (k + 1) % (ring.length / 2); if (!loop && k2 === 0) break;
          a1 = [ring[k * 2], ring[k * 2 + 1]]; b1 = [ring[k2 * 2], ring[k2 * 2 + 1]];
          steps = Math.max(1, Math.ceil(Math.hypot((b1[0] - a1[0]) * WORLD_W, (b1[1] - a1[1]) * WORLD_D) / 0.06));
          for (j = 0; j < steps; j++) { var tt = j / steps; pts2.push(world(a1[0] + (b1[0] - a1[0]) * tt, a1[1] + (b1[1] - a1[1]) * tt, 0.012)); }
        }
        if (loop) pts2.push(pts2[0].clone());
        var g2 = new THREE.BufferGeometry().setFromPoints(pts2);
        var ln = new THREE.Line(g2, mat2); ln.frustumCulled = false; ln.renderOrder = 2; scene.add(ln); return ln;
      }
      var mProv = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
      var mCountry = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
      T.mProv = mProv; T.mCountry = mCountry;
      G.provinces.forEach(function (pr) { pr.rings.forEach(function (r) { drape(r, mProv, true); }); });
      G.country.forEach(function (r) { drape(r, mCountry, true); });

      // hydrology particles ------------------------------------------------------
      for (i = 0; i < n; i++) if (flowArr[i] >= 40 && pidArr[i] > 0) rivers.push(i);
      ptsPos = new Float32Array(NP * 3); ptsA = new Float32Array(NP); ptsS = new Float32Array(NP);
      pdata = { x: new Float32Array(NP), y: new Float32Array(NP), age: new Float32Array(NP), life: new Float32Array(NP), sp: new Float32Array(NP) };
      for (i = 0; i < NP; i++) respawn(i, true);
      var pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3)); pg.setAttribute('aA', new THREE.BufferAttribute(ptsA, 1)); pg.setAttribute('aS', new THREE.BufferAttribute(ptsS, 1));
      var pm = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 400 }, uSize: { value: 1 }, uOp: { value: 1 } }, vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 3; scene.add(pts);

      // pins -----------------------------------------------------------------------
      var pinGroup = new THREE.Group(); pinGroup.visible = false; scene.add(pinGroup); T.pinGroup = pinGroup;
      Object.keys(G.pins).forEach(function (key) {
        var uv2 = G.pins[key], base = world(uv2[0], uv2[1], 0.008);
        var g3 = new THREE.Group(); g3.position.copy(base);
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        stem.position.y = 0.21; g3.add(stem);
        var head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        head.position.y = 0.43; g3.add(head);
        var rings = [];
        for (var r = 0; r < 3; r++) {
          var ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.058, 48), new THREE.MeshBasicMaterial({ color: 0x3bb6c7, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; g3.add(ring); rings.push(ring);
        }
        pinGroup.add(g3); pinObjs.push({ key: key, g: g3, head: head, rings: rings, uv: uv2, top: new THREE.Vector3(base.x, base.y + 0.46, base.z) });
      });

      resize();
      T.ok = true;
      return T;
    });

    function respawn(i, initial) {
      var c = rivers[(Math.random() * rivers.length) | 0] || 0;
      pdata.x[i] = (c % W) + Math.random(); pdata.y[i] = ((c / W) | 0) + Math.random();
      pdata.age[i] = initial ? Math.random() * 10 : 0; pdata.life[i] = 7 + Math.random() * 9; pdata.sp[i] = 0.55 + Math.random() * 0.9;
    }
    function stepParticles(dt) {
      if (!pts || !rivers.length) return;
      var i, cx, cy, code, d, sp, k, o, u, v, lift = 0.01, fade;
      for (i = 0; i < NP; i++) {
        pdata.age[i] += dt;
        cx = pdata.x[i] | 0; cy = pdata.y[i] | 0;
        code = (cx >= 0 && cx < W && cy >= 0 && cy < H) ? dirArr[cy * W + cx] : 0;
        if (code === 0 || pdata.age[i] > pdata.life[i] || pidArr[cy * W + cx] === 0) { respawn(i, false); cx = pdata.x[i] | 0; cy = pdata.y[i] | 0; code = dirArr[cy * W + cx]; }
        d = CODE[code] || CODE[0];
        k = d[0] !== 0 && d[1] !== 0 ? 0.7071 : 1;
        sp = (3.2 + flowArr[cy * W + cx] / 255 * 9) * pdata.sp[i] * dt;
        pdata.x[i] += d[1] * k * sp; pdata.y[i] += d[0] * k * sp;
        u = pdata.x[i] / (W - 1); v = pdata.y[i] / (H - 1);
        o = i * 3;
        ptsPos[o] = (u - 0.5) * WORLD_W; ptsPos[o + 1] = heightAt(u, v) * HS + lift; ptsPos[o + 2] = (v - 0.5) * WORLD_D;
        fade = Math.min(pdata.age[i] / 0.8, 1, (pdata.life[i] - pdata.age[i]) / 1.2);
        ptsA[i] = Math.max(0, fade) * (0.35 + flowArr[cy * W + cx] / 255 * 0.65);
        ptsS[i] = 0.6 + flowArr[cy * W + cx] / 255 * 0.9;
      }
      var g = pts.geometry; g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true; g.attributes.aS.needsUpdate = true;
    }

    // ---- picking ---------------------------------------------------------------
    T.pick = function (clientX, clientY) {
      if (!hf) return null;
      var r = canvas.getBoundingClientRect();
      var nx = ((clientX - r.left) / r.width) * 2 - 1, ny = -((clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera({ x: nx, y: ny }, camera);
      var o = raycaster.ray.origin, d = raycaster.ray.direction, tt = 0.5, step = 0.06, prev = null, px, py, pz, u, v, y;
      for (var i = 0; i < 520; i++, tt += step) {
        px = o.x + d.x * tt; py = o.y + d.y * tt; pz = o.z + d.z * tt;
        u = px / WORLD_W + 0.5; v = pz / WORLD_D + 0.5;
        if (u < 0 || u > 1 || v < 0 || v > 1) { if (prev) break; continue; }
        y = heightAt(u, v) * HS;
        if (py <= y) {
          // refine
          var lo = tt - step, hi = tt;
          for (var k = 0; k < 8; k++) { var mid = (lo + hi) / 2, qx = o.x + d.x * mid, qy = o.y + d.y * mid, qz = o.z + d.z * mid; (qy <= heightAt(qx / WORLD_W + 0.5, qz / WORLD_D + 0.5) * HS) ? hi = mid : lo = mid; }
          px = o.x + d.x * hi; pz = o.z + d.z * hi; u = px / WORLD_W + 0.5; v = pz / WORLD_D + 0.5;
          var ix = clamp(Math.round(u * (W - 1)), 0, W - 1), iy = clamp(Math.round(v * (H - 1)), 0, H - 1);
          return { u: u, v: v, lon: lonOf(u), lat: latOf(v), elev: T.elevationAt(u, v), pid: pidArr[iy * W + ix] };
        }
        prev = true;
      }
      return null;
    };

    // ---- labels (projected HTML) ----------------------------------------------------
    T.attachLabels = function (box, lang, pinLabels, pinHref, onPin) {
      labelBox = box; box.innerHTML = '';
      G.provinces.forEach(function (pr) {
        var el = document.createElement('span'); el.className = 'map-label'; el.textContent = pr[lang] || pr.en; el.dataset.pid = pr.id;
        box.appendChild(el); labelEls.push({ el: el, uv: pr.c, pid: pr.id });
      });
      T.ready.then(function () {
        pinObjs.forEach(function (po) {
          var a = document.createElement('a'); a.className = 'map-pin'; a.href = pinHref[po.key] || '#'; a.dataset.pin = po.key;
          a.innerHTML = '<b></b><i></i>'; a.firstChild.textContent = pinLabels[po.key] || po.key; box.appendChild(a); po.el = a;
          a.addEventListener('mouseenter', function () { T.hotPin = po.key; if (onPin) onPin(po.key, true); });
          a.addEventListener('mouseleave', function () { T.hotPin = null; if (onPin) onPin(po.key, false); });
        });
      });
    };
    function project(vec, out) {
      tmpV2.copy(vec).project(camera);
      out.x = (tmpV2.x * 0.5 + 0.5) * w; out.y = (-tmpV2.y * 0.5 + 0.5) * h; out.z = tmpV2.z;
      return out;
    }
    var pr2 = { x: 0, y: 0, z: 0 };
    function updateLabels() {
      if (!labelBox) return;
      var vis = T.s.labels;
      labelBox.style.opacity = vis; labelBox.style.visibility = vis > 0.01 ? 'visible' : 'hidden';
      if (vis <= 0.01) return;
      var i;
      for (i = 0; i < labelEls.length; i++) {
        var L = labelEls[i], wv = world(L.uv[0], L.uv[1], 0.02); project(wv, pr2);
        L.el.style.transform = 'translate(' + (pr2.x | 0) + 'px,' + (pr2.y | 0) + 'px) translate(-50%,-50%)';
        L.el.classList.toggle('is-hot', T.hotPid === L.pid);
      }
      for (i = 0; i < pinObjs.length; i++) {
        var po = pinObjs[i]; if (!po.el) continue; project(po.top, pr2);
        po.el.style.transform = 'translate(' + (pr2.x | 0) + 'px,' + (pr2.y | 0) + 'px) translate(-50%,-100%)';
        po.el.classList.toggle('is-hot', T.hotPin === po.key);
      }
    }

    // ---- render loop ------------------------------------------------------------------
    function applyState() {
      var s = T.s;
      var asp = w / h, fv = s.fov;
      if (asp < 1) fv = Math.atan(Math.tan(fv * Math.PI / 360) / asp * 0.55) * 360 / Math.PI;   // portrait: keep Armenia's width in frame
      camera.fov = fv;
      var px = s.cx + mouse.sx * 0.55 * s.par, py = s.cy + mouse.sy * 0.28 * s.par, ang = Math.sin(time * 0.09) * 0.22 * s.orbit;
      var dx = px - s.tx, dz = s.cz - s.tz;
      camera.position.set(s.tx + dx * Math.cos(ang) + dz * Math.sin(ang), py, s.tz - dx * Math.sin(ang) + dz * Math.cos(ang));
      camera.lookAt(s.tx, s.ty, s.tz);
      if (s.shiftX && asp >= 0.9) camera.setViewOffset(w, h, -s.shiftX * w, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      var u = uniforms;
      u.uStage.value = s.stage; u.uContour.value = s.contour; u.uColor.value = s.color; u.uDim.value = s.dim; u.uRiver.value = s.river; u.uGrid.value = s.grid;
      u.uReveal.value = s.reveal; u.uScan.value = s.scan > 0.01 ? ((time * 0.13) % 2.4) - 0.5 : -2; u.uAlpha.value = s.alpha; u.uTime.value = time; u.uHot.value = T.hotPid || 0;
      T.mProv.opacity = s.borders * 0.8; T.mCountry.opacity = Math.min(1, s.borders + 0.25);
      pts.visible = s.particles > 0.01; pts.material.uniforms.uOp.value = s.particles;
      pts.material.uniforms.uPx.value = h * 0.5 / Math.tan(camera.fov * Math.PI / 360) * 0.012 * (renderer.getPixelRatio());
      T.pinGroup.visible = s.pins > 0.01;
      var pi, ri, k;
      for (pi = 0; pi < pinObjs.length; pi++) {
        var po = pinObjs[pi]; po.g.scale.setScalar(Math.max(0.001, s.pins));
        for (ri = 0; ri < 3; ri++) {
          k = ((time * 0.45 + ri / 3 + pi * 0.13) % 1);
          po.rings[ri].scale.setScalar(0.6 + k * 3.4); po.rings[ri].material.opacity = (1 - k) * 0.7 * s.pins;
        }
        po.head.scale.setScalar(T.hotPin === po.key ? 1.5 : 1);
      }
    }

    function resize() {
      var cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, DPRMAX);
      if (w === cw && h === ch && renderer.getPixelRatio() === dpr) return;
      w = cw; h = ch; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    T.resize = resize;

    var pickT = 0, hudCb = null;
    T.onHud = function (fn) { hudCb = fn; };
    function tick() {
      if (!T.ok || !T.active || document.hidden) { last = 0; return; }
      var now = performance.now() / 1000, dt = last ? Math.min(now - last, 0.05) : 0.016; last = now;
      time += dt;
      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 3); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 3);
      applyState();
      stepParticles(dt);
      renderer.render(scene, camera);
      updateLabels();
      pickT += dt;
      if (mouse.moved && pickT > 0.05 && (hudCb || T.onPick)) {
        pickT = 0; mouse.moved = false;
        var hit = T.pick(mouse.cx, mouse.cy);
        if (hudCb) hudCb(hit);
        if (T.onPick) T.onPick(hit);
      }
    }
    gsap.ticker.add(tick);

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', function (ev) {
      mouse.x = (ev.clientX / window.innerWidth) * 2 - 1; mouse.y = (ev.clientY / window.innerHeight) * 2 - 1;
      mouse.cx = ev.clientX; mouse.cy = ev.clientY; mouse.moved = true;
    }, { passive: true });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); T.active = false; }, false);
    canvas.addEventListener('webglcontextrestored', function () { T.active = true; }, false);

    T.onlyPins = function (keys) { T.ready.then(function () { pinObjs.forEach(function (po) { po.g.visible = keys.indexOf(po.key) >= 0; }); }); };
    T.set = function (patch) { Object.keys(patch).forEach(function (k) { T.s[k] = patch[k]; }); };
    T.to = function (patch, dur, ease) { return gsap.to(T.s, Object.assign({ duration: dur == null ? 1.6 : dur, ease: ease || 'power3.inOut', overwrite: 'auto' }, patch)); };
    T.setActive = function (v) { T.active = !!v; if (v) last = 0; else if (labelBox) { labelBox.style.visibility = 'hidden'; labelBox.style.opacity = 0; } };
    T.fmt = function (hit) {
      if (!hit) return null;
      var n = Math.round(hit.elev).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return { lat: Math.abs(hit.lat).toFixed(2) + '° N', lon: Math.abs(hit.lon).toFixed(2) + '° E', elev: n + ' m' };
    };
    T.renderer = renderer;
    return T;
  }

  window.GGTerrain = { create: create, data: data, blur5: blur5 };
})();
