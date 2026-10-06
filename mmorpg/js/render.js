'use strict';
// =====================================================================
//  3D-Darstellung (Three.js): Terrain, Vegetation, Gebäude, Figuren,
//  Effekte, Licht, Himmel, Wetter und 2D-Overlay für Namen/Zahlen
// =====================================================================
const U = 1 / 16;          // Logik-Pixel -> Welteinheiten (1 Kachel = 2 Einheiten)
const TU = TILE * U;
const GN = 2;              // Terrain-Vertices pro Kachel und Achse

const Render = {
  cv: null, ov: null, oc: null, W: 0, H: 0, renderer: null, scene: null, camera: null, sun: null, hemi: null, sky: null, stars: null,
  yaw: 0.4, pitch: 0.5, dist: 15, tdist: 15, first: false, cam: { x: 0, y: 0 },
  heights: null, gw: 0, gh: 0, chunkMeshes: [], vis: new Map(), frame: 0, tint: [1, 1, 1], tmpV: new THREE.Vector3(), ray: new THREE.Raycaster(),
  worldBuilt: false, menuT: 0, fogCol: new THREE.Color('#9fb7c8'),

  init(cv, ov) {
    this.cv = cv; this.ov = ov; this.oc = ov.getContext('2d');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.85;
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.3, 420);
    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#4a4030', 0.75); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff1d8', 1.25);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 220; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
    s.add(sun, sun.target);
    s.fog = new THREE.FogExp2('#9fb7c8', 0.0085);
    this.buildSky();
    const rs = () => {
      this.W = window.innerWidth; this.H = window.innerHeight;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelCap || 1.75)); r.setSize(this.W, this.H, false);
      cv.style.width = this.W + 'px'; cv.style.height = this.H + 'px';
      ov.width = this.W; ov.height = this.H; this.camera.aspect = this.W / this.H; this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', rs); rs();
    this.buildFx();
    let q = 'high'; try { q = localStorage.getItem('aethermoor_gfx') || 'high'; } catch (e) { /* egal */ }
    this.setQuality(q);
  },

  setQuality(q) {
    this.quality = q; try { localStorage.setItem('aethermoor_gfx', q); } catch (e) { /* egal */ }
    const r = this.renderer, cfg = { low: [0, 1, 1, 95], medium: [1024, 1.25, 1, 125], high: [2048, 1.75, 1, 150] }[q] || [2048, 1.75, 1, 150];
    r.shadowMap.enabled = cfg[0] > 0; this.sun.castShadow = cfg[0] > 0;
    if (cfg[0] > 0) { this.sun.shadow.mapSize.set(cfg[0], cfg[0]); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.pixelCap = cfg[1]; this.viewDist = cfg[3];
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    window.dispatchEvent(new Event('resize'));
  },

  // ---------- Himmel ----------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#4a86d0') }, bot: { value: new THREE.Color('#bcd4e8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.4+0.12, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(h,0.7)), 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(360, 24, 14), mat); this.sky.renderOrder = -10; this.scene.add(this.sky);
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, e = Math.acos(Math.random() * 0.95 + 0.04); pos[i * 3] = Math.sin(e) * Math.cos(a) * 340; pos[i * 3 + 1] = Math.cos(e) * 340; pos[i * 3 + 2] = Math.sin(e) * Math.sin(a) * 340; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    // Mond/Sonne-Sprites
    const mk = (c1, c2) => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 128; const x = cv2.getContext('2d'); const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, c1); gr.addColorStop(0.25, c1); gr.addColorStop(1, c2); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv2); };
    this.sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: mk('rgba(255,244,214,1)', 'rgba(255,200,120,0)'), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunSpr.scale.set(90, 90, 1); this.scene.add(this.sunSpr);
    this.moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: mk('rgba(210,225,255,1)', 'rgba(120,150,255,0)'), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.moonSpr.scale.set(50, 50, 1); this.scene.add(this.moonSpr);
  },

  // ---------- Effekte (Pools) ----------
  buildFx() {
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.glowTex = glowTex;
    this.projPool = []; this.ringPool = []; this.telePool = [];
    const MAXP = 1500, pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAXP * 3); this.pCol = new Float32Array(MAXP * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.parts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex }));
    this.parts.frustumCulled = false; this.scene.add(this.parts); this.MAXP = MAXP;
    // Wetter
    const WN = 700, wg = new THREE.BufferGeometry(); this.wPos = new Float32Array(WN * 3); this.wN = WN;
    for (let i = 0; i < WN; i++) { this.wPos[i * 3] = Math.random() * 60 - 30; this.wPos[i * 3 + 1] = Math.random() * 25; this.wPos[i * 3 + 2] = Math.random() * 60 - 30; }
    wg.setAttribute('position', new THREE.BufferAttribute(this.wPos, 3));
    this.weather = new THREE.Points(wg, new THREE.PointsMaterial({ size: 0.22, color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, map: glowTex }));
    this.weather.frustumCulled = false; this.scene.add(this.weather);
    // Zielring
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.targetRing.rotation.x = -Math.PI / 2; this.targetRing.visible = false; this.scene.add(this.targetRing);
    this.clickMark = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24), new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.clickMark.rotation.x = -Math.PI / 2; this.clickMark.visible = false; this.scene.add(this.clickMark);
  },

  // ---------- Terrain ----------
  terrainH(x, y) {
    const tx = clamp(Math.floor(x), 0, MW - 1), ty = clamp(Math.floor(y), 0, MH - 1), i = ty * MW + tx;
    const z = World.zone[i], t = World.tile[i];
    if (t === TT.WATER) return -1.3;
    if (t === TT.LAVA) return -0.9;
    let n = fbm(x * 0.045, y * 0.045, 21), h = (n - 0.5) * 7;
    const m = [0.9, 1.4, 0.3, 1.5, 2.8, 1.8, 0.6][z];
    h *= m;
    if (z === 3) h += Math.sin(x * 0.35 + fbm(x * 0.05, y * 0.05, 3) * 8) * 0.6;
    for (const hb of HUBS) { const d = Math.hypot(x - hb.x, y - hb.y); if (d < 20) h *= clamp((d - 11) / 8, 0, 1); }
    for (const l of World.lairs) { const d = Math.hypot(x - l.x, y - l.y); if (d < 11) h *= clamp((d - 5) / 6, 0, 1); }
    if (t === TT.ROAD || t === TT.TRAIL) h *= 0.35;
    const edge = Math.min(x, y, MW - x, MH - y);
    if (edge < 7) h += (7 - edge) * 1.3;
    return h;
  },
  heightAt(xu, zu) {
    const gx = clamp(xu * GN / TU, 0, this.gw - 1.001), gz = clamp(zu * GN / TU, 0, this.gh - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, H = this.heights, w = this.gw;
    return (H[j * w + i] * (1 - fx) + H[j * w + i + 1] * fx) * (1 - fz) + (H[(j + 1) * w + i] * (1 - fx) + H[(j + 1) * w + i + 1] * fx) * fz;
  },
  groundAtPx(x, y) { return this.heightAt(x * U, y * U); },

  detailTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) { const v = 170 + Math.random() * 85; x.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.5})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    for (let i = 0; i < 700; i++) { x.strokeStyle = `rgba(120,120,120,${Math.random() * 0.25})`; x.beginPath(); const px = Math.random() * 256, py = Math.random() * 256; x.moveTo(px, py); x.lineTo(px + Math.random() * 3 - 1.5, py - 3 - Math.random() * 6); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  },

  buildTerrain() {
    const gw = this.gw = MW * GN + 1, gh = this.gh = MH * GN + 1;
    // Kachelfarben
    const tc = new Float32Array(MW * MH * 3), col = new THREE.Color();
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const i = ty * MW + tx, z = World.zone[i], t = World.tile[i], v = World.vari[i];
      col.set(ZONES[z].g[v & 3]);
      let r = col.r, g = col.g, b = col.b;
      const mix = (c2, k) => { r += (c2[0] - r) * k; g += (c2[1] - g) * k; b += (c2[2] - b) * k; };
      if (z === 0) mix([0.2, 0.36, 0.12], 0.5); if (z === 1) mix([0.09, 0.24, 0.09], 0.5); if (z === 5) mix([0.12, 0.07, 0.07], 0.3);
      if (t === TT.ROAD) { const plaza = HUBS.some(hb => Math.hypot(tx - hb.x, ty - hb.y) <= 4.6); if (plaza) { r = g = b = 0.34 + (v & 7) * 0.01; } else { r = 0.6; g = 0.5; b = 0.34; } }
      else if (t === TT.TRAIL) { r = 0.5; g = 0.43; b = 0.3; }
      else if (t === TT.MUD) { r = 0.27; g = 0.22; b = 0.14; }
      else if (t === TT.WATER) { if (z === 2) { r = 0.14; g = 0.2; b = 0.14; } else { r = 0.45; g = 0.42; b = 0.32; } }
      else if (t === TT.LAVA) { r = 0.12; g = 0.05; b = 0.04; }
      else if (t === TT.BUILD) { r = 0.42; g = 0.36; b = 0.27; }
      else if (z === 4 && v > 165) mix([0.95, 0.97, 1], 0.7);
      const dk = z === 3 ? 0.7 : z === 4 ? 0.85 : 0.82; if (t !== TT.WATER && t !== TT.LAVA) { r *= dk; g *= dk; b *= dk; }
      tc[i * 3] = r; tc[i * 3 + 1] = g; tc[i * 3 + 2] = b;
    }
    // Höhen
    let H = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) H[j * gw + i] = this.terrainH(i / GN, j / GN);
    for (let pass = 0; pass < 2; pass++) {
      const H2 = new Float32Array(H.length);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        let s = 0, c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue; const w = di === 0 && dj === 0 ? 2 : 1; s += H[jj * gw + ii] * w; c += w; }
        H2[j * gw + i] = s / c;
      }
      H = H2;
    }
    this.heights = H;
    const pos = new Float32Array(gw * gh * 3), colr = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2);
    const sample = (x, y, k) => { // bilinear über Kachelfarben
      const fx = clamp(x - 0.5, 0, MW - 1.001), fy = clamp(y - 0.5, 0, MH - 1.001), i0 = Math.floor(fx), j0 = Math.floor(fy), ax = fx - i0, ay = fy - j0;
      const a = tc[(j0 * MW + i0) * 3 + k], b = tc[(j0 * MW + i0 + 1) * 3 + k], c = tc[((j0 + 1) * MW + i0) * 3 + k], d = tc[((j0 + 1) * MW + i0 + 1) * 3 + k];
      return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
    };
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i, x = i / GN, y = j / GN, nz = (hash2(i, j, 77) - 0.5) * 0.07;
      pos[k * 3] = i * TU / GN; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = j * TU / GN;
      colr[k * 3] = clamp(sample(x, y, 0) + nz, 0, 1); colr[k * 3 + 1] = clamp(sample(x, y, 1) + nz, 0, 1); colr[k * 3 + 2] = clamp(sample(x, y, 2) + nz, 0, 1);
      uv[k * 2] = pos[k * 3] / 7; uv[k * 2 + 1] = pos[k * 3 + 2] / 7;
    }
    const idx = new Uint32Array((gw - 1) * (gh - 1) * 6); let p = 0;
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) { const a = j * gw + i, b = a + 1, c = a + gw, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // Steile Hänge -> Fels
    const nor = g.attributes.normal;
    for (let k = 0; k < gw * gh; k++) {
      const ny = nor.getY(k);
      if (ny < 0.86) { const t = clamp((0.86 - ny) * 4, 0, 0.8), zone = World.zone[clamp(Math.floor(pos[k * 3 + 2] / TU), 0, MH - 1) * MW + clamp(Math.floor(pos[k * 3] / TU), 0, MW - 1)]; const rock = zone === 4 ? [0.5, 0.52, 0.56] : zone === 5 ? [0.2, 0.15, 0.15] : [0.38, 0.35, 0.3]; for (let q = 0; q < 3; q++) colr[k * 3 + q] += (rock[q] - colr[k * 3 + q]) * t; }
    }
    g.attributes.color.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detailTexture(), roughness: 1, metalness: 0 });
    const terrain = new THREE.Mesh(g, m); terrain.receiveShadow = true; terrain.frustumCulled = false; this.scene.add(terrain); this.terrain = terrain;
    // Wasser & Lava
    const wq = [], wc = [], lq = [];
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const t = World.tile[ty * MW + tx]; if (t !== TT.WATER && t !== TT.LAVA) continue;
      (t === TT.WATER ? wq : lq).push([tx, ty]);
      if (t === TT.WATER) wc.push(World.zone[ty * MW + tx] === 2 ? [0.16, 0.3, 0.22] : [0.1, 0.35, 0.55]);
    }
    const quadMesh = (list, y, colorsFn) => {
      const P = new Float32Array(list.length * 12), C = new Float32Array(list.length * 12), I = new Uint32Array(list.length * 6), UV = new Float32Array(list.length * 8);
      list.forEach(([tx, ty], n) => {
        const x0 = tx * TU, z0 = ty * TU, x1 = x0 + TU, z1 = z0 + TU, o = n * 12;
        P.set([x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1], o);
        const c = colorsFn(n); for (let q = 0; q < 4; q++) { C[o + q * 3] = c[0]; C[o + q * 3 + 1] = c[1]; C[o + q * 3 + 2] = c[2]; }
        UV.set([x0 / 6, z0 / 6, x1 / 6, z0 / 6, x0 / 6, z1 / 6, x1 / 6, z1 / 6], n * 8);
        I.set([n * 4, n * 4 + 2, n * 4 + 1, n * 4 + 1, n * 4 + 2, n * 4 + 3], n * 6);
      });
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(P, 3)); gg.setAttribute('color', new THREE.BufferAttribute(C, 3)); gg.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); gg.setIndex(new THREE.BufferAttribute(I, 1)); gg.computeVertexNormals(); return gg;
    };
    const rip = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#d0d8e0'; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2; for (let i = 0; i < 18; i++) { x.beginPath(); const px = Math.random() * 128, py = Math.random() * 128; x.ellipse(px, py, 6 + Math.random() * 12, 2 + Math.random() * 3, 0, 0, TAU); x.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    this.rip = rip;
    if (wq.length) { this.water = new THREE.Mesh(quadMesh(wq, -0.28, n => wc[n]), new THREE.MeshStandardMaterial({ vertexColors: true, map: rip, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.25 })); this.water.receiveShadow = true; this.water.frustumCulled = false; this.scene.add(this.water); }
    const lavaTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#ff6a1a'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,210,70' : '150,30,5'},${0.3 + Math.random() * 0.5})`; x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 12, 3 + Math.random() * 8, Math.random() * 3, 0, TAU); x.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
    this.lavaTex = lavaTex;
    if (lq.length) { this.lava = new THREE.Mesh(quadMesh(lq, -0.2, () => [1, 1, 1]), new THREE.MeshBasicMaterial({ vertexColors: true, map: lavaTex, color: '#ffb070' })); this.lava.frustumCulled = false; this.scene.add(this.lava); }
  },

  // ---------- Vegetation & Objekte ----------
  mergeParts(parts) {
    let n = 0; const gs = parts.map(p => { const g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); g.applyMatrix4(p.m); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    gs.forEach((g, k) => {
      const c = new THREE.Color(parts[k].c), cnt = g.attributes.position.count, p = g.attributes.position, nn = g.attributes.normal, ymin = parts[k].shade || 0;
      for (let i = 0; i < cnt; i++) {
        pos[(o + i) * 3] = p.getX(i); pos[(o + i) * 3 + 1] = p.getY(i); pos[(o + i) * 3 + 2] = p.getZ(i);
        nor[(o + i) * 3] = nn.getX(i); nor[(o + i) * 3 + 1] = nn.getY(i); nor[(o + i) * 3 + 2] = nn.getZ(i);
        const sh = 1 - ymin * 0.5 + ymin * 0.5 * clamp(p.getY(i) / 3, 0, 1) * 2;
        col[(o + i) * 3] = c.r * sh; col[(o + i) * 3 + 1] = c.g * sh; col[(o + i) * 3 + 2] = c.b * sh;
      }
      o += cnt;
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  },
  objGeos() {
    const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));
    const ico = (d = 1) => new THREE.IcosahedronGeometry(1, d), cylG = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s), coneG = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
    const G = {};
    G.broad = this.mergeParts([{ g: cylG(0.14, 0.24, 2.0), m: M(0, 1, 0), c: '#5a3f24' }, { g: ico(), m: M(0, 2.9, 0, 1.55, 1.25, 1.55), c: '#3f8f35', shade: 1 }, { g: ico(), m: M(0.8, 2.4, 0.3, 1.0, 0.85, 1.0), c: '#4a9c3b', shade: 1 }, { g: ico(), m: M(-0.7, 2.5, -0.4, 1.05, 0.9, 1.05), c: '#36822f', shade: 1 }, { g: ico(), m: M(0.1, 3.7, -0.1, 0.9, 0.8, 0.9), c: '#55a844', shade: 1 }]);
    G.pine = this.mergeParts([{ g: cylG(0.12, 0.22, 1.4), m: M(0, 0.7, 0), c: '#4a3320' }, { g: coneG(1.5, 2.0, 8), m: M(0, 2.0, 0), c: '#245a2c', shade: 1 }, { g: coneG(1.2, 1.8, 8), m: M(0, 3.2, 0), c: '#2a652f', shade: 1 }, { g: coneG(0.85, 1.6, 8), m: M(0, 4.3, 0), c: '#2f7034', shade: 1 }, { g: coneG(0.45, 1.0, 7), m: M(0, 5.2, 0), c: '#357a38' }]);
    G.snowpine = this.mergeParts([{ g: cylG(0.12, 0.22, 1.4), m: M(0, 0.7, 0), c: '#4a3a2a' }, { g: coneG(1.5, 2.0, 8), m: M(0, 2.0, 0), c: '#2c5a4c', shade: 1 }, { g: coneG(1.2, 1.8, 8), m: M(0, 3.2, 0), c: '#2c5a4c', shade: 1 }, { g: coneG(0.85, 1.6, 8), m: M(0, 4.3, 0), c: '#2c5a4c', shade: 1 }, { g: coneG(1.15, 1.2, 8), m: M(0, 2.55, 0), c: '#f2f8ff' }, { g: coneG(0.88, 1.0, 8), m: M(0, 3.7, 0), c: '#f2f8ff' }, { g: coneG(0.55, 0.9, 8), m: M(0, 4.85, 0), c: '#f2f8ff' }]);
    G.dead = this.mergeParts([{ g: cylG(0.1, 0.28, 3.4, 5), m: M(0, 1.7, 0, 1, 1, 1, 0, 0.1), c: '#6a5a48' }, { g: cylG(0.05, 0.12, 1.8, 4), m: M(0.7, 2.5, 0, 1, 1, 1, 0, -0.9), c: '#6a5a48' }, { g: cylG(0.04, 0.1, 1.5, 4), m: M(-0.6, 2.9, 0.2, 1, 1, 1, 0.2, 0.9), c: '#6a5a48' }, { g: cylG(0.03, 0.08, 1.2, 4), m: M(0.2, 3.4, -0.4, 1, 1, 1, -0.6, -0.3), c: '#6a5a48' }]);
    G.cactus = this.mergeParts([{ g: cylG(0.3, 0.34, 2.4, 8), m: M(0, 1.2, 0), c: '#3f8a4a' }, { g: new THREE.SphereGeometry(0.3, 8, 6), m: M(0, 2.4, 0), c: '#4a9a55' }, { g: cylG(0.17, 0.17, 0.8, 6), m: M(-0.55, 1.4, 0, 1, 1, 1, 0, Math.PI / 2), c: '#3f8a4a' }, { g: cylG(0.17, 0.17, 0.9, 6), m: M(-0.85, 1.85, 0), c: '#3f8a4a' }, { g: cylG(0.17, 0.17, 0.8, 6), m: M(0.55, 1.0, 0, 1, 1, 1, 0, Math.PI / 2), c: '#3f8a4a' }, { g: cylG(0.17, 0.17, 0.8, 6), m: M(0.85, 1.4, 0), c: '#3f8a4a' }]);
    G.rock = this.mergeParts([{ g: new THREE.DodecahedronGeometry(1, 0), m: M(0, 0.55, 0, 1.15, 0.9, 1.0), c: '#7a7a80', shade: 1 }, { g: new THREE.DodecahedronGeometry(1, 0), m: M(0.7, 0.35, 0.4, 0.65, 0.55, 0.65), c: '#6c6c72' }, { g: new THREE.DodecahedronGeometry(1, 0), m: M(-0.6, 0.3, -0.5, 0.55, 0.5, 0.55), c: '#85858c' }]);
    G.wall = this.mergeParts([{ g: new THREE.BoxGeometry(2, 2.6, 2), m: M(0, 1.3, 0), c: '#6a6275', shade: 1 }, { g: new THREE.BoxGeometry(2.1, 0.25, 2.1), m: M(0, 2.7, 0), c: '#7c7488' }, { g: new THREE.BoxGeometry(0.5, 0.4, 0.5), m: M(-0.7, 3.0, -0.7), c: '#7c7488' }, { g: new THREE.BoxGeometry(0.5, 0.4, 0.5), m: M(0.7, 3.0, 0.7), c: '#7c7488' }]);
    G.pillar = this.mergeParts([{ g: cylG(0.45, 0.5, 4.5, 8), m: M(0, 2.25, 0), c: '#5a4f78', shade: 1 }, { g: new THREE.BoxGeometry(1.3, 0.4, 1.3), m: M(0, 4.7, 0), c: '#6a5f8a' }, { g: new THREE.BoxGeometry(1.3, 0.4, 1.3), m: M(0, 0.2, 0), c: '#6a5f8a' }]);
    G.tuft = this.mergeParts([{ g: coneG(0.07, 0.55, 3), m: M(0, 0.27, 0, 1, 1, 1, 0.2, 0), c: '#6fb04a' }, { g: coneG(0.07, 0.7, 3), m: M(0.1, 0.35, 0.05, 1, 1, 1, -0.15, 0.15), c: '#5da040' }, { g: coneG(0.06, 0.5, 3), m: M(-0.1, 0.25, -0.06, 1, 1, 1, 0.1, -0.2), c: '#7cc055' }, { g: coneG(0.06, 0.6, 3), m: M(0.02, 0.3, -0.12, 1, 1, 1, -0.25, 0), c: '#68a845' }]);
    G.flower = this.mergeParts([{ g: cylG(0.015, 0.015, 0.35, 3), m: M(0, 0.17, 0), c: '#4a8a3a' }, { g: new THREE.IcosahedronGeometry(0.1, 0), m: M(0, 0.38, 0), c: '#ffffff' }, { g: cylG(0.015, 0.015, 0.28, 3), m: M(0.2, 0.14, 0.1), c: '#4a8a3a' }, { g: new THREE.IcosahedronGeometry(0.08, 0), m: M(0.2, 0.3, 0.1), c: '#ffffff' }]);
    G.bone = this.mergeParts([{ g: new THREE.BoxGeometry(0.7, 0.07, 0.09), m: M(0, 0.04, 0, 1, 1, 1, 0, 0.1), c: '#e4dcc4' }, { g: new THREE.SphereGeometry(0.14, 6, 5), m: M(0.3, 0.1, 0.2), c: '#d8d0b8' }, { g: new THREE.BoxGeometry(0.5, 0.06, 0.08), m: M(-0.1, 0.04, 0.3, 1, 1, 1, 0.4, 0), c: '#e4dcc4' }]);
    return G;
  },
  buildObjects() {
    const geos = this.objGeos(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const lists = {}, q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4(), col = new THREE.Color();
    const add = (type, cx, cz, x, y, z, sc, sy, ry, tint, zone) => {
      const k = type + '|' + cx + '|' + cz; (lists[k] = lists[k] || { type, cx, cz, items: [] }).items.push({ x, y, z, sc, sy, ry, tint, zone });
    };
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const i = ty * MW + tx, t = World.tile[i], z = World.zone[i], h1 = hash2(tx, ty, 31), h2 = hash2(tx, ty, 32), h3 = hash2(tx, ty, 33);
      const cx = tx >> 4, cz = ty >> 4;
      const px = (tx + 0.5 + (h1 - 0.5) * 0.5) * TU, pz = (ty + 0.5 + (h2 - 0.5) * 0.5) * TU, py = this.heightAt(px, pz);
      const edge = Math.min(tx, ty, MW - 1 - tx, MH - 1 - ty);
      switch (t) {
        case TT.TREE: { const type = z === 0 ? 'broad' : z === 1 ? (h3 < 0.28 ? 'broad' : 'pine') : z === 4 ? 'snowpine' : 'pine'; add(type, cx, cz, px, py, pz, 0.85 + h3 * 0.7, 0.9 + h1 * 0.5, h2 * TAU, 0.85 + h1 * 0.3); break; }
        case TT.DEAD: add('dead', cx, cz, px, py, pz, 0.9 + h3 * 0.5, 1, h2 * TAU, z === 5 ? 0.35 : 0.9 + h1 * 0.2); break;
        case TT.CACT: add('cactus', cx, cz, px, py, pz, 0.8 + h3 * 0.6, 1, h2 * TAU, 0.9 + h1 * 0.2); break;
        case TT.ROCK: { const big = edge < 6 || z === 4; const s = big ? 1.3 + h3 * 1.5 : 0.8 + h3 * 0.7; const tint = z === 4 ? 1.15 : z === 5 ? 0.45 : z === 3 ? 1.3 : 0.9 + h1 * 0.3; add('rock', cx, cz, px, py - 0.1, pz, s, big ? 1 + h1 * 1.6 : 1, h2 * TAU, tint, z); break; }
        case TT.WALL: add('wall', cx, cz, (tx + 0.5) * TU, this.heightAt((tx + 0.5) * TU, (ty + 0.5) * TU), (ty + 0.5) * TU, 1, 0.85 + h1 * 0.5, 0, 0.9 + h2 * 0.2); break;
        case TT.PILL: add('pillar', cx, cz, (tx + 0.5) * TU, this.heightAt((tx + 0.5) * TU, (ty + 0.5) * TU), (ty + 0.5) * TU, 1, 1, 0, 1); break;
        case TT.FLOWER: for (let k = 0; k < 3; k++) add('flower', cx, cz, px + (hash2(tx, ty, 50 + k) - 0.5) * 1.6, py, pz + (hash2(tx, ty, 60 + k) - 0.5) * 1.6, 1, 1, h2 * TAU, [0, 1, 2, 3][k]); break;
        case TT.BONES: add('bone', cx, cz, px, py, pz, 1.1, 1, h2 * TAU, 1); break;
        case TT.G: if ((z <= 2) && h3 < (z === 2 ? 0.28 : 0.6)) { add('tuft', cx, cz, px, py, pz, 0.8 + h1 * 0.8, 0.8 + h2 * 0.8, h2 * TAU, z === 2 ? 0.6 : 0.85 + h1 * 0.3); if (h1 < 0.4) add('tuft', cx, cz, px + 0.7, this.heightAt(px + 0.7, pz + 0.4), pz + 0.4, 0.7, 0.9, h1 * TAU, 0.9); } break;
      }
    }
    const flowerCols = ['#ff6a8a', '#ffe14a', '#ffffff', '#a98aff'];
    for (const k in lists) {
      const L = lists[k], n = L.items.length, im = new THREE.InstancedMesh(geos[L.type], mat, n);
      L.items.forEach((it, idx) => {
        q.setFromEuler(e.set(0, it.ry, 0)); mtx.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sc, it.sy, it.sc)); im.setMatrixAt(idx, mtx);
        if (L.type === 'flower') col.set(flowerCols[it.tint | 0]); else if (L.type === 'rock') { const zr = it.zone; col.setRGB(it.tint, it.tint, it.tint); if (zr === 4) col.setRGB(1.0, 1.05, 1.15).multiplyScalar(it.tint * 0.95); } else col.setRGB(it.tint, it.tint, it.tint);
        im.setColorAt(idx, col);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.castShadow = !['tuft', 'flower', 'bone'].includes(L.type); im.receiveShadow = true;
      im.userData = { cx: (L.cx + 0.5) * 16 * TU, cz: (L.cz + 0.5) * 16 * TU, shadow: im.castShadow };
      this.scene.add(im); this.chunkMeshes.push(im);
    }
  },

  // ---------- Gebäude ----------
  texPlaster() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#d9cba6'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 50},40,${Math.random() * 0.1})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 6); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; },
  texRoof(col) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 128, 128); for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.14})`; x.fillRect(q * 16 + (r % 2) * 8, r * 16, 15, 14); x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(q * 16 + (r % 2) * 8, r * 16, 15, 3); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; },
  buildBuildings() {
    this.winMats = [];
    const plaster = this.texPlaster(), roofCols = ['#a03a2a', '#3a5a8a', '#7a5a2a', '#3a7a4a'], beam = new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 0.9 });
    const roofMats = roofCols.map(c => new THREE.MeshStandardMaterial({ map: this.texRoof(c), roughness: 0.85 }));
    const stone = new THREE.MeshStandardMaterial({ color: '#8a8a90', roughness: 0.95 });
    for (const b of World.buildings) {
      const hub = HUBS.find(h => h.id === b.hub), grp = new THREE.Group();
      const cx = (b.x + b.w / 2) * TU, cz = (b.y + b.h / 2) * TU, gy = this.heightAt(cx, cz);
      grp.position.set(cx, gy, cz);
      if (b.kind === 'well') {
        grp.position.set((b.x + 0.5) * TU, this.heightAt((b.x + 0.5) * TU, (b.y + 0.5) * TU), (b.y + 0.5) * TU);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.9, 14), stone); ring.position.y = 0.45; ring.castShadow = ring.receiveShadow = true; grp.add(ring);
        const wat = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14), new THREE.MeshStandardMaterial({ color: '#2f6aa8', roughness: 0.1 })); wat.rotation.x = -Math.PI / 2; wat.position.y = 0.7; grp.add(wat);
        for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), beam); p.position.set(sx * 0.9, 1.6, 0); p.castShadow = true; grp.add(p); }
        const rf = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), roofMats[0]); rf.rotation.y = Math.PI / 4; rf.position.y = 3.0; rf.castShadow = true; grp.add(rf);
        this.scene.add(grp); continue;
      }
      const w = b.w * TU - 0.4, d = b.h * TU - 0.4, hgt = 3.6, front = b.y > hub.y ? -1 : 1;
      const pm = plaster.clone(); pm.needsUpdate = true; pm.repeat.set(w / 4, hgt / 4);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshStandardMaterial({ map: pm, roughness: 0.95 })); walls.position.y = hgt / 2; walls.castShadow = walls.receiveShadow = true; grp.add(walls);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.7, d + 0.2), stone); base.position.y = 0.35; base.castShadow = base.receiveShadow = true; grp.add(base);
      // Fachwerk
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, hgt, 0.25), beam); p.position.set(sx * w / 2, hgt / 2, sz * d / 2); p.castShadow = true; grp.add(p); }
      for (const y of [1.2, 2.4, hgt - 0.1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, 0.2), beam); p.position.set(0, y, sz * (d / 2 + 0.01)); grp.add(p); }
      for (const k of [-1, 0, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, hgt, 0.18), beam); p.position.set(k * w / 3, hgt / 2, sz * (d / 2 + 0.01)); grp.add(p); }
      // Dach (Satteldach entlang Breite)
      const rh = 2.2, shape = new THREE.Shape(); shape.moveTo(-d / 2 - 0.5, 0); shape.lineTo(d / 2 + 0.5, 0); shape.lineTo(0, rh); shape.closePath();
      const rg = new THREE.ExtrudeGeometry(shape, { depth: w + 1.0, bevelEnabled: false });
      const roof = new THREE.Mesh(rg, roofMats[b.kind % 4]); roof.rotation.y = Math.PI / 2; roof.position.set(-w / 2 - 0.5, hgt, 0); roof.castShadow = true; grp.add(roof);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), stone); ch.position.set(w / 4, hgt + 1.6, -d / 4); ch.castShadow = true; grp.add(ch);
      // Tür & Fenster
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.2), new THREE.MeshStandardMaterial({ color: '#4a2f1a', roughness: 0.8 })); door.position.set(0, 1.05 + 0.35, front * (d / 2 + 0.05)); grp.add(door);
      for (const sx of [-1, 1]) {
        const wm = new THREE.MeshStandardMaterial({ color: '#9fd0f0', emissive: new THREE.Color('#ffcc66'), emissiveIntensity: 0, roughness: 0.2 }); this.winMats.push(wm);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.12), wm); win.position.set(sx * w * 0.3, 2.1, front * (d / 2 + 0.05)); grp.add(win);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.08), beam); fr.position.set(sx * w * 0.3, 2.1, front * (d / 2 + 0.02)); grp.add(fr);
      }
      grp.rotation.y = 0; this.scene.add(grp);
    }
    // Laternen an den Plätzen
    this.lamps = [];
    for (const hb of HUBS) for (const [dx, dy] of [[-5, -2], [5, -2], [-5, 3], [5, 3]]) {
      const x = (hb.x + dx + 0.5) * TU, z = (hb.y + dy + 0.5) * TU, y = this.heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), beam); pole.position.y = 1.6; pole.castShadow = true; g.add(pole);
      const lm = new THREE.MeshStandardMaterial({ color: '#ffd890', emissive: new THREE.Color('#ffa840'), emissiveIntensity: 0.5 }); this.winMats.push(lm);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.34), lm); lamp.position.y = 3.3; g.add(lamp); this.scene.add(g);
    }
  },

  buildWorld() {
    this.buildTerrain(); this.buildObjects(); this.buildBuildings(); this.worldBuilt = true;
  },

  // ---------- Hilfsfunktionen ----------
  moveVec(K) {
    let f = 0, r = 0;
    if (K['KeyW'] || K['ArrowUp']) f += 1; if (K['KeyS'] || K['ArrowDown']) f -= 1;
    if (K['KeyD'] || K['ArrowRight']) r += 1; if (K['KeyA'] || K['ArrowLeft']) r -= 1;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { x: -s * f + c * r, y: -c * f - s * r };
  },
  rotateCam(dx, dy) { this.yaw -= dx * 0.005; this.pitch = clamp(this.pitch + dy * 0.004, 0.08, 1.35); },
  zoom(d) { this.tdist = clamp(this.tdist + d * 0.012, 5, 34); },
  setRay(sx, sy) {
    const nx = sx / this.W * 2 - 1, ny = -(sy / this.H * 2 - 1);
    this.ray.setFromCamera({ x: nx, y: ny }, this.camera); return this.ray;
  },
  groundPoint(sx, sy) {
    const r = this.setRay(sx, sy), o = r.ray.origin, d = r.ray.direction;
    let t = 0, prev = 0;
    for (; t < 260; t += 1) { const x = o.x + d.x * t, z = o.z + d.z * t, h = this.heightAt(x, z); if (o.y + d.y * t < h) break; prev = t; }
    if (t >= 260) return null;
    for (let k = 0; k < 8; k++) { const m = (t + prev) / 2, x = o.x + d.x * m, z = o.z + d.z * m; if (o.y + d.y * m < this.heightAt(x, z)) t = m; else prev = m; }
    return { x: (o.x + d.x * t) / U, y: (o.z + d.z * t) / U };
  },
  pick(sx, sy) {
    const r = this.setRay(sx, sy).ray, P = G.P; let best = null, bd = 1e9; const c = this.tmpV, sph = new THREE.Sphere();
    const test = (e, rad, lift) => {
      const xu = e.x * U, zu = e.y * U; c.set(xu, this.heightAt(xu, zu) + lift, zu); sph.set(c, rad);
      const hit = r.intersectSphere(sph, new THREE.Vector3()); if (hit) { const d = hit.distanceTo(r.origin); if (d < bd) { bd = d; best = e; } }
    };
    for (const m of G.mobs) { if (m.dead || Math.hypot(m.x - P.x, m.y - P.y) > 1500) continue; const hv = m.def.kind === 'flyer' ? 1.7 : m.def.kind === 'ghost' ? 0.6 : 0; test(m, 0.85 * m.sc + 0.25, 1.0 * m.sc + hv); }
    for (const n of G.npcs) if (Math.hypot(n.x - P.x, n.y - P.y) < 1500) test(n, 0.9, 1.0);
    for (const n of G.nodes) if (n.avail && Math.hypot(n.x - P.x, n.y - P.y) < 1500) test(n, 0.8, 0.5);
    return best;
  },
  project(x, y, z) { const v = this.tmpV.set(x, y, z).project(this.camera); if (v.z > 1 || v.z < -1) return null; return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, d: v.z }; },

  // ---------- Sichtbare Figuren ----------
  getVis(e, kind, make) {
    let v = this.vis.get(e);
    if (!v) { v = make(); v.kind = kind; v.face = 0; v.lx = e.x; v.ly = e.y; v.t = Math.random() * 10; v.pop = 0; this.scene.add(v.root); this.vis.set(e, v); }
    v.seen = this.frame; return v;
  },
  placeVis(e, v, dt, hover = 0, faceTo = null) {
    const xu = e.x * U, zu = e.y * U, gy = this.heightAt(xu, zu);
    const dx = e.x - v.lx, dy = e.y - v.ly, mv = Math.hypot(dx, dy);
    v.moving = mv > 0.15;
    if (v.moving) { const a = Math.atan2(dx, dy); v.face = this.lerpAng(v.face, a, Math.min(1, dt * 14)); }
    if (faceTo) { const a = Math.atan2(faceTo.x - e.x, faceTo.y - e.y); v.face = this.lerpAng(v.face, a, Math.min(1, dt * 16)); }
    v.lx = e.x; v.ly = e.y;
    v.root.position.set(xu, gy + hover, zu); v.root.rotation.y = v.face;
    if (v.moving) { const g2 = this.heightAt(xu + Math.sin(v.face) * 0.6, zu + Math.cos(v.face) * 0.6); v.root.rotation.x = clamp(-(g2 - gy) * 0.35, -0.3, 0.3) * (v.kind === 'mob' ? 0.4 : 0); }
    v.t += dt * (v.moving ? 1 : 0.4);
  },
  lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * t; },

  updateEntities(dt) {
    const P = G.P, now = G.now;
    // Spieler
    if (!P.dead) {
      const key = P.cls + (P.mounted ? 'm' : '');
      let v = this.vis.get(P);
      if (v && v.key !== key) { this.scene.remove(v.root); this.vis.delete(P); v = null; }
      v = this.getVis(P, 'player', () => { const h = Models.forPlayer(P.cls); const root = new THREE.Group(); root.add(h.root); let horse = null; if (P.mounted) { horse = Models.horse(); root.add(horse); h.root.position.y = 0.95; } return { root, h, horse, key }; });
      v.key = key;
      const ft = G.target && G.target.def && !G.target.dead && now - (P.castAnim || -9) < 1.2 ? G.target : null;
      this.placeVis(P, v, dt, 0, ft);
      const att = now - (P.castAnim || -9) < 0.3 ? (now - P.castAnim) / 0.3 : 0;
      v.h.update(v.t, v.moving && !P.mounted, att); if (v.horse) v.horse.update(v.t, v.moving);
      if (P.mounted) v.h.legL.rotation.x = v.h.legR.rotation.x = -1.2;
      v.root.visible = true;
    }
    // NPCs
    for (const n of G.npcs) {
      if (Math.hypot(n.x - P.x, n.y - P.y) > 1700) continue;
      const v = this.getVis(n, 'npc', () => { const h = Models.forNpc(n); const root = new THREE.Group(); root.add(h.root); return { root, h, mk: null }; });
      this.placeVis(n, v, dt, 0, Math.hypot(n.x - P.x, n.y - P.y) < 260 && !P.dead ? P : null); v.h.update(v.t, false, 0);
      const mk = npcMarker(n);
      if (mk !== v.mk) {
        if (v.spr) { v.root.remove(v.spr); v.spr = null; }
        if (mk) { v.spr = this.markerSprite(mk); v.spr.position.y = 2.9; v.root.add(v.spr); }
        v.mk = mk;
      }
      if (v.spr) v.spr.position.y = 2.9 + Math.sin(now * 4 + n.x) * 0.12;
    }
    // Bots
    for (const b of G.bots) {
      if (Math.hypot(b.x - P.x, b.y - P.y) > 1500) continue;
      const v = this.getVis(b, 'bot', () => { const h = Models.forPlayer(b.cls); const root = new THREE.Group(); root.add(h.root); return { root, h }; });
      this.placeVis(b, v, dt); v.h.update(v.t, b.moving, 0);
    }
    // Monster
    for (const m of G.mobs) {
      const d = Math.hypot(m.x - P.x, m.y - P.y);
      if (d > 1650 || (m.dead && (m.temp || now - (m.diedAt || 0) > 6))) continue;
      const v = this.getVis(m, 'mob', () => { const h = Models.forMob(m); const root = new THREE.Group(); root.add(h.root); if (m.boss || m.elite) { const ring = new THREE.Mesh(new THREE.RingGeometry(1.2 * m.sc, 1.6 * m.sc, 32), new THREE.MeshBasicMaterial({ color: m.boss ? '#ff3a2a' : '#ffd23f', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; root.add(ring); } return { root, h }; });
      if (m.dead) {
        const k = clamp((now - (m.diedAt || now)) / 0.6, 0, 1);
        v.root.rotation.z = k * 1.4; v.root.position.y = this.heightAt(m.x * U, m.y * U) - (now - (m.diedAt || now)) * 0.05; v.root.position.x = m.x * U; v.root.position.z = m.y * U;
        continue;
      }
      v.root.rotation.z = 0;
      const atk = now - (m.atkAnim || -9) < 0.28 ? (now - m.atkAnim) / 0.28 : 0;
      const mvg = m.state !== 'idle' || m.wmove;
      this.placeVis(m, v, dt, v.h.hover || 0, m.state === 'chase' && !m.dead ? P : null);
      v.h.update(v.t, v.moving, atk);
      if (m.flash > 0) v.root.scale.setScalar(1.06); else v.root.scale.setScalar(1);
      v.root.visible = true;
    }
    // Sammelpunkte
    for (const n of G.nodes) {
      if (!n.avail || Math.hypot(n.x - P.x, n.y - P.y) > 1400) continue;
      const v = this.getVis(n, 'node', () => this.nodeVisual(n));
      v.root.position.set(n.x * U, this.heightAt(n.x * U, n.y * U), n.y * U); v.glow.material.opacity = 0.5 + 0.35 * Math.sin(now * 3 + n.x);
    }
    // Beute
    for (const b of G.bags) {
      if (Math.hypot(b.x - P.x, b.y - P.y) > 1400) continue;
      const v = this.getVis(b, 'bag', () => this.bagVisual());
      v.root.position.set(b.x * U, this.heightAt(b.x * U, b.y * U), b.y * U); v.root.rotation.y = now * 1.5; v.beam.material.opacity = 0.25 + 0.1 * Math.sin(now * 5);
    }
    // Aufräumen
    for (const [e, v] of this.vis) if (v.seen !== this.frame) { this.scene.remove(v.root); this.vis.delete(e); }
  },
  markerSprite(mk) {
    const key = 'mk' + mk; if (!this.mkTex) this.mkTex = {};
    if (!this.mkTex[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.font = 'bold 110px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 12; x.strokeStyle = '#000';
      const txt = mk === 'avail' ? '!' : '?'; x.strokeText(txt, 64, 70); x.fillStyle = mk === 'prog' ? '#9a9a9a' : '#ffd23f'; x.fillText(txt, 64, 70);
      this.mkTex[key] = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.mkTex[key], depthTest: false, transparent: true })); s.scale.set(1.3, 1.3, 1); s.renderOrder = 20; return s;
  },
  nodeVisual(n) {
    const nt = NODE_TYPES[n.type], root = new THREE.Group(), col = nt.col;
    if (nt.kind === 'herb') {
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, l = Models.mesh(Models.cone(0.1, 0.9, 4), Models.mat('#2f8a3a'), Math.cos(a) * 0.25, 0.4, Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); root.add(l); }
      for (let i = 0; i < 3; i++) root.add(Models.mesh(Models.sph(0.12, 6, 5), Models.glow(col, 0.9), (i - 1) * 0.3, 0.95 + i % 2 * 0.1, 0.1, false));
    } else {
      root.add(Models.mesh(new THREE.DodecahedronGeometry(0.6, 0), Models.mat('#6a6a72'), 0, 0.4, 0));
      for (let i = 0; i < 4; i++) { const cr = Models.mesh(Models.cone(0.14, 0.7, 5), Models.glow(col, 1.0), (i - 1.5) * 0.28, 0.9, (i % 2 - 0.5) * 0.3, false); cr.rotation.z = (i - 1.5) * 0.25; root.add(cr); }
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(3, 3, 1); glow.position.y = 0.8; root.add(glow);
    return { root, glow };
  },
  bagVisual() {
    const root = new THREE.Group();
    const sack = Models.mesh(Models.sph(0.38, 10, 8), Models.mat('#7a5a2a'), 0, 0.35, 0); sack.scale.y = 0.9; root.add(sack, Models.mesh(Models.cyl(0.12, 0.2, 0.2, 8), Models.mat('#5a3f1a'), 0, 0.78, 0), Models.mesh(Models.cyl(0.18, 0.18, 0.05, 8), Models.mat('#d8b04a', { metalness: 0.8 }), 0, 0.7, 0));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 2.5; root.add(beam);
    return { root, beam };
  },

  // ---------- Effekte ----------
  updateFx(dt, t) {
    const P = G.P;
    // Projektile
    let n = 0;
    for (const p of G.projs) {
      let s = this.projPool[n];
      if (!s) { s = this.projPool[n] = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.scene.add(s); }
      s.visible = true; s.material.color.set(p.col); const sz = 0.9 + p.size * 0.22; s.scale.set(sz * (p.arrow ? 0.7 : 1), sz * (p.arrow ? 0.7 : 1), 1);
      s.position.set(p.x * U, this.heightAt(p.x * U, p.y * U) + 1.4, p.y * U); n++;
      if (p.trail && Math.random() < 0.7) G.parts.push({ x: p.x, y: p.y, y0: p.y, vz: rnd(-20, 20), vx: rnd(-20, 20), vy: rnd(-20, 20), color: p.col, t: 0, life: 0.35, size: 3, lift: 1.4 });
    }
    for (let i = n; i < this.projPool.length; i++) this.projPool[i].visible = false;
    // Ringe
    n = 0;
    for (const r of G.rings) {
      let m = this.ringPool[n];
      if (!m) { m = this.ringPool[n] = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; this.scene.add(m); }
      const k = r.t / r.life, rad = r.r * U * (0.3 + k * 0.7);
      m.visible = true; m.material.color.set(r.color); m.material.opacity = 1 - k; m.scale.set(rad, rad, 1); m.position.set(r.x * U, this.heightAt(r.x * U, r.y * U) + 0.15, r.y * U); n++;
    }
    for (let i = n; i < this.ringPool.length; i++) this.ringPool[i].visible = false;
    // Telegraphen
    n = 0;
    for (const e of G.tele) {
      let m = this.telePool[n];
      if (!m) { const g = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })); const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })); const edge = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })); [disc, fill, edge].forEach(o => { o.rotation.x = -Math.PI / 2; g.add(o); }); fill.position.y = 0.02; edge.position.y = 0.03; g.userData = { disc, fill, edge }; this.scene.add(g); m = this.telePool[n] = g; }
      const k = clamp((G.now - e.start) / (e.at - e.start), 0, 1), U2 = m.userData, rad = e.r * U, pulse = 0.5 + 0.5 * Math.sin(t * 14);
      m.visible = true; m.position.set(e.x * U, this.heightAt(e.x * U, e.y * U) + 0.2, e.y * U); m.scale.set(rad, 1, rad);
      U2.disc.material.color.set(e.color); U2.disc.material.opacity = 0.16 + 0.14 * pulse; U2.fill.material.color.set(e.color); U2.fill.material.opacity = 0.3 + 0.3 * k; U2.fill.scale.set(Math.max(0.01, k), Math.max(0.01, k), 1); U2.edge.material.color.set(e.color); U2.edge.material.opacity = 0.95; n++;
    }
    for (let i = n; i < this.telePool.length; i++) this.telePool[i].visible = false;
    // Partikel
    n = 0; const cc = this.pc || (this.pc = {});
    for (const p of G.parts) {
      if (n >= this.MAXP) break;
      const col = cc[p.color] || (cc[p.color] = new THREE.Color(p.color)), f = 1 - p.t / p.life, y0 = p.y0 === undefined ? p.y : p.y0;
      const wx = p.x * U, wz = (y0 + (p.vz || 0) * p.t) * U, h = (y0 - p.y) * U + (p.lift || 0.8) + (p.vz ? 0 : 0);
      this.pPos[n * 3] = wx; this.pPos[n * 3 + 1] = this.heightAt(wx, wz) + Math.max(0.05, h); this.pPos[n * 3 + 2] = wz;
      this.pCol[n * 3] = col.r * f; this.pCol[n * 3 + 1] = col.g * f; this.pCol[n * 3 + 2] = col.b * f; n++;
    }
    for (let i = n; i < this.MAXP; i++) { this.pPos[i * 3 + 1] = -999; this.pCol[i * 3] = this.pCol[i * 3 + 1] = this.pCol[i * 3 + 2] = 0; }
    this.parts.geometry.attributes.position.needsUpdate = true; this.parts.geometry.attributes.color.needsUpdate = true;
    // Ziel-Ring
    const tg = G.target;
    if (tg && !tg.dead && !P.dead) { const r = tg.def ? 0.95 * tg.sc + 0.25 : 0.9; this.targetRing.visible = true; this.targetRing.material.color.set(tg.def ? '#ff4a3a' : '#ffe070'); this.targetRing.scale.set(r, r, 1); this.targetRing.position.set(tg.x * U, this.heightAt(tg.x * U, tg.y * U) + 0.12, tg.y * U); this.targetRing.rotation.z = t * 0.8; }
    else this.targetRing.visible = false;
    if (G.clickMark) { const c = G.clickMark; c.t += dt; if (c.t > 0.8) G.clickMark = null; else { this.clickMark.visible = true; const s = 1 + c.t * 1.5; this.clickMark.scale.set(s, s, 1); this.clickMark.material.opacity = 1 - c.t / 0.8; this.clickMark.position.set(c.x * U, this.heightAt(c.x * U, c.y * U) + 0.15, c.y * U); } } else this.clickMark.visible = false;
    // Wetter
    const z = P.zone === undefined ? 0 : P.zone, W = this.weather, wm = W.material;
    const kind = z === 4 ? 'snow' : z === 5 ? 'ash' : z === 2 ? 'fly' : z === 3 ? 'dust' : z === 6 ? 'spirit' : 'pollen';
    const cfg = { snow: ['#ffffff', 0.9, -3.2, 0.26], ash: ['#ff8a3a', 0.9, 1.6, 0.2], fly: ['#c8ff7a', 0.9, 0.0, 0.2], dust: ['#e8d09a', 0.35, -0.2, 0.18], spirit: ['#b08aff', 0.8, 0.9, 0.22], pollen: ['#fff6c0', 0.35, -0.3, 0.14] }[kind];
    wm.color.set(cfg[0]); wm.opacity += (cfg[1] * (kind === 'dust' ? 1 : 1) - wm.opacity) * 0.05; wm.size = cfg[3];
    const px = P.x * U, pz = P.y * U, py = this.heightAt(px, pz);
    for (let i = 0; i < this.wN; i++) {
      let x = this.wPos[i * 3], y = this.wPos[i * 3 + 1], zz = this.wPos[i * 3 + 2];
      y += cfg[2] * dt + (kind === 'fly' ? Math.sin(t * 2 + i) * 0.02 : 0); x += Math.sin(t * 0.7 + i * 1.7) * 0.4 * dt * (kind === 'dust' ? 6 : 1); zz += Math.cos(t * 0.6 + i) * 0.3 * dt;
      if (y < 0) y += 25; if (y > 25) y -= 25;
      if (x > 30) x -= 60; if (x < -30) x += 60; if (zz > 30) zz -= 60; if (zz < -30) zz += 60;
      this.wPos[i * 3] = x; this.wPos[i * 3 + 1] = y; this.wPos[i * 3 + 2] = zz;
    }
    W.geometry.attributes.position.needsUpdate = true;
    W.position.set(px, py, pz);
  },

  // ---------- Licht, Himmel ----------
  updateEnv(dt, px, pz, zone) {
    const phase = (G.clock / 600 + 0.1) % 1, a = phase * TAU;
    const dayness = clamp(0.5 + 0.5 * Math.cos(a) * 1.25, 0, 1), dark = 1 - dayness;
    const dusk = clamp(1 - Math.abs(dayness - 0.45) * 4, 0, 1);
    const zt = [[1, 1, 1], [0.95, 1, 0.95], [0.85, 0.95, 0.85], [1.0, 0.95, 0.8], [0.88, 0.95, 1.05], [1.1, 0.85, 0.75], [0.7, 0.62, 0.9]][zone || 0];
    for (let i = 0; i < 3; i++) this.tint[i] += (zt[i] - this.tint[i]) * Math.min(1, dt * 1.2);
    const T = this.tint;
    const day = new THREE.Color('#8fb8e0'), night = new THREE.Color('#080c1c'), dsk = new THREE.Color('#e08a4a');
    const horizon = new THREE.Color().copy(night).lerp(day, dayness).lerp(dsk, dusk * 0.5); horizon.multiply(new THREE.Color(T[0], T[1], T[2]));
    const top = new THREE.Color('#050818').lerp(new THREE.Color('#3f78c8'), dayness).multiply(new THREE.Color(T[0], T[1], T[2]));
    this.sky.material.uniforms.top.value.copy(top); this.sky.material.uniforms.bot.value.copy(horizon);
    this.scene.fog.color.copy(horizon); this.scene.fog.density = (zone === 5 ? 0.0095 : zone === 2 ? 0.011 : zone === 6 ? 0.0095 : 0.0058) * (1 + dark * 0.4);
    this.renderer.setClearColor(horizon);
    const sunA = a, sx = Math.sin(sunA) * 70, sy = Math.cos(sunA) * 90 + 25, sz = -35;
    const sunDir = new THREE.Vector3(sx, Math.max(18, sy), sz);
    this.sun.position.set(px + sunDir.x, sunDir.y, pz + sunDir.z); this.sun.target.position.set(px, 0, pz);
    this.sun.intensity = (2.0 * dayness * dayness + 0.1) * (0.6 + 0.4 * (this.zd || 1)); this.sun.color.set('#fff0d6').lerp(new THREE.Color('#ff9a5a'), dusk * 0.7).multiply(new THREE.Color(T[0], T[1], T[2]));
    const zd = [1, 0.95, 0.9, 1.05, 1, 0.8, 0.6][zone || 0]; this.zd = (this.zd || 1) + (zd - (this.zd || 1)) * Math.min(1, dt * 1.5);
    this.hemi.intensity = (0.3 + 0.7 * dayness) * this.zd; this.hemi.color.set('#2a3a6a').lerp(new THREE.Color('#cfe0ff'), dayness); this.hemi.groundColor.set('#1a1a28').lerp(new THREE.Color('#5a4a34'), dayness);
    this.stars.material.opacity = clamp((dark - 0.35) * 2, 0, 1); this.stars.position.set(px, 0, pz); this.sky.position.set(px, 0, pz);
    const sd = new THREE.Vector3(Math.sin(a), Math.cos(a), -0.3).normalize();
    this.sunSpr.position.set(px + sd.x * 330, sd.y * 330, pz + sd.z * 330); this.sunSpr.visible = sd.y > -0.05; this.sunSpr.material.opacity = clamp(dayness * 1.2, 0, 1);
    this.moonSpr.position.set(px - sd.x * 330, -sd.y * 330, pz - sd.z * 330); this.moonSpr.visible = -sd.y > 0; this.moonSpr.material.opacity = clamp(dark * 1.5, 0, 1);
    const glow = clamp(dark * 1.6 - 0.2, 0, 1);
    for (const m of this.winMats || []) m.emissiveIntensity = 0.15 + glow * 1.4;
    this.dark = dark;
    // Chunk-Sichtbarkeit
    for (const im of this.chunkMeshes) {
      const d = Math.hypot(im.userData.cx - px, im.userData.cz - pz);
      im.visible = d < (this.viewDist || 150); im.castShadow = im.userData.shadow && d < 62 && this.renderer.shadowMap.enabled;
    }
    // Wasser/Lava animieren
    if (this.rip) { this.rip.offset.x += dt * 0.02; this.rip.offset.y += dt * 0.012; }
    if (this.lavaTex) { this.lavaTex.offset.x += dt * 0.012; this.lavaTex.offset.y -= dt * 0.008; }
  },

  // ---------- Hauptdarstellung ----------
  draw(dt) {
    dt = dt || 0.016; this.frame++;
    const P = G.P, t = performance.now() / 1000;
    this.tdist += 0; this.dist += (this.tdist - this.dist) * Math.min(1, dt * 10);
    const px = P.x * U, pz = P.y * U, py = this.heightAt(px, pz);
    const targ = new THREE.Vector3(px, py + (P.mounted ? 2.7 : 1.9), pz);
    if (!this.first) { this.camTarget = targ.clone(); this.first = true; }
    this.camTarget.lerp(targ, Math.min(1, dt * 12));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), shake = G.shake;
    let cx = this.camTarget.x + Math.sin(this.yaw) * cp * this.dist, cz = this.camTarget.z + Math.cos(this.yaw) * cp * this.dist, cy = this.camTarget.y + sp * this.dist;
    { // Verdeckung: Kamera vor großen Hindernissen heranziehen
      const dx = cx - this.camTarget.x, dy = cy - this.camTarget.y, dz = cz - this.camTarget.z; let cut = 1;
      for (let s = 0.12; s <= 1.001; s += 0.04) {
        const x = this.camTarget.x + dx * s, z = this.camTarget.z + dz * s, y = this.camTarget.y + dy * s, tt = World.tileAt(Math.floor(x / TU), Math.floor(z / TU));
        if ((tt === TT.ROCK || tt === TT.WALL || tt === TT.BUILD || tt === TT.PILL) && y < this.heightAt(x, z) + 7.5) { cut = Math.max(0.35, s - 0.1); break; }
      }
      this.camCut = this.camCut === undefined ? cut : this.camCut + (cut - this.camCut) * Math.min(1, dt * (cut < this.camCut ? 20 : 4));
      cx = this.camTarget.x + dx * this.camCut; cy = this.camTarget.y + dy * this.camCut; cz = this.camTarget.z + dz * this.camCut;
    }
    const gh = this.heightAt(cx, cz) + 0.8; if (cy < gh) cy = gh;
    this.camera.position.set(cx + (shake ? rnd(-shake, shake) * 0.03 : 0), cy + (shake ? rnd(-shake, shake) * 0.03 : 0), cz);
    this.camera.lookAt(this.camTarget);
    this.cam.x = this.camTarget.x / U; this.cam.y = this.camTarget.z / U;
    this.updateEnv(dt, px, pz, P.zone);
    this.updateEntities(dt); this.updateFx(dt, t);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(t);
  },
  // Startbildschirm-Kulisse: Kamera kreist über Eichenhain
  drawMenu(dt) {
    this.frame++; this.menuT += dt; G.clock += dt;
    const hub = HUBS[this.menuHub || 0], a = this.menuT * 0.08, r = 34;
    const cx = (hub.x + 0.5) * TU, cz = (hub.y + 0.5) * TU, gy = this.heightAt(cx, cz);
    this.camera.position.set(cx + Math.sin(a) * r, gy + 11, cz + Math.cos(a) * r); this.camera.lookAt(cx, gy + 3, cz);
    this.updateEnv(dt, cx, cz, hub.zone);
    this.vis.forEach(v => this.scene.remove(v.root)); this.vis.clear();
    this.renderer.render(this.scene, this.camera);
    this.oc.clearRect(0, 0, this.W, this.H);
  },

  // ---------- Overlay: Namen, Balken, Schadenszahlen ----------
  diffColor(lv) { const d = lv - G.P.level; return d >= 6 ? '#ff3030' : d >= 3 ? '#ff9a2a' : d >= -2 ? '#ffe040' : d >= -6 ? '#4fd34f' : '#aaaaaa'; },
  bar(c, x, y, w, h, k, col) { c.fillStyle = 'rgba(0,0,0,.8)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2); c.fillStyle = '#3a0f0f'; c.fillRect(x - w / 2, y, w, h); c.fillStyle = col; c.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h / 2.5); },
  text(c, txt, x, y, col, size = 12) { c.font = `bold ${size}px Cinzel, Georgia, serif`; c.textAlign = 'center'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,.92)'; c.lineJoin = 'round'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); },
  drawOverlay(t) {
    const c = this.oc, P = G.P, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    const plate = (e, hv, headU, draw) => {
      const xu = e.x * U, zu = e.y * U, s = this.project(xu, this.heightAt(xu, zu) + headU + hv, zu); if (!s) return;
      const fade = clamp(1.4 - Math.hypot(e.x - P.x, e.y - P.y) / 700, 0, 1); if (fade <= 0.02) return;
      c.globalAlpha = fade; draw(s.x, s.y); c.globalAlpha = 1;
    };
    for (const m of G.mobs) {
      if (m.dead || Math.hypot(m.x - P.x, m.y - P.y) > 900) continue;
      const hv = m.def.kind === 'flyer' ? 1.7 * m.sc : m.def.kind === 'ghost' ? 0.5 * m.sc : 0;
      const show = m === G.target || m === UI.hover || m.state === 'chase' || m.boss || m.elite || m.hp < m.maxhp;
      if (!show && !(m.lvl >= P.level + 3)) continue;
      plate(m, hv, 2.2 * m.sc + 0.3, (x, y) => {
        if (show) this.bar(c, x, y + 4, 52 * Math.max(1, m.sc * 0.8), 6, m.hp / m.maxhp, m.boss ? '#c0392b' : m.elite ? '#e0a020' : '#d33');
        this.text(c, `${m.boss ? '♛ ' : m.elite ? '★ ' : ''}${m.name}`, x, y - 4, m.boss ? '#ff9a5a' : this.diffColor(m.lvl), 13);
        this.text(c, `Lv ${m.lvl}`, x, y + 24, this.diffColor(m.lvl), 10);
      });
    }
    for (const n of G.npcs) { if (Math.hypot(n.x - P.x, n.y - P.y) > 700) continue; plate(n, 0, 3.3, (x, y) => { this.text(c, n.name, x, y - 2, '#7aff7a', 13); this.text(c, `<${n.title}>`, x, y + 11, '#cfe8cf', 10); }); }
    for (const b of G.bots) { if (Math.hypot(b.x - P.x, b.y - P.y) > 600) continue; plate(b, 0, 2.3, (x, y) => this.text(c, b.name, x, y, '#6fb0ff', 12)); }
    if (!P.dead) plate(P, P.mounted ? 1 : 0, 2.35 + (P.mounted ? 0.4 : 0), (x, y) => this.text(c, P.name, x, y, '#ffe9a0', 13));
    if (P.gather) { const k = clamp((G.now - P.gather.start) / (P.gather.until - P.gather.start), 0, 1), s = this.project(P.x * U, this.heightAt(P.x * U, P.y * U) + 3.2, P.y * U); if (s) { c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(s.x - 28, s.y - 4, 56, 8); c.fillStyle = '#7ad07a'; c.fillRect(s.x - 27, s.y - 3, 54 * k, 6); } }
    // Schwebende Texte
    for (const f of G.texts) {
      const wx = f.x * U, wz = (f.y0 === undefined ? f.y : f.y0) * U + 0.5, rise = (f.y0 === undefined ? 0 : f.y0 - f.y) * U;
      const s = this.project(wx, this.heightAt(wx, wz) + 2.4 + rise, wz); if (!s) continue;
      c.globalAlpha = Math.min(1, (f.life - f.t) * 3); this.text(c, f.txt, s.x, s.y, f.color, Math.round(f.size * 1.15)); c.globalAlpha = 1;
    }
    // Bildschirmeffekte
    if (P.hp / P.st.maxHp < 0.3 && !P.dead) { const a = 0.25 + 0.15 * Math.sin(t * 6), rg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7); rg.addColorStop(0, 'rgba(160,0,0,0)'); rg.addColorStop(1, `rgba(160,0,0,${a})`); c.fillStyle = rg; c.fillRect(0, 0, W, H); }
    if (P.dead) { c.fillStyle = 'rgba(30,0,0,.55)'; c.fillRect(0, 0, W, H); }
  },
};
