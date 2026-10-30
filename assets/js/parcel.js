/* ==========================================================================
   GGParcel — the shapefile->DXF idea as a small 3D object: an extruded cadastral parcel with a building on it,
   vertices as DXF points. Lives inside the teal card on the Tools page (after the 3D compass card on cnrres.co.kr).
   ========================================================================== */
(function () {
  'use strict';
  var THREE = window.THREE, gsap = window.gsap;
  if (!THREE || !gsap) { window.GGParcel = null; return; }
  var PARCEL = [[70, 300], [108, 120], [290, 70], [430, 130], [452, 288], [330, 352]];
  var BUILD = [[190, 238], [190, 176], [262, 176], [262, 205], [318, 205], [318, 262], [246, 262], [246, 238]];
  function pt(p) { return new THREE.Vector2((p[0] - 262) / 100, -(p[1] - 212) / 100); }
  function shapeOf(arr) { var s = new THREE.Shape(arr.map(pt)); return s; }

  function create(canvas) {
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); } catch (e) { return null; }
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60), root = new THREE.Group(), flat = new THREE.Group();
    scene.add(root); root.add(flat); flat.rotation.x = -Math.PI / 2;
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var dl = new THREE.DirectionalLight(0xffffff, 1.15); dl.position.set(3, 6, 4); scene.add(dl);
    var rim = new THREE.PointLight(0x7fe9f5, 0.9, 30); rim.position.set(-4, 3, -3); scene.add(rim);

    function extrude(arr, depth, top, side, lift) {
      var geo = new THREE.ExtrudeGeometry(shapeOf(arr), { depth: depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
      var m = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ color: top, roughness: 0.45, metalness: 0.08 }), new THREE.MeshStandardMaterial({ color: side, roughness: 0.6, metalness: 0.05 })]);
      m.position.z = lift || 0; flat.add(m);
      var ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      ed.position.z = lift || 0; flat.add(ed);
      return m;
    }
    var land = extrude(PARCEL, 0.22, 0xe8f6f7, 0x9fd5dc, 0);
    var home = extrude(BUILD, 0.5, 0xf7db5d, 0xcfae2f, 0.22);
    // DXF vertices: a white bead and a thin leader line above every corner
    var beadM = new THREE.MeshBasicMaterial({ color: 0xffffff }), lineM = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), beads = [];
    PARCEL.concat(BUILD).forEach(function (p, i) {
      var v = pt(p), zTop = i < PARCEL.length ? 0.24 : 0.74;
      var b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), beadM); b.position.set(v.x, v.y, zTop + 0.18); flat.add(b); beads.push(b);
      var l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(v.x, v.y, zTop), new THREE.Vector3(v.x, v.y, zTop + 0.18)]), lineM); flat.add(l);
    });
    // fine grid under the parcel
    var grid = new THREE.GridHelper(9, 36, 0xffffff, 0xffffff); grid.material.transparent = true; grid.material.opacity = 0.14; grid.position.y = -0.02; root.add(grid);

    var P = { spin: 0, tiltX: 0, tiltY: 0, rise: 0 }, mouse = { x: 0, y: 0 }, w = 1, h = 1, time = 0, last = 0, active = true;
    function resize() {
      var cw = canvas.clientWidth || 600, ch = canvas.clientHeight || 600, dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      if (cw === w && ch === h) return; w = cw; h = ch; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    function tick() {
      if (!active || document.hidden) { last = 0; return; }
      var now = performance.now() / 1000, dt = last ? Math.min(now - last, 0.05) : 0.016; last = now; time += dt;
      var asp = w / h, R = Math.max(7.8, 3.6 / (Math.tan(15 * Math.PI / 180) * asp));
      camera.position.set(0, R * 0.62 + P.tiltY * 0.8, R * 0.78); camera.lookAt(0, 0.1, 0);
      root.rotation.y = P.spin + time * 0.22 + mouse.x * 0.35;
      root.rotation.x = -0.05 + mouse.y * 0.08;
      flat.scale.setScalar(0.2 + 0.8 * P.rise); home.scale.z = 0.2 + 0.8 * P.rise;
      beads.forEach(function (b, i) { b.position.z += Math.sin(time * 2 + i) * 0.0004; });
      renderer.render(scene, camera);
    }
    resize(); window.addEventListener('resize', resize, { passive: true });
    canvas.addEventListener('pointermove', function (e) { var r = canvas.getBoundingClientRect(); mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2; mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2; });
    canvas.addEventListener('pointerleave', function () { mouse.x = 0; mouse.y = 0; });
    gsap.ticker.add(tick);
    return { s: P, setActive: function (v) { active = !!v; if (v) last = 0; }, resize: resize };
  }
  window.GGParcel = { create: create };
})();
