'use strict';
// =====================================================================
//  Spiellogik: Spieler, Items, Kampf, Fertigkeiten, KI, Quests
// =====================================================================
const G = {
  now: 0, clock: 0, P: null, mobs: [], npcs: [], bots: [], nodes: [], bags: [], projs: [], tele: [], texts: [], parts: [], rings: [], timers: [],
  target: null, chat: [], running: false, shake: 0, dirty: {}, gather: null, lastSave: 0, playerSafe: true, killsTotal: 0,
};
const INV_SIZE = 30;
const xpNeed = L => Math.round(80 * Math.pow(L, 1.5));
let UID = 1;

// ---------------------------------------------------------------------
//  Meldungen / Effekte
// ---------------------------------------------------------------------
function log(text, ch = 'system', color) {
  G.chat.push({ text, ch, color, t: Date.now() });
  if (G.chat.length > 200) G.chat.shift();
  G.dirty.chat = true;
}
function ftext(x, y, txt, color = '#fff', size = 15, life = 1.1) {
  G.texts.push({ x: x + rnd(-8, 8), y, txt, color, size, t: 0, life, vy: -46 });
}
function burst(x, y, color, n = 8, sp = 90, life = 0.5) {
  for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(sp * 0.3, sp); G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, color, t: 0, life: rnd(life * 0.6, life), size: rnd(2, 4) }); }
}
function ring(x, y, r, color, life = 0.45) { G.rings.push({ x, y, r, color, t: 0, life }); }
function later(sec, fn) { G.timers.push({ at: G.now + sec, fn }); }
function sfx(kind) { if (window.Audio2) Audio2.play(kind); }

// ---------------------------------------------------------------------
//  Gegenstände
// ---------------------------------------------------------------------
function genItem(ilvl, rar, slot, opts = {}) {
  ilvl = Math.max(1, Math.round(ilvl));
  if (!slot) slot = weighted([['weapon', 18], ['head', 14], ['chest', 14], ['legs', 14], ['feet', 14], ['ring', 13], ['neck', 13]]);
  const R = RARITY[rar], m = R.m * (opts.unique ? 1.12 : 1);
  const it = { uid: UID++, type: 'gear', slot, rar, ilvl, req: Math.max(1, ilvl - 2), stats: {}, armor: 0, dmg: null };
  let mainStat;
  const budget = Math.round((ilvl * 0.75 + 3) * m);
  if (slot === 'weapon') {
    let wt = pick(WEAPON_TYPES);
    if (opts.cls && Math.random() < 0.6) { const w = CLASSES[opts.cls].weapon; wt = WEAPON_TYPES.find(x => x.n === w) || wt; }
    mainStat = wt.stat; it.ic = wt.ic; it.wt = wt.n;
    const avg = (4 + ilvl * 2.2) * m;
    it.dmg = [Math.round(avg * 0.85), Math.round(avg * 1.15)];
    it.stats[mainStat] = Math.round(budget * 0.7);
    const adj = wt.adj[clamp(Math.floor(ilvl / 6.5), 0, 4)];
    it.name = adj.endsWith('-') ? adj + wt.n.toLowerCase() : `${adj} ${wt.n}`;
  } else {
    const at = ARMOR_TYPES[slot];
    mainStat = weighted([['str', 1], ['dex', 1], ['int', 1], ['vit', 1.4]]);
    it.ic = at.ic;
    it.armor = Math.round(ilvl * 2 * at.arm * m + (at.arm ? 2 : 0));
    it.stats[mainStat] = Math.round(budget * 0.6);
    it.name = pick(at.n);
  }
  const extra = [0, 1, 1, 2, 2][rar];
  for (let i = 0; i < extra; i++) {
    const s = pick(['str', 'dex', 'int', 'vit']);
    it.stats[s] = (it.stats[s] || 0) + Math.max(1, Math.round(budget * 0.25));
  }
  if (rar >= 2 && Math.random() < 0.5) it.stats.crit = Math.max(1, Math.round(ilvl / 10 + rar));
  if (rar >= 1 && !opts.unique) it.name += ' ' + SUFFIX[mainStat];
  if (opts.unique) {
    it.name = opts.unique[0]; it.ic = opts.unique[2]; it.slot = opts.unique[1]; it.unique = true;
    if (it.slot === 'weapon' && !it.dmg) { const avg = (4 + ilvl * 2.2) * m; it.dmg = [Math.round(avg * 0.85), Math.round(avg * 1.15)]; }
    it.stats[opts.cls ? CLASSES[opts.cls].primary : 'str'] = (it.stats[opts.cls ? CLASSES[opts.cls].primary : 'str'] || 0) + Math.round(budget * 0.3);
  }
  it.price = Math.max(1, Math.round((6 + ilvl * 3) * R.sell * (slot === 'weapon' ? 1.4 : 1)));
  return it;
}
function itemInfo(it) {
  if (!it) return null;
  if (it.type === 'gear') return it;
  return Object.assign({}, BASEITEMS[it.id], it);
}
function itemValue(it) { return it.type === 'gear' ? it.price : BASEITEMS[it.id].price; }
function sellValue(it) { return it.type === 'gear' ? Math.max(1, Math.floor(it.price * 0.4)) : Math.max(1, Math.floor(BASEITEMS[it.id].price * 0.4)) * (it.qty || 1); }

function invCount(id) { let n = 0; for (const s of G.P.inv) if (s && s.id === id) n += s.qty; return n; }
function invFree() { return G.P.inv.filter(s => !s).length; }
function invAdd(it) {
  const P = G.P;
  if (it.type !== 'gear') {
    const max = BASEITEMS[it.id].stack; let left = it.qty || 1;
    for (const s of P.inv) if (s && s.id === it.id && s.qty < max) { const a = Math.min(max - s.qty, left); s.qty += a; left -= a; if (!left) break; }
    while (left > 0) {
      const f = P.inv.indexOf(null); if (f < 0) { G.dirty.inv = true; return false; }
      const a = Math.min(max, left); P.inv[f] = { type: it.type || BASEITEMS[it.id].type, id: it.id, qty: a }; left -= a;
    }
    G.dirty.inv = true; return true;
  }
  const f = P.inv.indexOf(null); if (f < 0) return false;
  P.inv[f] = it; G.dirty.inv = true; return true;
}
function invRemove(id, n) {
  const P = G.P;
  for (let i = 0; i < P.inv.length && n > 0; i++) {
    const s = P.inv[i];
    if (s && s.id === id) { const a = Math.min(s.qty, n); s.qty -= a; n -= a; if (!s.qty) P.inv[i] = null; }
  }
  G.dirty.inv = true;
}
function giveItem(it, silent) {
  if (invAdd(it)) { if (!silent) log(`Erhalten: ${itemLabel(it)}`, 'loot'); sfx('loot'); return true; }
  log('Dein Inventar ist voll!', 'system', '#ff6a6a'); return false;
}
function itemLabel(it) {
  const i = itemInfo(it);
  const col = it.type === 'gear' ? RARITY[it.rar].c : '#ddd';
  return `<span style="color:${col}">[${esc(i.name)}]</span>${it.qty > 1 ? ' x' + it.qty : ''}`;
}
function canUseItem(it) { return it.type === 'gear' ? G.P.level >= it.req : true; }

function equipFromInv(idx) {
  const P = G.P, it = P.inv[idx];
  if (!it || it.type !== 'gear') return;
  if (P.level < it.req) { log(`Du benötigst Stufe ${it.req}.`, 'system', '#ff6a6a'); return; }
  const old = P.eq[it.slot];
  if (it.slot === 'ring' && old && !P.eq.ring2) { P.eq.ring2 = it; P.inv[idx] = null; }
  else { P.eq[it.slot] = it; P.inv[idx] = old || null; }
  sfx('equip'); recalc(); G.dirty.inv = G.dirty.char = true;
}
function unequip(slot) {
  const P = G.P, it = P.eq[slot]; if (!it) return;
  const f = P.inv.indexOf(null); if (f < 0) { log('Dein Inventar ist voll!', 'system', '#ff6a6a'); return; }
  P.inv[f] = it; delete P.eq[slot]; recalc(); G.dirty.inv = G.dirty.char = true;
}
function useInv(idx) {
  const P = G.P, it = P.inv[idx]; if (!it) return;
  if (it.type === 'gear') return equipFromInv(idx);
  if (it.type === 'consumable') useConsumable(it.id);
}
function useConsumable(id) {
  const P = G.P, b = BASEITEMS[id];
  if (!b || P.dead || invCount(id) < 1) return false;
  if (P.level < (b.lv || 1)) { log(`Du benötigst Stufe ${b.lv}.`, 'system', '#ff6a6a'); return false; }
  if (G.now < (P.potCd || 0) && (b.hp || b.mp)) { log('Tränke sind noch nicht bereit.', 'system', '#ff6a6a'); return false; }
  if (b.hp) { if (P.hp >= P.st.maxHp) return false; healPlayer(P.st.maxHp * b.hp, true); P.potCd = G.now + 12; }
  if (b.mp) { if (P.res >= P.st.maxRes) return false; P.res = Math.min(P.st.maxRes, P.res + P.st.maxRes * b.mp); ftext(P.x, P.y - 40, '+' + Math.round(P.st.maxRes * b.mp), '#6aa0ff'); P.potCd = G.now + 12; }
  if (b.buff) { addFx(P, { type: 'buff', id: id, until: G.now + b.buff.dur, mods: { apPct: b.buff.apPct, critAdd: b.buff.critAdd }, name: b.name, ic: b.ic }); recalc(); log(`${b.name} wirkt für ${b.buff.dur / 60} Minuten.`, 'system'); }
  invRemove(id, 1); sfx('potion'); return true;
}
function buyItem(vendorItem) {
  const P = G.P, price = vendorItem.type === 'gear' ? vendorItem.price * 1.6 | 0 : BASEITEMS[vendorItem.id].price;
  if (P.gold < price) { log('Nicht genug Gold.', 'system', '#ff6a6a'); return; }
  const copy = vendorItem.type === 'gear' ? Object.assign({}, vendorItem, { uid: UID++ }) : { type: vendorItem.type, id: vendorItem.id, qty: 1 };
  if (giveItem(copy)) { P.gold -= price; sfx('coin'); G.dirty.inv = true; }
}
function sellItem(idx) {
  const P = G.P, it = P.inv[idx]; if (!it) return;
  P.gold += sellValue(it); P.inv[idx] = null; sfx('coin'); G.dirty.inv = true;
}
function vendorStock(hubIndex) {
  const hub = HUBS[hubIndex], rng = mulberry32(hubIndex * 77 + 5), L = hub.lv + 1, stock = [];
  const pots = ['hp1', 'mp1', 'hp2', 'mp2', 'hp3', 'mp3', 'hp4', 'mp4'];
  for (const p of pots) if (BASEITEMS[p].lv <= L + 1) stock.push({ type: 'consumable', id: p });
  const save = Math.random; Math.random = rng;
  for (let i = 0; i < 9; i++) stock.push(genItem(L + rndi(-1, 2), Math.random() < 0.28 ? 2 : Math.random() < 0.55 ? 1 : 0, undefined, {}));
  Math.random = save;
  return stock;
}

