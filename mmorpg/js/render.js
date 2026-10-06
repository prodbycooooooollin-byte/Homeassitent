'use strict';
// =====================================================================
//  Darstellung (Canvas 2D, komplett prozedural gezeichnet)
// =====================================================================
const Render = {
  cv: null, c: null, W: 0, H: 0, cam: { x: 0, y: 0 }, tint: [255, 255, 255],
  init(cv) {
    this.cv = cv; this.c = cv.getContext('2d');
    const rs = () => { this.W = cv.width = window.innerWidth; this.H = cv.height = window.innerHeight; };
    window.addEventListener('resize', rs); rs();
  },
  screenToWorld(sx, sy) { return { x: sx + this.cam.x, y: sy + this.cam.y }; },

  draw() {
    const c = this.c, P = G.P, W = this.W, H = this.H;
    // Kamera
    const sh = G.shake;
    let tx = P.x - W / 2, ty = P.y - 14 - H / 2;
    tx = clamp(tx, -40, MW * TILE - W + 40); ty = clamp(ty, -40, MH * TILE - H + 40);
    this.cam.x += (tx - this.cam.x) * (this.first ? 0.2 : 1); this.cam.y += (ty - this.cam.y) * (this.first ? 0.2 : 1);
    this.first = true;
    const camX = Math.round(this.cam.x + (sh ? rnd(-sh, sh) : 0)), camY = Math.round(this.cam.y + (sh ? rnd(-sh, sh) : 0));
    c.fillStyle = '#10100c'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(-camX, -camY);
    // Boden
    const cx0 = Math.max(0, Math.floor(camX / 512)), cx1 = Math.min(Math.floor((MW * TILE) / 512), Math.floor((camX + W) / 512));
    const cy0 = Math.max(0, Math.floor(camY / 512)), cy1 = Math.min(Math.floor((MH * TILE) / 512), Math.floor((camY + H) / 512));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) c.drawImage(World.getChunk(cx, cy), cx * 512, cy * 512);
    const t = performance.now() / 1000;
    // animierte Kacheln (Wasser, Lava)
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1), tx1 = Math.min(MW - 1, Math.floor((camX + W) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1), ty1 = Math.min(MH - 1, Math.floor((camY + H) / TILE) + 3);
    const draws = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * MW + x, tt = World.tile[i];
      if (tt === TT.WATER) { const z = World.zone[i]; c.fillStyle = z === 2 ? 'rgba(160,210,170,.16)' : 'rgba(255,255,255,.18)'; const o = Math.sin(t * 1.5 + x * 0.9 + y * 0.6) * 4; c.fillRect(x * TILE + 8 + o, y * TILE + 10, 9, 2); c.fillRect(x * TILE + 14 - o, y * TILE + 22, 7, 2); }
      else if (tt === TT.LAVA) { c.fillStyle = `rgba(255,220,80,${0.18 + 0.15 * Math.sin(t * 2.5 + x + y * 1.3)})`; c.fillRect(x * TILE + 4, y * TILE + 4, 24, 24); }
      else if (tt === TT.TREE || tt === TT.ROCK || tt === TT.CACT || tt === TT.WALL || tt === TT.PILL || tt === TT.DEAD) draws.push({ y: (y + 1) * TILE - 2, k: 't', tt, x, ty: y });
    }
    for (const b of World.buildings) if (b.x + b.w + 2 > tx0 && b.x - 2 < tx1 && b.y + b.h + 2 > ty0 && b.y - 3 < ty1) draws.push({ y: (b.y + b.h) * TILE, k: 'b', b });
    // Bodenmarkierungen
    this.drawTele(c, t);
    const inView = (e, m = 80) => e.x > camX - m && e.x < camX + W + m && e.y > camY - m - 60 && e.y < camY + H + m + 40;
    for (const n of G.nodes) if (n.avail && inView(n)) draws.push({ y: n.y, k: 'n', n });
    for (const b of G.bags) if (inView(b)) draws.push({ y: b.y, k: 'g', b });
    for (const n of G.npcs) if (inView(n)) draws.push({ y: n.y, k: 'p', n });
    for (const m of G.mobs) if (!m.dead && inView(m, 120)) draws.push({ y: m.y, k: 'm', m });
    for (const m of G.mobs) if (m.dead && inView(m) && !m.temp) draws.push({ y: m.y - 100000, k: 'c', m });
    for (const b of G.bots) if (inView(b)) draws.push({ y: b.y, k: 'o', b });
    if (!P.dead) draws.push({ y: P.y, k: 'me' }); else draws.push({ y: P.y - 100000, k: 'grave' });
    draws.sort((a, b) => a.y - b.y);
    // Zielmarkierung
    if (G.target && !G.target.dead) { const e = G.target; this.ellipse(c, e.x, e.y + 2, (e.def ? 15 * e.sc : 14) + 3, 'rgba(0,0,0,0)', e.def ? '#ff4a3a' : '#ffe070'); }
    for (const d of draws) {
      switch (d.k) {
        case 't': this.drawObj(c, d, t); break;
        case 'b': this.drawBuilding(c, d.b); break;
        case 'n': this.drawNode(c, d.n, t); break;
        case 'g': this.drawBag(c, d.b, t); break;
        case 'p': this.drawNpc(c, d.n, t); break;
        case 'm': this.drawMob(c, d.m, t); break;
        case 'c': this.drawCorpse(c, d.m); break;
        case 'o': this.drawBot(c, d.b, t); break;
        case 'me': this.drawPlayer(c, t); break;
        case 'grave': this.drawGrave(c, P); break;
      }
    }
    // Projektile, Ringe, Partikel
    for (const p of G.projs) this.drawProj(c, p);
    for (const r of G.rings) { const k = r.t / r.life; c.strokeStyle = r.color; c.globalAlpha = 1 - k; c.lineWidth = 3; c.beginPath(); c.ellipse(r.x, r.y, r.r * (0.3 + k * 0.7), r.r * (0.3 + k * 0.7) * 0.6, 0, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    for (const p of G.parts) { c.globalAlpha = 1 - p.t / p.life; c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    c.globalAlpha = 1;
    // Namensschilder
    for (const d of draws) {
      if (d.k === 'm') this.plateMob(c, d.m); else if (d.k === 'p') this.plateNpc(c, d.n, t); else if (d.k === 'o') this.plateBot(c, d.b); else if (d.k === 'me') this.platePlayer(c);
    }
    // Schwebende Texte
    c.textAlign = 'center';
    for (const f of G.texts) {
      c.globalAlpha = Math.min(1, (f.life - f.t) * 3); c.font = `bold ${f.size}px Georgia, serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(f.txt, f.x, f.y); c.fillStyle = f.color; c.fillText(f.txt, f.x, f.y);
    }
    c.globalAlpha = 1;
    c.restore();
    this.drawLight(c, t);
  },

  // ---------- Hilfsfunktionen ----------
  ellipse(c, x, y, r, fill, stroke) {
    c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  },
  shadow(c, x, y, r) { c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x, y, r, r * 0.38, 0, 0, TAU); c.fill(); },

  drawTele(c, t) {
    for (const e of G.tele) {
      const k = clamp((G.now - e.start) / (e.at - e.start), 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * 14);
      c.fillStyle = e.color; c.globalAlpha = 0.14 + 0.12 * pulse; c.beginPath(); c.ellipse(e.x, e.y, e.r, e.r * 0.62, 0, 0, TAU); c.fill();
      c.globalAlpha = 0.35 + 0.25 * k; c.beginPath(); c.ellipse(e.x, e.y, e.r * k, e.r * k * 0.62, 0, 0, TAU); c.fill();
      c.globalAlpha = 0.9; c.strokeStyle = e.color; c.lineWidth = 2.5; c.beginPath(); c.ellipse(e.x, e.y, e.r, e.r * 0.62, 0, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
  },

  // ---------- Weltobjekte ----------
  drawObj(c, d, t) {
    const x = d.x * TILE + 16, y = (d.ty + 1) * TILE - 2, i = d.ty * MW + d.x, z = World.zone[i], v = World.vari[i], h = v / 255;
    switch (d.tt) {
      case TT.TREE: {
        this.shadow(c, x, y, 14);
        if (z === 0) {
          c.fillStyle = '#6b4a2b'; c.fillRect(x - 3, y - 18, 6, 18);
          const g = ['#3f8f35', '#4a9c3b', '#36822f'][v % 3];
          c.fillStyle = g; c.beginPath(); c.arc(x, y - 30, 15 + h * 3, 0, TAU); c.arc(x - 9, y - 22, 10, 0, TAU); c.arc(x + 9, y - 22, 10, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc(x - 4, y - 34, 7, 0, TAU); c.fill();
        } else if (z === 4) {
          c.fillStyle = '#4a3a2a'; c.fillRect(x - 2.5, y - 10, 5, 10);
          for (let k = 0; k < 3; k++) { const w = 18 - k * 4, yy = y - 10 - k * 14; c.fillStyle = '#2f5a4a'; c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x, yy - 20); c.lineTo(x + w, yy); c.fill(); c.fillStyle = '#e8f4ff'; c.beginPath(); c.moveTo(x - w * 0.6, yy - 7); c.lineTo(x, yy - 20); c.lineTo(x + w * 0.6, yy - 7); c.fill(); }
        } else {
          c.fillStyle = '#4a3320'; c.fillRect(x - 3, y - 12, 6, 12);
          for (let k = 0; k < 3; k++) { const w = 17 - k * 3.5, yy = y - 8 - k * 14; c.fillStyle = k === 1 ? '#2e6a30' : '#285c2c'; c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x, yy - 24); c.lineTo(x + w, yy); c.fill(); }
        }
        break;
      }
      case TT.DEAD: {
        this.shadow(c, x, y, 11);
        const col = z === 5 ? '#1c1414' : z === 2 ? '#4a3e30' : '#5a4a38';
        c.strokeStyle = col; c.lineWidth = 5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (h - 0.5) * 6, y - 26); c.stroke();
        c.lineWidth = 3; c.beginPath(); c.moveTo(x + (h - 0.5) * 4, y - 16); c.lineTo(x - 12, y - 30); c.moveTo(x + (h - 0.5) * 5, y - 21); c.lineTo(x + 12, y - 34); c.moveTo(x + (h - 0.5) * 6, y - 26); c.lineTo(x + 2, y - 42); c.stroke();
        if (z === 5) { c.fillStyle = 'rgba(255,120,30,.8)'; c.fillRect(x - 12, y - 31, 3, 3); }
        if (z === 2) { c.strokeStyle = 'rgba(100,140,80,.7)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 12, y - 30); c.lineTo(x - 13, y - 14); c.moveTo(x + 12, y - 34); c.lineTo(x + 14, y - 20); c.stroke(); }
        break;
      }
      case TT.CACT: {
        this.shadow(c, x, y, 10);
        c.fillStyle = '#3f8a4a'; c.fillRect(x - 5, y - 30, 10, 30); c.beginPath(); c.arc(x, y - 30, 5, 0, TAU); c.fill();
        c.fillRect(x - 14, y - 22, 9, 5); c.fillRect(x - 14, y - 30, 5, 10); c.fillRect(x + 5, y - 18, 9, 5); c.fillRect(x + 9, y - 28, 5, 12);
        c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x - 3, y - 28, 2, 26);
        break;
      }
      case TT.ROCK: {
        const tall = 10 + h * 14, base = z === 4 ? '#8c93a0' : z === 5 ? '#3b3236' : z === 3 ? '#b49a66' : '#7a7a80';
        this.shadow(c, x, y, 17);
        c.fillStyle = base; c.beginPath(); c.moveTo(x - 17, y); c.lineTo(x - 13, y - tall * 0.8); c.lineTo(x - 3, y - tall - 6); c.lineTo(x + 9, y - tall); c.lineTo(x + 17, y - tall * 0.4); c.lineTo(x + 16, y); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(x - 13, y - tall * 0.8); c.lineTo(x - 3, y - tall - 6); c.lineTo(x + 3, y - tall * 0.6); c.lineTo(x - 8, y - tall * 0.3); c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(x + 9, y - tall); c.lineTo(x + 17, y - tall * 0.4); c.lineTo(x + 16, y); c.lineTo(x + 5, y); c.closePath(); c.fill();
        if (z === 4) { c.fillStyle = '#f2f8ff'; c.beginPath(); c.moveTo(x - 9, y - tall * 0.9 - 2); c.lineTo(x - 3, y - tall - 6); c.lineTo(x + 7, y - tall - 1); c.lineTo(x + 2, y - tall * 0.7); c.closePath(); c.fill(); }
        break;
      }
      case TT.WALL: {
        const base = z === 6 ? '#4a3f62' : '#6a6a72';
        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 16, y - 3, 34, 6);
        c.fillStyle = base; c.fillRect(x - 16, y - 34, 32, 34);
        c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(x - 16, y - 34, 32, 8);
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.strokeRect(x - 15.5, y - 33.5, 31, 33);
        c.beginPath(); c.moveTo(x - 16, y - 18); c.lineTo(x + 16, y - 18); c.moveTo(x - 4, y - 26); c.lineTo(x - 4, y - 18); c.moveTo(x + 6, y - 18); c.lineTo(x + 6, y - 2); c.stroke();
        break;
      }
      case TT.PILL: {
        this.shadow(c, x, y, 13);
        c.fillStyle = '#5a4f78'; c.fillRect(x - 8, y - 46, 16, 46); c.fillStyle = '#6a5f8a'; c.fillRect(x - 11, y - 50, 22, 8); c.fillRect(x - 11, y - 6, 22, 6);
        c.fillStyle = 'rgba(180,140,255,.35)'; c.fillRect(x - 3, y - 40, 3, 36);
        break;
      }
    }
  },
  drawBuilding(c, b) {
    const T = TILE, x = b.x * T, y = b.y * T;
    if (b.kind === 'well') {
      const cx = x + 16, cy = y + 24;
      this.shadow(c, cx, cy + 4, 20);
      c.fillStyle = '#8a8a90'; c.beginPath(); c.ellipse(cx, cy, 16, 9, 0, 0, TAU); c.fill(); c.fillStyle = '#3a78b8'; c.beginPath(); c.ellipse(cx, cy - 2, 11, 6, 0, 0, TAU); c.fill();
      c.fillStyle = '#6b4a2b'; c.fillRect(cx - 14, cy - 28, 4, 28); c.fillRect(cx + 10, cy - 28, 4, 28); c.fillStyle = '#a03a2a'; c.beginPath(); c.moveTo(cx - 20, cy - 26); c.lineTo(cx, cy - 40); c.lineTo(cx + 20, cy - 26); c.fill();
      return;
    }
    const w = b.w * T, h = b.h * T, wallTop = y + T * 0.9;
    const roofs = ['#a03a2a', '#3a5a8a', '#7a5a2a', '#3a7a4a'], walls = ['#d8c8a0', '#cdbf9a', '#d4c4a8', '#c8b894'];
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 4, y + h - 2, w, 8);
    c.fillStyle = walls[b.kind % 4]; c.fillRect(x, wallTop, w, y + h - wallTop);
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 3;
    c.strokeRect(x + 1.5, wallTop + 1.5, w - 3, y + h - wallTop - 3);
    c.beginPath(); c.moveTo(x + w / 3, wallTop); c.lineTo(x + w / 3, y + h); c.moveTo(x + 2 * w / 3, wallTop); c.lineTo(x + 2 * w / 3, y + h); c.stroke();
    // Tür und Fenster
    c.fillStyle = '#4a2f1a'; c.fillRect(x + w / 2 - 9, y + h - 28, 18, 28); c.fillStyle = '#d8b04a'; c.fillRect(x + w / 2 + 4, y + h - 14, 3, 3);
    c.fillStyle = '#9fd0f0'; c.fillRect(x + 10, wallTop + 14, 14, 14); c.fillRect(x + w - 24, wallTop + 14, 14, 14);
    c.strokeStyle = '#4a2f1a'; c.lineWidth = 2; c.strokeRect(x + 10, wallTop + 14, 14, 14); c.strokeRect(x + w - 24, wallTop + 14, 14, 14);
    // Dach
    c.fillStyle = roofs[b.kind % 4];
    c.beginPath(); c.moveTo(x - 8, wallTop + 6); c.lineTo(x + 14, y - T * 0.9); c.lineTo(x + w - 14, y - T * 0.9); c.lineTo(x + w + 8, wallTop + 6); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.moveTo(x + w / 2, y - T * 0.9); c.lineTo(x + w - 14, y - T * 0.9); c.lineTo(x + w + 8, wallTop + 6); c.lineTo(x + w / 2, wallTop + 6); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
    for (let k = 1; k < 4; k++) { const yy = y - T * 0.9 + k * (wallTop + 6 - (y - T * 0.9)) / 4; c.beginPath(); c.moveTo(x - 8 + (14 + 8) * (1 - k / 4) + 0, yy); c.lineTo(x + w + 8 - (14 + 8) * (1 - k / 4), yy); c.stroke(); }
    c.fillStyle = '#5a5a5a'; c.fillRect(x + w - 30, y - T * 1.3, 8, 18);
  },
  drawNode(c, n, t) {
    const nt = NODE_TYPES[n.type], x = n.x, y = n.y + 8;
    this.shadow(c, x, y, 10);
    const glow = 0.5 + 0.5 * Math.sin(t * 3 + n.x);
    c.fillStyle = nt.col; c.globalAlpha = 0.18 + 0.15 * glow; c.beginPath(); c.arc(x, y - 8, 17, 0, TAU); c.fill(); c.globalAlpha = 1;
    if (nt.kind === 'herb') {
      c.strokeStyle = '#2f7a2f'; c.lineWidth = 2;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + k * 4, y - 10, x + k * 7, y - 16 - Math.abs(k) * -1); c.stroke(); }
      c.fillStyle = nt.col; for (let k = -2; k <= 2; k += 2) { c.beginPath(); c.arc(x + k * 7, y - 16, 4, 0, TAU); c.fill(); }
    } else {
      c.fillStyle = '#6a6a72'; c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x - 8, y - 12); c.lineTo(x + 3, y - 15); c.lineTo(x + 12, y - 6); c.lineTo(x + 11, y); c.fill();
      c.fillStyle = nt.col; c.beginPath(); c.moveTo(x - 4, y - 8); c.lineTo(x, y - 20); c.lineTo(x + 4, y - 8); c.fill(); c.beginPath(); c.moveTo(x + 3, y - 4); c.lineTo(x + 8, y - 14); c.lineTo(x + 11, y - 4); c.fill();
    }
    c.fillStyle = '#fff'; c.globalAlpha = glow; c.fillRect(x - 6 + Math.sin(t * 2) * 6, y - 22 + Math.cos(t * 2.3) * 4, 2, 2); c.globalAlpha = 1;
  },
  drawBag(c, b, t) {
    const x = b.x, y = b.y + 6 + Math.sin(t * 3) * 1.5;
    this.shadow(c, x, b.y + 8, 9);
    c.fillStyle = '#7a5a2a'; c.beginPath(); c.ellipse(x, y - 5, 9, 8, 0, 0, TAU); c.fill(); c.fillStyle = '#5a3f1a'; c.fillRect(x - 4, y - 14, 8, 5); c.fillStyle = '#d8b04a'; c.fillRect(x - 5, y - 10, 10, 2);
    c.fillStyle = '#fff'; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); c.fillRect(x + 7, y - 16, 3, 3); c.fillRect(x - 10, y - 10, 2, 2); c.globalAlpha = 1;
  },
  drawGrave(c, P) {
    const x = P.x, y = P.y; this.shadow(c, x, y, 12);
    c.fillStyle = '#8a8a90'; c.fillRect(x - 9, y - 26, 18, 26); c.beginPath(); c.arc(x, y - 26, 9, Math.PI, 0); c.fill();
    c.fillStyle = '#5a5a60'; c.fillRect(x - 2, y - 30, 4, 14); c.fillRect(x - 6, y - 25, 12, 4);
  },

  // ---------- Figuren ----------
  humanoid(c, x, y, o) {
    const s = o.s || 1, t = o.t || 0, mv = o.moving, bob = mv ? Math.abs(Math.sin(t * 10)) * -2 : Math.sin(t * 2) * 0.5, leg = mv ? Math.sin(t * 10) * 5 : 0;
    c.save(); c.translate(x, y); c.scale(s * (o.dir < 0 ? -1 : 1), s);
    if (!o.noShadow) this.shadow(c, 0, 0, 11);
    const wide = o.wide || 1;
    // Beine
    c.fillStyle = o.legs || '#4a3a2a'; c.fillRect(-5 * wide, -10 + bob * 0.3, 4 * wide, 10 - leg * 0.15 + (leg > 0 ? -leg * 0.3 : 0)); c.fillRect(1 * wide, -10 + bob * 0.3, 4 * wide, 10 + (leg < 0 ? leg * 0.3 : 0));
    c.fillStyle = o.boots || '#2a1f14'; c.fillRect(-6 * wide + leg * 0.5, -3, 5 * wide, 3); c.fillRect(1 * wide - leg * 0.5, -3, 5 * wide, 3);
    // Weitere Rückenelemente (Umhang)
    if (o.cape) { c.fillStyle = o.cape; c.beginPath(); c.moveTo(-6 * wide, -25 + bob); c.lineTo(-10 * wide, -6 + bob); c.lineTo(2, -8 + bob); c.closePath(); c.fill(); }
    // Körper
    c.fillStyle = o.body; c.beginPath(); c.roundRect(-7 * wide, -25 + bob, 14 * wide, 16, 3); c.fill();
    if (o.robe) { c.beginPath(); c.moveTo(-7 * wide, -12 + bob); c.lineTo(-9 * wide, -2); c.lineTo(9 * wide, -2); c.lineTo(7 * wide, -12 + bob); c.fill(); }
    if (o.trim) { c.fillStyle = o.trim; c.fillRect(-7 * wide, -17 + bob, 14 * wide, 3); }
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(-7 * wide, -25 + bob, 5 * wide, 16);
    // Arm hinten
    c.fillStyle = o.skin || '#e0b080'; c.fillRect(-9 * wide, -23 + bob, 3, 10);
    // Kopf
    c.fillStyle = o.skin || '#e0b080'; c.beginPath(); c.arc(0, -30 + bob, 6.2, 0, TAU); c.fill();
    c.fillStyle = '#222'; c.fillRect(2, -31 + bob, 1.8, 1.8);
    // Haare / Kopfbedeckung
    if (o.hair) { c.fillStyle = o.hair; c.beginPath(); c.arc(0, -32 + bob, 6.4, Math.PI * 1.05, Math.PI * 1.95); c.fill(); c.fillRect(-6.4, -32 + bob, 3, 6); }
    if (o.hat === 'helm') { c.fillStyle = '#9aa4b4'; c.beginPath(); c.arc(0, -31 + bob, 7, Math.PI, 0); c.fill(); c.fillRect(-7, -31 + bob, 14, 3); c.fillStyle = '#c0392b'; c.fillRect(-1, -42 + bob, 3, 6); }
    else if (o.hat === 'wizard') { c.fillStyle = o.hatc || '#5a3a9a'; c.beginPath(); c.moveTo(-9, -34 + bob); c.lineTo(0, -52 + bob); c.lineTo(9, -34 + bob); c.closePath(); c.fill(); c.fillRect(-10, -35 + bob, 20, 3); }
    else if (o.hat === 'hood') { c.fillStyle = o.hatc || '#2f6a3a'; c.beginPath(); c.arc(0, -31 + bob, 7.4, Math.PI * 0.95, Math.PI * 2.05); c.fill(); c.fillRect(-7.4, -31 + bob, 4, 8); }
    else if (o.hat === 'crown') { c.fillStyle = '#e8c040'; c.fillRect(-6, -38 + bob, 12, 4); c.beginPath(); c.moveTo(-6, -38 + bob); c.lineTo(-4, -43 + bob); c.lineTo(-1, -38 + bob); c.lineTo(2, -43 + bob); c.lineTo(5, -38 + bob); c.fill(); }
    else if (o.hat === 'horns') { c.fillStyle = '#d8d2bc'; c.beginPath(); c.moveTo(-5, -34 + bob); c.lineTo(-9, -44 + bob); c.lineTo(-2, -36 + bob); c.moveTo(5, -34 + bob); c.lineTo(9, -44 + bob); c.lineTo(2, -36 + bob); c.fill(); }
    // Waffe / Arm vorne
    const att = o.att || 0, ang = att > 0 ? -1.4 + att * 2.6 : (mv ? Math.sin(t * 10) * 0.3 : 0.1);
    c.save(); c.translate(6 * wide, -21 + bob); c.rotate(ang);
    c.fillStyle = o.skin || '#e0b080'; c.fillRect(-1.5, 0, 3.5, 9);
    c.translate(0, 8);
    switch (o.wep) {
      case 'sword': c.fillStyle = '#d8dce8'; c.fillRect(-1.5, 0, 3, 17); c.fillStyle = '#c8a24a'; c.fillRect(-4, -1, 8, 2.5); break;
      case 'club': c.fillStyle = '#6b4a2b'; c.fillRect(-2, -2, 4, 15); c.beginPath(); c.arc(0, 15, 5, 0, TAU); c.fill(); break;
      case 'axe': c.fillStyle = '#6b4a2b'; c.fillRect(-1, -2, 2.5, 18); c.fillStyle = '#b8c0cc'; c.beginPath(); c.moveTo(1, 8); c.lineTo(9, 5); c.lineTo(9, 16); c.lineTo(1, 13); c.fill(); break;
      case 'staff': c.fillStyle = '#6b4a2b'; c.fillRect(-1, -14, 2.5, 30); c.fillStyle = o.orb || '#a070ff'; c.beginPath(); c.arc(0, -16, 4, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-1.5, -18, 2, 2); break;
      case 'scepter': c.fillStyle = '#c8a24a'; c.fillRect(-1, -8, 2.5, 22); c.fillStyle = '#fff2a0'; c.beginPath(); c.arc(0, -10, 4, 0, TAU); c.fill(); break;
      case 'bow': c.strokeStyle = '#8a5a2a'; c.lineWidth = 2; c.beginPath(); c.arc(4, 6, 12, -1.2, 1.2); c.stroke(); c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(4 + Math.cos(-1.2) * 12, 6 + Math.sin(-1.2) * 12); c.lineTo(4 + Math.cos(1.2) * 12, 6 + Math.sin(1.2) * 12); c.stroke(); break;
      case 'spear': c.fillStyle = '#6b4a2b'; c.fillRect(-1, -16, 2.5, 38); c.fillStyle = '#c8d0dc'; c.beginPath(); c.moveTo(-3, -16); c.lineTo(0, -26); c.lineTo(3, -16); c.fill(); break;
      case 'dagger': c.fillStyle = '#c8d0dc'; c.fillRect(-1, 0, 2.5, 10); break;
    }
    c.restore();
    c.restore();
  },
  classLook(cls, t) {
    switch (cls) {
      case 'krieger': return { body: '#8d97a8', legs: '#4a4f5c', trim: '#c0392b', hat: 'helm', wep: 'sword', cape: '#8a2a2a', skin: '#e0b080' };
      case 'magier': return { body: '#5a3a9a', legs: '#3a2a6a', robe: true, trim: '#e8c040', hat: 'wizard', wep: 'staff', orb: '#b080ff', skin: '#e8c8a0' };
      case 'waldlaeufer': return { body: '#4a7a3a', legs: '#5a4a2a', trim: '#8a6a2a', hat: 'hood', wep: 'bow', cape: '#2f5a2a', skin: '#e0b080' };
      case 'priester': return { body: '#eee8d8', legs: '#cfc8b0', robe: true, trim: '#e8c040', hair: '#c8a050', wep: 'scepter', skin: '#f0d0b0' };
    }
    return {};
  },
  drawPlayer(c, t) {
    const P = G.P, look = this.classLook(P.cls);
    const att = G.now - (P.castAnim || -9) < 0.3 ? (G.now - P.castAnim) / 0.3 : 0;
    if (P.mounted) { this.drawHorse(c, P.x, P.y, P.dir, P.moving, t); this.humanoid(c, P.x, P.y - 12, Object.assign({ dir: P.dir, t, moving: false, att, noShadow: true }, look)); }
    else this.humanoid(c, P.x, P.y, Object.assign({ dir: P.dir, t, moving: P.moving, att }, look));
    if (hasFx(P, 'shield')) { c.strokeStyle = 'rgba(150,210,255,.8)'; c.lineWidth = 2; c.beginPath(); c.arc(P.x, P.y - 18, 22, 0, TAU); c.stroke(); c.fillStyle = 'rgba(150,210,255,.15)'; c.fill(); }
    if (hasFx(P, 'stun')) { c.fillStyle = '#ffe070'; for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; c.fillRect(P.x + Math.cos(a) * 12 - 2, P.y - 46 + Math.sin(a) * 4, 4, 4); } }
    if (P.gather) {
      const k = (G.now - P.gather.start) / (P.gather.until - P.gather.start);
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(P.x - 22, P.y - 62, 44, 6); c.fillStyle = '#7ad07a'; c.fillRect(P.x - 21, P.y - 61, 42 * clamp(k, 0, 1), 4);
    }
  },
  drawHorse(c, x, y, dir, mv, t) {
    c.save(); c.translate(x, y); c.scale(dir < 0 ? -1 : 1, 1);
    this.shadow(c, 0, 0, 20);
    const leg = mv ? Math.sin(t * 14) * 6 : 0;
    c.fillStyle = '#6a4222';
    c.fillRect(-14, -12, 4, 12 + (leg > 0 ? -leg * 0.3 : 0)); c.fillRect(-8, -12, 4, 12 + (leg < 0 ? leg * 0.3 : 0)); c.fillRect(8, -12, 4, 12 + (leg < 0 ? leg * 0.3 : 0)); c.fillRect(14, -12, 4, 12 + (leg > 0 ? -leg * 0.3 : 0));
    c.fillStyle = '#8a5a30'; c.beginPath(); c.ellipse(0, -18, 19, 9, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(14, -22); c.lineTo(22, -34); c.lineTo(30, -30); c.lineTo(20, -16); c.fill();
    c.fillStyle = '#3a2412'; c.beginPath(); c.moveTo(14, -24); c.lineTo(20, -36); c.lineTo(22, -34); c.lineTo(16, -22); c.fill(); c.fillRect(-22, -22, 5, 10);
    c.fillStyle = '#a03a2a'; c.fillRect(-4, -26, 10, 4);
    c.restore();
  },
  drawBot(c, b, t) {
    const look = this.classLook(b.cls);
    this.humanoid(c, b.x, b.y, Object.assign({ dir: b.dir, t: b.anim, moving: b.moving }, look));
  },
  drawNpc(c, n, t) {
    const look = n.id === 'pip' ? { s: 0.78 } : {};
    this.humanoid(c, n.x, n.y, Object.assign({ dir: n.x < G.P.x ? 1 : -1, t: n.anim + t * 0.2, moving: false, body: n.c, hair: n.hair, legs: '#3a2f22', trim: '#c8a24a',
      wep: n.vendor !== undefined ? '' : n.id === 'torben' || n.id === 'ardan' || n.id === 'reinhild' ? 'spear' : n.craft === 'smith' ? 'club' : n.id === 'aldric' ? 'staff' : '', orb: '#ffd070', robe: n.id === 'aldric' || n.id === 'marta' || n.id === 'mirelle' || n.id === 'gudrun' }, look));
    // Zwerge kleiner/breiter
    const mk = npcMarker(n);
    if (mk) {
      const by = n.y - 64 + Math.sin(t * 4) * 3;
      c.font = 'bold 26px Georgia'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#000';
      const txt = mk === 'avail' ? '!' : '?', col = mk === 'avail' ? '#ffd23f' : mk === 'ready' ? '#ffd23f' : '#9a9a9a';
      c.strokeText(txt, n.x, by); c.fillStyle = col; c.fillText(txt, n.x, by);
    }
  },
  // Monsterformen
  drawMob(c, m, t) {
    const d = m.def, x = m.x, y = m.y, s = m.sc, mv = m.state !== 'idle' || m.wmove, dir = m.dir, an = m.anim;
    const stun = hasFx(m, 'stun');
    if (m.boss || m.elite) {
      const g = c.createRadialGradient(x, y - 10 * s, 4, x, y - 10 * s, 36 * s);
      g.addColorStop(0, m.boss ? 'rgba(255,60,40,.28)' : 'rgba(255,215,64,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - 40 * s, y - 50 * s, 80 * s, 80 * s);
    }
    const atk = G.now - (m.atkAnim || -9) < 0.28 ? (G.now - m.atkAnim) / 0.28 : 0;
    c.save();
    if (m.flash > 0) c.filter = 'brightness(2.2)';
    switch (d.kind) {
      case 'human': case 'bulky': {
        const bulky = d.kind === 'bulky';
        const wep = d.ranged ? 'staff' : d.id === 'skelett' || d.id === 'wuestenraeuber' || d.id === 'wegelagerer' || d.id === 'dieb' || m.id === 'karg' ? 'sword' : d.id === 'goblin' || d.id === 'zwergenabtruennig' ? 'axe' : bulky ? 'club' : d.id === 'mortharion' ? 'sword' : 'club';
        this.humanoid(c, x, y, { s: s * (bulky ? 1.1 : 1), dir, t: an, moving: mv, att: atk, body: d.c1, skin: d.c2, legs: d.c1, boots: '#222', wide: bulky ? 1.5 : 1,
          wep: m.id === 'mumie' ? '' : wep, orb: d.bolt, hat: m.id === 'mortharion' || m.id === 'malakor' ? 'crown' : m.id === 'goblin' ? '' : d.id === 'todesbeschwoerer' || d.id === 'feuerkultist' || d.id === 'schamane' || d.id === 'hexenschuelerin' || m.id === 'morgraine' ? 'hood' : bulky && m.id !== 'ent' ? 'horns' : d.id === 'skelett' || d.id === 'skelettschuetze' ? 'helm' : '',
          hatc: d.c1, robe: d.ranged });
        break;
      }
      case 'beast': {
        c.translate(x, y); c.scale(s * (dir < 0 ? -1 : 1), s);
        this.shadow(c, 0, 0, 16);
        const leg = mv ? Math.sin(an * 1.4) * 5 : 0, lunge = atk ? Math.sin(atk * Math.PI) * 6 : 0;
        c.fillStyle = d.c1;
        c.fillRect(-12, -9, 4, 9 + leg * 0.3); c.fillRect(-6, -9, 4, 9 - leg * 0.3); c.fillRect(6, -9, 4, 9 + leg * 0.3); c.fillRect(12, -9, 4, 9 - leg * 0.3);
        c.beginPath(); c.ellipse(0, -15, 17, 8.5, 0, 0, TAU); c.fill();
        c.fillStyle = d.c2; c.beginPath(); c.ellipse(1, -12, 11, 4, 0, 0, TAU); c.fill();
        c.fillStyle = d.c1; c.beginPath(); c.ellipse(17 + lunge, -20, 8, 7, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(14 + lunge, -26); c.lineTo(16 + lunge, -33); c.lineTo(19 + lunge, -26); c.fill();
        c.fillStyle = d.c2; c.beginPath(); c.ellipse(23 + lunge, -18, 4, 3, 0, 0, TAU); c.fill();
        c.fillStyle = '#ff3a2a'; c.fillRect(19 + lunge, -23, 2.2, 2.2);
        c.strokeStyle = d.c1; c.lineWidth = 3; c.beginPath(); c.moveTo(-16, -16); c.quadraticCurveTo(-24, -22 + Math.sin(an) * 3, -22, -28); c.stroke();
        if (d.id === 'eber' || m.id === 'grunthar') { c.fillStyle = '#f2ecd8'; c.beginPath(); c.moveTo(23 + lunge, -18); c.lineTo(28 + lunge, -24); c.lineTo(25 + lunge, -16); c.fill(); }
        if (d.id === 'hase') { c.fillStyle = d.c1; c.fillRect(14, -36, 3, 10); c.fillRect(18, -36, 3, 10); }
        break;
      }
      case 'blob': {
        c.translate(x, y); c.scale(s, s); this.shadow(c, 0, 0, 13);
        const sq = 1 + Math.sin(an * (mv ? 1.5 : 0.8)) * 0.1;
        c.fillStyle = d.c1; c.globalAlpha = 0.92; c.beginPath(); c.ellipse(0, -9 * sq, 14 / sq, 11 * sq, 0, Math.PI, 0); c.lineTo(14 / sq, 0); c.lineTo(-14 / sq, 0); c.fill(); c.globalAlpha = 1;
        c.fillStyle = d.c2; c.beginPath(); c.ellipse(-4, -14 * sq, 4, 3, 0, 0, TAU); c.fill();
        c.fillStyle = '#222'; c.fillRect(-5, -8, 3, 4); c.fillRect(3, -8, 3, 4);
        break;
      }
      case 'spider': {
        c.translate(x, y); c.scale(s * (dir < 0 ? -1 : 1), s); this.shadow(c, 0, 0, 16);
        c.strokeStyle = d.c1; c.lineWidth = 2.5;
        for (let k = 0; k < 4; k++) { const ph = Math.sin(an * 1.6 + k * 1.7) * (mv ? 4 : 1); c.beginPath(); c.moveTo(-4 + k * 3, -10); c.lineTo(-14 + k * 7, -20 + ph); c.lineTo(-18 + k * 9, 0 + ph * 0.3); c.stroke(); c.beginPath(); c.moveTo(-4 + k * 3, -10); c.lineTo(-14 + k * 7, -2 - ph); c.lineTo(-20 + k * 10, 0); c.stroke(); }
        c.fillStyle = d.c1; c.beginPath(); c.ellipse(-4, -12, 11, 9, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(9, -11, 6, 5, 0, 0, TAU); c.fill();
        c.fillStyle = d.c2; c.beginPath(); c.arc(-6, -14, 3.5, 0, TAU); c.fill(); c.fillStyle = '#ff3030'; c.fillRect(11, -14, 2, 2); c.fillRect(13, -12, 2, 2);
        if (d.id === 'skorpion') { c.strokeStyle = d.c1; c.lineWidth = 3; c.beginPath(); c.moveTo(-14, -14); c.quadraticCurveTo(-26, -24, -18, -34); c.stroke(); c.fillStyle = d.c2; c.beginPath(); c.arc(-17, -34, 3, 0, TAU); c.fill(); }
        break;
      }
      case 'flyer': {
        const hover = Math.sin(an * 0.8) * 4 - 22 * s;
        c.translate(x, y); this.shadow(c, 0, 0, 12 * s); c.scale(s * (dir < 0 ? -1 : 1), s); c.translate(0, hover / s);
        const fl = Math.sin(an * 3) * 0.6;
        c.fillStyle = d.c2; c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(-2, -4); c.lineTo(-20, -18 - fl * 14); c.lineTo(-10, 0); c.fill(); c.beginPath(); c.moveTo(2, -4); c.lineTo(20, -18 - fl * 14); c.lineTo(10, 0); c.fill(); c.globalAlpha = 1;
        c.fillStyle = d.c1; c.beginPath(); c.ellipse(0, 0, 8, 10, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(8, -8, 5, 0, TAU); c.fill();
        c.fillStyle = d.c2; c.beginPath(); c.moveTo(12, -8); c.lineTo(19, -6); c.lineTo(12, -5); c.fill(); c.fillStyle = '#ffd030'; c.fillRect(8, -10, 2, 2);
        if (d.bolt) { c.fillStyle = d.bolt; c.globalAlpha = 0.5; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); c.globalAlpha = 1; }
        break;
      }
      case 'ghost': {
        const hover = Math.sin(an * 0.9) * 4 - 16 * s;
        c.translate(x, y); this.shadow(c, 0, 0, 11 * s); c.scale(s, s); c.translate(0, hover / s);
        c.globalAlpha = 0.78;
        const g = c.createLinearGradient(0, -34, 0, 6); g.addColorStop(0, d.c2); g.addColorStop(1, d.c1);
        c.fillStyle = g; c.beginPath(); c.arc(0, -22, 11, Math.PI, 0); c.lineTo(11, 0);
        for (let k = 0; k < 5; k++) c.lineTo(11 - (k + 1) * 4.4, k % 2 ? -2 : 6 + Math.sin(an * 2 + k) * 2);
        c.fill(); c.globalAlpha = 1;
        c.fillStyle = '#111'; c.fillRect(-5, -24, 3, 5); c.fillRect(3, -24, 3, 5);
        if (m.boss) { c.fillStyle = '#b060ff'; c.fillRect(-4, -23, 2, 2); c.fillRect(4, -23, 2, 2); }
        break;
      }
      case 'worm': {
        c.translate(x, y); c.scale(s, s); this.shadow(c, 0, 0, 22);
        for (let k = 6; k >= 0; k--) { const px = -k * 10 + 10, py = -10 - Math.abs(Math.sin(an * 1.2 - k * 0.6)) * 14 * (1 - k / 9); c.fillStyle = k % 2 ? d.c1 : d.c2; c.beginPath(); c.arc(px * (dir < 0 ? -1 : 1), py, 12 - k * 0.8, 0, TAU); c.fill(); }
        c.fillStyle = '#7a1a1a'; c.beginPath(); c.arc(14 * (dir < 0 ? -1 : 1), -14, 6, 0, TAU); c.fill();
        break;
      }
      default: this.humanoid(c, x, y, { s, dir, t: an, moving: mv, body: d.c1, skin: d.c2 });
    }
    c.restore();
    if (stun) { c.fillStyle = '#ffe070'; for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; c.fillRect(x + Math.cos(a) * 12 - 2, y - 44 * s + Math.sin(a) * 4, 4, 4); } }
    if (hasFx(m, 'slow')) { c.strokeStyle = 'rgba(140,220,255,.8)'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 14 * s, 6 * s, 0, 0, TAU); c.stroke(); }
    if (hasFx(m, 'dot')) { c.fillStyle = 'rgba(160,80,220,.8)'; c.fillRect(x + Math.sin(t * 6) * 8, y - 30 * s - ((t * 30) % 14), 3, 3); }
  },
  drawCorpse(c, m) {
    c.save(); c.globalAlpha = 0.5; c.translate(m.x, m.y); c.scale(m.sc, m.sc * 0.35);
    c.fillStyle = m.def.c1; c.beginPath(); c.ellipse(0, -4, 17, 12, 0, 0, TAU); c.fill(); c.restore();
  },
  drawProj(c, p) {
    c.save();
    if (p.arrow) { c.translate(p.x, p.y); c.rotate(p.ang || 0); c.strokeStyle = '#d8c8a0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 0); c.lineTo(8, 0); c.stroke(); c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(8, -3); c.lineTo(13, 0); c.lineTo(8, 3); c.fill(); }
    else {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.6); g.addColorStop(0, '#fff'); g.addColorStop(0.35, p.col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.size * 2.6, 0, TAU); c.fill();
      if (p.trail && Math.random() < 0.6) G.parts.push({ x: p.x, y: p.y, vx: rnd(-20, 20), vy: rnd(-20, 20), color: p.col, t: 0, life: 0.3, size: 3 });
    }
    c.restore();
  },

  // ---------- Namensschilder ----------
  diffColor(lv) {
    const d = lv - G.P.level;
    return d >= 6 ? '#ff3030' : d >= 3 ? '#ff9a2a' : d >= -2 ? '#ffe040' : d >= -6 ? '#4fd34f' : '#aaaaaa';
  },
  bar(c, x, y, w, h, k, col) {
    c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2); c.fillStyle = '#3a0f0f'; c.fillRect(x - w / 2, y, w, h); c.fillStyle = col; c.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h);
  },
  text(c, txt, x, y, col, size = 12) {
    c.font = `bold ${size}px Georgia, serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.9)'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y);
  },
  plateMob(c, m) {
    const show = m === G.target || m === UI.hover || m.state === 'chase' || m.boss || m.elite || m.hp < m.maxhp;
    const top = m.y - (m.def.kind === 'flyer' || m.def.kind === 'ghost' ? 66 : 48) * m.sc - 4;
    if (!show && !(m.lvl >= G.P.level + 3)) return;
    if (show) this.bar(c, m.x, top + 6, 44 * Math.max(1, m.sc * 0.8), 5, m.hp / m.maxhp, m.boss ? '#c0392b' : m.elite ? '#e0a020' : '#d33');
    const tag = m.boss ? '👑 ' : m.elite ? '★ ' : '';
    this.text(c, `${tag}${m.name}`, m.x, top, m.boss ? '#ff9a5a' : this.diffColor(m.lvl), 12);
    this.text(c, `Lv ${m.lvl}`, m.x, top + 22, this.diffColor(m.lvl), 10);
  },
  plateNpc(c, n, t) { this.text(c, n.name, n.x, n.y - 48, '#7aff7a', 12); this.text(c, `<${n.title}>`, n.x, n.y - 35, '#cfe8cf', 10); },
  plateBot(c, b) { this.text(c, `${b.name}`, b.x, b.y - 46, '#6fb0ff', 11); },
  platePlayer(c) { const P = G.P; this.text(c, P.name, P.x, P.y - (P.mounted ? 62 : 48), '#ffe9a0', 12); },

  // ---------- Licht ----------
  drawLight(c, t) {
    const P = G.P, W = this.W, H = this.H;
    const phase = (G.clock / 600 + 0.1) % 1, dark = clamp((0.5 - 0.5 * Math.cos(phase * TAU)) * 1.4 - 0.25, 0, 0.62);
    let tint = [255, 255, 255];
    const z = P.zone === undefined ? 0 : P.zone;
    if (z === 6) tint = [170, 150, 215]; else if (z === 5) tint = [255, 215, 185]; else if (z === 4) tint = [225, 238, 255]; else if (z === 3) tint = [255, 244, 215]; else if (z === 2) tint = [215, 235, 205];
    for (let i = 0; i < 3; i++) this.tint[i] += (tint[i] - this.tint[i]) * 0.02;
    const night = [90, 105, 175];
    const r = this.tint[0] * (1 - dark) + night[0] * dark, g = this.tint[1] * (1 - dark) + night[1] * dark, b = this.tint[2] * (1 - dark) + night[2] * dark;
    c.globalCompositeOperation = 'multiply'; c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    // Vignette
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.35 + dark * 0.2})`); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // Lebensrand bei wenig HP
    if (P.hp / P.st.maxHp < 0.3 && !P.dead) { const a = 0.25 + 0.15 * Math.sin(t * 6); const rg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7); rg.addColorStop(0, 'rgba(160,0,0,0)'); rg.addColorStop(1, `rgba(160,0,0,${a})`); c.fillStyle = rg; c.fillRect(0, 0, W, H); }
    if (P.dead) { c.fillStyle = 'rgba(20,0,0,.5)'; c.fillRect(0, 0, W, H); }
  },
};
