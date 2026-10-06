'use strict';
// =====================================================================
//  Start, Eingabe, Hauptschleife
// =====================================================================
(function () {
  const cv = $('cv');
  Render.init(cv);
  Audio2.init();
  World.build();
  UI.init();

  // ---------- Startbildschirm ----------
  const NAMES = ['Aldwin', 'Brynhild', 'Cedric', 'Dara', 'Eldor', 'Fiora', 'Galen', 'Helka', 'Ivar', 'Jorun', 'Kaela', 'Lorin', 'Mira', 'Norwin', 'Orla', 'Perrin', 'Runa', 'Soren', 'Talia', 'Ulric', 'Vesna', 'Wulf'];
  let selCls = 'krieger';
  $('nameIn').value = NAMES[Math.floor(Math.random() * NAMES.length)];
  const pick = $('classPick');
  for (const k in CLASSES) {
    const C = CLASSES[k], el = h('div', 'cc' + (k === selCls ? ' sel' : ''), `<span class="ci">${C.ic}</span>${C.name}`);
    el.onclick = () => { selCls = k; pick.querySelectorAll('.cc').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); showDesc(); };
    pick.appendChild(el);
  }
  function showDesc() { const C = CLASSES[selCls]; $('classDesc').innerHTML = `<b style="color:${C.col}">${C.name}</b> – ${C.desc}<br><span style="font-size:12px;color:#a89c78">Ressource: ${C.res} · ${C.ranged ? 'Fernkampf' : 'Nahkampf'}</span>`; }
  showDesc();
  const save = readSave();
  if (save) {
    $('saveInfo').classList.remove('hidden');
    $('saveText').textContent = `${save.name} – ${CLASSES[save.cls].name}, Stufe ${save.level}`;
    $('continueBtn').onclick = () => begin(loadPlayer(save), false);
  }
  $('startBtn').onclick = () => {
    const name = $('nameIn').value.trim();
    if (name.length < 2) { $('nameIn').focus(); $('nameIn').style.borderColor = '#ff4a4a'; return; }
    begin(newPlayer(name, selCls), true);
  };

  function begin(P, fresh) {
    Audio2.resume();
    G.P = P; initWorldEntities(); UI.resetState();
    G.now = 0; G.clock = 100; G.target = null; G.chat = []; G.texts = []; G.parts = []; G.lastSave = 0; G.running = true;
    P.cd = {}; P.fx = []; P.dead = false;
    if (fresh) {
      const first = TREES[P.cls][0][0]; P.skills[first.id] = 1; P.hotbar[0] = { t: 'skill', id: first.id };
    }
    recalc(); if (fresh) { P.hp = P.st.maxHp; P.res = P.st.maxRes; }
    $('start').classList.add('hidden'); $('ui').classList.remove('hidden');
    Render.first = false;
    log(`Willkommen in Aethermoor, ${esc(P.name)}!`, 'system', '#ffe070');
    log('Sprich mit Aldric (goldenes „!“) im Dorf. Drücke K für Fertigkeiten, B für das Inventar.', 'system');
    log('Mit Rechtsklick greifst du Gegner an, Tab wählt das nächste Ziel. /hilfe zeigt Befehle.', 'system');
    G.dirty = { chat: true, quests: true, inv: true, char: true, skills: true };
    if (fresh) UI.toast('Dein Abenteuer beginnt!');
    saveGame();
  }

  // ---------- Eingabe ----------
  function typing() { return document.activeElement && document.activeElement.tagName === 'INPUT'; }
  window.addEventListener('keydown', e => {
    if (!G.running) return;
    Audio2.resume();
    if (typing()) return;
    const P = G.P;
    if (e.code === 'Enter') { $('chatIn').focus(); e.preventDefault(); return; }
    if (e.code === 'Escape') {
      const any = Object.values(UI.wins).some(w => w.open && w.id !== 'menu');
      if (any) { for (const id in UI.wins) if (id !== 'menu') UI.close(id); } else UI.toggle('menu');
      return;
    }
    const winKeys = { KeyC: 'char', KeyB: 'inv', KeyI: 'inv', KeyK: 'skills', KeyN: 'skills', KeyL: 'quests', KeyM: 'map' };
    if (winKeys[e.code]) { UI.toggle(winKeys[e.code]); return; }
    if (e.code === 'Tab') { e.preventDefault(); tabTarget(); return; }
    if (e.code === 'Space') { e.preventDefault(); if (G.target && isHostile(G.target)) { P.autoAtk = !P.autoAtk; P.chase = P.autoAtk; } return; }
    if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5); activateHotbar((n + 9) % 10); return; }
    if (e.code === 'KeyR') { toggleMount(); return; }
    if (e.code === 'KeyQ') { for (let t = 4; t >= 1; t--) if (invCount('hp' + t) && P.level >= BASEITEMS['hp' + t].lv) { useConsumable('hp' + t); return; } log('Du hast keine Heiltränke.', 'system', '#ff6a6a'); return; }
    if (e.code === 'KeyE') { for (let t = 4; t >= 1; t--) if (invCount('mp' + t) && P.level >= BASEITEMS['mp' + t].lv) { useConsumable('mp' + t); return; } log('Du hast keine Manatränke.', 'system', '#ff6a6a'); return; }
    if (e.code === 'KeyF') {
      let best = null, bd = 100;
      for (const n of G.npcs) { const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } }
      for (const n of G.nodes) { if (!n.avail) continue; const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } }
      if (best) interact(best);
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    UI.keys[e.code] = true;
  });
  window.addEventListener('keyup', e => { UI.keys[e.code] = false; });
  window.addEventListener('blur', () => { UI.keys = {}; });
  window.addEventListener('beforeunload', () => { if (G.running) saveGame(); });

  function pickEntity(wx, wy) {
    let best = null, bd = 1e9;
    for (const m of G.mobs) {
      if (m.dead) continue;
      const lift = m.def.kind === 'flyer' ? 30 : m.def.kind === 'ghost' ? 22 : 16;
      const d = Math.hypot(wx - m.x, wy - (m.y - lift * m.sc)), r = 22 * m.sc + 4;
      if (d < r && d < bd) { bd = d; best = m; }
    }
    for (const n of G.npcs) { const d = Math.hypot(wx - n.x, wy - (n.y - 20)); if (d < 26 && d < bd) { bd = d; best = n; } }
    for (const n of G.nodes) { if (!n.avail) continue; const d = Math.hypot(wx - n.x, wy - (n.y - 4)); if (d < 24 && d < bd) { bd = d; best = n; } }
    return best;
  }
  cv.addEventListener('mousemove', e => {
    UI.mouse.x = e.clientX; UI.mouse.y = e.clientY;
    const w = Render.screenToWorld(e.clientX, e.clientY); UI.mouseWorld = w;
    const ent = G.running ? pickEntity(w.x, w.y) : null;
    UI.hover = ent && ent.def ? ent : null;
    cv.style.cursor = ent ? (ent.def ? 'crosshair' : 'pointer') : '';
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    if (!G.running) return;
    Audio2.resume(); if (typing()) document.activeElement.blur();
    const P = G.P; if (P.dead) return;
    const w = Render.screenToWorld(e.clientX, e.clientY), ent = pickEntity(w.x, w.y);
    if (e.button === 0) {
      if (ent && ent.def) {
        if (G.target === ent) { P.autoAtk = true; P.chase = true; P.interact = null; } else setTarget(ent);
      } else if (ent && ent.npc) { setTarget(ent); P.interact = ent; P.path = null; P.approach = null; P.chase = false; }
      else if (ent) { P.interact = ent; P.path = null; P.approach = null; P.chase = false; }
      else { moveTo(w.x, w.y); }
    } else if (e.button === 2) {
      if (ent && ent.def) { setTarget(ent); P.autoAtk = true; P.chase = true; P.interact = null; P.path = null; }
      else if (ent) { P.interact = ent; P.path = null; P.chase = false; }
      else moveTo(w.x, w.y);
    }
  });
  function moveTo(x, y) {
    const P = G.P; P.chase = false; P.approach = null; P.interact = null; if (P.gather) cancelGather();
    const path = World.findPath(P.x, P.y, x, y);
    if (path) { P.path = path; G.clickMark = { x, y, t: 0 }; burst(x, y, '#ffe9a0', 4, 40, 0.3); }
  }

  // ---------- Schleife ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!G.running) return;
    updateGame(dt); Render.draw(); UI.update(dt);
  }
  requestAnimationFrame(frame);
})();