// ---------------------------------------------------------------------
//  Statuseffekte
// ---------------------------------------------------------------------
function hasFx(e, t) { for (const f of e.fx) if (f.type === t && f.until > G.now) return f; return null; }
function addFx(e, f) {
  if (f.id) { const i = e.fx.findIndex(x => x.type === f.type && x.id === f.id); if (i >= 0) { e.fx[i] = f; return; } }
  else if (f.type === 'stun' || f.type === 'slow') { const i = e.fx.findIndex(x => x.type === f.type); if (i >= 0) { if (e.fx[i].until < f.until) e.fx[i] = f; return; } }
  e.fx.push(f);
}
function updateFx(e, dt, isPlayer) {
  let changed = false;
  for (let i = e.fx.length - 1; i >= 0; i--) {
    const f = e.fx[i];
    if (!f) continue;
    if ((f.type === 'dot' || f.type === 'hot') && f.until > G.now && G.now >= f.next) {
      f.next += 1;
      if (f.type === 'dot') { if (isPlayer) hurtPlayer(f.tick, f.src, { ignoreArmor: true, dot: true }); else hurtMob(e, f.tick, false, 'dot'); }
      else healPlayer(f.tick, true);
      if (e.fx[i] !== f) continue; // Effektliste wurde durch Tod geleert
    }
    if (f.until <= G.now) { if (f.type === 'buff') changed = true; e.fx.splice(i, 1); }
  }
  if (changed && isPlayer) recalc();
}

// ---------------------------------------------------------------------
//  Spielerwerte
// ---------------------------------------------------------------------
function recalc() {
  const P = G.P, C = CLASSES[P.cls], lv = P.level;
  const s = {}; for (const k of ['str', 'dex', 'int', 'vit']) s[k] = C.base[k] + C.grow[k] * (lv - 1);
  const mod = { apPct: 0, armorPct: 0, hpPct: 0, spdPct: 0, dmgRed: 0, critAdd: 0, lifesteal: 0, cdr: 0, healPct: 0, regenPct: 0 };
  let armor = 0, wdmg = 0, crit = 0;
  for (const slot in P.eq) {
    const it = P.eq[slot]; if (!it) continue;
    for (const k in it.stats) { if (k === 'crit') crit += it.stats[k]; else s[k] += it.stats[k]; }
    armor += it.armor || 0;
    if (it.dmg) wdmg += (it.dmg[0] + it.dmg[1]) / 2;
  }
  for (const id in P.skills) { const sk = SKILLS[id]; if (sk && sk.type === 'passive' && P.skills[id]) for (const k in sk.mods) mod[k] += rv(sk.mods[k], P.skills[id]); }
  for (const f of P.fx) if (f.type === 'buff' && f.until > G.now && f.mods) for (const k in f.mods) mod[k] += rv(f.mods[k], f.rank || 1);
  const st = P.st || (P.st = {});
  st.s = s; st.mod = mod;
  st.ap = (s[C.primary] * 1.6 + wdmg + lv * 2) * (1 + mod.apPct / 100) * C.apMul;
  st.maxHp = Math.round((60 + s.vit * 9 + lv * 8) * (1 + mod.hpPct / 100));
  st.maxRes = C.res === 'Mana' ? Math.round(90 + s.int * 4) : 100;
  st.armor = Math.max(0, armor * (1 + mod.armorPct / 100) * C.armorMul);
  st.crit = 5 + s.dex * 0.12 + crit + mod.critAdd;
  st.speed = 178 * (1 + mod.spdPct / 100) * (P.mounted ? 1.65 : 1);
  st.regenRes = C.res === 'Mana' ? st.maxRes * 0.014 : C.res === 'Ausdauer' ? 6 : 10;
  st.wdmg = wdmg;
  P.hp = Math.min(P.hp, st.maxHp); P.res = Math.min(P.res, st.maxRes);
  G.dirty.char = true;
}
function healPlayer(amt, noBonus) {
  const P = G.P; if (P.dead) return;
  if (!noBonus) amt *= 1 + P.st.mod.healPct / 100; else amt *= 1 + P.st.mod.healPct / 200;
  amt = Math.round(amt);
  const real = Math.min(amt, P.st.maxHp - P.hp); P.hp += real;
  if (real > 0) ftext(P.x, P.y - 44, '+' + real, '#5aff7a', 16);
}
function addXp(n) {
  const P = G.P; if (P.level >= MAX_LEVEL) return;
  P.xp += Math.round(n);
  while (P.level < MAX_LEVEL && P.xp >= xpNeed(P.level)) {
    P.xp -= xpNeed(P.level); P.level++; levelUp();
  }
  if (P.level >= MAX_LEVEL) P.xp = 0;
  G.dirty.char = true;
}
function levelUp() {
  const P = G.P;
  recalc(); P.hp = P.st.maxHp; P.res = P.st.maxRes;
  ring(P.x, P.y, 120, '#ffe070', 0.9); burst(P.x, P.y - 20, '#ffe070', 30, 160, 1);
  ftext(P.x, P.y - 60, `STUFE ${P.level}!`, '#ffe070', 26, 2);
  log(`Glückwunsch! Du hast Stufe ${P.level} erreicht! Du erhältst einen Fertigkeitspunkt.`, 'system', '#ffe070');
  sfx('levelup'); G.dirty.skills = G.dirty.quests = G.dirty.char = true;
  if (UI && UI.toast) UI.toast(`Stufe ${P.level} erreicht!`);
  if (P.level === 8) log('Tipp: Bei Edda in der Waldwacht kannst du ein Reittier kaufen (Taste R).', 'system', '#9fd0ff');
}
function skillPointsTotal(P) { return P.level + 1; }
function skillPointsSpent(P) { let n = 0; for (const k in P.skills) n += P.skills[k]; return n; }
function skillPointsFree(P) { return skillPointsTotal(P) - skillPointsSpent(P); }
function canLearn(id) {
  const P = G.P, sk = SKILLS[id], r = P.skills[id] || 0;
  if (r >= sk.max || skillPointsFree(P) < 1 || P.level < sk.lv) return false;
  if (sk.parent && !(P.skills[sk.parent] > 0)) return false;
  return true;
}
function learnSkill(id) {
  if (!canLearn(id)) return;
  const P = G.P, sk = SKILLS[id];
  P.skills[id] = (P.skills[id] || 0) + 1;
  if (P.skills[id] === 1 && sk.type !== 'passive') { const f = P.hotbar.findIndex(h => !h); if (f >= 0) P.hotbar[f] = { t: 'skill', id }; }
  sfx('learn'); recalc(); G.dirty.skills = G.dirty.hotbar = true;
}
function resetSkills() {
  const P = G.P, cost = 20 * P.level;
  if (P.gold < cost) { log(`Du benötigst ${cost} Gold für eine Neuverteilung.`, 'system', '#ff6a6a'); return false; }
  P.gold -= cost; P.skills = {}; P.hotbar = P.hotbar.map(h => (h && h.t === 'skill' ? null : h));
  recalc(); G.dirty.skills = G.dirty.hotbar = true; return true;
}

// ---------------------------------------------------------------------
//  Spieler erstellen / Spiel starten
// ---------------------------------------------------------------------
function newPlayer(name, cls) {
  const hub = HUBS[0];
  const P = {
    name, cls, level: 1, xp: 0, gold: 25, x: hub.x * TILE + 16, y: (hub.y + 3) * TILE + 16, dir: 1,
    skills: {}, hotbar: new Array(10).fill(null), inv: new Array(INV_SIZE).fill(null), eq: {}, quests: {}, done: {}, kills: {},
    hp: 100, res: 100, fx: [], cd: {}, mounted: false, hasMount: false, autoAtk: false, playtime: 0, deaths: 0, created: Date.now(),
  };
  G.P = P; P.st = {}; recalc();
  const w = genItem(1, 0, 'weapon', { cls }); w.name = 'Abgenutzte ' + CLASSES[cls].weapon; w.stats = { [CLASSES[cls].primary]: 2 }; w.dmg = [5, 8]; w.price = 2; w.ic = (WEAPON_TYPES.find(x => x.n === CLASSES[cls].weapon) || WEAPON_TYPES[0]).ic; w.req = 1;
  P.eq.weapon = w;
  const b = genItem(1, 0, 'chest'); b.name = 'Einfaches Wams'; b.armor = 6; b.stats = { vit: 2 }; P.eq.chest = b;
  P.inv[0] = { type: 'consumable', id: 'hp1', qty: 5 };
  if (CLASSES[cls].res === 'Mana') P.inv[1] = { type: 'consumable', id: 'mp1', qty: 3 };
  P.hotbar[8] = { t: 'item', id: 'hp1' }; if (CLASSES[cls].res === 'Mana') P.hotbar[9] = { t: 'item', id: 'mp1' };
  recalc(); P.hp = P.st.maxHp; P.res = P.st.maxRes;
  return P;
}

