// Erklärungen werden ausschließlich aus berechneten Werten des EvaluationResult
// erzeugt. Fehlt eine Grundlage, entfällt der Satz – es wird nichts ergänzt.

import type { EvaluationResult, OptionEval } from './engine';

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} %`;
const secs = (s: number) => (s <= 0.5 ? 'jetzt' : `in ~${Math.round(s)} s`);

function topTargets(res: EvaluationResult, key: 'armor' | 'mr' | 'hp', n = 2) {
  return [...res.enemies]
    .filter((e) => e.targetWeight >= 0.1)
    .sort((a, b) => b.targetWeight * b[key].value - a.targetWeight * a[key].value)
    .slice(0, n);
}

export function tempoText(o: OptionEval): string {
  return o.remaining <= 0 ? 'bereits bezahlbar'
    : o.etaSec <= 0.5 ? `jetzt kaufbar (${Math.round(o.remaining)} g)`
      : `fertig ${secs(o.etaSec)} (${Math.round(o.remaining)} g Rest)`;
}

/** Konkrete Gründe für eine Option, sortiert nach berechnetem Beitrag. */
export function optionReasons(res: EvaluationResult, o: OptionEval, max = 2): string[] {
  const out: string[] = [];
  const physical = res.myDamageMix.physical >= res.myDamageMix.magic;
  for (const d of o.drivers) {
    if (out.length >= max) break;
    if (d.contribution < 0.005) continue;
    switch (d.kind) {
      case 'pen': {
        const key = physical ? 'armor' : 'mr';
        const ts = topTargets(res, key);
        if (!ts.length) break;
        const list = ts.map((t) => `${t.name} ~${Math.round(t[key].value)} ${physical ? 'Rüstung' : 'MR'}${(physical ? t.itemArmor : t.itemMr) > 0 ? ` (+${Math.round(physical ? t.itemArmor : t.itemMr)} aus Items)` : ''}`).join(', ');
        out.push(`Durchdringung zählt gegen ${list}: ${pct(d.contribution / Math.max(0.01, res.weights.offense))} Schaden allein durch diesen Teil.`);
        break;
      }
      case 'hpPct': {
        const ts = topTargets(res, 'hp');
        if (!ts.length) break;
        out.push(`Prozentualer Lebensschaden gegen ${ts.map((t) => `${t.name} ~${Math.round(t.hp.value)} LP`).join(', ')}: ${pct(d.contribution / Math.max(0.01, res.weights.offense))} Schaden durch diesen Effekt.`);
        break;
      }
      case 'antiheal': {
        const healer = [...res.enemies].sort((a, b) => b.healPerSec - a.healPerSec)[0];
        if (!healer) break;
        out.push(`Antiheal gegen ${healer.name} (geschätzt ~${Math.round(healer.healPerSec)} LP/s Heilung im Kampf).`);
        break;
      }
      case 'raw':
        out.push(`${pct(o.gains.offense)} modellierter Schaden gegen deine gewichteten Ziele.`);
        break;
      case 'defense': {
        const t = res.threat;
        const top = t.top[0];
        out.push(`${pct(o.gains.defense)} effektive LP gegen die erwartete Mischung (${Math.round(t.physical * 100)} % phys. / ${Math.round(t.magic * 100)} % mag.)${top ? `, größte Bedrohung: ${top.name}` : ''}.`);
        break;
      }
      case 'utility':
        if (o.gains.utility > 0.01) out.push('Zusätzliche Utility (siehe Details).');
        break;
      default: break;
    }
  }
  if (!out.length) out.push(`${pct(o.gains.offense)} Schaden, ${pct(o.gains.defense)} effektive LP.`);
  return out;
}

/** Kurzer Vorteil einer Alternative gegenüber dem Favoriten – nur berechnete Unterschiede. */
export function alternativeText(res: EvaluationResult, alt: OptionEval, fav: OptionEval): string {
  const parts: string[] = [];
  const dOff = alt.gains.offense - fav.gains.offense;
  const dDef = alt.gains.defense - fav.gains.defense;
  if (dOff > 0.01) parts.push(`${pct(dOff)} Schaden ggü. ${fav.name}`);
  if (dDef > 0.01) parts.push(`${pct(dDef)} effektive LP ggü. ${fav.name}`);
  if (alt.etaSec + 5 < fav.etaSec) parts.push(`${Math.round(fav.etaSec - alt.etaSec)} s früher fertig`);
  const wins = res.variants.filter((v) => v.bestItem === alt.itemId).map((v) => v.label);
  if (wins.length) parts.push(`vorne bei: ${wins.join(', ')}`);
  if (!parts.length) parts.push(`Modellwert ${Math.round((alt.pathScore / Math.max(1e-6, fav.pathScore)) * 100)} % des Favoriten`);
  return parts.join('; ');
}

export interface WhyNotEntry {
  itemId: number;
  name: string;
  text: string;
}

/** "Warum dieses andere Item gerade nicht?" – naheliegende Gegenmaßnahmen + nächste Kandidaten. */
export function whyNot(res: EvaluationResult, max = 6): WhyNotEntry[] {
  const out: WhyNotEntry[] = [];
  const fav = res.options.find((o) => o.itemId === res.bestId);
  const seen = new Set<number>([res.bestId ?? -1, ...res.alternatives.map((a) => a.itemId)]);
  for (const c of res.counters) {
    if (seen.has(c.itemId) || c.status === 'favorite' || c.status === 'alternative') continue;
    seen.add(c.itemId);
    const wins = c.winsUnder.length ? ` Vorne nur unter: ${c.winsUnder.join(', ')}.` : '';
    out.push({ itemId: c.itemId, name: c.name, text: `${c.trigger}. ${c.reason}${wins}` });
  }
  if (fav) {
    for (const o of res.options.slice(0, 6)) {
      if (out.length >= max) break;
      if (seen.has(o.itemId)) continue;
      seen.add(o.itemId);
      const parts: string[] = [];
      if (o.gains.offense < fav.gains.offense - 0.01) parts.push(`${pct(o.gains.offense - fav.gains.offense)} Schaden`);
      if (o.gains.defense < fav.gains.defense - 0.01) parts.push(`${pct(o.gains.defense - fav.gains.defense)} eff. LP`);
      if (o.etaSec > fav.etaSec + 5) parts.push(`${Math.round(o.etaSec - fav.etaSec)} s später fertig`);
      const wins = res.variants.filter((v) => v.bestItem === o.itemId).map((v) => v.label);
      const tail = wins.length ? ` Vorne unter: ${wins.join(', ')}.` : '';
      out.push({ itemId: o.itemId, name: o.name, text: `Gegenüber ${fav.name}: ${parts.join(', ') || 'knapp schwächer im Gesamtwert'}.${tail}` });
    }
  }
  return out.slice(0, max);
}
