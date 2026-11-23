import type { ItemChip, OverlayVM } from '../present/viewModel';

import { bridge } from './bridge';

let expanded = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(c: ItemChip, small = false): HTMLElement {
  const box = el('div', small ? 'icon sm' : 'icon');
  box.title = c.name;
  // Kürzel als Platzhalter; das Icon ersetzt es erst nach erfolgreichem Laden (offline-fest).
  box.textContent = c.name.split(/[\s'-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const img = new Image();
  img.alt = c.name;
  img.onload = () => box.replaceChildren(img);
  img.src = c.icon;
  return box;
}

function section(title: string): HTMLElement {
  const s = el('div', 'sec');
  s.appendChild(el('h4', undefined, title));
  return s;
}

function render(vm: OverlayVM) {
  const root = document.getElementById('root')!;
  root.replaceChildren();
  const head = el('div', 'head');
  const left = el('div');
  left.appendChild(el('div', 'champ', vm.champion ? vm.champion.name : 'LoL Build-Assistent'));
  if (vm.champion) left.appendChild(el('div', 'sub', `${vm.champion.playstyle} · ${vm.champion.role} · Ziel: ${vm.champion.focus}`));
  head.appendChild(left);
  const pill = el('span', `pill ${vm.status.tone}`, vm.status.label);
  pill.title = vm.status.detail;
  head.appendChild(pill);
  root.appendChild(head);

  if (vm.message) root.appendChild(el('div', 'warnbox', vm.message));

  if (vm.favorite) {
    root.appendChild(el('div', 'label', vm.favorite.pinned ? 'Fixiert (deine Vorgabe)' : 'Bevorzugte nächste Option'));
    const f = el('div', vm.favorite.changed ? 'fav changed' : 'fav');
    f.appendChild(icon(vm.favorite));
    const body = el('div');
    body.appendChild(el('div', 'name', vm.favorite.name));
    body.appendChild(el('div', 'tempo', vm.favorite.tempo));
    for (const r of vm.favorite.reasons) body.appendChild(el('div', 'reason', r));
    f.appendChild(body);
    root.appendChild(f);
  }
  if (vm.components) {
    root.appendChild(el('div', 'label', vm.components.mode === 'save' ? 'Budget' : 'Jetzt mit deinem Gold'));
    const c = el('div', 'comps');
    for (const it of vm.components.items) {
      c.appendChild(icon(it, true));
      c.appendChild(el('span', 'cost', `${it.name} ${it.cost ?? ''} g`));
    }
    root.appendChild(c);
    root.appendChild(el('div', 'muted small', vm.components.text));
    if (vm.components.interim) root.appendChild(el('div', 'small', `Option: ${vm.components.interim}`));
  }
  if (vm.alternatives.length) {
    root.appendChild(el('div', 'label', 'Alternativen'));
    for (const a of vm.alternatives) {
      const row = el('div', 'alt');
      row.appendChild(icon(a, true));
      const t = el('div');
      const line = el('div');
      line.appendChild(el('b', undefined, a.name + ' '));
      line.appendChild(el('span', 'adv', a.advantage));
      t.appendChild(line);
      t.appendChild(el('div', 'txt', a.text));
      row.appendChild(t);
      root.appendChild(row);
    }
  }
  if (vm.pending) root.appendChild(el('div', 'pending', vm.pending));
  if (vm.patch.restricted) root.appendChild(el('div', 'warnbox', `Eingeschränkt: ${vm.patch.label}`));

  if (expanded && vm.expanded) {
    const x = vm.expanded;
    const pv = section('Vorläufiger Build-Pfad (Vorschau)');
    const r = el('div', 'comps');
    x.preview.forEach((p) => r.appendChild(icon(p, true)));
    pv.appendChild(r);
    pv.appendChild(el('div', 'muted small', 'Nur die nächste Entscheidung ist belastbar; spätere Items sind eine Vorschau.'));
    root.appendChild(pv);

    const ch = section('Warum geändert?');
    if (!x.changes.length) ch.appendChild(el('div', 'muted small', 'Noch keine Änderungen.'));
    for (const c of x.changes.slice(0, 5)) {
      const d = el('div', 'change small');
      d.appendChild(el('span', 't', c.time));
      d.appendChild(el('span', undefined, c.summary));
      if (c.decisive.length) { const ul = el('ul'); c.decisive.forEach((t) => ul.appendChild(el('li', undefined, t))); d.appendChild(ul); }
      else if (c.triggers.length) { const ul = el('ul'); c.triggers.slice(0, 4).forEach((t) => ul.appendChild(el('li', 'muted', t))); d.appendChild(ul); }
      if (c.tradeoff) d.appendChild(el('div', 'muted', c.tradeoff));
      ch.appendChild(d);
    }
    root.appendChild(ch);

    const cmp = section('Vergleich (modelliert)');
    const tbl = el('table');
    const hr = el('tr');
    ['Item', 'Schaden', 'Eff. LP', 'Utility', 'Wert'].forEach((h) => hr.appendChild(el('th', undefined, h)));
    tbl.appendChild(hr);
    for (const c of x.comparison) {
      const tr = el('tr', c.highlight ? 'hl' : undefined);
      [c.name, c.offense, c.defense, c.utility, c.score].forEach((v) => tr.appendChild(el('td', undefined, v)));
      tr.title = c.tempo;
      tbl.appendChild(tr);
    }
    cmp.appendChild(tbl);
    root.appendChild(cmp);

    const wn = section('Warum nicht …?');
    const ul = el('ul', 'small');
    x.whyNot.forEach((w) => { const li = el('li'); li.appendChild(el('b', undefined, w.name + ': ')); li.appendChild(el('span', undefined, w.text)); ul.appendChild(li); });
    wn.appendChild(ul);
    root.appendChild(wn);

    const en = section('Gegner & beobachtete Käufe');
    for (const e of x.enemies) {
      const d = el('div', 'enemy small');
      d.appendChild(el('span', 'nm', `${e.name} `));
      d.appendChild(el('span', 'muted', `Ziel ${e.weight} · Bedrohung ${e.threat} · ${e.source}`));
      const row = el('div', 'comps');
      e.items.forEach((i) => row.appendChild(icon(i, true)));
      if (e.unknown) row.appendChild(el('span', 'muted', `+${e.unknown} unbekannt`));
      d.appendChild(row);
      d.appendChild(el('div', 'muted', e.stats));
      en.appendChild(d);
    }
    en.appendChild(el('div', 'muted small', x.threat));
    root.appendChild(en);

    if (x.sell) root.appendChild(el('div', 'warnbox', x.sell));
    const q = section('Datenqualität & Annahmen');
    const ql = el('ul', 'small');
    [...x.quality, ...(x.robust ? [x.robust] : []), ...x.assumptions].forEach((t) => ql.appendChild(el('li', undefined, t)));
    q.appendChild(ql);
    root.appendChild(q);
  }

  const foot = el('div', 'foot');
  foot.appendChild(el('span', undefined, `Stand: ${vm.lastUpdate}`));
  foot.appendChild(el('span', undefined, vm.patch.label));
  root.appendChild(foot);
  // Fensterhöhe an den Inhalt anpassen (Hauptprozess begrenzt auf Bildschirmhöhe).
  requestAnimationFrame(() => bridge.send({ type: 'overlay-height', height: Math.ceil(root.scrollHeight + 14) }));
}

let lastVm: OverlayVM | null = null;
bridge.onVM((vm) => { lastVm = vm; render(vm); });
bridge.onLayout((l) => {
  expanded = l.expanded;
  document.documentElement.style.setProperty('--scale', String(l.scale));
  document.body.classList.toggle('interactive', l.interactive);
  if (lastVm) render(lastVm);
});