function initWorldEntities() {
  G.mobs = []; G.npcs = []; G.nodes = []; G.bots = []; G.bags = []; G.projs = []; G.tele = []; G.timers = [];
  // NPCs
  for (const n of NPCS) {
    const hub = HUBS.find(h => h.id === n.hub), sp = NPC_SPOTS[n.spot];
    G.npcs.push(Object.assign({ x: (hub.x + sp[0]) * TILE + 16, y: (hub.y + sp[1]) * TILE + 16, hubIdx: HUBS.indexOf(hub), npc: true, anim: rnd(0, 6) }, n));
  }
  // Monster
  const lairR2 = 9 * 9;
  for (let z = 0; z < 7; z++) {
    const tiles = [];
    for (let i = 0; i < MW * MH; i++) if (World.zone[i] === z && World.reach[i] && World.tile[i] !== TT.ROAD) tiles.push(i);
    const packs = Math.round(tiles.length / 105), spawns = ZONE_SPAWNS[z];
    let made = 0, tries = 0;
    while (made < packs && tries++ < packs * 30) {
      const ci = tiles[Math.floor(Math.random() * tiles.length)], cx = ci % MW, cy = (ci / MW) | 0;
      if (World.hubAt(cx * TILE, cy * TILE, 3)) continue;
      if (World.lairs.some(l => (l.x - cx) ** 2 + (l.y - cy) ** 2 < lairR2)) continue;
      const lead = weighted(spawns), def = MOBS[lead];
      const size = def.sc > 1.3 ? rndi(1, 2) : def.ranged ? rndi(2, 3) : def.passive ? rndi(1, 2) : rndi(2, 4);
      for (let k = 0; k < size; k++) {
        const id = Math.random() < 0.75 ? lead : weighted(spawns);
        let x = 0, y = 0, ok = false;
        for (let a = 0; a < 8 && !ok; a++) {
          const tx = cx + rndi(-3, 3), ty = cy + rndi(-3, 3);
          if (tx > 0 && ty > 0 && tx < MW && ty < MH && World.reach[ty * MW + tx] && !World.hubAt(tx * TILE, ty * TILE, 2)) { x = tx * TILE + rnd(6, 26); y = ty * TILE + rnd(6, 26); ok = true; }
        }
        if (!ok) continue;
        const d = MOBS[id], elite = !d.passive && Math.random() < 0.035;
        const m = makeMob(id, x, y, rndi(d.lv[0], d.lv[1]), elite); m.pack = made; G.mobs.push(m);
      }
      made++;
    }
  }
  // Bosse
  for (const id of BOSS_LIST) { const d = MOBS[id]; const m = makeMob(id, d.x * TILE + 16, d.y * TILE + 16, d.lv[0], false); G.mobs.push(m); }
  // Sammelpunkte
  for (const np of World.nodePoints) G.nodes.push({ type: np.type, x: np.x, y: np.y, avail: true, respawnAt: 0 });
  // Mitspieler (simulierte Abenteurer)
  const names = ['Thorgrim', 'Lyriel', 'Dunkelklinge', 'Elowen', 'Ragnar92', 'Mirabelle', 'xXSchattenXx', 'Gandrel', 'Sylvanas_', 'Eisenfaust', 'Nimue', 'Balduin', 'Kaelthas', 'Freya', 'Jorund', 'Tiramisu', 'DrachenToeter', 'Waldkind', 'Aurelia', 'Brunhild', 'Morwen', 'Hagen', 'LichtBringer', 'Zwergnase', 'Finnegan', 'Isolde', 'Ulfric', 'Rabenherz'];
  const clsKeys = Object.keys(CLASSES);
  names.forEach((n, i) => {
    const hub = HUBS[Math.min(HUBS.length - 1, Math.floor(Math.pow(Math.random(), 1.6) * HUBS.length))];
    const a = rnd(0, TAU), r = rnd(2, 9) * TILE;
    G.bots.push({ name: n, cls: pick(clsKeys), level: clamp(hub.lv + rndi(-2, 6), 1, 30), x: hub.x * TILE + Math.cos(a) * r, y: hub.y * TILE + Math.sin(a) * r, hub, dir: 1, anim: rnd(0, 6), tx: 0, ty: 0, wait: rnd(0, 6), bot: true });
  });
  G.bots.forEach(b => { if (World.blockedPx(b.x, b.y, 9)) { b.x = b.hub.x * TILE + 16; b.y = (b.hub.y + 3) * TILE + 16; } });
}
function makeMob(id, x, y, lvl, elite) {
  const d = MOBS[id], base = 25 + 50 * Math.pow(lvl, 1.45);
  const m = {
    def: d, id, name: d.name, lvl, x, y, hx: x, hy: y, boss: !!d.boss, elite: !!elite, sc: d.sc * (elite ? 1.2 : 1),
    maxhp: Math.round(base * d.hpm * (elite ? 3.2 : 1)), dmg: (4 + lvl * 3.8) * d.dmgm * (elite ? 1.4 : 1) * (d.boss ? 0.6 : 1), spd: d.spd * rnd(0.93, 1.07),
    state: 'idle', dead: false, fx: [], atkAt: 0, wanderT: rnd(0, 4), dir: 1, anim: rnd(0, 6), flash: 0, stuck: 0, respawnAt: 0, hurtAt: -99,
  };
  m.hp = m.maxhp;
  m.range = d.ranged ? 240 : 26 + m.sc * 15;
  m.atkIv = d.boss ? 2 : d.ranged ? 2.4 : 1.9;
  if (d.boss) m.ab = d.abil.map(a => Object.assign({ next: 0, done: false }, a));
  return m;
}

