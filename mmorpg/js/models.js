'use strict';
// =====================================================================
//  3D-Modelle: Helden, NPCs und Monster (prozedural aus Low-Poly-Teilen)
//  Einheit: 1 Welteinheit ≈ 1 Meter. Eine Figur ist ~1,9 hoch.
// =====================================================================
const Models = (() => {
  const geoCache = {}, matCache = {};
  const geo = (key, fn) => geoCache[key] || (geoCache[key] = fn());
  function mat(hex, o) {
    if (o && o.metalness) o = Object.assign({}, o, { metalness: Math.min(o.metalness, 0.18), roughness: Math.max(o.roughness || 0.6, 0.55) });
    const k = hex + (o ? JSON.stringify(o) : '');
    return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(hex), roughness: 0.78, metalness: 0 }, o)));
  }
  const glow = (hex, i = 1) => mat(hex, { emissive: new THREE.Color(hex), emissiveIntensity: i, roughness: 0.4 });
  function mesh(g, m, x = 0, y = 0, z = 0, shadow = true) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; return o; }
  const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const boxTop = (w, h, d) => geo(`bt${w},${h},${d}`, () => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, -h / 2, 0); return g; });
  const sph = (r, ws = 12, hs = 9) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  const cyl = (r1, r2, h, s = 8) => geo(`c${r1},${r2},${h},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));
  const cone = (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

  // ---------- Waffen ----------
  function weapon(type, orb) {
    const g = new THREE.Group();
    const steel = mat('#cfd6e4', { metalness: 0.85, roughness: 0.25 }), wood = mat('#6b4a2b'), gold = mat('#d8b04a', { metalness: 0.8, roughness: 0.3 });
    switch (type) {
      case 'sword': g.add(mesh(box(0.08, 1.0, 0.025), steel, 0, 0.62, 0), mesh(box(0.34, 0.06, 0.07), gold, 0, 0.12, 0), mesh(cyl(0.03, 0.03, 0.22, 6), wood, 0, 0, 0), mesh(sph(0.05, 6, 5), gold, 0, -0.12, 0)); break;
      case 'axe': g.add(mesh(cyl(0.03, 0.03, 1.1, 6), wood, 0, 0.4, 0), mesh(box(0.42, 0.34, 0.05), steel, 0.2, 0.82, 0), mesh(box(0.08, 0.46, 0.06), steel, 0.02, 0.82, 0)); break;
      case 'club': g.add(mesh(cyl(0.05, 0.1, 0.9, 6), wood, 0, 0.4, 0), mesh(sph(0.15, 7, 6), wood, 0, 0.9, 0)); break;
      case 'staff': g.add(mesh(cyl(0.03, 0.04, 1.7, 6), wood, 0, 0.55, 0), mesh(sph(0.12, 10, 8), glow(orb || '#a070ff', 1.6), 0, 1.5, 0, false)); break;
      case 'scepter': g.add(mesh(cyl(0.025, 0.03, 1.2, 6), gold, 0, 0.45, 0), mesh(sph(0.1, 10, 8), glow('#fff2a0', 1.5), 0, 1.1, 0, false), mesh(box(0.22, 0.04, 0.04), gold, 0, 0.98, 0)); break;
      case 'spear': g.add(mesh(cyl(0.025, 0.025, 2.0, 6), wood, 0, 0.6, 0), mesh(cone(0.07, 0.3, 5), steel, 0, 1.75, 0)); break;
      case 'dagger': g.add(mesh(box(0.05, 0.4, 0.02), steel, 0, 0.3, 0), mesh(box(0.14, 0.04, 0.05), gold, 0, 0.08, 0)); break;
      case 'bow': {
        const arc = new THREE.Mesh(geo('bowarc', () => new THREE.TorusGeometry(0.62, 0.025, 5, 16, Math.PI)), mat('#8a5a2a')); arc.rotation.z = -Math.PI / 2; arc.castShadow = true; g.add(arc);
        g.add(mesh(cyl(0.006, 0.006, 1.24, 3), mat('#e8e8e8'), 0, 0, 0, false)); break;
      }
    }
    return g;
  }
  function hat(type, color, headY) {
    const g = new THREE.Group(); g.position.y = headY;
    switch (type) {
      case 'helm': g.add(mesh(sph(0.235, 12, 8), mat('#9aa4b4', { metalness: 0.8, roughness: 0.3 }), 0, 0.04, 0), mesh(box(0.05, 0.22, 0.34), mat('#c0392b'), 0, 0.26, 0)); g.children[0].scale.y = 0.85; g.add(mesh(box(0.2, 0.05, 0.3), mat('#7a8494', { metalness: 0.8 }), 0, -0.06, 0.1)); break;
      case 'wizard': g.add(mesh(cone(0.27, 0.8, 10), mat(color || '#5a3a9a'), 0, 0.5, 0), mesh(cyl(0.4, 0.4, 0.04, 14), mat(color || '#5a3a9a'), 0, 0.12, 0), mesh(cyl(0.275, 0.275, 0.06, 12), mat('#e8c040', { metalness: 0.7 }), 0, 0.17, 0)); break;
      case 'hood': g.add(mesh(sph(0.26, 12, 9), mat(color || '#2f6a3a'), 0, 0.0, -0.03)); g.add(mesh(cone(0.22, 0.34, 8), mat(color || '#2f6a3a'), 0, 0.2, -0.17)); g.children[1].rotation.x = -0.9; break;
      case 'crown': g.add(mesh(cyl(0.22, 0.2, 0.14, 8), mat('#e8c040', { metalness: 0.9, roughness: 0.25 }), 0, 0.2, 0)); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(mesh(cone(0.04, 0.14, 4), mat('#e8c040', { metalness: 0.9 }), Math.cos(a) * 0.19, 0.34, Math.sin(a) * 0.19)); } break;
      case 'horns': { const bone = mat('#d8d2bc'); const a = mesh(cone(0.07, 0.4, 6), bone, -0.2, 0.28, 0), b = mesh(cone(0.07, 0.4, 6), bone, 0.2, 0.28, 0); a.rotation.z = 0.5; b.rotation.z = -0.5; g.add(a, b); break; }
    }
    return g;
  }

  // ---------- Humanoide ----------
  function humanoid(o) {
    const root = new THREE.Group(), wide = o.wide || 1;
    const body = new THREE.Group(); root.add(body);
    const skin = mat(o.skin || '#e0b080'), cloth = mat(o.body || '#666', o.metal ? { metalness: 0.65, roughness: 0.38 } : null);
    const legsM = mat(o.legs || '#4a3a2a'), boots = mat(o.boots || '#2a1f14');
    const legL = new THREE.Group(), legR = new THREE.Group();
    for (const [lg, sx] of [[legL, -1], [legR, 1]]) {
      lg.position.set(sx * 0.15 * wide, 0.86, 0);
      lg.add(mesh(boxTop(0.25 * wide, 0.78, 0.27 * wide), legsM, 0, 0, 0), mesh(box(0.27 * wide, 0.18, 0.38 * wide), boots, 0, -0.74, 0.05));
      root.add(lg);
    }
    if (o.robe) { const r = mesh(cyl(0.3 * wide, 0.52 * wide, 1.0, 12), cloth, 0, 0.5, 0); r.scale.z = 0.9; root.add(r); }
    const torso = mesh(box(0.6 * wide, 0.75, 0.34 * wide), cloth, 0, 1.22, 0); body.add(torso);
    if (o.trim) body.add(mesh(box(0.62 * wide, 0.1, 0.36 * wide), mat(o.trim, { metalness: 0.4 }), 0, 0.96, 0));
    if (o.metal) { for (const sx of [-1, 1]) body.add(mesh(sph(0.19, 8, 6), mat('#9aa4b4', { metalness: 0.85, roughness: 0.3 }), sx * 0.38 * wide, 1.56, 0)); }
    const head = mesh(sph(0.21, 14, 10), skin, 0, 1.74, 0); body.add(head);
    body.add(mesh(box(0.05, 0.04, 0.03), mat('#111'), -0.08, 1.76, 0.19, false), mesh(box(0.05, 0.04, 0.03), mat('#111'), 0.08, 1.76, 0.19, false));
    if (o.hair) { const hr = mesh(geo('haircap', () => new THREE.SphereGeometry(0.225, 12, 8, 0, TAU, 0, Math.PI * 0.55)), mat(o.hair), 0, 1.76, -0.02); hr.rotation.x = -0.2; body.add(hr); }
    if (o.hat) body.add(hat(o.hat, o.hatc, 1.78));
    if (o.cape) { const c = mesh(box(0.56 * wide, 1.0, 0.04), mat(o.cape), 0, 1.0, -0.2); c.rotation.x = 0.08; body.add(c); }
    const armL = new THREE.Group(), armR = new THREE.Group();
    for (const [ar, sx] of [[armL, -1], [armR, 1]]) {
      ar.position.set(sx * 0.4 * wide, 1.52, 0);
      ar.add(mesh(boxTop(0.17, 0.66, 0.17), cloth, 0, 0, 0), mesh(sph(0.1, 8, 6), skin, 0, -0.7, 0));
      body.add(ar);
    }
    const holder = new THREE.Group(); holder.position.set(0, -0.7, 0.05); holder.rotation.x = -1.35; armR.add(holder);
    if (o.wep) holder.add(weapon(o.wep, o.orb));
    if (o.shield) { const sh = mesh(box(0.08, 0.62, 0.5), mat('#9aa4b4', { metalness: 0.8, roughness: 0.3 }), -0.1, -0.4, 0.12); sh.add(mesh(box(0.09, 0.2, 0.2), mat('#c0392b'), -0.02, 0, 0)); armL.add(sh); armL.rotation.x = -0.3; }
    root.scale.setScalar(o.s || 1);
    const v = { root, body, legL, legR, armL, armR, holder, bowArm: o.wep === 'bow' };
    v.update = (t, moving, att) => {
      const sw = moving ? Math.sin(t * 9) : 0;
      legL.rotation.x = sw * 0.75; legR.rotation.x = -sw * 0.75;
      body.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 2) * 0.012;
      armL.rotation.x = o.shield ? -0.3 : -sw * 0.6;
      if (att > 0) armR.rotation.x = -2.2 + att * 3.2; else armR.rotation.x = sw * 0.6 - 0.15;
      if (v.bowArm && att <= 0) armR.rotation.x = -1.2;
    };
    return v;
  }
  function horse(color) {
    const g = new THREE.Group(), c = mat(color || '#8a5a30'), dark = mat('#2a1a0e');
    const bodyM = mesh(sph(0.5, 12, 9), c, 0, 1.1, 0); bodyM.scale.set(0.6, 0.62, 1.35); g.add(bodyM);
    const neck = mesh(cyl(0.16, 0.24, 0.8, 7), c, 0, 1.55, 0.7); neck.rotation.x = 0.7; g.add(neck);
    const head = mesh(box(0.24, 0.26, 0.55), c, 0, 1.85, 1.05); head.rotation.x = 0.4; g.add(head);
    g.add(mesh(box(0.06, 0.6, 0.1), dark, 0, 1.75, 0.55).rotateX(0.5), mesh(box(0.34, 0.06, 0.5), mat('#a03a2a'), 0, 1.5, 0.05), mesh(cyl(0.05, 0.02, 0.6, 5), dark, 0, 1.0, -0.8).rotateX(-0.6));
    const legs = [];
    for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) { const l = new THREE.Group(); l.position.set(x, 0.9, z); l.add(mesh(boxTop(0.15, 0.9, 0.15), c, 0, 0, 0), mesh(box(0.17, 0.12, 0.19), dark, 0, -0.9, 0)); g.add(l); legs.push(l); }
    g.update = (t, moving) => { legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 13 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.2 : 0)) * 0.7 : 0; }); };
    return g;
  }

  // ---------- Tiere ----------
  function beast(d, sc, id) {
    const root = new THREE.Group(), c1 = mat(d.c1), c2 = mat(d.c2);
    const bodyM = mesh(sph(0.5, 12, 9), c1, 0, 0.78, 0); bodyM.scale.set(0.62, 0.55, 1.25); root.add(bodyM);
    const belly = mesh(sph(0.5, 10, 8), c2, 0, 0.62, 0.05); belly.scale.set(0.5, 0.35, 1.0); root.add(belly);
    const head = new THREE.Group(); head.position.set(0, 0.98, 0.72); root.add(head);
    head.add(mesh(sph(0.27, 10, 8), c1, 0, 0, 0), mesh(box(0.2, 0.16, 0.3), c2, 0, -0.06, 0.26));
    head.add(mesh(cone(0.07, 0.2, 4), c1, -0.15, 0.27, -0.02), mesh(cone(0.07, 0.2, 4), c1, 0.15, 0.27, -0.02));
    head.add(mesh(sph(0.04, 5, 4), glow('#ff3a2a', 1.4), -0.1, 0.07, 0.22, false), mesh(sph(0.04, 5, 4), glow('#ff3a2a', 1.4), 0.1, 0.07, 0.22, false));
    if (id === 'eber' || id === 'grunthar') { const t1 = mesh(cone(0.05, 0.28, 5), mat('#f2ecd8'), -0.14, -0.1, 0.38), t2 = mesh(cone(0.05, 0.28, 5), mat('#f2ecd8'), 0.14, -0.1, 0.38); t1.rotation.set(-0.3, 0, 0.4); t2.rotation.set(-0.3, 0, -0.4); head.add(t1, t2); }
    if (id === 'hase') { root.add(mesh(box(0.06, 0.4, 0.1), c1, -0.08, 1.35, 0.7), mesh(box(0.06, 0.4, 0.1), c1, 0.08, 1.35, 0.7)); }
    const tail = mesh(cyl(0.03, 0.08, 0.7, 5), c1, 0, 0.95, -0.85); tail.rotation.x = -0.9; root.add(tail);
    const legs = [];
    for (const [x, z] of [[-0.22, 0.5], [0.22, 0.5], [-0.22, -0.5], [0.22, -0.5]]) { const l = new THREE.Group(); l.position.set(x, 0.6, z); l.add(mesh(boxTop(0.15, 0.62, 0.17), c1, 0, 0, 0)); root.add(l); legs.push(l); }
    root.scale.setScalar(sc * 0.9);
    const v = { root, head, update: (t, moving, att) => { legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(t * 11 + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.8 : 0)) * 0.7 : 0)); tail.rotation.z = Math.sin(t * 5) * 0.3; head.position.z = 0.72 + (att > 0 ? Math.sin(att * Math.PI) * 0.3 : 0); } };
    return v;
  }
  function blob(d, sc) {
    const root = new THREE.Group();
    const b = mesh(sph(0.65, 14, 10), mat(d.c1, { transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 }), 0, 0.45, 0); b.scale.y = 0.78; root.add(b);
    root.add(mesh(sph(0.2, 8, 6), mat(d.c2, { transparent: true, opacity: 0.7 }), -0.2, 0.7, 0.2, false));
    root.add(mesh(sph(0.07, 6, 5), mat('#111'), -0.2, 0.55, 0.58, false), mesh(sph(0.07, 6, 5), mat('#111'), 0.2, 0.55, 0.58, false));
    root.scale.setScalar(sc);
    return { root, update: (t, moving) => { const s = 1 + Math.sin(t * (moving ? 9 : 3)) * 0.09; b.scale.set(1 / s, 0.78 * s, 1 / s); } };
  }
  function spider(d, sc, id) {
    const root = new THREE.Group(), c1 = mat(d.c1), c2 = mat(d.c2);
    const ab = mesh(sph(0.5, 10, 8), c1, 0, 0.7, -0.45); ab.scale.set(0.9, 0.8, 1.2); root.add(ab);
    const ceph = mesh(sph(0.34, 9, 7), c1, 0, 0.62, 0.3); root.add(ceph);
    root.add(mesh(sph(0.2, 7, 5), c2, 0, 1.05, -0.45), mesh(sph(0.05, 5, 4), glow('#ff3030', 1.5), -0.1, 0.72, 0.58, false), mesh(sph(0.05, 5, 4), glow('#ff3030', 1.5), 0.1, 0.72, 0.58, false));
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4, l = new THREE.Group(); l.position.set(side * 0.2, 0.62, 0.35 - k * 0.22);
      const up = mesh(boxTop(0.07, 0.7, 0.07), c1, 0, 0, 0); up.rotation.z = side * 1.0; l.add(up);
      const low = mesh(boxTop(0.06, 0.8, 0.06), c1, side * 0.6, -0.4, 0); low.rotation.z = -side * 0.35; l.add(low);
      root.add(l); legs.push(l);
    }
    if (id === 'skorpion') { const tail = mesh(cyl(0.07, 0.1, 0.9, 6), c1, 0, 1.2, -1.0); tail.rotation.x = 0.5; root.add(tail, mesh(cone(0.08, 0.26, 5), c2, 0, 1.75, -0.65)); }
    root.scale.setScalar(sc);
    return { root, update: (t, moving) => legs.forEach((l, i) => (l.rotation.y = moving ? Math.sin(t * 12 + i * 1.3) * 0.35 : Math.sin(t * 2 + i) * 0.04)) };
  }
  function flyer(d, sc) {
    const root = new THREE.Group(), c1 = mat(d.c1), c2 = mat(d.c2, { side: THREE.DoubleSide });
    const b = mesh(sph(0.4, 10, 8), c1, 0, 0, 0); b.scale.set(0.8, 0.8, 1.3); root.add(b);
    const head = mesh(sph(0.2, 8, 6), c1, 0, 0.18, 0.55); root.add(head, mesh(cone(0.07, 0.3, 4), mat('#ffb040'), 0, 0.13, 0.82).rotateX(Math.PI / 2));
    root.add(mesh(sph(0.04, 5, 4), glow('#ffd030', 1.5), -0.09, 0.26, 0.68, false), mesh(sph(0.04, 5, 4), glow('#ffd030', 1.5), 0.09, 0.26, 0.68, false));
    const wl = new THREE.Group(), wr = new THREE.Group();
    const wingG = geo('wing', () => { const s = new THREE.Shape(); s.moveTo(0, 0.25); s.lineTo(1.4, 0.5); s.lineTo(1.1, -0.1); s.lineTo(0.5, -0.4); s.lineTo(0, -0.3); return new THREE.ShapeGeometry(s); });
    const w1 = new THREE.Mesh(wingG, c2); w1.rotation.x = -Math.PI / 2; w1.castShadow = true; wr.add(w1);
    const w2 = new THREE.Mesh(wingG, c2); w2.rotation.x = -Math.PI / 2; w2.scale.x = -1; w2.castShadow = true; wl.add(w2);
    root.add(wl, wr);
    if (d.bolt) root.add(mesh(sph(0.62, 10, 8), mat(d.bolt, { transparent: true, opacity: 0.18, emissive: new THREE.Color(d.bolt), emissiveIntensity: 0.8 }), 0, 0, 0, false));
    root.scale.setScalar(sc);
    return { root, hover: 1.7 * sc, update: (t) => { const f = Math.sin(t * 10) * 0.7; wr.rotation.z = f; wl.rotation.z = -f; } };
  }
  function ghost(d, sc, boss) {
    const root = new THREE.Group();
    const cm = mat(d.c1, { transparent: true, opacity: 0.72, emissive: new THREE.Color(d.c2), emissiveIntensity: 0.35, side: THREE.DoubleSide });
    const robe = mesh(geo('ghostrobe', () => { const g = new THREE.ConeGeometry(0.62, 1.9, 12, 4, true); g.translate(0, 0.0, 0); return g; }), cm, 0, 1.05, 0, false); root.add(robe);
    const hd = mesh(sph(0.3, 10, 8), mat(d.c2, { transparent: true, opacity: 0.85, emissive: new THREE.Color(d.c2), emissiveIntensity: 0.4 }), 0, 1.95, 0, false); root.add(hd);
    root.add(mesh(sph(0.06, 5, 4), glow(boss ? '#b060ff' : '#101020', 1.5), -0.1, 1.98, 0.25, false), mesh(sph(0.06, 5, 4), glow(boss ? '#b060ff' : '#101020', 1.5), 0.1, 1.98, 0.25, false));
    root.scale.setScalar(sc);
    return { root, hover: 0.5 * sc, update: (t) => { robe.rotation.y = t * 0.5; robe.scale.x = 1 + Math.sin(t * 3) * 0.05; } };
  }
  function worm(d, sc) {
    const root = new THREE.Group(), segs = [];
    for (let i = 0; i < 8; i++) { const s = mesh(sph(0.7 - i * 0.05, 10, 8), mat(i % 2 ? d.c1 : d.c2), 0, 0.6, -i * 0.8); root.add(s); segs.push(s); }
    root.add(mesh(sph(0.2, 6, 5), glow('#c01010', 1.2), -0.25, 0.9, 0.5, false), mesh(sph(0.2, 6, 5), glow('#c01010', 1.2), 0.25, 0.9, 0.5, false));
    root.scale.setScalar(sc * 0.8);
    return { root, update: (t) => segs.forEach((s, i) => { s.position.y = 0.6 + Math.abs(Math.sin(t * 2.2 - i * 0.7)) * 0.8 * (1 - i / 10); s.position.x = Math.sin(t * 1.6 - i * 0.6) * 0.3; }) };
  }

  // ---------- Hauptfunktionen ----------
  function classLook(cls) {
    switch (cls) {
      case 'krieger': return { body: '#8d97a8', legs: '#4a4f5c', trim: '#c0392b', hat: 'helm', wep: 'sword', cape: '#8a2a2a', metal: true, shield: true };
      case 'magier': return { body: '#4f3490', legs: '#33266a', robe: true, trim: '#e8c040', hat: 'wizard', hatc: '#4f3490', wep: 'staff', orb: '#b080ff', skin: '#e8c8a0' };
      case 'waldlaeufer': return { body: '#4a7a3a', legs: '#5a4a2a', trim: '#8a6a2a', hat: 'hood', hatc: '#2f5a2a', wep: 'bow', cape: '#2f5a2a' };
      case 'priester': return { body: '#eee8d8', legs: '#cfc8b0', robe: true, trim: '#e8c040', hair: '#c8a050', wep: 'scepter', skin: '#f0d0b0' };
    }
    return {};
  }
  function forPlayer(cls) { return humanoid(classLook(cls)); }
  function forNpc(n) {
    const o = { body: n.c, hair: n.hair, legs: '#3a2f22', trim: '#c8a24a', robe: ['aldric', 'marta', 'mirelle', 'gudrun'].includes(n.id), s: n.id === 'pip' ? 0.72 : 1 };
    o.wep = n.vendor !== undefined ? '' : ['torben', 'ardan', 'reinhild'].includes(n.id) ? 'spear' : n.craft === 'smith' ? 'club' : n.id === 'aldric' ? 'staff' : '';
    o.orb = '#ffd070';
    if (['thrain', 'borin'].includes(n.id)) { o.s = 0.82; o.wide = 1.25; }
    if (n.id === 'ardan') { o.metal = true; o.hat = 'helm'; }
    return humanoid(o);
  }
  function forMob(m) {
    const d = m.def, sc = m.sc;
    switch (d.kind) {
      case 'human': case 'bulky': {
        const bulky = d.kind === 'bulky';
        const wep = d.ranged ? 'staff' : ['skelett', 'wuestenraeuber', 'wegelagerer', 'dieb'].includes(d.id) || m.id === 'karg' || m.id === 'mortharion' ? 'sword' : ['goblin', 'zwergenabtruennig'].includes(d.id) ? 'axe' : 'club';
        const hat = m.id === 'mortharion' || m.id === 'malakor' ? 'crown' : m.id === 'goblin' ? '' : ['todesbeschwoerer', 'feuerkultist', 'schamane', 'hexenschuelerin'].includes(d.id) || m.id === 'morgraine' ? 'hood' : bulky && m.id !== 'ent' ? 'horns' : ['skelett', 'skelettschuetze', 'verfluchter'].includes(d.id) ? 'helm' : '';
        const v = humanoid({ s: sc * (bulky ? 1.1 : 1) * (d.id === 'goblin' ? 0.8 : 1), body: d.c1, skin: d.c2, legs: d.c1, boots: '#222', wide: bulky ? 1.45 : 1, wep: m.id === 'mumie' ? '' : wep, orb: d.bolt, hat, hatc: d.c1, robe: d.ranged, metal: d.id === 'verfluchter' || d.id === 'skelett' });
        if (m.id === 'ent') v.root.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === '4a3a22') { /* Rinde */ } });
        return v;
      }
      case 'beast': return beast(d, sc, m.id);
      case 'blob': return blob(d, sc);
      case 'spider': return spider(d, sc, m.id);
      case 'flyer': return flyer(d, sc);
      case 'ghost': return ghost(d, sc, m.boss);
      case 'worm': return worm(d, sc);
    }
    return humanoid({ s: sc, body: d.c1, skin: d.c2 });
  }
  return { humanoid, horse, forPlayer, forNpc, forMob, classLook, mat, glow, mesh, geo, box, cyl, cone, sph };
})();
