import type { ControlSnapshot } from '../main/controller';
import type { OverlayVM } from '../present/viewModel';

import { bridge } from './bridge';

const send = (a: unknown) => bridge.send(a);
let snap: ControlSnapshot | null = null;
let vm: OverlayVM | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(text: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls ? { class: cls } : {}, text);
  b.onclick = onClick;
  return b;
}
function select(options: [string, string][], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = el('select');
  for (const [v, t] of options) { const o = el('option', { value: v }, t); if (v === value) o.selected = true; s.appendChild(o); }
  s.onchange = () => onChange(s.value);
  return s;
}
function itemName(id: number): string {
  return snap?.itemCatalog.find((i) => i.id === id)?.name ?? `#${id}`;
}
function itemSelect(onPick: (id: number) => void, placeholder = 'Item hinzufügen …'): HTMLSelectElement {
  const opts: [string, string][] = [['', placeholder], ...(snap?.itemCatalog ?? []).map((i) => [String(i.id), `${i.name}${i.tier === 'legendary' || i.tier === 'boots' ? '' : ' (Komponente)'}`] as [string, string])];
  return select(opts, '', (v) => { if (v) onPick(Number(v)); });
}
function advisor(patch: Record<string, unknown>) { send({ type: 'settings', patch: { advisor: patch } }); }

function renderModebar() {
  const m = document.getElementById('modebar')!;
  m.replaceChildren();
  const seg = el('div', { class: 'row seg' });
  const live = button('Live-Partie', () => send({ type: 'mode', mode: 'live' }));
  const sim = button('Simulationsmodus', () => send({ type: 'mode', mode: 'simulation' }));
  if (snap?.mode === 'live') live.classList.add('on'); else sim.classList.add('on');
  seg.append(live, sim, button('Overlay ein/aus', () => send({ type: 'overlay-toggle' })), button('Aufklappen', () => send({ type: 'overlay-expand' })), button('Overlay verschieben', () => send({ type: 'overlay-interactive' })));
  m.appendChild(seg);
}

function renderSummary() {
  const s = document.getElementById('summary')!;
  s.replaceChildren(el('h2', {}, 'Aktueller Vorschlag'));
  if (!vm) return;
  s.appendChild(el('div', { class: 'muted small' }, `${vm.status.label} – ${vm.status.detail} · ${vm.patch.label}`));
  if (vm.message) s.appendChild(el('div', { class: 'warn' }, vm.message));
  if (vm.favorite) {
    s.appendChild(el('div', { class: 'fav' }, `${vm.favorite.name} – ${vm.favorite.tempo}`));
    const ul = el('ul');
    vm.favorite.reasons.forEach((r) => ul.appendChild(el('li', {}, r)));
    s.appendChild(ul);
    const row = el('div', { class: 'row' });
    row.appendChild(button(vm.favorite.pinned ? 'Fixierung aufheben' : 'Dieses Item fixieren', () => advisor({ pinnedItem: vm!.favorite!.pinned ? null : vm!.favorite!.itemId })));
    s.appendChild(row);
  }
  if (vm.components) s.appendChild(el('div', { class: 'small' }, vm.components.text));
  for (const a of vm.alternatives) {
    const d = el('div', { class: 'small' });
    d.append(el('b', {}, `Alternative: ${a.name} `), el('span', { class: 'muted' }, `(${a.advantage}) ${a.text} `));
    d.appendChild(button('fixieren', () => advisor({ pinnedItem: a.itemId }), 'small'));
    s.appendChild(d);
  }
  if (vm.pending) s.appendChild(el('div', { class: 'small muted' }, vm.pending));
}