// ---------------------------------------------------------------------
//  Schaden
// ---------------------------------------------------------------------
function mobRadius(m) { return 11 * m.sc; }
function hurtMob(m, dmg, crit, src, noAggro) {
  if (m.dead || m.state === 'return') return 0;
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg; m.flash = 0.12; m.hurtAt = G.now;
  const P = G.P;
  ftext(m.x, m.y - 28 * m.sc, (crit ? '' : '') + fmt(dmg), crit ? '#ffd23f' : src === 'dot' ? '#c98aff' : '#fff', crit ? 22 : 15, crit ? 1.3 : 1);
  if (src !== 'dot') burst(m.x, m.y - 10, crit ? '#ffd23f' : '#ff5a4a', crit ? 8 : 4, 80, 0.35);
  P.lastCombat = G.now;
  if (!noAggro && m.state !== 'chase') aggro(m);
  if (m.hp <= 0) killMob(m);
  return dmg;
}
function aggro(m) {
  if (m.state === 'chase' || m.dead) return;
  m.state = 'chase'; m.chaseStart = G.now;
  if (m.boss && !m.yelled) { m.yelled = true; log(`${m.name}: „${pick(['Ihr wagt es, mich zu stören?!', 'Euer Blut wird fließen!', 'Verschwindet – oder sterbt!', 'Niemand entkommt mir!'])}“`, 'combat', '#ff8a5a'); sfx('boss'); }
  for (const o of G.mobs) {
    if (o !== m && !o.dead && o.state === 'idle' && !o.def.passive && o.pack === m.pack && o.pack !== undefined && Math.hypot(o.x - m.x, o.y - m.y) < 220) aggro(o);
  }
  const P = G.P;
  if (!G.target || G.target.dead) { G.target = m; P.autoAtk = true; G.dirty.target = true; }
}
function killMob(m) {
  const P = G.P;
  m.dead = true; m.state = 'dead'; m.fx.length = 0;
  m.respawnAt = G.now + (m.boss ? 240 : m.elite ? 100 : 30);
  const diff = m.lvl - P.level;
  let f = diff >= 0 ? 1 + Math.min(diff, 4) * 0.05 : diff < -6 ? 0.1 : clamp(1 + diff * 0.12, 0.15, 1);
  const xp = Math.round((10 + m.lvl * 7) * (m.elite ? 3 : 1) * (m.boss ? 8 : 1) * f);
  addXp(xp);
  const gold = Math.round(rndi(Math.floor(m.lvl * 1.5) + 1, Math.floor(m.lvl * 3.5) + 3) * (m.elite ? 3 : 1) * (m.boss ? 12 : 1) * (f < 0.2 ? 0.3 : 1));
  P.gold += gold;
  ftext(m.x, m.y - 50, `+${xp} EP`, '#c8a0ff', 14, 1.4);
  log(`${m.name} besiegt. Du erhältst ${xp} Erfahrung und ${gold} Gold.`, 'combat', '#d0c0ff');
  burst(m.x, m.y - 6, '#cfc7ac', 12, 100, 0.7);
  sfx('kill');
  P.kills[m.id] = (P.kills[m.id] || 0) + 1; G.killsTotal++;
  // Beute
  const items = [];
  const gear = (r, n = 1) => { for (let i = 0; i < n; i++) items.push(genItem(m.lvl + rndi(0, 1), r(), undefined, { cls: P.cls })); };
  if (m.boss) {
    gear(() => weighted([[1, 10], [2, 50], [3, 40]]), 2);
    const u = m.def.uniques; if (u && Math.random() < 0.45) items.push(genItem(m.lvl + 2, m.lvl >= 20 ? 4 : 3, u[0][1], { unique: pick(u), cls: P.cls }));
    if (Math.random() < 0.8) items.push({ type: 'consumable', id: bestPot('hp', m.lvl), qty: rndi(1, 3) });
  } else if (m.elite) { gear(() => weighted([[0, 20], [1, 50], [2, 26], [3, 4]])); }
  else if (!m.def.passive && f > 0.2) {
    if (Math.random() < 0.14) gear(() => weighted([[0, 70], [1, 24], [2, 5.5], [3, 0.5]]));
    if (Math.random() < 0.09) items.push({ type: 'consumable', id: bestPot(Math.random() < 0.5 ? 'hp' : 'mp', m.lvl), qty: 1 });
  }
  if (items.length) G.bags.push({ x: m.x, y: m.y, items, until: G.now + 120 });
  // Quests
  questKill(m);
  // Beschworene Begleiter verschwinden mit dem Boss
  if (m.boss) {
    for (const o of G.mobs) if (o.temp && o.owner === m && !o.dead) { o.dead = true; o.removeAt = G.now; }
    log(`★ ${m.name} wurde von ${P.name} besiegt! ★`, 'world', '#ffb84a');
    if (UI && UI.toast) UI.toast(`${m.name} besiegt!`);
    sfx('bossdown');
  }
  if (m.temp) m.removeAt = G.now + 4;
  if (G.target === m) G.dirty.target = true;
  G.dirty.char = true;
}
function bestPot(kind, lvl) {
  let best = kind + '1';
  for (let t = 1; t <= 4; t++) if (BASEITEMS[kind + t].lv <= lvl + 1) best = kind + t;
  return best;
}
function respawnMob(m) {
  if (m.temp) return;
  m.dead = false; m.hp = m.maxhp; m.x = m.hx; m.y = m.hy; m.state = 'idle'; m.fx.length = 0; m.yelled = false; m.enraged = false;
  if (m.boss) m.ab.forEach(a => { a.next = 0; a.done = false; });
  m.dmgMul = 1; m.spdMul = 1;
}
function mobDamage(m, mult = 1) {
  return m.dmg * mult * rnd(0.88, 1.12) * (m.enraged ? 1.4 : 1);
}
function hurtPlayer(raw, src, o = {}) {
  const P = G.P; if (P.dead) return;
  let d = raw;
  if (!o.ignoreArmor) { const lv = src ? src.lvl || P.level : P.level; d *= 1 - P.st.armor / (P.st.armor + 40 + lv * 18); }
  d *= 1 - clamp(P.st.mod.dmgRed, 0, 80) / 100;
  d = Math.max(1, Math.round(d));
  // Schilde
  for (const f of P.fx) if (f.type === 'shield' && f.until > G.now && f.amount > 0) { const a = Math.min(f.amount, d); f.amount -= a; d -= a; if (a) ftext(P.x, P.y - 30, `(${Math.round(a)})`, '#9fd0ff', 12); }
  P.lastCombat = G.now;
  if (P.mounted && !o.dot) { P.mounted = false; recalc(); }
  if (d <= 0) return;
  P.hp -= d; G.shake = Math.max(G.shake, Math.min(6, d / P.st.maxHp * 30));
  ftext(P.x, P.y - 36, '-' + fmt(d), o.dot ? '#c98aff' : '#ff4a4a', 17);
  if (!o.dot) { burst(P.x, P.y - 10, '#c0392b', 5, 90, 0.4); sfx('hurt'); }
  if (P.gather) cancelGather();
  if (P.hp <= 0) die();
}
function die() {
  const P = G.P; P.dead = true; P.hp = 0; P.autoAtk = false; P.path = null; P.deaths++;
  P.fx.length = 0; G.target = null; P.mounted = false; cancelGather();
  log('Du bist gestorben.', 'system', '#ff4a4a'); sfx('death');
  for (const m of G.mobs) if (!m.dead && m.state === 'chase') m.state = 'return';
  G.dirty.death = true;
}
function respawnPlayer() {
  const P = G.P, hub = World.nearestHub(P.x, P.y);
  P.dead = false; P.x = hub.x * TILE + 16; P.y = (hub.y + 3) * TILE + 16; P.fx.length = 0;
  recalc(); P.hp = Math.round(P.st.maxHp * 0.6); P.res = P.st.maxRes; P.cd = {};
  log(`Du erwachst in ${hub.name}.`, 'system'); G.dirty.death = true; G.dirty.char = true;
  for (const m of G.mobs) if (m.state === 'chase') m.state = 'return';
}

// ---------------------------------------------------------------------
//  Projektile & Flächeneffekte
// ---------------------------------------------------------------------
function fireProj(o) { G.projs.push(Object.assign({ t: 0, speed: 420, size: 5, col: '#fff', life: 3 }, o)); }
function telegraph(o) { G.tele.push(Object.assign({ start: G.now, at: G.now + 1.4, color: '#ff3a2a' }, o)); }
function updateProjs(dt) {
  const P = G.P;
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    p.t += dt; let rm = p.t > p.life;
    if (p.owner === 'p') {
      const t = p.tgt;
      if (t && !t.dead) { p.tx = t.x; p.ty = t.y - 10 * t.sc; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      if (d <= step + 8) { p.x = p.tx; p.y = p.ty; if (t && !t.dead) p.onHit(t); rm = true; }
      else { p.x += dx / d * step; p.y += dy / d * step; p.ang = Math.atan2(dy, dx); }
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt; p.ang = Math.atan2(p.vy, p.vx);
      if (!P.dead && Math.hypot(P.x - p.x, P.y - 10 - p.y) < 17) { hurtPlayer(p.dmg, p.src); burst(p.x, p.y, p.col, 6, 80, 0.3); rm = true; }
      else if (World.blockedPx(p.x, p.y, 2)) rm = true;
    }
    if (rm) G.projs.splice(i, 1);
  }
  for (let i = G.tele.length - 1; i >= 0; i--) {
    const t = G.tele[i];
    if (t.src && t.src.dead) { G.tele.splice(i, 1); continue; }
    if (t.follow && t.src) { t.x = t.src.x; t.y = t.src.y; }
    if (G.now >= t.at) {
      ring(t.x, t.y, t.r, t.color, 0.5); burst(t.x, t.y, t.color, 14, 140, 0.5); G.shake = Math.max(G.shake, 3);
      if (!P.dead && Math.hypot(P.x - t.x, P.y - t.y) < t.r) {
        hurtPlayer(t.dmg, t.src);
        if (t.stun) addFx(P, { type: 'stun', until: G.now + t.stun });
        if (t.slow) addFx(P, { type: 'slow', until: G.now + 3, pct: 40 });
      }
      G.tele.splice(i, 1);
    }
  }
  for (let i = G.timers.length - 1; i >= 0; i--) if (G.now >= G.timers[i].at) { const f = G.timers[i].fn; G.timers.splice(i, 1); f(); }
}

// ---------------------------------------------------------------------
//  Fertigkeiten & Angriffe des Spielers
// ---------------------------------------------------------------------
function isHostile(m) { return m && m.def && !m.dead; }
function roll(mult) {
  const P = G.P, crit = Math.random() * 100 < P.st.crit;
  return { d: P.st.ap * mult * rnd(0.92, 1.08) * (crit ? 1.9 : 1), crit };
}
function applyExtras(sk, rank, m, dealt) {
  const P = G.P;
  if (!m || m.dead) { if (sk.lifesteal && dealt) healPlayer(dealt * rv(sk.lifesteal, rank) / 100, true); return; }
  if (sk.stun) addFx(m, { type: 'stun', until: G.now + rv(sk.stun, rank) * (m.boss ? 0.35 : 1) });
  if (sk.slow) addFx(m, { type: 'slow', until: G.now + rv(sk.slow.dur, rank), pct: sk.slow.pct * (m.boss ? 0.6 : 1) });
  if (sk.dot) { const total = P.st.ap * rv(sk.dot.pow, rank), dur = sk.dot.dur; addFx(m, { type: 'dot', id: sk.id, until: G.now + dur, tick: total / dur, next: G.now + 1, src: P }); }
  if (sk.lifesteal && dealt) healPlayer(dealt * rv(sk.lifesteal, rank) / 100, true);
  if (P.st.mod.lifesteal && dealt) healPlayer(dealt * P.st.mod.lifesteal / 100, true);
}
function playerHit(m, mult, sk, rank, extraMult = 1) {
  if (!m || m.dead) return 0;
  const r = roll(mult * extraMult);
  const dealt = hurtMob(m, r.d, r.crit, 'skill');
  if (sk) applyExtras(sk, rank, m, dealt); else if (G.P.st.mod.lifesteal) healPlayer(dealt * G.P.st.mod.lifesteal / 100, true);
  return dealt;
}
function mobsInRadius(x, y, r) { return G.mobs.filter(m => !m.dead && m.state !== 'return' && !m.def.passive && Math.hypot(m.x - x, m.y - y) < r + mobRadius(m)); }

