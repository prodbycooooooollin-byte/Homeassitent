'use strict';
// =====================================================================
//  Benutzeroberfläche (klassisches MMORPG-Layout, DOM-Overlay)
// =====================================================================
const $ = id => document.getElementById(id);
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

const UI = {
  keys: {}, hover: null, mouse: { x: 0, y: 0 }, mouseWorld: { x: 0, y: 0 }, wins: {}, chatTab: 'all', vendorNpc: null, dialogNpc: null, dlgQuest: null,
  qSel: null, lastPlace: null, acc: 0, stockCache: {}, hbEls: [],

  init() {
    this.buildHotbar(); this.buildWindows(); this.buildChat();
    document.querySelectorAll('#menubar button').forEach(b => (b.onclick = () => this.toggle(b.dataset.win)));
    $('reviveBtn').onclick = () => respawnPlayer();
    document.addEventListener('mousemove', e => { if ($('tip').style.display === 'block') this.moveTip(e); });
  },

  // ---------- Fenster ----------
  makeWin(id, title, w, place, render) {
    const el = h('div', 'win hidden'); el.id = 'w_' + id; if (w) el.style.width = w + 'px';
    el.innerHTML = `<div class="wh">${title}</div><div class="wx">✕</div><div class="wb"></div>`;
    $('windows').appendChild(el);
    const win = { id, el, body: el.querySelector('.wb'), render, place, open: false, stale: true };
    this.wins[id] = win;
    el.querySelector('.wx').onclick = () => this.close(id);
    el.addEventListener('mousedown', () => { document.querySelectorAll('.win').forEach(x => (x.style.zIndex = 5)); el.style.zIndex = 9; });
    const hd = el.querySelector('.wh');
    hd.onmousedown = e => {
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { el.style.left = clamp(ev.clientX - dx, 0, window.innerWidth - 80) + 'px'; el.style.top = clamp(ev.clientY - dy, 0, window.innerHeight - 40) + 'px'; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); e.preventDefault();
    };
    return win;
  },
  buildWindows() {
    const W = () => window.innerWidth, Hh = () => window.innerHeight;
    this.makeWin('char', 'Charakter', 470, () => [60, 70], () => this.renderChar());
    this.makeWin('inv', 'Inventar', 330, () => [W() - 380, 300], () => this.renderInv());
    this.makeWin('skills', 'Fertigkeiten', 600, () => [Math.max(20, W() / 2 - 300), 40], () => this.renderSkills());
    this.makeWin('quests', 'Questlog', 640, () => [Math.max(20, W() / 2 - 320), 90], () => this.renderQuests());
    this.makeWin('map', 'Weltkarte von Aethermoor', 680, () => [Math.max(10, W() / 2 - 340), 30], () => this.renderMap());
    this.makeWin('dialog', 'Gespräch', 410, () => [Math.max(20, W() / 2 - 460), 120], () => this.renderDialog());
    this.makeWin('vendor', 'Händler', 480, () => [Math.max(20, W() / 2 - 30), 110], () => this.renderVendor());
    this.makeWin('craft', 'Handwerk', 460, () => [Math.max(20, W() / 2 - 230), 110], () => this.renderCraft());
    this.makeWin('menu', 'Menü', 320, () => [W() / 2 - 160, 120], () => this.renderMenu());
    this.wins.dialog.el.querySelector('.wx').onclick = () => this.closeDialog();
    this.wins.vendor.el.querySelector('.wx').onclick = () => this.closeVendor();
  },
  open(id) {
    const w = this.wins[id]; if (!w) return;
    if (!w.placed) { const p = w.place(); w.el.style.left = p[0] + 'px'; w.el.style.top = p[1] + 'px'; w.placed = true; }
    w.el.classList.remove('hidden'); w.open = true; w.render(); w.stale = false;
    document.querySelectorAll('.win').forEach(x => (x.style.zIndex = 5)); w.el.style.zIndex = 9;
  },
  close(id) { const w = this.wins[id]; if (!w) return; w.el.classList.add('hidden'); w.open = false; this.hideTip(); if (id === 'dialog') this.dialogNpc = null; if (id === 'vendor') this.vendorNpc = null; },
  toggle(id) { const w = this.wins[id]; if (w.open) this.close(id); else this.open(id); },
  closeAll() { for (const id in this.wins) this.close(id); },
  refresh(id) { const w = this.wins[id]; if (w.open) w.render(); else w.stale = true; },

  // ---------- Tooltips ----------
  attachTip(el, fn) {
    el.addEventListener('mouseenter', e => { const html = fn(); if (!html) return; const t = $('tip'); t.innerHTML = html; t.style.display = 'block'; t.classList.add('tip'); this.moveTip(e); });
    el.addEventListener('mousemove', e => this.moveTip(e));
    el.addEventListener('mouseleave', () => this.hideTip());
  },
  moveTip(e) {
    const t = $('tip'); let x = e.clientX + 16, y = e.clientY + 16;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 6) x = e.clientX - r.width - 12;
    if (y + r.height > window.innerHeight - 6) y = window.innerHeight - r.height - 6;
    t.style.left = Math.max(4, x) + 'px'; t.style.top = Math.max(4, y) + 'px';
  },
  hideTip() { $('tip').style.display = 'none'; },
  score(it) { let s = 0; for (const k in it.stats) s += it.stats[k] * (k === 'crit' ? 3 : 1); s += (it.armor || 0) / 6; if (it.dmg) s += (it.dmg[0] + it.dmg[1]) / 6; return s; },
  itemTip(it) {
    if (!it) return '';
    const P = G.P;
    if (it.type === 'gear') {
      const R = RARITY[it.rar]; let s = `<div class="tn" style="color:${R.c}">${esc(it.name)}</div><div class="ts">${R.n} · ${SLOTS[it.slot]}${it.wt ? ' (' + it.wt + ')' : ''} · Gegenstandsstufe ${it.ilvl}</div>`;
      if (it.dmg) s += `<div>Schaden: <b>${it.dmg[0]} – ${it.dmg[1]}</b></div>`;
      if (it.armor) s += `<div>Rüstung: <b>${it.armor}</b></div>`;
      for (const k in it.stats) s += `<div class="g">+${it.stats[k]} ${STAT_NAMES[k]}${k === 'crit' ? ' %' : ''}</div>`;
      s += `<div class="${P.level >= it.req ? 'gr' : 'b'}">Benötigt Stufe ${it.req}</div><div class="y">Verkaufswert: ${sellValue(it)} Gold</div>`;
      let cur = P.eq[it.slot]; if (it.slot === 'ring' && cur && P.eq.ring2) cur = this.score(P.eq.ring2) < this.score(cur) ? P.eq.ring2 : cur;
      if (!Object.values(P.eq).includes(it)) { if (!cur) s += '<div class="g">▲ Verbessert deinen leeren Platz</div>'; else { const d = this.score(it) - this.score(cur); s += d > 0.5 ? '<div class="g">▲ Verbesserung gegenüber angelegt</div>' : d < -0.5 ? '<div class="b">▼ Schwächer als angelegt</div>' : '<div class="gr">≈ Gleichwertig</div>'; } }
      return s;
    }
    const b = BASEITEMS[it.id];
    let s = `<div class="tn" style="color:${b.c || '#ddd'}">${b.name}</div><div class="ts">${b.type === 'material' ? 'Handwerksmaterial' : 'Verbrauchsgegenstand'}</div>`;
    if (b.hp) s += `<div class="g">Stellt ${Math.round(b.hp * 100)}% deiner Lebenspunkte wieder her.</div>`;
    if (b.mp) s += `<div class="g">Stellt ${Math.round(b.mp * 100)}% deiner Ressource wieder her.</div>`;
    if (b.desc) s += `<div class="g">${b.desc}</div>`;
    if (b.lv > 1) s += `<div class="${P.level >= b.lv ? 'gr' : 'b'}">Benötigt Stufe ${b.lv}</div>`;
    if (b.hp || b.mp) s += '<div class="gr">Abklingzeit: 12 Sek.</div>';
    s += `<div class="y">Verkaufswert: ${Math.max(1, Math.floor(b.price * 0.4))} Gold</div>`;
    return s;
  },
  skillTip(sk, rank) {
    const P = G.P, C = CLASSES[P.cls];
    let s = `<div class="tn y">${sk.name}</div><div class="ts">${sk.type === 'passive' ? 'Passiv' : 'Aktiv'} · Rang ${rank}/${sk.max}</div>`;
    if (sk.type !== 'passive') s += `<div class="gr">${sk.cost ? sk.cost + ' ' + C.res + ' · ' : ''}${sk.cd ? 'Abklingzeit ' + sk.cd + ' Sek.' : 'Kein Cooldown'}</div>`;
    s += skillDesc(sk, rank || 1).map(l => `<div>${l}</div>`).join('');
    if (rank > 0 && rank < sk.max) s += `<div class="ts" style="margin-top:6px">Nächster Rang:</div>` + skillDesc(sk, rank + 1).map(l => `<div class="g">${l}</div>`).join('');
    if (rank === 0) { s += `<div class="${P.level >= sk.lv ? 'gr' : 'b'}" style="margin-top:6px">Benötigt Stufe ${sk.lv}</div>`; if (sk.parent) s += `<div class="${P.skills[sk.parent] ? 'gr' : 'b'}">Benötigt: ${SKILLS[sk.parent].name}</div>`; }
    if (sk.type !== 'passive' && rank > 0) s += `<div class="gr" style="margin-top:4px">Ziehe das Symbol auf die Aktionsleiste.</div>`;
    return s;
  },

  // ---------- Slots ----------
  slotEl(it) {
    const s = h('div', 'slot');
    if (it) {
      const i = itemInfo(it); s.textContent = i.ic;
      s.style.borderColor = it.type === 'gear' ? RARITY[it.rar].c : '#4a3718';
      if (it.type === 'gear') s.style.boxShadow = it.rar >= 3 ? `inset 0 0 8px ${RARITY[it.rar].c}` : 'none';
      if (it.qty > 1) s.appendChild(h('span', 'cnt', it.qty));
      if (it.type === 'gear' && G.P.level < it.req) s.style.filter = 'brightness(.6) sepia(.6) hue-rotate(-30deg)';
    }
    return s;
  },
  renderInv() {
    const P = G.P, body = this.wins.inv.body; body.innerHTML = '';
    const grid = h('div', 'grid'); grid.style.gridTemplateColumns = 'repeat(6, 46px)';
    P.inv.forEach((it, i) => {
      const s = this.slotEl(it);
      if (it) {
        s.onclick = () => { this.hideTip(); useInv(i); };
        s.oncontextmenu = e => { e.preventDefault(); this.hideTip(); if (this.vendorNpc) sellItem(i); else useInv(i); };
        this.attachTip(s, () => this.itemTip(it));
        if (it.type === 'consumable') { s.draggable = true; s.ondragstart = e => e.dataTransfer.setData('text/plain', 'item:' + it.id); }
      }
      grid.appendChild(s);
    });
    body.appendChild(grid);
    body.appendChild(h('div', 'goldline', `💰 ${fmt(P.gold)} Gold &nbsp; <span style="font-size:11px;color:#a89c78">(${INV_SIZE - invFree()}/${INV_SIZE} Plätze)</span>`));
    body.appendChild(h('div', 'hint', this.vendorNpc ? 'Rechtsklick auf einen Gegenstand verkauft ihn.' : 'Klick: Benutzen/Anlegen · Tränke auf die Aktionsleiste ziehen'));
  },
  renderChar() {
    const P = G.P, C = CLASSES[P.cls], st = P.st, body = this.wins.char.body; body.innerHTML = '';
    const wrap = h('div'); wrap.id = 'charWrap';
    const paper = h('div', 'paper');
    const layout = ['neck', 'head', 'ring', 'weapon', 'chest', 'ring2', '', 'legs', '', '', 'feet', ''];
    for (const sl of layout) {
      if (!sl) { paper.appendChild(h('div')); continue; }
      const it = P.eq[sl], s = this.slotEl(it), wrapS = h('div');
      if (!it) { s.style.opacity = .5; s.textContent = { weapon: '⚔️', head: '🪖', chest: '🦺', legs: '👖', feet: '🥾', ring: '💍', ring2: '💍', neck: '📿' }[sl]; s.style.filter = 'grayscale(1)'; }
      else { s.onclick = () => { this.hideTip(); unequip(sl); }; this.attachTip(s, () => this.itemTip(it)); }
      wrapS.appendChild(s); wrapS.appendChild(h('div', 'lbl2', SLOTS[sl.replace('2', '')])); paper.appendChild(wrapS);
    }
    const stats = h('div', 'stats');
    const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
    stats.innerHTML = `<div style="font-family:var(--font);font-size:16px;color:var(--gold2)">${esc(P.name)}</div>
      <div>Stufe ${P.level} ${C.name} ${C.ic}</div>
      <div style="margin:4px 0 8px;font-size:11px;color:#a89c78">Erfahrung: ${fmt(P.xp)} / ${P.level >= MAX_LEVEL ? '—' : fmt(xpNeed(P.level))}</div>
      ${row('Stärke', Math.round(st.s.str))}${row('Geschick', Math.round(st.s.dex))}${row('Intellekt', Math.round(st.s.int))}${row('Ausdauer', Math.round(st.s.vit))}
      <div style="height:6px"></div>
      ${row('Lebenspunkte', fmt(st.maxHp))}${row(C.res, fmt(st.maxRes))}${row('Angriffskraft', fmt(st.ap))}${row('Rüstung', fmt(st.armor) + ' (' + Math.round(st.armor / (st.armor + 40 + P.level * 18) * 100) + '%)')}
      ${row('Kritische Treffer', st.crit.toFixed(1) + '%')}${row('Tempo', Math.round(st.speed / 1.78) + '%')}${row('Erlittener Schaden', '-' + st.mod.dmgRed + '%')}
      <div style="height:6px"></div>
      ${row('Gespielte Zeit', Math.floor(P.playtime / 3600) + 'h ' + (Math.floor(P.playtime / 60) % 60) + 'm')}${row('Besiegte Gegner', Object.values(P.kills).reduce((a, b) => a + b, 0))}${row('Tode', P.deaths)}
      ${row('Abgeschlossene Quests', Object.keys(P.done).length + ' / ' + QUESTS.length)}${row('Bosse besiegt', BOSS_LIST.filter(b => P.kills[b]).length + ' / ' + BOSS_LIST.length)}`;
    wrap.appendChild(paper); wrap.appendChild(stats); body.appendChild(wrap);
  },
  renderSkills() {
    const P = G.P, body = this.wins.skills.body; body.innerHTML = '';
    const free = skillPointsFree(P);
    const top = h('div', '', `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-family:var(--font)">${CLASSES[P.cls].ic} ${CLASSES[P.cls].name} · Freie Punkte: <b class="${free ? 'g' : ''}" style="color:${free ? '#7aff7a' : '#fff'}">${free}</b></div></div>`);
    const rb = h('button', 'btn sm red', `Neu verteilen (${20 * P.level} Gold)`); rb.onclick = () => { if (confirm('Alle Fertigkeitspunkte zurücksetzen?')) resetSkills(); };
    top.firstChild.appendChild(rb); body.appendChild(top);
    const wrap = h('div'); wrap.id = 'treeWrap';
    TREES[P.cls].forEach((col, bi) => {
      const b = h('div', 'branch', `<h4>${BRANCH_NAMES[P.cls][bi]}</h4>`);
      col.forEach(sk => {
        const rank = P.skills[sk.id] || 0, can = canLearn(sk.id), locked = rank === 0 && !can;
        const n = h('div', 'node' + (rank >= sk.max ? ' max' : '') + (can ? ' can' : '') + (locked ? ' lock' : '') + (sk.type === 'passive' ? ' passive' : '') + (sk.parent && P.skills[sk.parent] ? ' link' : ''));
        const s = h('div', 'slot', sk.ic); n.appendChild(s);
        n.appendChild(h('div', 'rank', `${rank}/${sk.max}`));
        if (rank === 0 && P.level < sk.lv) n.appendChild(h('div', 'lv', 'Lv ' + sk.lv));
        s.onclick = () => { learnSkill(sk.id); };
        s.oncontextmenu = e => { e.preventDefault(); };
        this.attachTip(s, () => this.skillTip(sk, rank));
        if (rank > 0 && sk.type !== 'passive') { s.draggable = true; s.ondragstart = e => e.dataTransfer.setData('text/plain', 'skill:' + sk.id); }
        b.appendChild(n);
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    body.appendChild(h('div', 'hint', `Pro Stufe erhältst du einen Fertigkeitspunkt. Aktive Fertigkeiten ziehst du per Maus auf die Aktionsleiste (Tasten 1–0).`));
  },
  renderQuests() {
    const P = G.P, body = this.wins.quests.body; body.innerHTML = '';
    const active = QUESTS.filter(q => P.quests[q.id]);
    if (!active.find(q => q.id === this.qSel)) this.qSel = active.length ? active[0].id : null;
    const wrap = h('div'); wrap.id = 'qWrap';
    const list = h('div', 'scroll'); list.id = 'qList';
    if (!active.length) list.appendChild(h('div', 'hint', 'Keine aktiven Quests. Sprich mit Personen mit einem goldenen ! über dem Kopf.'));
    active.forEach(q => {
      const it = h('div', 'qi' + (q.id === this.qSel ? ' sel' : '') + (P.quests[q.id].ready ? ' ready' : ''), `${esc(q.name)}<small>Stufe ${q.lv}${P.quests[q.id].ready ? ' · abgeschlossen' : ''}</small>`);
      it.onclick = () => { this.qSel = q.id; this.renderQuests(); }; list.appendChild(it);
    });
    list.appendChild(h('div', 'hint', `Abgeschlossen: ${Object.keys(P.done).length} / ${QUESTS.length}`));
    const det = h('div', 'scroll'); det.id = 'qDetail';
    if (this.qSel) {
      const q = QMAP[this.qSel], st = P.quests[q.id], tn = NPCS.find(n => n.id === q.turn);
      det.innerHTML = this.questHtml(q, st);
      const ab = h('button', 'btn sm red', 'Quest aufgeben'); ab.style.marginTop = '10px'; ab.onclick = () => { if (confirm('Quest wirklich aufgeben?')) abandonQuest(q.id); };
      det.appendChild(ab);
    }
    wrap.appendChild(list); wrap.appendChild(det); body.appendChild(wrap);
  },
  questHtml(q, st) {
    const tn = NPCS.find(n => n.id === q.turn), hub = HUBS.find(x => x.id === tn.hub);
    let s = `<h3>${esc(q.name)}</h3><div class="story">${esc(q.text)}</div><b>Ziele:</b>`;
    q.obj.forEach((o, i) => { const pr = st ? st.prog[i] : 0, t = objTarget(o), d = pr >= t; s += `<div class="obj ${d ? 'done' : ''}">${objText(o)}${t > 1 ? ` (${pr}/${t})` : ''}</div>`; });
    s += `<div class="hint">Abgabe bei: <b style="color:#7aff7a">${esc(tn.name)}</b> in ${hub.name}</div>`;
    s += this.rewardHtml(q);
    return s;
  },
  rewardHtml(q) {
    const xp = Math.max(30, Math.round(xpNeed(q.lv) * 0.22 * q.xp)), gold = Math.round((q.lv * 8 + 10) * q.gold);
    return `<div class="rew"><b>Belohnung:</b> <span style="color:#c8a0ff">${fmt(xp)} Erfahrung</span> · <span style="color:var(--gold2)">${gold} Gold</span>${q.rar >= 0 ? ` · <span style="color:${RARITY[q.rar].c}">Ausrüstungsgegenstand (${RARITY[q.rar].n}+)</span>` : ''}</div>`;
  },
  renderMap() {
    const body = this.wins.map.body; body.innerHTML = '';
    const cv = h('canvas'); cv.width = 640; cv.height = 560; cv.style.cssText = 'width:640px;height:560px;border:2px solid var(--gold);display:block;image-rendering:pixelated;';
    body.appendChild(cv); this.mapCv = cv; this.drawMap();
    body.appendChild(h('div', 'hint', '💀 Boss-Lager · ◆ Erkundungsziel · Siedlungen sind sichere Zonen · Gelbes ! = Quest verfügbar'));
  },
  drawMap() {
    const cv = this.mapCv; if (!cv || !this.wins.map.open) return;
    const c = cv.getContext('2d'), S = 4, P = G.P;
    c.imageSmoothingEnabled = false; c.drawImage(World.mm, 0, 0, MW * S, MH * S);
    c.textAlign = 'center'; c.lineWidth = 3;
    const label = (txt, x, y, col, size) => { c.font = `bold ${size}px Georgia`; c.strokeStyle = '#000'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); };
    const zc = [[80, 131, 0], [80, 80, 1], [35, 70, 2], [122, 70, 3], [30, 38, 4], [132, 36, 5], [80, 12, 6]];
    for (const z of zc) label(ZONES[z[2]].name.toUpperCase(), z[0] * S, z[1] * S, 'rgba(255,255,255,.55)', 13);
    for (const hb of HUBS) { c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(hb.x * S, hb.y * S, 6, 0, TAU); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke(); label(hb.name, hb.x * S, hb.y * S - 10, '#fff', 12); }
    for (const l of World.lairs) { const d = P.kills[l.id]; c.font = '15px serif'; c.globalAlpha = d ? 0.45 : 1; c.fillText('💀', l.x * S, l.y * S + 5); c.globalAlpha = 1; }
    for (const k in POIS) { const p = POIS[k]; c.fillStyle = '#7ad0ff'; c.fillRect(p.x * S - 4, p.y * S - 4, 8, 8); label(p.name, p.x * S, p.y * S - 8, '#bfe8ff', 10); }
    for (const n of G.npcs) { const mk = npcMarker(n); if (mk === 'avail' || mk === 'ready') label(mk === 'avail' ? '!' : '?', n.x / TILE * S, n.y / TILE * S - 8, '#ffd23f', 16); }
    c.save(); c.translate(P.x / TILE * S, P.y / TILE * S); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#e03030'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill(); c.restore();
    label('Du', P.x / TILE * S, P.y / TILE * S - 10, '#fff', 12);
  },

  // ---------- NPC-Dialog ----------
  openDialog(npc) {
    this.dialogNpc = npc; this.dlgQuest = null;
    // eventuell sofort fertige Quests anzeigen
    this.wins.dialog.el.querySelector('.wh').textContent = npc.name;
    this.open('dialog');
  },
  closeDialog() { this.close('dialog'); this.dlgQuest = null; },
  renderDialog() {
    const npc = this.dialogNpc, P = G.P, body = this.wins.dialog.body; if (!npc) return;
    body.innerHTML = '';
    const d = h('div', 'qd');
    if (this.dlgQuest) {
      const q = QMAP[this.dlgQuest], st = P.quests[q.id], ready = st && st.ready;
      d.innerHTML = `<h3>${esc(q.name)}</h3><div class="story">${esc(ready ? q.done : q.text)}</div>`;
      if (!ready) { d.innerHTML += '<b>Ziele:</b>'; q.obj.forEach((o, i) => { const t = objTarget(o), pr = st ? st.prog[i] : 0; d.innerHTML += `<div class="obj ${pr >= t ? 'done' : ''}">${objText(o)}${t > 1 ? ` (${pr}/${t})` : ''}</div>`; }); }
      d.innerHTML += this.rewardHtml(q);
      const bt = h('div'); bt.style.marginTop = '12px';
      if (!st) { const b = h('button', 'btn', 'Quest annehmen'); b.onclick = () => { acceptQuest(q.id); this.dlgQuest = null; this.renderDialog(); }; bt.appendChild(b); }
      else if (ready) { const b = h('button', 'btn', 'Quest abschließen'); b.onclick = () => { completeQuest(q.id); this.dlgQuest = null; this.renderDialog(); }; bt.appendChild(b); }
      else bt.appendChild(h('div', 'hint', 'Du bist noch nicht fertig. Komm zurück, wenn du alles erledigt hast.'));
      const back = h('button', 'btn sm', 'Zurück'); back.style.marginLeft = '8px'; back.onclick = () => { this.dlgQuest = null; this.renderDialog(); }; bt.appendChild(back);
      d.appendChild(bt); body.appendChild(d); return;
    }
    d.innerHTML = `<div class="dlgnpc"><b>${esc(npc.name)}</b> <small style="color:#a89c78">&lt;${esc(npc.title)}&gt;</small></div><p>„${esc(npc.greet)}“</p>`;
    const add = (mk, cls, text, fn) => { const r = h('div', 'dlgq', `<span class="mk ${cls}">${mk}</span> ${text}`); r.onclick = fn; d.appendChild(r); };
    for (const q of QUESTS) if (q.turn === npc.id && P.quests[q.id] && P.quests[q.id].ready) add('?', 'r', esc(q.name), () => { this.dlgQuest = q.id; this.renderDialog(); });
    for (const q of QUESTS) if (q.giver === npc.id && questAvailable(q)) add('!', 'a', `${esc(q.name)} <small style="color:#a89c78">(Stufe ${q.lv})</small>`, () => { this.dlgQuest = q.id; this.renderDialog(); });
    for (const q of QUESTS) if (q.turn === npc.id && P.quests[q.id] && !P.quests[q.id].ready) add('?', 'p', `${esc(q.name)} <small style="color:#a89c78">(in Arbeit)</small>`, () => { this.dlgQuest = q.id; this.renderDialog(); });
    if (npc.vendor !== undefined) add('🛒', '', 'Ich möchte etwas kaufen oder verkaufen.', () => this.openVendor(npc));
    if (npc.craft) add(npc.craft === 'smith' ? '🔨' : '⚗️', '', npc.craft === 'smith' ? 'Schmiedekunst' : 'Alchemie', () => this.openCraft(npc));
    if (npc.mount) add('🐴', '', P.hasMount ? 'Du besitzt bereits ein Reittier.' : 'Reittier kaufen (150 Gold, ab Stufe 8)', () => { buyMount(); this.renderDialog(); });
    body.appendChild(d);
  },
  openVendor(npc) {
    this.vendorNpc = npc; this.wins.vendor.el.querySelector('.wh').textContent = 'Händler – ' + npc.name;
    this.open('vendor'); this.open('inv');
  },
  closeVendor() { this.close('vendor'); this.refresh('inv'); },
  renderVendor() {
    const npc = this.vendorNpc, body = this.wins.vendor.body, P = G.P; if (!npc) return;
    body.innerHTML = '';
    if (!this.stockCache[npc.id]) this.stockCache[npc.id] = vendorStock(npc.hubIdx);
    const grid = h('div', 'grid stock');
    for (const it of this.stockCache[npc.id]) {
      const info = itemInfo(it), price = it.type === 'gear' ? (it.price * 1.6) | 0 : BASEITEMS[it.id].price;
      const el = h('div', 'si', `<div class="ic">${info.ic}</div><div class="pr" style="color:${P.gold >= price ? '#f0d27a' : '#ff6a6a'}">${price} 💰</div>`);
      if (it.type === 'gear') el.style.borderColor = RARITY[it.rar].c;
      el.onclick = () => { buyItem(it); this.refresh('vendor'); }; this.attachTip(el, () => this.itemTip(it));
      grid.appendChild(el);
    }
    body.appendChild(grid);
    body.appendChild(h('div', 'goldline', `💰 ${fmt(P.gold)} Gold`));
    body.appendChild(h('div', 'hint', 'Klicke auf einen Gegenstand, um ihn zu kaufen. Zum Verkaufen: Rechtsklick im Inventar.'));
  },
  openCraft(npc) { this.craftNpc = npc; this.wins.craft.el.querySelector('.wh').textContent = npc.craft === 'smith' ? 'Schmiedekunst' : 'Alchemie'; this.open('craft'); },
  renderCraft() {
    const npc = this.craftNpc, body = this.wins.craft.body; if (!npc) return;
    body.innerHTML = '';
    for (const r of RECIPES.filter(x => x.craft === npc.craft)) {
      const ok = canCraft(r);
      const mats = Object.keys(r.in).map(k => `<span class="mat ${invCount(k) >= r.in[k] ? 'ok' : ''}">${BASEITEMS[k].ic} ${BASEITEMS[k].name} ${invCount(k)}/${r.in[k]}</span>`).join(' · ') + (r.gold ? ` · <span class="mat ${G.P.gold >= r.gold ? 'ok' : ''}">💰 ${r.gold}</span>` : '');
      const out = r.gen ? `${RARITY[r.gen.rar].n}er ${SLOTS[r.gen.slot]}-Gegenstand (Stufe ${G.P.level + 1})` : `${r.n}× ${BASEITEMS[r.out].name}`;
      const row = h('div', 'recipe', `<div class="rn"><b>${r.name}</b><div style="font-size:11px;color:#a89c78">${out}</div><div>${mats}</div></div>`);
      const b = h('button', 'btn sm', 'Herstellen'); b.disabled = !ok; b.onclick = () => { craft(r); this.refresh('craft'); };
      row.appendChild(b); body.appendChild(row);
    }
    body.appendChild(h('div', 'hint', 'Materialien sammelst du an den leuchtenden Pflanzen und Erzadern in der Welt.'));
  },
  renderMenu() {
    const body = this.wins.menu.body; body.innerHTML = ''; const m = h('div', 'menu');
    const mk = (t, fn, cls = '') => { const b = h('button', 'btn ' + cls, t); b.onclick = fn; m.appendChild(b); };
    mk('Weiterspielen', () => this.close('menu'));
    mk('Spiel speichern', () => { saveGame(); this.toast('Gespeichert'); });
    mk(Audio2.on ? '🔊 Ton: an' : '🔇 Ton: aus', () => { Audio2.toggle(); this.renderMenu(); });
    mk('Zum nächsten Ort teleportieren (/stuck)', () => { clientCommand('/stuck'); this.close('menu'); });
    mk('Neuer Charakter (löscht Speicherstand)', () => { if (confirm('Wirklich neu beginnen? Dein Fortschritt geht verloren.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } window.onbeforeunload = null; location.reload(); } }, 'red');
    body.appendChild(m);
    body.appendChild(h('div', 'hint', 'Steuerung: WASD / Klick = Bewegen · Rechtsklick Gegner = Angriff · 1–0 Fertigkeiten · Tab Ziel · R Reittier · Q/E Tränke · Enter Chat · Leertaste Auto-Angriff'));
  },

  // ---------- Aktionsleiste ----------
  buildHotbar() {
    const hb = $('hotbar'); hb.innerHTML = ''; this.hbEls = [];
    for (let i = 0; i < 10; i++) {
      const s = h('div', 'slot empty'); s.innerHTML = `<span class="key">${(i + 1) % 10}</span><span class="ic"></span><span class="cnt"></span><div class="cd" style="height:0"></div><div class="cdt"></div>`;
      s.onclick = () => activateHotbar(i);
      s.oncontextmenu = e => { e.preventDefault(); G.P.hotbar[i] = null; this.updateHotbar(true); };
      s.draggable = true; s.ondragstart = e => { if (!G.P.hotbar[i]) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', 'hb:' + i); };
      s.ondragover = e => { e.preventDefault(); s.classList.add('drop'); }; s.ondragleave = () => s.classList.remove('drop');
      s.ondrop = e => { e.preventDefault(); s.classList.remove('drop'); this.dropHotbar(i, e.dataTransfer.getData('text/plain')); };
      this.attachTip(s, () => { const e = G.P.hotbar[i]; if (!e) return ''; if (e.t === 'skill') return this.skillTip(SKILLS[e.id], G.P.skills[e.id] || 0); return this.itemTip({ type: 'consumable', id: e.id, qty: 1 }); });
      hb.appendChild(s); this.hbEls.push(s);
    }
  },
  dropHotbar(i, data) {
    const P = G.P; const [k, v] = data.split(':');
    if (k === 'hb') { const a = +v; const t = P.hotbar[i]; P.hotbar[i] = P.hotbar[a]; P.hotbar[a] = t; }
    else if (k === 'skill' || k === 'item') { P.hotbar = P.hotbar.map(e => (e && e.t === k && e.id === v ? null : e)); P.hotbar[i] = { t: k, id: v }; }
    this.updateHotbar(true);
  },
  updateHotbar() {
    const P = G.P;
    this.hbEls.forEach((s, i) => {
      const e = P.hotbar[i], ic = s.children[1], cnt = s.children[2], cd = s.children[3], cdt = s.children[4];
      if (!e) { ic.textContent = ''; cnt.textContent = ''; cd.style.height = 0; cdt.textContent = ''; s.className = 'slot empty'; return; }
      let rem = 0, max = 1, nores = false, c = '';
      if (e.t === 'skill') {
        const sk = SKILLS[e.id]; ic.textContent = sk.ic; rem = Math.max(0, (P.cd[e.id] || 0) - G.now); max = (P.cdMax && P.cdMax[e.id]) || sk.cd || 1;
        if (rem <= 0 && G.now < (P.gcd || 0)) { rem = P.gcd - G.now; max = 0.75; }
        nores = P.res < sk.cost;
      } else {
        const b = BASEITEMS[e.id]; ic.textContent = b.ic; const n = invCount(e.id); c = n; nores = n < 1;
        rem = Math.max(0, (P.potCd || 0) - G.now); max = 12; if (!(b.hp || b.mp)) rem = 0;
      }
      cnt.textContent = c; cd.style.height = rem > 0 ? Math.min(100, rem / max * 100) + '%' : '0'; cdt.textContent = rem > 1.05 ? Math.ceil(rem) : '';
      s.className = 'slot' + (nores ? ' nores' : '');
    });
  },

  // ---------- Chat ----------
  buildChat() {
    document.querySelectorAll('#chatTabs button').forEach(b => (b.onclick = () => {
      this.chatTab = b.dataset.ch; document.querySelectorAll('#chatTabs button').forEach(x => x.classList.toggle('on', x === b)); this.renderChat();
    }));
    const inp = $('chatIn');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const t = inp.value.trim(); inp.value = ''; inp.blur(); if (t) { if (t[0] === '/') clientCommand(t); else playerSay(t); } e.stopPropagation(); }
      else if (e.key === 'Escape') { inp.blur(); e.stopPropagation(); }
      else e.stopPropagation();
    });
  },
  renderChat() {
    const box = $('chatLog'), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const msgs = G.chat.filter(m => this.chatTab === 'all' || m.ch === this.chatTab || (this.chatTab === 'chat' && m.ch === 'world') || (this.chatTab === 'combat' && m.ch === 'loot')).slice(-90);
    box.innerHTML = msgs.map(m => `<div class="ch-${m.ch}" ${m.color ? `style="color:${m.color}"` : ''}>${m.text}</div>`).join('');
    if (stick) box.scrollTop = box.scrollHeight;
  },

  // ---------- Allgemein ----------
  toast(msg) {
    const d = h('div', '', esc(msg)); $('toast').appendChild(d); setTimeout(() => d.remove(), 3300);
  },
  banner(title, sub) {
    const b = $('zoneBanner'); b.innerHTML = `${esc(title)}<small>${esc(sub)}</small>`; b.classList.add('show');
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => b.classList.remove('show'), 3200);
  },
  updateFrames() {
    const P = G.P, C = CLASSES[P.cls], st = P.st;
    $('pfIcon').textContent = C.ic; $('pfName').textContent = P.name; $('pfLvl').textContent = P.level;
    $('pfHp').style.width = clamp(P.hp / st.maxHp * 100, 0, 100) + '%'; $('pfHpT').textContent = `${Math.ceil(P.hp)} / ${st.maxHp}`;
    $('pfRes').style.width = clamp(P.res / st.maxRes * 100, 0, 100) + '%'; $('pfRes').style.background = `linear-gradient(${C.resCol}, ${C.resCol}99)`; $('pfResT').textContent = `${Math.floor(P.res)} / ${st.maxRes}`;
    const xpk = P.level >= MAX_LEVEL ? 1 : P.xp / xpNeed(P.level);
    $('xp').firstElementChild.style.width = xpk * 100 + '%'; $('xp').lastElementChild.textContent = P.level >= MAX_LEVEL ? 'Höchststufe erreicht' : `${fmt(P.xp)} / ${fmt(xpNeed(P.level))} EP`;
    // Ziel
    const t = G.target, tf = $('tf');
    if (t && t.dead) { G.target = null; }
    if (G.target) {
      const e = G.target; tf.classList.remove('hidden');
      if (e.def) {
        $('tfIcon').textContent = e.boss ? '💀' : e.elite ? '⭐' : { beast: '🐺', human: '🧟', blob: '🟢', spider: '🕷️', flyer: '🦅', bulky: '👹', ghost: '👻', worm: '🪱' }[e.def.kind] || '👾';
        $('tfName').textContent = e.name; $('tfLvl').textContent = e.lvl; $('tfLvl').style.color = Render.diffColor(e.lvl); $('tfName').style.color = e.boss ? '#ff9a5a' : e.elite ? '#ffd23f' : '#fff';
        $('tfHpBar').style.display = ''; $('tfHp').style.width = clamp(e.hp / e.maxhp * 100, 0, 100) + '%'; $('tfHpT').textContent = `${Math.ceil(e.hp)} / ${e.maxhp}`;
        $('tfSub').textContent = e.boss ? (e.def.title || 'Boss') : e.elite ? 'Elite' : e.def.passive ? 'Friedlich' : e.def.ranged ? 'Fernkämpfer' : '';
      } else {
        $('tfIcon').textContent = '🧑'; $('tfName').textContent = e.name; $('tfName').style.color = '#7aff7a'; $('tfLvl').textContent = ''; $('tfHpBar').style.display = 'none'; $('tfSub').textContent = e.title;
      }
    } else tf.classList.add('hidden');
    // Buffs
    const bf = $('buffs'); let html = '';
    for (const f of P.fx) { if (f.until <= G.now) continue; const bad = f.type === 'dot' || f.type === 'stun' || f.type === 'slow'; const ic = f.ic || (f.type === 'stun' ? '💫' : f.type === 'slow' ? '🐌' : f.type === 'dot' ? '☠️' : '✨'); html += `<div class="buff ${bad ? 'bad' : ''}" title="${esc(f.name || f.type)}">${ic}<small>${Math.ceil(f.until - G.now)}</small></div>`; }
    if (P.mounted) html += '<div class="buff" title="Reittier">🐴</div>';
    if (bf.innerHTML !== html) bf.innerHTML = html;
    // Cast/Gather
    const cb = $('castbar');
    if (P.gather) { cb.classList.remove('hidden'); cb.firstChild.style.width = clamp((G.now - P.gather.start) / (P.gather.until - P.gather.start) * 100, 0, 100) + '%'; cb.lastChild.textContent = 'Sammeln: ' + NODE_TYPES[P.gather.node.type].name; }
    else cb.classList.add('hidden');
    // Orts-Anzeige
    const hub = P.hub, key = hub ? 'h' + hub.id : 'z' + P.zone;
    if (key !== this.lastPlace) {
      const first = this.lastPlace === null; this.lastPlace = key;
      if (hub) { $('zoneLabel').textContent = hub.name + ' (sicher)'; if (!first) this.banner(hub.name, 'Sichere Siedlung'); }
      else { const Z = ZONES[P.zone]; $('zoneLabel').textContent = `${Z.name} (${Z.lv[0]}–${Z.lv[1]})`; this.banner(Z.name, `Empfohlene Stufen ${Z.lv[0]}–${Z.lv[1]}`); }
    }
    $('coord').textContent = `${Math.round(P.x / TILE)}, ${Math.round(P.y / TILE)}`;
  },
  drawMinimap() {
    const cv = $('mm'), c = cv.getContext('2d'), P = G.P, V = 52, S = cv.width / V;
    c.save(); c.clearRect(0, 0, cv.width, cv.height);
    c.beginPath(); c.arc(cv.width / 2, cv.height / 2, cv.width / 2, 0, TAU); c.clip();
    c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    c.imageSmoothingEnabled = false;
    const px = P.x / TILE, py = P.y / TILE;
    c.drawImage(World.mm, px - V / 2, py - V / 2, V, V, 0, 0, cv.width, cv.height);
    const mx = x => (x / TILE - px + V / 2) * S, my = y => (y / TILE - py + V / 2) * S;
    for (const n of G.npcs) { const mk = npcMarker(n); c.fillStyle = mk === 'avail' || mk === 'ready' ? '#ffd23f' : '#7aff7a'; c.beginPath(); c.arc(mx(n.x), my(n.y), mk === 'avail' || mk === 'ready' ? 4 : 2.5, 0, TAU); c.fill(); if (mk === 'avail' || mk === 'ready') { c.fillStyle = '#000'; c.font = 'bold 8px Georgia'; c.textAlign = 'center'; c.fillText(mk === 'avail' ? '!' : '?', mx(n.x), my(n.y) + 3); } }
    for (const m of G.mobs) if (!m.dead && (m.boss || m.state === 'chase')) { const x = mx(m.x), y = my(m.y); if (x < 0 || y < 0 || x > cv.width || y > cv.height) continue; c.fillStyle = m.boss ? '#ff2a2a' : '#e03030'; c.beginPath(); c.arc(x, y, m.boss ? 4 : 2.5, 0, TAU); c.fill(); }
    for (const b of G.bots) { c.fillStyle = '#6fb0ff'; c.fillRect(mx(b.x) - 1.5, my(b.y) - 1.5, 3, 3); }
    for (const nd of G.nodes) if (nd.avail) { const x = mx(nd.x), y = my(nd.y); if (x > 0 && y > 0 && x < cv.width && y < cv.height) { c.fillStyle = NODE_TYPES[nd.type].col; c.fillRect(x - 1.5, y - 1.5, 3, 3); } }
    c.translate(cv.width / 2, cv.height / 2); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill(); c.stroke();
    c.restore();
  },
  renderTracker() {
    const P = G.P, t = $('tracker'); let html = '<h4>Aktive Quests</h4>', n = 0;
    for (const q of QUESTS) {
      const st = P.quests[q.id]; if (!st) continue; n++; if (n > 6) break;
      html += `<div class="q"><div class="qn">${esc(q.name)}</div>`;
      if (st.ready) html += `<div class="rdy">✔ Bereit zur Abgabe: ${esc(NPCS.find(x => x.id === q.turn).name)}</div>`;
      else q.obj.forEach((o, i) => { const tg = objTarget(o), d = st.prog[i] >= tg; html += `<div class="o ${d ? 'done' : ''}">${objText(o)}${tg > 1 ? ` ${st.prog[i]}/${tg}` : ''}</div>`; });
      html += '</div>';
    }
    t.innerHTML = n ? html : '<h4>Aktive Quests</h4><div class="o">Sprich mit NPCs mit einem goldenen „!“ über dem Kopf.</div>';
  },

  update(dt) {
    const P = G.P, d = G.dirty;
    this.drawMinimap(); this.updateHotbar();
    this.acc += dt;
    if (d.dialog) { const n = d.dialog; d.dialog = null; this.openDialog(n); }
    if (d.chat) { d.chat = false; this.renderChat(); }
    if (d.quests) { d.quests = false; this.renderTracker(); this.refresh('quests'); this.refresh('dialog'); this.refresh('skills'); }
    if (d.inv) { d.inv = false; this.refresh('inv'); this.refresh('vendor'); this.refresh('craft'); this.refresh('char'); }
    if (d.char) { d.char = false; this.refresh('char'); }
    if (d.skills) { d.skills = false; this.refresh('skills'); }
    if (d.death !== undefined && d.death !== null) { d.death = null; }
    $('death').classList.toggle('hidden', !P.dead);
    if (this.acc > 0.1) {
      this.acc = 0; this.updateFrames();
      if (this.wins.map.open) this.drawMap();
      if (this.dialogNpc && Math.hypot(this.dialogNpc.x - P.x, this.dialogNpc.y - P.y) > 190) this.closeDialog();
      if (this.vendorNpc && Math.hypot(this.vendorNpc.x - P.x, this.vendorNpc.y - P.y) > 190) this.closeVendor();
      if (this.craftNpc && this.wins.craft.open && Math.hypot(this.craftNpc.x - P.x, this.craftNpc.y - P.y) > 190) this.close('craft');
      if (this.wins.char.open) this.renderChar();
    }
  },
  resetState() {
    this.closeAll(); this.lastPlace = null; this.stockCache = {}; this.qSel = null;
    for (const id in this.wins) { this.wins[id].placed = false; }
  },
};

function activateHotbar(i) {
  const P = G.P, e = P.hotbar[i]; if (!e) return;
  if (e.t === 'skill') castSkill(e.id); else useConsumable(e.id);
}
