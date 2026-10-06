'use strict';
// =====================================================================
//  Weltgenerierung, Kollision, Wegfindung, Karten
// =====================================================================
const TT = { G: 0, TREE: 1, WATER: 2, ROCK: 3, CACT: 4, LAVA: 5, BUILD: 6, ROAD: 7, MUD: 8, WALL: 9, PILL: 10, DEAD: 11, FLOWER: 12, BONES: 13, TRAIL: 14 };
const BLOCKS = new Uint8Array(16);
[1, 2, 3, 4, 5, 6, 9, 10, 11].forEach(i => (BLOCKS[i] = 1));

function zoneRaw(x, y) {
  if (y >= 102) return 0;
  if (y >= 74) return 1;
  if (y >= 50) return x < 80 ? 2 : 3;
  if (x >= 58 && x < 102) return 6;
  return x < 80 ? 4 : 5;
}
function zoneAtTile(x, y) {
  const jx = (fbm(x * 0.07, y * 0.07, 3) - 0.5) * 9, jy = (fbm(x * 0.07, y * 0.07, 4) - 0.5) * 9;
  return zoneRaw(x + jx, y + jy);
}

const World = {
  tile: new Uint8Array(MW * MH), zone: new Uint8Array(MW * MH), vari: new Uint8Array(MW * MH), reach: new Uint8Array(MW * MH),
  buildings: [], lairs: [], nodePoints: [], chunks: new Map(), mm: null,

  idx: (x, y) => y * MW + x,
  tileAt(x, y) { return x < 0 || y < 0 || x >= MW || y >= MH ? TT.ROCK : this.tile[y * MW + x]; },
  blockedTile(x, y) { return x < 0 || y < 0 || x >= MW || y >= MH || BLOCKS[this.tile[y * MW + x]] === 1; },
  blockedPx(x, y, r) {
    const rx = r, ry = r * 0.55;
    const x0 = Math.floor((x - rx) / TILE), x1 = Math.floor((x + rx) / TILE), y0 = Math.floor((y - ry) / TILE), y1 = Math.floor((y + ry) / TILE);
    return this.blockedTile(x0, y0) || this.blockedTile(x1, y0) || this.blockedTile(x0, y1) || this.blockedTile(x1, y1);
  },
  zoneAtPx(x, y) {
    const tx = clamp(Math.floor(x / TILE), 0, MW - 1), ty = clamp(Math.floor(y / TILE), 0, MH - 1);
    return this.zone[ty * MW + tx];
  },
  hubAt(x, y, extra = 0) {
    for (const h of HUBS) if (Math.hypot(x - h.x * TILE - TILE / 2, y - h.y * TILE - TILE / 2) < (HUB_SAFE + extra) * TILE) return h;
    return null;
  },
  nearestHub(x, y) {
    let best = null, bd = 1e12;
    for (const h of HUBS) { const d = Math.hypot(x - h.x * TILE, y - h.y * TILE); if (d < bd) { bd = d; best = h; } }
    return best;
  },

  // ----- Generierung ------------------------------------------------
  build() {
    const tile = this.tile, zone = this.zone, vari = this.vari;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x, z = zoneAtTile(x, y);
        zone[i] = z; vari[i] = Math.floor(hash2(x, y, 5) * 256);
        const n = fbm(x * 0.12, y * 0.12, 1), n2 = fbm(x * 0.22 + 50, y * 0.22 + 50, 2), h = hash2(x, y, 9);
        let t = TT.G;
        switch (z) {
          case 0:
            if (n < 0.3) t = TT.WATER; else if (n2 > 0.64 && h < 0.8) t = TT.TREE; else if (h < 0.05) t = TT.FLOWER; else if (h < 0.06) t = TT.ROCK; break;
          case 1:
            if (n2 < 0.28) t = TT.WATER; else if (n > 0.52 && h < 0.8) t = TT.TREE; else if (h < 0.05) t = TT.TREE; else if (h < 0.08) t = TT.FLOWER; break;
          case 2:
            if (n < 0.36) t = TT.WATER; else if (n < 0.42) t = TT.MUD; else if (n2 > 0.6 && h < 0.6) t = TT.DEAD; else if (h < 0.03) t = TT.DEAD; break;
          case 3:
            if (h < 0.025) t = TT.CACT; else if (n2 > 0.66 && h < 0.7) t = TT.ROCK; else if (h < 0.035) t = TT.BONES; break;
          case 4:
            if (n > 0.56 && h < 0.85) t = TT.ROCK; else if (n2 < 0.32 && h < 0.8) t = TT.TREE; else if (h < 0.025) t = TT.TREE; break;
          case 5:
            if (n < 0.34) t = TT.LAVA; else if (n2 > 0.64 && h < 0.7) t = TT.ROCK; else if (h < 0.02) t = TT.DEAD; else if (h < 0.035) t = TT.BONES; break;
          case 6:
            if (n2 > 0.62 && h < 0.8) t = TT.WALL; else if (h < 0.012) t = TT.PILL; else if (h < 0.04) t = TT.BONES; break;
        }
        // Randgebirge
        const edge = Math.min(x, y, MW - 1 - x, MH - 1 - y);
        if (edge < 2 + Math.floor(n * 3)) t = TT.ROCK;
        tile[i] = t;
      }
    }
    // Festungsmauern
    for (let y = 0; y < 38; y++) for (const x of [58, 59, 100, 101]) tile[y * MW + x] = TT.WALL;
    for (let x = 60; x < 100; x++) for (const y of [34, 35]) if (x < 77 || x > 83) tile[y * MW + x] = TT.WALL;
    // Siedlungen räumen + bauen
    this.buildings = [];
    for (const hub of HUBS) {
      for (let y = hub.y - 13; y <= hub.y + 13; y++) for (let x = hub.x - 13; x <= hub.x + 13; x++) {
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const d = Math.hypot(x - hub.x, y - hub.y);
        if (d <= 12) tile[y * MW + x] = d <= 4.5 ? TT.ROAD : TT.G;
      }
      HUB_BUILDINGS.forEach((b, bi) => {
        const bx = hub.x + b[0], by = hub.y + b[1];
        this.buildings.push({ x: bx, y: by, w: b[2], h: b[3], kind: (bi + HUBS.indexOf(hub)) % 4, hub: hub.id });
        for (let yy = by; yy < by + b[3]; yy++) for (let xx = bx; xx < bx + b[2]; xx++) tile[yy * MW + xx] = TT.BUILD;
      });
      this.buildings.push({ x: hub.x, y: hub.y, w: 1, h: 1, kind: 'well', hub: hub.id });
      tile[hub.y * MW + hub.x] = TT.BUILD;
    }
    // Wege
    const hubById = {}; HUBS.forEach(h => (hubById[h.id] = h));
    ROADS.forEach((r, i) => { const a = hubById[r[0]], b = hubById[r[1]]; this.carve(a.x, a.y, b.x, b.y, 1, TT.ROAD, i * 3 + 1, false); });
    // Boss-Arenen und Sehenswürdigkeiten
    this.lairs = [];
    for (const id of BOSS_LIST) {
      const m = MOBS[id], h = this.nearestHub(m.x * TILE, m.y * TILE);
      this.carve(m.x, m.y, h.x, h.y, 1, TT.TRAIL, m.x + m.y, true);
      this.clearCircle(m.x, m.y, 7);
      this.lairs.push({ x: m.x, y: m.y, id });
    }
    for (const k in POIS) {
      const p = POIS[k], h = this.nearestHub(p.x * TILE, p.y * TILE);
      this.carve(p.x, p.y, h.x, h.y, 1, TT.TRAIL, p.x * 3, true);
      this.clearCircle(p.x, p.y, 4);
    }
    // Erreichbarkeit
    const q = [HUBS[0].y * MW + HUBS[0].x + 5];
    this.reach.fill(0); this.reach[q[0]] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cx = c % MW, cy = (c / MW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (this.blockedTile(nx, ny)) continue;
        const ni = ny * MW + nx;
        if (!this.reach[ni]) { this.reach[ni] = 1; q.push(ni); }
      }
    }
    // Sammelpunkte
    this.nodePoints = [];
    const cnt = {};
    for (let i = 0; i < MW * MH; i++) if (this.reach[i]) cnt[zone[i]] = (cnt[zone[i]] || 0) + 1;
    for (const key in NODE_TYPES) {
      const nt = NODE_TYPES[key], want = Math.round((cnt[nt.zone] || 0) / 150);
      let tries = 0, got = 0;
      while (got < want && tries++ < want * 40) {
        const x = rndi(4, MW - 5), y = rndi(4, MH - 5), i = y * MW + x;
        if (!this.reach[i] || zone[i] !== nt.zone || tile[i] === TT.ROAD || tile[i] === TT.TRAIL) continue;
        if (this.hubAt(x * TILE, y * TILE, 3)) continue;
        this.nodePoints.push({ type: key, x: x * TILE + 16, y: y * TILE + 16 }); got++;
      }
    }
    this.buildMinimap();
  },
  carve(ax, ay, bx, by, hw, type, seed, thin) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, steps = Math.ceil(len * 1.6);
    const nx = -dy / len, ny = dx / len, amp = Math.min(3, len / 20);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, w = Math.sin(t * Math.PI) * Math.sin(t * 6 + seed) * amp;
      const px = Math.round(ax + dx * t + nx * w), py = Math.round(ay + dy * t + ny * w);
      for (let oy = -hw; oy <= hw; oy++) for (let ox = -hw; ox <= hw; ox++) {
        if (thin && Math.abs(ox) + Math.abs(oy) > 1) continue;
        const x = px + ox, y = py + oy;
        if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
        const i2 = y * MW + x;
        if (this.tile[i2] === TT.BUILD) continue;
        if (this.tile[i2] === TT.ROAD && type === TT.TRAIL) continue;
        this.tile[i2] = type;
      }
    }
  },
  clearCircle(cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
      const d = Math.hypot(x - cx, y - cy), i = y * MW + x;
      if (d <= r && this.tile[i] !== TT.BUILD && this.tile[i] !== TT.ROAD) {
        this.tile[i] = d > r - 1.5 && hash2(x, y, 4) < 0.25 ? TT.BONES : TT.G;
      }
    }
  },

  // ----- Wegfindung (A*) --------------------------------------------
  findPath(sx, sy, tx, ty) {
    let stx = clamp(Math.floor(sx / TILE), 0, MW - 1), sty = clamp(Math.floor(sy / TILE), 0, MH - 1);
    let gtx = clamp(Math.floor(tx / TILE), 0, MW - 1), gty = clamp(Math.floor(ty / TILE), 0, MH - 1);
    if (this.blockedTile(gtx, gty)) {
      let found = false;
      for (let r = 1; r < 6 && !found; r++) for (let oy = -r; oy <= r && !found; oy++) for (let ox = -r; ox <= r && !found; ox++) {
        if (!this.blockedTile(gtx + ox, gty + oy)) { gtx += ox; gty += oy; found = true; }
      }
      if (!found) return null;
    }
    if (stx === gtx && sty === gty) return [{ x: gtx * TILE + 16, y: gty * TILE + 16 }];
    const open = [], g = new Map(), from = new Map(), closed = new Set();
    const key = (x, y) => y * MW + x, h = (x, y) => Math.hypot(x - gtx, y - gty);
    const push = n => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= open[i].f) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => {
      const top = open[0], last = open.pop();
      if (open.length) { open[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < open.length && open[l].f < open[s].f) s = l; if (r < open.length && open[r].f < open[s].f) s = r; if (s === i) break; [open[s], open[i]] = [open[i], open[s]]; i = s; } }
      return top;
    };
    g.set(key(stx, sty), 0); push({ x: stx, y: sty, f: h(stx, sty) });
    let iter = 0, end = null;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
    while (open.length && iter++ < 9000) {
      const c = pop(), ck = key(c.x, c.y);
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (c.x === gtx && c.y === gty) { end = ck; break; }
      for (const [dx, dy, cost] of dirs) {
        const nx = c.x + dx, ny = c.y + dy;
        if (this.blockedTile(nx, ny)) continue;
        if (dx && dy && (this.blockedTile(c.x + dx, c.y) || this.blockedTile(c.x, c.y + dy))) continue;
        const nk = key(nx, ny), ng = g.get(ck) + cost;
        if (closed.has(nk) || (g.has(nk) && g.get(nk) <= ng)) continue;
        g.set(nk, ng); from.set(nk, ck);
        push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
    if (end === null) return null;
    const path = [];
    for (let k = end; k !== undefined; k = from.get(k)) path.push({ x: (k % MW) * TILE + 16, y: ((k / MW) | 0) * TILE + 16 });
    path.reverse(); path.shift();
    return path;
  },

  // ----- Darstellung der Bodenkacheln (gecacht in Chunks) ----------
  getChunk(cx, cy) {
    const k = cy * 1000 + cx;
    let c = this.chunks.get(k);
    if (!c) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 16 * TILE;
      this.renderChunk(cv.getContext('2d'), cx, cy);
      c = { cv, t: 0 }; this.chunks.set(k, c);
      if (this.chunks.size > 48) {
        let ok = null, ot = 1e18;
        for (const [kk, v] of this.chunks) if (v.t < ot && kk !== k) { ot = v.t; ok = kk; }
        this.chunks.delete(ok);
      }
    }
    c.t = performance.now();
    return c.cv;
  },
  renderChunk(c, cx, cy) {
    for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
      const x = cx * 16 + tx, y = cy * 16 + ty;
      if (x >= MW || y >= MH) continue;
      this.drawGroundTile(c, x, y, tx * TILE, ty * TILE);
    }
  },
  drawGroundTile(c, x, y, px, py) {
    const i = y * MW + x, z = this.zone[i], t = this.tile[i], v = this.vari[i], h2 = hash2(x, y, 11), h3 = hash2(x, y, 12);
    const Z = ZONES[z];
    c.fillStyle = Z.g[v & 3]; c.fillRect(px, py, TILE, TILE);
    if (t === TT.WATER) {
      c.fillStyle = z === 2 ? '#2f5a46' : z === 1 ? '#2c6a9a' : '#2f6aa8'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = z === 2 ? '#3d6e57' : '#4a8ac8';
      c.fillRect(px + 4 + h2 * 12, py + 6 + h3 * 14, 10, 2); c.fillRect(px + 12 + h3 * 8, py + 20, 8, 2);
      // Uferlinie
      c.fillStyle = z === 2 ? '#4a5b34' : '#c9b78a';
      if (!BLOCKS[this.tileAt(x, y - 1)] || this.tileAt(x, y - 1) !== TT.WATER && this.tileAt(x, y - 1) !== TT.WATER) { if (this.tileAt(x, y - 1) !== TT.WATER) c.fillRect(px, py, TILE, 3); }
      if (this.tileAt(x, y + 1) !== TT.WATER) c.fillRect(px, py + TILE - 3, TILE, 3);
      if (this.tileAt(x - 1, y) !== TT.WATER) c.fillRect(px, py, 3, TILE);
      if (this.tileAt(x + 1, y) !== TT.WATER) c.fillRect(px + TILE - 3, py, 3, TILE);
      return;
    }
    if (t === TT.LAVA) {
      c.fillStyle = '#b32a12'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = '#ff8a22'; c.fillRect(px + h2 * 18, py + h3 * 18, 12, 8);
      c.fillStyle = '#ffd04a'; c.fillRect(px + h3 * 20, py + h2 * 20, 5, 4);
      c.fillStyle = '#6a1608';
      if (this.tileAt(x, y + 1) !== TT.LAVA) c.fillRect(px, py + TILE - 3, TILE, 3);
      return;
    }
    if (t === TT.ROAD) {
      const plaza = HUBS.some(hb => Math.hypot(x - hb.x, y - hb.y) <= 4.6);
      c.fillStyle = plaza ? (v & 1 ? '#8e8a84' : '#85817b') : (v & 1 ? '#a08a64' : '#98825d'); c.fillRect(px, py, TILE, TILE);
      c.fillStyle = plaza ? 'rgba(0,0,0,.18)' : 'rgba(60,40,10,.18)';
      if (plaza) { c.fillRect(px, py, TILE, 1); c.fillRect(px, py, 1, TILE); c.fillRect(px + 16, py + 16, 1, 16); c.fillRect(px, py + 16, TILE, 1); }
      else { c.fillRect(px + h2 * 22, py + h3 * 22, 4, 3); c.fillRect(px + h3 * 22, py + h2 * 24, 3, 3); }
      return;
    }
    if (t === TT.TRAIL) { c.fillStyle = v & 1 ? '#8b7653' : '#85704e'; c.fillRect(px, py, TILE, TILE); c.fillStyle = 'rgba(40,25,5,.2)'; c.fillRect(px + h2 * 22, py + h3 * 22, 4, 3); return; }
    if (t === TT.MUD) { c.fillStyle = '#4a3f2a'; c.fillRect(px, py, TILE, TILE); c.fillStyle = '#5c4f35'; c.fillRect(px + h2 * 16, py + h3 * 16, 12, 6); return; }
    // Bodendetails je Zone
    if (z <= 1) {
      c.fillStyle = z === 0 ? 'rgba(30,80,20,.35)' : 'rgba(10,50,15,.4)';
      for (let k = 0; k < 3; k++) { const hx = hash2(x, y, 20 + k) * 28, hy = hash2(x, y, 30 + k) * 26; c.fillRect(px + hx, py + hy + 3, 1.5, 4); c.fillRect(px + hx + 2, py + hy + 4, 1.5, 3); }
      c.fillStyle = z === 0 ? 'rgba(200,255,150,.16)' : 'rgba(150,230,120,.12)'; c.fillRect(px + h2 * 24, py + h3 * 24, 5, 3);
      if (t === TT.FLOWER) {
        const cols = ['#ff6a8a', '#ffe14a', '#ffffff', '#a98aff']; c.fillStyle = cols[(v >> 2) & 3];
        c.fillRect(px + 8 + h2 * 10, py + 8 + h3 * 10, 3, 3); c.fillRect(px + 20 - h3 * 8, py + 18 + h2 * 6, 3, 3);
      }
    } else if (z === 2) {
      c.fillStyle = 'rgba(20,35,15,.35)'; c.fillRect(px + h2 * 20, py + h3 * 20, 9, 5);
      c.fillStyle = 'rgba(120,150,70,.18)'; c.fillRect(px + h3 * 22, py + h2 * 22, 6, 3);
    } else if (z === 3) {
      c.fillStyle = 'rgba(255,240,190,.3)'; c.fillRect(px + 2, py + 8 + h2 * 14, 14, 2);
      c.fillStyle = 'rgba(150,110,40,.25)'; c.fillRect(px + 12 + h3 * 8, py + 20, 12, 2);
    } else if (z === 4) {
      if (v > 170) { c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(px + 3, py + 4, 20 + h2 * 8, 14); }
      c.fillStyle = 'rgba(40,50,70,.22)'; c.fillRect(px + h2 * 20, py + h3 * 24, 8, 2);
    } else if (z === 5) {
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(px + h2 * 20, py + h3 * 20, 10, 6);
      if (h3 > 0.9) { c.fillStyle = 'rgba(255,120,30,.55)'; c.fillRect(px + h2 * 22, py + h3 * 20, 6, 1.5); }
    } else {
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      c.fillStyle = 'rgba(160,120,230,.08)'; c.fillRect(px + h2 * 16, py + h3 * 16, 12, 8);
      if (t === TT.BONES) { c.fillStyle = '#d8d2bc'; c.fillRect(px + 8 + h2 * 8, py + 10 + h3 * 8, 8, 2); c.fillRect(px + 12 + h3 * 6, py + 6 + h2 * 10, 2, 8); }
    }
    if (t === TT.BONES && z !== 6) {
      c.fillStyle = '#e4dcc4'; c.fillRect(px + 6 + h2 * 10, py + 12 + h3 * 8, 9, 2); c.fillRect(px + 14 + h3 * 6, py + 7 + h2 * 10, 2, 9);
      c.fillStyle = '#cfc7ac'; c.beginPath(); c.arc(px + 20 - h2 * 8, py + 20 - h3 * 6, 3.2, 0, TAU); c.fill();
    }
  },

  // ----- Minimap ------------------------------------------------------
  buildMinimap() {
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const c = cv.getContext('2d'), img = c.createImageData(MW, MH);
    const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    for (let i = 0; i < MW * MH; i++) {
      const t = this.tile[i], z = this.zone[i];
      let col = hex(ZONES[z].mm);
      if (t === TT.WATER) col = z === 2 ? [47, 90, 70] : [47, 106, 168];
      else if (t === TT.LAVA) col = [220, 80, 20];
      else if (t === TT.ROAD || t === TT.TRAIL) col = [176, 154, 112];
      else if (t === TT.BUILD) col = [150, 80, 50];
      else if (t === TT.ROCK || t === TT.WALL || t === TT.PILL) col = [105, 105, 112];
      else if (t === TT.TREE || t === TT.DEAD || t === TT.CACT) col = col.map(v => v * 0.7);
      else if (t === TT.MUD) col = [74, 63, 42];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    this.mm = cv;
  },
};