function castSkill(id, fromApproach) {
  const P = G.P; if (P.dead) return;
  const sk = SKILLS[id], rank = P.skills[id] || 0;
  if (!sk || !rank || sk.type === 'passive') return;
  if (hasFx(P, 'stun')) { log('Du bist betäubt!', 'system', '#ff6a6a'); return; }
  if (G.now < (P.cd[id] || 0)) { if (!fromApproach) log(`${sk.name} ist noch nicht bereit.`, 'system', '#aaa'); return; }
  if (G.now < (P.gcd || 0) && !fromApproach) return;
  if (P.res < sk.cost) { log(`Nicht genug ${CLASSES[P.cls].res}.`, 'system', '#ff6a6a'); sfx('fail'); return; }
  const tgt = G.target && isHostile(G.target) ? G.target : null;
  const needsTarget = ['melee', 'proj', 'dash', 'dot', 'gaoe'].includes(sk.type);
  if (needsTarget && !tgt) { log('Du hast kein Ziel.', 'system', '#ff6a6a'); sfx('fail'); return; }
  if (tgt) {
    const d = Math.hypot(tgt.x - P.x, tgt.y - P.y) - mobRadius(tgt);
    const range = sk.type === 'melee' ? (sk.range || 58) : sk.type === 'dash' ? 380 : sk.type === 'dot' || sk.type === 'proj' || sk.type === 'gaoe' ? (sk.type === 'proj' ? 340 : 360) : 999;
    if (d > range) {
      if (needsTarget) { P.approach = { tgt, id, range: range - 12 }; P.path = null; if (!fromApproach) log('Ziel ist zu weit entfernt – du läufst hin.', 'system', '#aaa'); }
      return;
    }
  }
  P.approach = null;
  if (P.mounted) { P.mounted = false; recalc(); }
  const cdr = 1 - clamp(P.st.mod.cdr, 0, 60) / 100;
  P.res -= sk.cost; P.cd[id] = G.now + sk.cd * cdr; P.gcd = G.now + 0.75; P.cdMax = P.cdMax || {}; P.cdMax[id] = sk.cd * cdr;
  if (tgt) { P.dir = tgt.x >= P.x ? 1 : -1; if (['melee', 'proj', 'dash', 'dot', 'gaoe'].includes(sk.type)) P.autoAtk = true; }
  P.castAnim = G.now; P.lastCombat = G.now;
  const ap = P.st.ap;
  switch (sk.type) {
    case 'melee': {
      playerHit(tgt, rv(sk.pow, rank), sk, rank);
      if (sk.cleave) for (const o of mobsInRadius(tgt.x, tgt.y, sk.cleave)) if (o !== tgt) playerHit(o, rv(sk.pow, rank) * 0.6, null, rank);
      ring(tgt.x, tgt.y, 40, '#fff', 0.25); sfx('hit'); break;
    }
    case 'proj': {
      const col = sk.col || '#fff';
      fireProj({ owner: 'p', x: P.x, y: P.y - 14, tx: tgt.x, ty: tgt.y, tgt, col, size: 5 + (sk.pow[0] > 4 ? 4 : 0), speed: 520, trail: true, onHit: m => { playerHit(m, rv(sk.pow, rank) * (sk.exec && m.hp / m.maxhp < sk.exec.below / 100 ? sk.exec.mult : 1), sk, rank); ring(m.x, m.y, 30, col, 0.3); burst(m.x, m.y - 8, col, 8, 100, 0.4); sfx('hit'); } });
      sfx('cast'); break;
    }
    case 'dot': {
      applyExtras(sk, rank, tgt, 0); burst(tgt.x, tgt.y - 10, sk.col || '#9a50d0', 14, 90, 0.6); ring(tgt.x, tgt.y, 36, sk.col || '#9a50d0', 0.4);
      if (!tgt.state || tgt.state === 'idle') aggro(tgt); sfx('cast'); break;
    }
    case 'nova': {
      const r = sk.r; ring(P.x, P.y, r, sk.col || '#ffd070', 0.5); burst(P.x, P.y - 8, '#ffd070', 22, 200, 0.5);
      for (const m of mobsInRadius(P.x, P.y, r)) playerHit(m, rv(sk.pow, rank), sk, rank);
      G.shake = Math.max(G.shake, 2.5); sfx('nova'); break;
    }
    case 'gaoe': {
      const cx = tgt.x, cy = tgt.y, r = sk.r;
      ring(cx, cy, r, '#ff9a3a', 0.8);
      later(0.45, () => {
        ring(cx, cy, r, '#ffd070', 0.5); burst(cx, cy, '#ff7a2a', 30, 220, 0.7); G.shake = Math.max(G.shake, 3.5); sfx('boom');
        for (const m of mobsInRadius(cx, cy, r)) playerHit(m, rv(sk.pow, rank), sk, rank);
      });
      sfx('cast'); break;
    }
    case 'dash': {
      const a = Math.atan2(tgt.y - P.y, tgt.x - P.x), stopD = mobRadius(tgt) + 20;
      burst(P.x, P.y, '#ddd', 10, 120, 0.4);
      let nx = tgt.x - Math.cos(a) * stopD, ny = tgt.y - Math.sin(a) * stopD;
      if (!World.blockedPx(nx, ny, 9)) { P.x = nx; P.y = ny; }
      ring(P.x, P.y, 50, '#fff', 0.3); playerHit(tgt, rv(sk.pow, rank), sk, rank); sfx('hit'); break;
    }
    case 'blink': {
      let a;
      if (sk.back && tgt) a = Math.atan2(P.y - tgt.y, P.x - tgt.x);
      else if (UI && UI.mouseWorld) a = Math.atan2(UI.mouseWorld.y - P.y, UI.mouseWorld.x - P.x);
      else a = P.dir > 0 ? 0 : Math.PI;
      burst(P.x, P.y - 10, sk.col || '#c0a0ff', 14, 120, 0.4);
      for (let d = sk.dist; d > 20; d -= 16) {
        const nx = P.x + Math.cos(a) * d, ny = P.y + Math.sin(a) * d;
        if (!World.blockedPx(nx, ny, 9)) { P.x = nx; P.y = ny; break; }
      }
      P.path = null; burst(P.x, P.y - 10, '#c0a0ff', 14, 120, 0.4); sfx('blink'); break;
    }
    case 'buff': {
      const dur = sk.dur;
      if (sk.mods) addFx(P, { type: 'buff', id: sk.id, until: G.now + dur, mods: sk.mods, rank, name: sk.name, ic: sk.ic });
      if (sk.shield) addFx(P, { type: 'shield', id: sk.id, until: G.now + dur, amount: ap * rv(sk.shield, rank), name: sk.name, ic: sk.ic });
      if (sk.heal) healPlayer(P.st.maxHp * rv(sk.heal, rank) / 100, true);
      if (sk.mods && sk.mods.regenPct) addFx(P, { type: 'hot', id: sk.id + '_h', until: G.now + dur, tick: P.st.maxHp * rv(sk.mods.regenPct, rank) / 100, next: G.now + 1 });
      ring(P.x, P.y, 55, '#ffe9a0', 0.6); burst(P.x, P.y - 10, '#ffe9a0', 14, 80, 0.7); recalc(); sfx('buff'); break;
    }
    case 'heal': {
      const amt = ap * rv(sk.pow, rank);
      if (amt > 0) healPlayer(amt);
      if (sk.hot) addFx(P, { type: 'hot', id: sk.id, until: G.now + sk.hot.dur, tick: ap * rv(sk.hot.pow, rank) / sk.hot.dur, next: G.now + 1, name: sk.name, ic: sk.ic });
      ring(P.x, P.y, 50, '#6aff8a', 0.6); burst(P.x, P.y - 10, '#6aff8a', 16, 70, 0.8); sfx('heal'); break;
    }
  }
  G.dirty.hotbar = true;
}
function basicAttack() {
  const P = G.P, C = CLASSES[P.cls], t = G.target;
  if (!t || t.dead || P.dead || hasFx(P, 'stun')) return;
  const d = Math.hypot(t.x - P.x, t.y - P.y) - mobRadius(t), range = C.range;
  if (d > range) return;
  if (G.now < (P.atkAt || 0)) return;
  P.atkAt = G.now + 1.35; P.castAnim = G.now; P.dir = t.x >= P.x ? 1 : -1; P.lastCombat = G.now;
  if (P.mounted) { P.mounted = false; recalc(); }
  if (C.ranged) {
    const col = P.cls === 'magier' ? '#a98aff' : P.cls === 'priester' ? '#fff2a0' : '#e8d8a0';
    fireProj({ owner: 'p', x: P.x, y: P.y - 14, tx: t.x, ty: t.y, tgt: t, col, size: 4, speed: 560, arrow: P.cls === 'waldlaeufer', onHit: m => { playerHit(m, 0.9, null, 1); sfx('hit'); } });
    sfx('shoot');
  } else { playerHit(t, 0.9, null, 1); ring(t.x, t.y, 28, '#fff', 0.2); sfx('hit'); }
  if (!t.dead && t.state !== 'chase') aggro(t);
}