function renderSettings() {
  const s = document.getElementById('settings')!;
  s.replaceChildren(el('h2', {}, 'Annahmen & Einstellungen'));
  if (!snap) return;
  const a = snap.settings.advisor;
  s.appendChild(el('label', {}, 'Rolle (leer = aus dem Spiel übernommen, falls verfügbar)'));
  s.appendChild(select([['', 'automatisch'], ['TOP', 'Top'], ['JUNGLE', 'Jungle'], ['MIDDLE', 'Mid'], ['BOTTOM', 'Bot'], ['UTILITY', 'Support']], a.roleOverride ?? '', (v) => advisor({ roleOverride: v || null })));
  s.appendChild(el('label', {}, 'Spielweise (wechselt nie automatisch)'));
  s.appendChild(select([['', 'Standard für Rolle'], ...snap.playstyles.map((p) => [p.id, p.name] as [string, string])], a.playstyleOverride ?? '', (v) => advisor({ playstyleOverride: v || null })));
  s.appendChild(el('label', {}, 'Wen kannst du realistisch treffen? (Annahme, keine Positionsdaten)'));
  s.appendChild(select([['balanced', 'Ausgewogen'], ['frontline', 'Frontline'], ['backline', 'Backline']], a.targetFocus, (v) => advisor({ targetFocus: v })));
  s.appendChild(el('label', {}, 'Quelle für gegnerische Items'));
  s.appendChild(select([['manual', 'Manuell (Standard – Sichtbarkeit nicht nachgewiesen)'], ['live-client', 'Live Client Data API (nach eigener Prüfung)']], a.enemyItemPolicy, (v) => advisor({ enemyItemPolicy: v })));
  if (a.enemyItemPolicy === 'live-client') s.appendChild(el('div', { class: 'warn' }, 'Die Nutzung ist nur vertretbar, wenn die gemeldeten Items exakt dem entsprechen, was dir der Client (Tab-Übersicht) anzeigt. Prüfe das im Abschnitt „Datenverfügbarkeit“ und kläre den Anwendungsfall mit Riot.'));
  s.appendChild(el('label', {}, 'Fixiertes Item'));
  const pinRow = el('div', { class: 'row' });
  pinRow.appendChild(el('span', {}, a.pinnedItem ? itemName(a.pinnedItem) : 'keins'));
  pinRow.appendChild(itemSelect((id) => advisor({ pinnedItem: id }), 'Item fixieren …'));
  if (a.pinnedItem) pinRow.appendChild(button('lösen', () => advisor({ pinnedItem: null }), 'small'));
  s.appendChild(pinRow);
  s.appendChild(el('label', {}, 'Spielversion (manuell, z. B. 26.19), falls nicht ermittelbar'));
  const ver = el('input', { type: 'text', value: snap.settings.manualGameVersion ?? '' });
  ver.onchange = () => send({ type: 'settings', patch: { manualGameVersion: ver.value.trim() || null } });
  s.appendChild(ver);
  s.appendChild(el('label', {}, 'Wechselschwelle / sofort ab / stabile Auswertungen'));
  const hr = el('div', { class: 'row' });
  const num = (v: number, key: string, step: string) => { const i = el('input', { type: 'number', value: String(v), step }); i.style.width = '100px'; i.onchange = () => advisor({ [key]: Number(i.value) }); return i; };
  hr.append(num(a.switchMargin, 'switchMargin', '0.01'), num(a.urgentMargin, 'urgentMargin', '0.01'), num(a.stabilityPolls, 'stabilityPolls', '1'));
  s.appendChild(hr);
  const strict = el('label', {});
  const cb = el('input', { type: 'checkbox' }); (cb as HTMLInputElement).checked = a.strictPatch;
  cb.onchange = () => advisor({ strictPatch: (cb as HTMLInputElement).checked });
  strict.append(cb, document.createTextNode(' Strikter Patchmodus (keine Empfehlungen ohne geprüften Datensatz)'));
  s.appendChild(strict);
  s.appendChild(el('div', { class: 'small muted' }, snap.patchStatus.message));
}

function renderEnemies() {
  const s = document.getElementById('enemies')!;
  s.replaceChildren(el('h2', {}, 'Gegnerische Items'));
  if (!snap) return;
  if (snap.mode === 'simulation') { s.appendChild(el('div', { class: 'muted small' }, 'Im Simulationsmodus werden Gegner-Items im Abschnitt „Simulation“ verändert.')); return; }
  if (!snap.enemies.length) { s.appendChild(el('div', { class: 'muted small' }, 'Keine Partie erkannt.')); return; }
  const manual = snap.settings.advisor.enemyItemPolicy === 'manual';
  s.appendChild(el('div', { class: 'small muted' }, manual
    ? 'Trage ein, was du im Spiel (Tab) siehst. „API-Stand übernehmen“ nur nach eigener Kontrolle.'
    : 'Quelle: Live Client Data API. Manuelle Einträge werden ignoriert.'));
  for (const e of snap.enemies) {
    const box = el('div', { class: 'small' });
    box.appendChild(el('b', {}, e.name));
    const cur = e.manualItems ?? [];
    const chips = el('div');
    for (const id of cur) {
      const c = el('span', { class: 'chip' }, itemName(id));
      if (manual) c.appendChild(button('×', () => { const n = [...cur]; n.splice(n.indexOf(id), 1); send({ type: 'manual-items', championKey: e.championKey, items: n }); }, 'small'));
      chips.appendChild(c);
    }
    if (!cur.length) chips.appendChild(el('span', { class: 'muted' }, manual ? 'unbekannt (nichts eingetragen)' : ''));
    box.appendChild(chips);
    if (manual) {
      const row = el('div', { class: 'row' });
      row.appendChild(itemSelect((id) => send({ type: 'manual-items', championKey: e.championKey, items: [...cur, id] })));
      row.appendChild(button('Keine Items (geprüft)', () => send({ type: 'manual-items', championKey: e.championKey, items: [] }), 'small'));
      row.appendChild(button('API-Stand übernehmen', () => send({ type: 'manual-items', championKey: e.championKey, items: e.apiItems }), 'small'));
      box.appendChild(row);
      box.appendChild(el('div', { class: 'muted' }, `API meldet (nicht verwendet): ${e.apiItems.map(itemName).join(', ') || '–'}`));
    }
    s.appendChild(box);
  }
}

