import type { ItemVM, OverlayVM, RecVM } from '../present/viewModel';

// Darstellung des Overlays. Enthält keine Gameplay-Logik – nur Anzeige des ViewModels.

export interface Layout {
  expanded: boolean;
  edit: boolean;
  scale: number;
  opacity: number;
  reducedMotion: 'system' | 'on' | 'off';
  hotkeys: { details: string; edit: string; toggle: string; control: string };
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const key = (acc: string) => acc.replace('CommandOrControl', 'Strg').replace('Shift', 'Umschalt').replace(/\+/g, '+');

export function iconHtml(it: ItemVM, small = false): string {
  const tier = Array.from({ length: it.tier }, () => '<i></i>').join('');
  const inner = it.image ? `<img src="${esc(it.image)}" alt="">` : esc(it.initials);
  return `<span class="icon ${it.slot}${small ? ' sm' : ''}" title="${esc(it.name)}">${inner}<span class="tier">${tier}</span>${it.active ? '<span class="act">A</span>' : ''}</span>`;
}

function recHtml(r: RecVM): string {
  const sub: string[] = [];
  if (r.affordable === 'unknown' || r.affordable === 'likely') sub.push(`<span class="${r.affordable === 'likely' ? 'calc' : 'unk'}">${esc(r.affordText)}</span>`);
  if (r.missingText) sub.push(`<span class="no">${esc(r.missingText)}</span>`);
  if (r.etaText) sub.push(`<span>${esc(r.etaText)}</span>`);
  if (r.consumesText && !/^Upgrade von/.test(r.reason)) sub.push(`<span>${esc(r.consumesText)}</span>`);
  return `<div class="rec${r.primary ? ' primary' : ''}">
    ${iconHtml(r.item)}
    <div class="body">
      <div class="top"><span class="label" title="${r.primary ? 'Empfohlen' : ''}">${r.primary ? '◆ ' : ''}${esc(r.label)}</span><span class="price souls">${esc(r.priceText)}</span></div>
      <div class="name">${esc(r.item.name)}</div>
      <div class="reason">${esc(r.reason)}</div>
      ${sub.length ? `<div class="sub">${sub.join('')}</div>` : ''}
    </div></div>`;
}

export function renderOverlay(vm: OverlayVM, layout: Layout): string {
  const parts: string[] = [];
  if (layout.edit) {
    parts.push(`<div class="editbar">
      <span class="caps" style="color:var(--amber)">Bearbeiten</span>
      <button data-a="scale-" title="kleiner">−</button><button data-a="scale+" title="größer">+</button>
      <input type="range" min="0.5" max="1" step="0.02" value="${layout.opacity}" data-a="opacity" title="Deckkraft">
      <button data-a="reset" title="Position zurücksetzen">⟲</button>
      <button class="done" data-a="done">Fertig</button></div>
      <div class="edithint">Ziehen zum Verschieben · ${esc(key(layout.hotkeys.edit))} beendet den Bearbeitungsmodus</div>`);
  }
  const freshTxt = vm.freshness === 'stale' ? 'veraltet' : vm.freshness === 'none' ? 'wartet' : vm.freshness === 'limited' ? 'eingeschränkt' : 'aktuell';
  parts.push(`<div class="head">
    <span class="fresh ${vm.freshness}"><span class="dot"></span><span class="txt">${esc(freshTxt)} · ${esc(vm.isDemo ? 'Beispieldaten' : vm.sourceLabel)}</span></span>
    <span class="sp"></span>${vm.myHero ? `<span class="hero">${esc(vm.myHero)}</span>` : ''}${vm.isDemo ? '<span class="pill demo">DEMO</span>' : vm.freshness === 'fresh' ? '<span class="pill live">LIVE</span>' : ''}</div>`);

  if (vm.buy) parts.push(recHtml(vm.buy));
  if (vm.holdText && !vm.buy) parts.push(`<div class="hold">${esc(vm.holdText)}</div>`);
  if (vm.save) parts.push(recHtml(vm.save));
  if (!vm.buy && !vm.save) parts.push(`<div class="hold" style="color:var(--ink-3)">${esc(vm.primaryText || vm.statusText || 'Warte auf Daten …')}</div>`);

  if (vm.swap) {
    parts.push(`<div class="swap"><div class="sw1"><span class="caps">Platz schaffen</span><span class="net souls">${esc(vm.swap.netText)}</span></div>
      <div class="sw2">${iconHtml(vm.swap.sell, true)}<span class="nm">${esc(vm.swap.sell.name)}</span><span class="arrow">→</span>${iconHtml(vm.swap.buy, true)}<span class="nm">${esc(vm.swap.buy.name)}</span></div></div>`);
    if (layout.expanded) parts.push(`<div class="swapnote">${esc(vm.swap.gain)} · ${esc(vm.swap.loss)}</div>`);
  } else if (layout.expanded && vm.swapNote) parts.push(`<div class="swapnote">${esc(vm.swapNote)}</div>`);

  if (vm.dataNotice) parts.push(`<div class="notice${vm.freshness === 'stale' ? ' bad' : ''}"><span class="ic">!</span><span>${esc(vm.dataNotice)}</span></div>`);
  if (vm.alert) {
    parts.push(`<div class="alert"><span class="flag">NEU</span><div><div class="t">${esc(vm.alert.text)}</div><div class="c">${esc(vm.alert.consequence)}${vm.alert.change ? ` ${esc(vm.alert.change)}` : ''}</div></div></div>`);
  }

  if (layout.expanded) {
    const main = vm.buy?.primary ? vm.buy : vm.save?.primary ? vm.save : vm.buy ?? vm.save;
    if (main) {
      parts.push(`<div class="sec"><h4>Warum ${esc(main.item.name)}</h4><ul class="why" style="margin:0;padding:0">
        ${main.reasonsLong.map((r) => `<li>${esc(r)}</li>`).join('')}
        ${main.drawback ? `<li class="minus">${esc(main.drawback)}</li>` : ''}</ul>
        ${vm.primaryText ? `<div class="hist" style="margin-top:5px">${esc(vm.primaryText)}</div>` : ''}
        ${main.tags.length ? `<div class="tags">${main.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}</div>`);
    }
    if (vm.threats.length) {
      parts.push(`<div class="sec"><h4>Relevante Gegner</h4>${vm.threats.slice(0, 4).map((t) => `
        <div class="thr"><span class="n">${esc(t.hero)}</span><span class="bar ${t.level}"><i style="width:${t.pct}%"></i></span><span class="lv ${t.level}">${esc(t.level)} ${t.pct}</span>
        <span class="f">${esc(t.factors.slice(0, 2).join(' · '))} · ${esc(t.mix)} (${esc(t.mixSource)})${t.cc !== '–' ? ` · CC: ${esc(t.cc)}` : ''}</span></div>`).join('')}</div>`);
    }
    if (vm.needs.length) {
      parts.push(`<div class="sec"><h4>Bedarf</h4>${vm.needs.filter((n) => n.value >= 5).slice(0, 4).map((n) => `
        <div class="need${n.focus ? ' focus' : ''}"><span>${esc(n.label)}${n.focus ? ' ◆' : ''}</span><span class="b"><i style="width:${n.value}%"></i></span><span class="v">${n.value}</span></div>`).join('')}</div>`);
    }
    if (vm.alternatives.length) {
      parts.push(`<div class="sec"><h4>Alternativen (Modellwert)</h4>${vm.alternatives.slice(0, 4).map((a) => `
        <div class="alt">${iconHtml(a.item, true)}<span class="nm">${esc(a.item.name)}${a.note ? ` <span class="pill">${esc(a.note)}</span>` : ''}</span><span class="souls">${esc(a.priceText)}</span><span style="width:34px;text-align:right;color:var(--ink-3)">${esc(a.score)}</span></div>`).join('')}</div>`);
    }
    if (vm.alertsHistory.length) {
      parts.push(`<div class="sec"><h4>Hinweise</h4>${vm.alertsHistory.slice(0, 3).map((h) => `<div class="hist">⚑ ${esc(h.text)} – ${esc(h.consequence)} <span class="a">${esc(h.ageText)}</span></div>`).join('')}</div>`);
    }
    if (vm.warnings.length) parts.push(`<div class="sec"><h4>Datenlage</h4>${vm.warnings.map((w) => `<div class="hist">${esc(w)}</div>`).join('')}</div>`);
    parts.push(`<div class="foot"><span>${esc(vm.slotsText)}</span><span class="souls">${esc(vm.budgetText)}</span><span>${esc(vm.patchText)}</span><span>Details: ${esc(key(layout.hotkeys.details))}</span></div>`);
  }
  return `<div class="panel deco${layout.edit ? ' edit' : ''}">${parts.join('')}</div>`;
}