// ---------------------------------------------------------------------
//  Monster-KI
// ---------------------------------------------------------------------
function moveEnt(e, dx, dy, r = 10) {
  let moved = false;
  if (dx && !World.blockedPx(e.x + dx, e.y, r)) { e.x += dx; moved = true; }
  if (dy && !World.blockedPx(e.x, e.y + dy, r)) { e.y += dy; moved = true; }
  return moved;
}
function mobMove(m, tx, ty, speed, dt) {
  const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1, st = Math.min(d, speed * dt);
  const ok = moveEnt(m, dx / d * st, dy / d * st, 9);
  if (Math.abs(dx) > 1) m.dir = dx > 0 ? 1 : -1;
  m.anim += dt * (speed / 30);
  if (!ok) {
    // seitlich ausweichen
    const ang = Math.atan2(dy, dx) + (m.sidestep || (m.sidestep = Math.random() < 0.5 ? 1 : -1)) * 1.2;
    moveEnt(m, Math.cos(ang) * st, Math.sin(ang) * st, 9); m.stuck += dt;
  } else m.stuck = Math.max(0, m.stuck - dt * 0.5);
  return d;
}
function updateMob(m, dt) {
  const P = G.P;
  if (m.dead) { if (m.removeAt && G.now >= m.removeAt) m.gone = true; else if (G.now >= m.respawnAt && !m.temp) respawnMob(m); return; }
  m.flash = Math.max(0, m.flash - dt);
  updateFx(m, dt, false);
  if (m.dead) return;
  const stunned = hasFx(m, 'stun'), slow = hasFx(m, 'slow');
  const speed = m.spd * (m.spdMul || 1) * (slow ? 1 - slow.pct / 100 : 1);
  const d = Math.hypot(P.x - m.x, P.y - m.y), hd = Math.hypot(m.hx - m.x, m.hy - m.y);
  const leash = m.boss ? 560 : m.temp ? 700 : 430;
  switch (m.state) {
    case 'idle': {
      if (m.hp < m.maxhp) m.hp = Math.min(m.maxhp, m.hp + m.maxhp * 0.1 * dt);
      if (stunned) break;
      m.wanderT -= dt;
      if (m.wanderT <= 0) { const a = rnd(0, TAU), r = rnd(20, 90); m.wx = m.hx + Math.cos(a) * r; m.wy = m.hy + Math.sin(a) * r; m.wanderT = rnd(3, 8); m.wmove = Math.random() < 0.7; }
      if (m.wmove && m.wx !== undefined) { const dd = mobMove(m, m.wx, m.wy, speed * 0.4, dt); if (dd < 6 || m.stuck > 1.5) { m.wmove = false; m.stuck = 0; } }
      if (!m.def.passive && !P.dead && !G.playerSafe) {
        const lf = P.level - m.lvl >= 6 ? 0.35 : 1;
        const ar = m.def.aggro * lf * (m.boss ? 1.4 : 1) * (P.mounted ? 0.9 : 1);
        if (d < ar) aggro(m);
      }
      break;
    }
    case 'chase': {
      if (P.dead || (G.playerSafe && !m.temp) || (hd > leash && !m.temp)) { m.state = 'return'; m.stuck = 0; break; }
      if (m.def.passive) { m.state = 'return'; break; }
      if (m.boss) bossAbilities(m);
      if (stunned) break;
      const rad = mobRadius(m) + 9;
      const want = m.def.ranged ? m.range : m.range + 6;
      if (d > want * (m.def.ranged ? 0.9 : 0.85)) mobMove(m, P.x, P.y, speed, dt);
      else if (m.def.ranged && d < want * 0.35) mobMove(m, m.x - (P.x - m.x), m.y - (P.y - m.y), speed * 0.7, dt);
      if (d <= want + rad * 0.2 && G.now >= m.atkAt) {
        m.atkAt = G.now + m.atkIv * rnd(0.9, 1.1); m.atkAnim = G.now;
        if (Math.abs(P.x - m.x) > 1) m.dir = P.x > m.x ? 1 : -1;
        if (m.def.ranged) {
          const a = Math.atan2(P.y - 10 - (m.y - 12), P.x - m.x), sp = 330;
          fireProj({ owner: 'm', x: m.x, y: m.y - 12 * m.sc, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: mobDamage(m, 1), src: m, col: m.def.bolt || '#fff', size: 6, life: 2 });
        } else hurtPlayer(mobDamage(m, 1) * (Math.random() < 0.06 ? 1.6 : 1), m);
      }
      if (m.stuck > 5) { m.x = m.hx; m.y = m.hy; m.state = 'return'; m.stuck = 0; }
      break;
    }
    case 'return': {
      m.hp = Math.min(m.maxhp, m.hp + m.maxhp * 0.25 * dt);
      const dd = mobMove(m, m.hx, m.hy, m.spd * 1.5, dt);
      if (dd < 8 || m.stuck > 3) { if (m.stuck > 3) { m.x = m.hx; m.y = m.hy; } m.state = 'idle'; m.stuck = 0; m.hp = m.maxhp; m.fx.length = 0; if (G.target === m) G.dirty.target = true; }
      break;
    }
  }
}
function bossAbilities(m) {
  const P = G.P, hpf = m.hp / m.maxhp;
  for (const a of m.ab) {
    if (a.t === 'enrage' || a.t === 'heal') {
      if (!a.done && hpf <= a.at) {
        a.done = true;
        if (a.t === 'enrage') { m.enraged = true; m.spdMul = 1.25; ring(m.x, m.y, 200, '#ff2a2a', 1); log(`${m.name} gerät in Raserei!`, 'combat', '#ff5a3a'); ftext(m.x, m.y - 70, 'RASEREI!', '#ff4a2a', 24, 2); }
        else { m.hp = Math.min(m.maxhp, m.hp + m.maxhp * 0.15); ring(m.x, m.y, 150, '#6aff8a', 1); log(`${m.name} heilt sich mit dunkler Macht!`, 'combat', '#9aff9a'); }
      }
      continue;
    }
    if (G.now < a.next) continue;
    if (!a.next) { a.next = G.now + rnd(2, a.cd); continue; }
    if (hasFx(m, 'stun')) continue;
    const d = Math.hypot(P.x - m.x, P.y - m.y);
    a.next = G.now + a.cd * rnd(0.9, 1.1);
    if (a.t === 'slam') {
      if (d > 480) continue;
      telegraph({ x: P.x, y: P.y, r: a.r, at: G.now + 1.3, dmg: mobDamage(m, a.m), src: m, stun: a.stun, slow: a.slow });
      ftext(m.x, m.y - 60, '!', '#ff4a2a', 26, 0.9);
    } else if (a.t === 'nova') {
      telegraph({ x: m.x, y: m.y, r: a.r, at: G.now + 1.7, dmg: mobDamage(m, a.m), src: m, follow: true, color: '#ff7a2a' });
      ftext(m.x, m.y - 60, 'Vorsicht!', '#ff9a2a', 20, 1.2);
    } else if (a.t === 'summon') {
      if (G.mobs.filter(o => o.owner === m && !o.dead).length >= 5) continue;
      for (let i = 0; i < a.n; i++) {
        const ang = rnd(0, TAU), x = m.x + Math.cos(ang) * 70, y = m.y + Math.sin(ang) * 70;
        if (World.blockedPx(x, y, 9)) continue;
        const d2 = MOBS[a.mob], add = makeMob(a.mob, x, y, clamp(m.lvl - 1, d2.lv[0], 40), false);
        add.temp = true; add.owner = m; add.hx = m.x; add.hy = m.y; add.maxhp = Math.round(add.maxhp * 0.45); add.hp = add.maxhp; add.dmg *= 0.45; add.state = 'chase'; add.chaseStart = G.now; add.pack = -1;
        G.mobs.push(add); burst(x, y, '#9a50d0', 10, 90, 0.5);
      }
      log(`${m.name} ruft Verstärkung!`, 'combat', '#ff9a5a');
    } else if (a.t === 'bolt') {
      const ang = Math.atan2(P.y - 10 - (m.y - 14), P.x - m.x);
      fireProj({ owner: 'm', x: m.x, y: m.y - 14 * m.sc, vx: Math.cos(ang) * 340, vy: Math.sin(ang) * 340, dmg: mobDamage(m, a.m), src: m, col: m.def.bolt || '#ff6a2a', size: 9, life: 2.4 });
    } else if (a.t === 'dot') {
      if (d > 520) continue;
      addFx(P, { type: 'dot', id: 'boss_' + m.id, until: G.now + 8, tick: mobDamage(m, a.m) / 8, next: G.now + 1, src: m, name: 'Fluch', ic: '☠️' });
      log(`${m.name} belegt dich mit einem Fluch!`, 'combat', '#c98aff'); burst(P.x, P.y - 10, '#9a50d0', 14, 90, 0.6);
    }
  }
}

function updateBots(dt) {
  for (const b of G.bots) {
    b.anim += dt;
    if (b.wait > 0) { b.wait -= dt; b.moving = false; continue; }
    if (!b.tx) {
      const a = rnd(0, TAU), r = rnd(3, 15) * TILE;
      b.tx = b.hub.x * TILE + Math.cos(a) * r; b.ty = b.hub.y * TILE + Math.sin(a) * r; b.stuck = 0;
      if (Math.random() < 0.08) { const h2 = pick(HUBS); b.hub = h2; }
    }
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
    if (d < 8 || b.stuck > 1.2 || World.blockedPx(b.tx, b.ty, 9)) { b.tx = 0; b.wait = rnd(2, 9); b.moving = false; continue; }
    b.moving = true; b.dir = dx > 0 ? 1 : -1;
    if (!moveEnt(b, dx / d * 115 * dt, dy / d * 115 * dt, 9)) b.stuck += dt;
  }
}