function renderSim() {
  const s = document.getElementById('sim')!;
  s.replaceChildren(el('h2', {}, 'Simulation (getrennt von Live-Daten)'));
  if (!snap) return;
  s.appendChild(select([['', 'Szenario wählen …'], ...snap.scenarios.map((x) => [x.id, x.name] as [string, string])], snap.sim.scenarioId ?? '', (v) => { if (v) { send({ type: 'mode', mode: 'simulation' }); send({ type: 'sim-load', id: v }); } }));
  if (snap.mode !== 'simulation' || !snap.sim.scenarioId) return;
  const row = el('div', { class: 'row' });
  row.append(button('◀ Schritt zurück', () => send({ type: 'sim-step', delta: -1 })), button('Nächster Schritt ▶', () => send({ type: 'sim-step', delta: 1 }), 'primary'));
  s.appendChild(row);
  const ol = el('ul', { class: 'small' });
  ol.appendChild(el('li', { class: snap.sim.step === -1 ? 'fav' : 'muted' }, 'Ausgangszustand'));
  snap.sim.steps.forEach((st, i) => ol.appendChild(el('li', { class: i === snap!.sim.step ? 'fav' : i < snap!.sim.step ? '' : 'muted' }, `${Math.floor(st.t / 60)}:${String(st.t % 60).padStart(2, '0')} ${st.label}`)));
  s.appendChild(ol);
  s.appendChild(el('label', {}, 'Manuelle Änderung: Gegner kauft/verkauft'));
  const champs = vm?.expanded?.enemies.map((e) => e.name) ?? [];
  let who = '';
  const whoSel = select([['', 'Champion …'], ...champs.map((c) => [c, c] as [string, string])], '', (v) => { who = v; });
  let item = 0;
  const itSel = itemSelect((id) => { item = id; }, 'Item …');
  const r2 = el('div', { class: 'row' });
  r2.append(whoSel, itSel,
    button('kauft', () => { if (who && item) send({ type: 'sim-change', who, add: [item], remove: [] }); }, 'small'),
    button('entfernt', () => { if (who && item) send({ type: 'sim-change', who, add: [], remove: [item] }); }, 'small'));
  s.appendChild(r2);
  s.appendChild(el('div', { class: 'small muted' }, 'Champion-Namen entsprechen den internen Schlüsseln des Szenarios.'));
}

function renderHistory() {
  const s = document.getElementById('history')!;
  s.replaceChildren(el('h2', {}, 'Änderungsverlauf'));
  for (const c of vm?.expanded?.changes ?? []) {
    const d = el('div', { class: 'small' });
    d.appendChild(el('b', {}, `${c.time} ${c.summary}`));
    const ul = el('ul');
    c.decisive.forEach((t) => ul.appendChild(el('li', {}, `Ausschlaggebend: ${t}`)));
    c.triggers.forEach((t) => ul.appendChild(el('li', { class: 'muted' }, `Beobachtung: ${t}`)));
    if (c.tradeoff) ul.appendChild(el('li', { class: 'muted' }, `Trade-off: ${c.tradeoff}`));
    d.appendChild(ul);
    s.appendChild(d);
  }
}