// ---------------------------------------------------------------------
//  Quests
// ---------------------------------------------------------------------
const QMAP = {}; QUESTS.forEach(q => (QMAP[q.id] = q));
function questAvailable(q) {
  const P = G.P;
  return !P.done[q.id] && !P.quests[q.id] && P.level >= q.lv - 2 && q.pre.every(p => P.done[p]);
}
function questComplete(q) {
  const st = G.P.quests[q.id]; if (!st) return false;
  return q.obj.every((o, i) => st.prog[i] >= objTarget(o));
}
function objTarget(o) { return o.t === 'kill' || o.t === 'collect' || o.t === 'gather' ? o.n : 1; }
function objText(o) {
  switch (o.t) {
    case 'kill': return `${MOBS[o.m].name} besiegen`;
    case 'collect': return `${o.label} sammeln`;
    case 'gather': return `${NODE_TYPES[o.node].name} sammeln`;
    case 'talk': return `Sprich mit ${NPCS.find(n => n.id === o.npc).name}`;
    case 'explore': return `Erkunde: ${POIS[o.poi].name}`;
  }
}
function acceptQuest(id) {
  const q = QMAP[id], P = G.P;
  if (!questAvailable(q)) return;
  if (Object.keys(P.quests).length >= 15) { log('Dein Questlog ist voll (max. 15).', 'system', '#ff6a6a'); return; }
  P.quests[id] = { prog: q.obj.map(() => 0) };
  log(`Quest angenommen: ${q.name}`, 'quest', '#ffe070'); sfx('quest');
  G.dirty.quests = true;
  // Sofort-Fortschritt (z. B. bereits gesammelte Materialien zählen nicht – nur Erkundung/Gespräch prüfen)
  questCheckComplete(q);
}
function abandonQuest(id) { delete G.P.quests[id]; G.dirty.quests = true; }
function questCheckComplete(q) {
  const st = G.P.quests[q.id]; if (!st) return;
  const c = questComplete(q);
  if (c && !st.ready) {
    st.ready = true; log(`Quest abgeschlossen: ${q.name} – kehre zu ${NPCS.find(n => n.id === q.turn).name} zurück.`, 'quest', '#ffe070');
    if (UI && UI.toast) UI.toast(`Quest bereit: ${q.name}`); sfx('questdone');
  }
  G.dirty.quests = true;
}
function questProgress(match, amount = 1) {
  const P = G.P;
  for (const id in P.quests) {
    const q = QMAP[id], st = P.quests[id]; let ch = false;
    q.obj.forEach((o, i) => {
      if (st.prog[i] >= objTarget(o)) return;
      if (match(o)) { st.prog[i] = Math.min(objTarget(o), st.prog[i] + amount); ch = true; ftext(P.x, P.y - 70, `${shortObj(o)} ${st.prog[i]}/${objTarget(o)}`, '#ffe070', 14, 1.3); }
    });
    if (ch) questCheckComplete(q);
  }
}
function shortObj(o) { return o.t === 'kill' ? MOBS[o.m].name : o.t === 'collect' ? o.label : o.t === 'gather' ? NODE_TYPES[o.node].name : ''; }
function questKill(m) {
  const P = G.P;
  questProgress(o => o.t === 'kill' && o.m === m.id);
  for (const id in P.quests) {
    const q = QMAP[id], st = P.quests[id];
    q.obj.forEach((o, i) => {
      if (o.t === 'collect' && o.m === m.id && st.prog[i] < o.n && Math.random() < o.ch) { st.prog[i]++; ftext(m.x, m.y - 70, `${o.label} ${st.prog[i]}/${o.n}`, '#ffe070', 14, 1.4); questCheckComplete(q); }
    });
  }
}
function questTalk(npcId) { questProgress(o => o.t === 'talk' && o.npc === npcId); }
function completeQuest(id) {
  const q = QMAP[id], P = G.P;
  if (!P.quests[id] || !questComplete(q)) return false;
  const xp = Math.max(30, Math.round(xpNeed(q.lv) * 0.22 * q.xp)), gold = Math.round((q.lv * 8 + 10) * q.gold);
  delete P.quests[id]; P.done[id] = true; P.gold += gold;
  if (q.rar >= 0) { const it = genItem(q.lv + 1, q.rar, undefined, { cls: P.cls }); giveItem(it); }
  log(`Quest erfüllt: ${q.name}  (+${xp} EP, +${gold} Gold)`, 'quest', '#ffe070'); sfx('questdone');
  addXp(xp); G.dirty.quests = true; G.dirty.inv = true;
  return true;
}
function npcMarker(n) {
  const P = G.P; let m = null;
  for (const q of QUESTS) {
    if (q.turn === n.id && P.quests[q.id]) { if (P.quests[q.id].ready) return 'ready'; m = m || 'prog'; }
  }
  for (const q of QUESTS) if (q.giver === n.id && questAvailable(q)) return 'avail';
  return m;
}
function checkExplore() {
  const P = G.P;
  for (const id in P.quests) {
    const q = QMAP[id], st = P.quests[id];
    q.obj.forEach((o, i) => {
      if (o.t !== 'explore' || st.prog[i] >= 1) return;
      const p = POIS[o.poi];
      if (Math.hypot(P.x - (p.x * TILE + 16), P.y - (p.y * TILE + 16)) < o.r * TILE) {
        st.prog[i] = 1; log(`Entdeckt: ${p.name}`, 'quest', '#ffe070'); ftext(P.x, P.y - 70, `Entdeckt: ${p.name}`, '#ffe070', 16, 2); questCheckComplete(q);
      }
    });
  }
}

// ---------------------------------------------------------------------
//  Sammeln, Handwerk, Reittier
// ---------------------------------------------------------------------
function startGather(node) {
  const P = G.P; if (P.gather || !node.avail) return;
  if (Math.hypot(node.x - P.x, node.y - P.y) > 70) return;
  P.gather = { node, until: G.now + 2.2, start: G.now }; P.path = null; P.approach = null;
}
function cancelGather() { if (G.P) G.P.gather = null; }
function finishGather(node) {
  const P = G.P, nt = NODE_TYPES[node.type];
  node.avail = false; node.respawnAt = G.now + 75;
  const n = rndi(1, 2) + (Math.random() < 0.15 ? 1 : 0);
  giveItem({ type: 'material', id: node.type, qty: n }, true);
  log(`Du sammelst ${n}x ${nt.name}.`, 'loot', '#bfe8c0'); sfx('gather'); burst(node.x, node.y - 8, nt.col, 12, 90, 0.6);
  questProgress(o => o.t === 'gather' && o.node === node.type, n);
}
function canCraft(r) {
  for (const k in r.in) if (invCount(k) < r.in[k]) return false;
  return G.P.gold >= (r.gold || 0);
}
function craft(r) {
  const P = G.P;
  if (!canCraft(r)) { log('Dir fehlen Materialien oder Gold.', 'system', '#ff6a6a'); return; }
  if (r.gen && invFree() < 1) { log('Dein Inventar ist voll!', 'system', '#ff6a6a'); return; }
  for (const k in r.in) invRemove(k, r.in[k]);
  P.gold -= r.gold || 0;
  if (r.gen) giveItem(genItem(P.level + 1, r.gen.rar, r.gen.slot, { cls: P.cls }));
  else giveItem({ type: BASEITEMS[r.out].type, id: r.out, qty: r.n });
  sfx('craft'); G.dirty.inv = true;
}
function buyMount() {
  const P = G.P;
  if (P.hasMount) return;
  if (P.level < 8) { log('Du benötigst Stufe 8 für ein Reittier.', 'system', '#ff6a6a'); return; }
  if (P.gold < 150) { log('Ein Reittier kostet 150 Gold.', 'system', '#ff6a6a'); return; }
  P.gold -= 150; P.hasMount = true; log('Du hast ein Reittier erhalten! Drücke R zum Auf-/Absteigen.', 'system', '#ffe070'); sfx('quest');
}
function toggleMount() {
  const P = G.P;
  if (!P.hasMount) { log('Du besitzt kein Reittier. Edda in der Waldwacht verkauft eines.', 'system', '#ff6a6a'); return; }
  if (P.dead) return;
  if (!P.mounted && G.now - (P.lastCombat || -99) < 4) { log('Du kannst im Kampf nicht aufsteigen.', 'system', '#ff6a6a'); return; }
  if (!P.mounted && G.playerSafe === false && G.mobs.some(m => m.state === 'chase' && !m.dead)) { log('Du wirst noch verfolgt!', 'system', '#ff6a6a'); return; }
  P.mounted = !P.mounted; recalc(); burst(P.x, P.y, '#ddd', 8, 70, 0.4);
}