function renderDetails() {
  const s = document.getElementById('details')!;
  s.replaceChildren(el('h2', {}, 'Details der Berechnung'));
  const x = vm?.expanded;
  if (!x) return;
  const t = el('table');
  const hr = el('tr');
  ['Item', 'Schaden', 'Eff. LP', 'Utility', 'Tempo', 'Wert'].forEach((h) => hr.appendChild(el('th', {}, h)));
  t.appendChild(hr);
  x.comparison.forEach((c) => { const tr = el('tr'); [c.name, c.offense, c.defense, c.utility, c.tempo, c.score].forEach((v) => tr.appendChild(el('td', {}, v))); t.appendChild(tr); });
  s.appendChild(t);
  s.appendChild(el('h2', {}, 'Warum nicht …?'));
  const ul = el('ul', { class: 'small' });
  x.whyNot.forEach((w) => ul.appendChild(el('li', {}, `${w.name}: ${w.text}`)));
  s.appendChild(ul);
  s.appendChild(el('h2', {}, 'Gegner (geschätzt)'));
  const et = el('table');
  x.enemies.forEach((e) => { const tr = el('tr'); [e.name, `Ziel ${e.weight}`, `Bedrohung ${e.threat}`, e.stats, e.items.map((i) => i.name).join(', ') || '–', e.source].forEach((v) => tr.appendChild(el('td', {}, v))); et.appendChild(tr); });
  s.appendChild(et);
  s.appendChild(el('div', { class: 'small muted' }, x.threat));
  s.appendChild(el('h2', {}, 'Datenqualität & Annahmen'));
  const q = el('ul', { class: 'small' });
  [...x.quality, ...(x.robust ? [x.robust] : []), ...x.assumptions].forEach((v) => q.appendChild(el('li', {}, v)));
  x.enemies.forEach((e) => e.notes.forEach((n) => q.appendChild(el('li', { class: 'muted' }, n))));
  s.appendChild(q);
}

function renderData() {
  const s = document.getElementById('data')!;
  s.replaceChildren(el('h2', {}, 'Datenverfügbarkeit (zur Laufzeit geprüft)'));
  if (!snap) return;
  if (snap.waitingReason) s.appendChild(el('div', { class: 'warn' }, `Warte auf Partie: ${snap.waitingReason}`));
  const t = el('table');
  t.appendChild((() => { const tr = el('tr'); ['Feld', 'vorhanden', 'Beispiel'].forEach((h) => tr.appendChild(el('th', {}, h))); return tr; })());
  for (const f of snap.schema) {
    const tr = el('tr');
    tr.append(el('td', {}, f.field), el('td', { class: f.present ? 'ok' : 'bad' }, f.present ? 'ja' : 'nein'), el('td', { class: 'muted' }, f.sample ?? ''));
    t.appendChild(tr);
  }
  if (!snap.schema.length) s.appendChild(el('div', { class: 'muted small' }, 'Noch keine Live-Antwort erhalten.'));
  s.appendChild(t);
  s.appendChild(el('div', { class: 'small muted' }, `Abfrage-Statistik: ${JSON.stringify(snap.pollerStats)}`));
  if (snap.dataProblems.length) {
    s.appendChild(el('h2', {}, 'Probleme im Datensatz'));
    const ul = el('ul', { class: 'small' });
    snap.dataProblems.forEach((p) => ul.appendChild(el('li', {}, p)));
    s.appendChild(ul);
  }
  s.appendChild(el('h2', {}, 'Inventar-Ereignisse (Live, stabilisiert)'));
  const ul = el('ul', { class: 'small' });
  (snap.inventoryEvents as { playerId: string; kind: string; itemIds: number[]; gameTime: number }[]).slice(-20).reverse()
    .forEach((e) => ul.appendChild(el('li', {}, `${Math.round(e.gameTime)} s · ${e.playerId}: ${e.kind} ${e.itemIds.map(itemName).join(', ')}`)));
  s.appendChild(ul);
}

function renderAll() {
  renderModebar(); renderSummary(); renderSettings(); renderEnemies(); renderSim(); renderHistory(); renderDetails(); renderData();
}

bridge.onVM((v) => { vm = v; renderSummary(); renderHistory(); renderDetails(); });
bridge.onControl((c) => {
  const first = !snap;
  const structural = !snap || snap.mode !== c.mode || snap.sim.step !== c.sim.step || snap.sim.scenarioId !== c.sim.scenarioId
    || JSON.stringify(snap.settings) !== JSON.stringify(c.settings) || JSON.stringify(snap.enemies) !== JSON.stringify(c.enemies);
  snap = c;
  if (first || structural) renderAll(); else renderData();
});
send({ type: 'request' });