// ---------------------------------------------------------------------
//  Hauptaktualisierung
// ---------------------------------------------------------------------
function updatePlayer(dt) {
  const P = G.P;
  if (P.dead) return;
  P.playtime += dt;
  updateFx(P, dt, true);
  const hub = World.hubAt(P.x, P.y);
  G.playerSafe = !!hub;
  P.zone = World.zoneAtPx(P.x, P.y);
  P.hub = hub;
  // Regeneration
  const out = G.now - (P.lastCombat || -99) > 6;
  P.res = Math.min(P.st.maxRes, P.res + P.st.regenRes * dt * (out ? 2.2 : 1));
  if (out && P.hp < P.st.maxHp) P.hp = Math.min(P.st.maxHp, P.hp + P.st.maxHp * 0.02 * dt * (hub ? 3 : 1));
  // Bewegung
  const stunned = hasFx(P, 'stun');
  const slow = hasFx(P, 'slow');
  let spd = P.st.speed * (slow ? 1 - slow.pct / 100 : 1);
  let mx = 0, my = 0;
  const K = UI.keys;
  if (K['KeyW'] || K['ArrowUp']) my -= 1; if (K['KeyS'] || K['ArrowDown']) my += 1;
  if (K['KeyA'] || K['ArrowLeft']) mx -= 1; if (K['KeyD'] || K['ArrowRight']) mx += 1;
  P.moving = false;
  if (!stunned) {
    if (mx || my) {
      P.path = null; P.approach = null; P.interact = null; P.chase = false; if (P.gather) cancelGather();
      const l = Math.hypot(mx, my); moveEnt(P, mx / l * spd * dt, my / l * spd * dt, 9); P.moving = true; if (mx) P.dir = mx > 0 ? 1 : -1;
    } else if (P.approach) {
      const a = P.approach, t = a.tgt;
      if (t.dead || !isHostile(t)) P.approach = null;
      else {
        const d = Math.hypot(t.x - P.x, t.y - P.y) - mobRadius(t);
        if (d <= a.range) { const id = a.id; P.approach = null; if (id === '_auto') { /* Auto-Angriff übernimmt */ } else castSkill(id, true); }
        else { stepToward(P, t.x, t.y, spd, dt); }
      }
    } else if (P.autoAtk && G.target && isHostile(G.target) && P.chase) {
      const t = G.target, d = Math.hypot(t.x - P.x, t.y - P.y) - mobRadius(t);
      if (d > CLASSES[P.cls].range - 8) stepToward(P, t.x, t.y, spd, dt);
    } else if (P.path && P.path.length) {
      const w = P.path[0], d = Math.hypot(w.x - P.x, w.y - P.y);
      if (d < 6) P.path.shift(); else { stepToward(P, w.x, w.y, spd, dt, true); }
      if (!P.path.length) P.path = null;
    }
    if (P.interact && !P.path) {
      const e = P.interact;
      if (Math.hypot(e.x - P.x, e.y - P.y) < (e.npc ? 80 : 60)) { P.interact = null; interact(e); }
      else if (!P.path) { const p = World.findPath(P.x, P.y, e.x, e.y); if (p) P.path = p; else P.interact = null; }
    }
  }
  // Angriff
  if (P.autoAtk && G.target) {
    if (!isHostile(G.target)) { P.autoAtk = false; }
    else basicAttack();
  }
  // Sammeln
  if (P.gather) {
    if (G.now >= P.gather.until) { const n = P.gather.node; P.gather = null; if (n.avail) finishGather(n); }
  }
  // Beute einsammeln
  for (let i = G.bags.length - 1; i >= 0; i--) {
    const b = G.bags[i];
    if (G.now > b.until) { G.bags.splice(i, 1); continue; }
    if (Math.hypot(b.x - P.x, b.y - P.y) < 46) {
      while (b.items.length) { if (!giveItem(b.items[0])) break; b.items.shift(); }
      if (!b.items.length) G.bags.splice(i, 1);
    }
  }
  if (G.target && G.target.dead && !G.target.def) G.target = null;
  if ((G.now | 0) !== (P._ex | 0)) { P._ex = G.now; checkExplore(); }
}
function stepToward(e, tx, ty, spd, dt, allowSlide = true) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1, st = Math.min(d, spd * dt);
  const ok = moveEnt(e, dx / d * st, dy / d * st, 9);
  if (Math.abs(dx) > 1) e.dir = dx > 0 ? 1 : -1;
  e.moving = true;
  if (!ok && e === G.P) { e.blockedT = (e.blockedT || 0) + dt; if (e.blockedT > 0.6) { e.path = null; e.approach = null; e.blockedT = 0; } } else e.blockedT = 0;
}
function interact(e) {
  const P = G.P;
  if (e.npc) { questTalk(e.id); G.dirty.dialog = e; sfx('talk'); }
  else if (e.type && NODE_TYPES[e.type]) startGather(e);
}
function setTarget(t) { G.target = t; G.dirty.target = true; }
function tabTarget() {
  const P = G.P; let best = null, bd = 520;
  for (const m of G.mobs) {
    if (m.dead || m.def.passive && false) continue;
    const d = Math.hypot(m.x - P.x, m.y - P.y);
    if (d < bd && m !== G.target) { bd = d; best = m; }
  }
  if (best) setTarget(best);
}
function clientCommand(t) {
  const P = G.P, a = t.split(' ');
  if (a[0] === '/hilfe') {
    log('Befehle: /hilfe, /pos, /stuck (zurück zur nächsten Siedlung), /zeit, /kills', 'system', '#9fd0ff');
  } else if (a[0] === '/pos') log(`Position: ${Math.round(P.x / TILE)} / ${Math.round(P.y / TILE)}`, 'system');
  else if (a[0] === '/stuck') { const h = World.nearestHub(P.x, P.y); P.x = h.x * TILE + 16; P.y = (h.y + 3) * TILE + 16; P.path = null; log(`Du wurdest nach ${h.name} gebracht.`, 'system'); }
  else if (a[0] === '/zeit') log(`Spielzeit: ${Math.floor(P.playtime / 3600)}h ${Math.floor(P.playtime / 60) % 60}min`, 'system');
  else if (a[0] === '/kills') log(`Besiegte Gegner: ${Object.values(P.kills).reduce((x, y) => x + y, 0)}`, 'system');
  else log('Unbekannter Befehl. /hilfe zeigt alle Befehle.', 'system', '#ff6a6a');
}

// ---------------------------------------------------------------------
//  Chat der anderen Abenteurer
// ---------------------------------------------------------------------
const BOT_LINES = [
  'Hat jemand Lust auf {boss}? Ich bin Stufe {lv}!', 'LFG {boss}, brauche noch Hilfe!', 'Verkaufe {item} – PN an mich!', 'Wo finde ich {node}?', 'Boah, {boss} hat mich gerade zerlegt…',
  'Kann mir jemand sagen, wo Edda steht?', 'Endlich Stufe {lv}!', 'Die Spinnen im Grünwald sind übel.', 'Suche Gilde, bin aktiv!', 'Hat wer nen Heiltrank übrig? :D', 'lol', 'GZ zum Levelup!',
  'Der Wächter in den Zinnen droppt tolle Sachen!', 'Achtung, Elite-Monster bei {zone}!', 'Handwerk lohnt sich, glaubt mir.', 'Wer kommt mit nach {zone}?', 'Haha, schon wieder gestorben.', 'Brauche Hilfe bei der Questreihe!',
];
const BOT_REPLIES = ['Hi {n}!', 'Hallo {n} :)', 'jo, viel Glück!', 'Gute Reise, {n}!', 'haha ja', 'Willkommen in Aethermoor!', 'Viel Spaß beim Leveln!', 'Gute Idee, {n}.', 'Ich bin dabei!', 'Pass auf die Elite-Monster auf!'];
function botChat(dt) {
  G.botChatT = (G.botChatT === undefined ? rnd(5, 12) : G.botChatT) - dt;
  if (G.botChatT > 0) return;
  G.botChatT = rnd(14, 38);
  const b = pick(G.bots), tpl = pick(BOT_LINES), boss = MOBS[pick(BOSS_LIST)].name;
  const zone = ZONES[Math.min(6, Math.max(0, Math.floor(b.level / 5)))].name;
  const txt = tpl.replace('{boss}', boss).replace('{lv}', b.level).replace('{item}', pick(['Stählernes Schwert', 'Kettenhemd', 'Heiltränke', 'Eisenerz', 'Wolfsfelle'])).replace('{node}', NODE_TYPES[pick(Object.keys(NODE_TYPES))].name).replace('{zone}', zone);
  log(`<span style="color:#6fb0ff">[${b.name}]</span> ${esc(txt)}`, 'chat');
}
function playerSay(text) {
  const P = G.P;
  log(`<span style="color:#ffe9a0">[${esc(P.name)}]</span> ${esc(text)}`, 'chat');
  if (Math.random() < 0.55) later(rnd(2, 5), () => { const b = pick(G.bots); log(`<span style="color:#6fb0ff">[${b.name}]</span> ${esc(pick(BOT_REPLIES).replace('{n}', P.name))}`, 'chat'); });
}

function updateGame(dt) {
  const P = G.P;
  G.now += dt; G.clock += dt;
  updatePlayer(dt);
  for (const m of G.mobs) {
    // Nur Monster in der Nähe simulieren
    if (!m.dead && m.state === 'idle') { const dx = m.x - P.x, dy = m.y - P.y; if (dx * dx + dy * dy > 1500 * 1500) { m.flash = 0; continue; } }
    updateMob(m, dt);
  }
  for (let i = G.mobs.length - 1; i >= 0; i--) if (G.mobs[i].gone) { if (G.target === G.mobs[i]) G.target = null; G.mobs.splice(i, 1); }
  for (const n of G.nodes) if (!n.avail && G.now >= n.respawnAt) n.avail = true;
  updateBots(dt); botChat(dt);
  updateProjs(dt);
  for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.t += dt; t.y += t.vy * dt; t.vy *= 0.97; if (t.t > t.life) G.texts.splice(i, 1); }
  for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; if (p.t > p.life) G.parts.splice(i, 1); }
  for (let i = G.rings.length - 1; i >= 0; i--) { const r = G.rings[i]; r.t += dt; if (r.t > r.life) G.rings.splice(i, 1); }
  G.shake = Math.max(0, G.shake - dt * 12);
  if (G.target && G.target.dead) { G.dirty.target = true; P.autoAtk = false; if (G.target.def) { /* Ziel bleibt als Leiche angezeigt, bis neues gewählt */ } }
  if (G.now - G.lastSave > 20 && !P.dead) { G.lastSave = G.now; saveGame(); }
}

// ---------------------------------------------------------------------
//  Speichern & Laden
// ---------------------------------------------------------------------
const SAVE_KEY = 'aethermoor_save_v1';
function saveGame() {
  const P = G.P; if (!P) return;
  try {
    const s = { v: 1, name: P.name, cls: P.cls, level: P.level, xp: P.xp, gold: P.gold, x: P.x, y: P.y, skills: P.skills, hotbar: P.hotbar, inv: P.inv, eq: P.eq, quests: P.quests, done: P.done, kills: P.kills, hasMount: P.hasMount, playtime: P.playtime, deaths: P.deaths, hp: P.hp, res: P.res, uid: UID };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (e) { /* Speicher nicht verfügbar */ }
}
function readSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 ? s : null; } catch (e) { return null; }
}
function loadPlayer(s) {
  UID = s.uid || 1000;
  const P = newPlayer(s.name, s.cls);
  Object.assign(P, { level: s.level, xp: s.xp, gold: s.gold, x: s.x, y: s.y, skills: s.skills, hotbar: s.hotbar, inv: s.inv, eq: s.eq, quests: s.quests, done: s.done, kills: s.kills || {}, hasMount: !!s.hasMount, playtime: s.playtime || 0, deaths: s.deaths || 0 });
  while (P.inv.length < INV_SIZE) P.inv.push(null);
  recalc(); P.hp = clamp(s.hp || 1, 1, P.st.maxHp); P.res = s.res != null ? Math.min(s.res, P.st.maxRes) : P.st.maxRes;
  if (World.blockedPx(P.x, P.y, 9)) { const h = HUBS[0]; P.x = h.x * TILE + 16; P.y = (h.y + 3) * TILE + 16; }
  return P;
}
