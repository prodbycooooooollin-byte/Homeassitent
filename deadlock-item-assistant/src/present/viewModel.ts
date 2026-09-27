import type { Catalog } from '../gamedata/catalog';
import type { ProviderDiagnostics } from '../providers/provider';
import type { AdvisorOutput, EnemyAlert, Recommendation, SourceId } from '../shared/types';
import { needLabel } from '../engine/score';

// Reine Aufbereitung für die Anzeige (Texte, Formate, Icons). Keine Gameplay-Logik:
// alles stammt aus AdvisorOutput.

export interface ItemVM {
  cls: string;
  name: string;
  slot: 'weapon' | 'vitality' | 'spirit';
  tier: number;
  active: boolean;
  image: string | null;
  initials: string;
}

export interface RecVM {
  label: string;
  item: ItemVM;
  priceText: string;
  missingText: string | null;
  etaText: string | null;
  affordable: 'yes' | 'likely' | 'no' | 'unknown';
  affordText: string;
  reason: string;
  reasonsLong: string[];
  drawback: string | null;
  tags: string[];
  consumesText: string | null;
  primary: boolean;
}

export interface OverlayVM {
  myHero: string | null;
  source: SourceId | null;
  sourceLabel: string;
  isDemo: boolean;
  freshness: 'fresh' | 'limited' | 'stale' | 'none';
  statusText: string;
  dataNotice: string | null;
  primaryText: string;
  buy: RecVM | null;
  save: RecVM | null;
  holdText: string | null;
  swap: { sell: ItemVM; buy: ItemVM; netText: string; gain: string; loss: string } | null;
  swapNote: string | null;
  alert: AlertVM | null;
  alertsHistory: AlertVM[];
  threats: { hero: string; pct: number; level: 'hoch' | 'mittel' | 'gering'; factors: string[]; mix: string; mixSource: string; cc: string; sustain: string }[];
  needs: { label: string; value: number; focus: boolean }[];
  alternatives: { item: ItemVM; priceText: string; score: string; note: string | null }[];
  slotsText: string;
  budgetText: string;
  warnings: string[];
  patchText: string;
}

export interface AlertVM { id: string; text: string; consequence: string; change: string | null; ageText: string; at: number }

const fmt = (n: number) => n.toLocaleString('de-DE');

export function itemVM(cat: Catalog, cls: string): ItemVM {
  const it = cat.item(cls);
  const name = cat.itemName(cls);
  const initials = name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return { cls, name, slot: it?.slot ?? 'weapon', tier: it?.tier ?? 1, active: (it?.activation ?? 'passive') !== 'passive', image: it?.imageUrl ?? null, initials };
}

const PROV_LABEL: Record<string, string> = {
  observed: 'beobachtet', 'from-build': 'aus Build geschätzt', 'from-hero-data': 'aus Heldendaten', curated: 'aus Heldenprofil geschätzt',
  reported: 'von dir gemeldet', 'damage-window': 'aus Schadensfenster erkannt',
};

function recVM(cat: Catalog, r: Recommendation, label: string, primary: boolean): RecVM {
  const affordText = r.affordable === 'yes' ? 'bezahlbar' : r.affordable === 'likely' ? 'bezahlbar (berechnet)' : r.affordable === 'unknown' ? 'Budget unbekannt' : 'noch nicht bezahlbar';
  return {
    label, item: itemVM(cat, r.item!), priceText: fmt(r.price ?? 0),
    missingText: r.missing ? `fehlen ${fmt(r.missing)}` : null,
    etaText: r.etaSec ? `ca. ${Math.max(1, Math.round(r.etaSec / 60 * 2) / 2).toLocaleString('de-DE')} min (geschätzt)` : null,
    affordable: r.affordable, affordText, reason: r.reasonShort, reasonsLong: r.reasonsLong, drawback: r.drawback, tags: r.provenanceTags,
    consumesText: r.consumes.length ? `übernimmt ${r.consumes.map((c) => cat.itemName(c)).join(' + ')}` : null, primary,
  };
}

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`;
}

export function alertVM(cat: Catalog, a: EnemyAlert, now: number): AlertVM {
  const names = a.items.map((i) => cat.itemName(i)).join(', ');
  return { id: a.id, text: `${a.heroName}: ${names} ${a.wording}`, consequence: a.consequence, change: a.changedRecommendation, ageText: ago(now - a.at), at: a.at };
}

export function buildOverlayVM(cat: Catalog, o: AdvisorOutput | null, diag: ProviderDiagnostics | null, alerts: EnemyAlert[], now: number, alertVisibleMs: number): OverlayVM {
  const source = diag?.id ?? null;
  const isDemo = source === 'demo';
  const auto = diag?.label.startsWith('Automatisch') ?? false;
  const sourceLabel = auto
    ? (source === 'spectator' ? 'Automatisch · Zuschauer-Stream' : source === 'screen' ? 'Auto · Bildschirm' : 'Automatisch · Live')
    : source === 'demo' ? 'DEMO · Beispieldaten' : source === 'manual' ? 'Manuelle Eingabe' : source === 'spectator' ? 'Spectator (verzögert)' : source === 'gep' ? 'Live · Overwolf' : source === 'screen' ? 'Bildschirmerkennung' : 'Keine Quelle';
  const hist = alerts.slice(-8).reverse().map((a) => alertVM(cat, a, now));
  const latest = hist[0] && now - hist[0].at < alertVisibleMs ? hist[0] : null;
  const patchText = `Spieldaten Build ${cat.manifest.build} (${cat.manifest.versionDate.split(' ').slice(0, 3).join(' ')})`;
  if (!o) {
    return {
      myHero: null, source, sourceLabel, isDemo, freshness: 'none', statusText: diag?.detail || 'Warte auf Daten', dataNotice: 'Noch keine Matchdaten.', primaryText: '',
      buy: null, save: null, holdText: null, swap: null, swapNote: null, alert: latest, alertsHistory: hist, threats: [], needs: [], alternatives: [],
      slotsText: '', budgetText: '', warnings: [], patchText,
    };
  }
  const freshness = o.status === 'ok' ? 'fresh' : o.status === 'limited' ? 'limited' : o.status === 'stale' ? 'stale' : 'none';
  const buy = o.buyNow?.item ? recVM(cat, o.buyNow, o.buyNow.affordable === 'unknown' ? 'NÄCHSTER KAUF' : 'JETZT KAUFEN', o.primary === 'buy') : null;
  const save = o.saveFor?.item ? recVM(cat, o.saveFor, o.primary === 'save' ? 'DARAUF SPAREN' : 'DANACH', o.primary === 'save') : null;
  // Datenhinweis, der die Empfehlung betrifft, bleibt im kompakten Overlay sichtbar
  const noData = o.status === 'no-data';
  const notice = noData ? null : o.status === 'stale' ? 'Daten veraltet – nicht aktuell' : o.budget.status === 'derived' ? null : o.budget.status !== 'observed' ? 'Budget unbekannt – Preis selbst prüfen' : o.warnings.find((w) => /unbekannt|eingeschränkt/i.test(w)) ?? null;
  const slotsText = `${o.slots.used}/${o.slots.total ?? '?'} Slots${o.slots.totalStatus === 'unknown' ? ' (Zusatzslots unbekannt)' : ''} · aktiv ${o.slots.activeUsed}/${o.slots.activeTotal}*`;
  const budgetText = o.budget.status === 'observed' ? `${fmt(o.budget.value!)} Souls` : o.budget.status === 'derived' ? `≈ ${fmt(o.budget.value!)} Souls (berechnet)` : o.budget.status === 'stale' ? `${fmt(o.budget.value!)} Souls (veraltet)` : 'Souls unbekannt';
  return {
    myHero: o.myHeroClass ? cat.heroName(o.myHeroClass) : null,
    source, sourceLabel, isDemo, freshness, statusText: o.statusText, dataNotice: notice,
    primaryText: noData && diag?.detail ? diag.detail : o.primaryReason,
    buy, save,
    holdText: o.primary === 'save' && !buy ? 'Nichts kaufen – weiter sparen' : null,
    swap: o.swap ? {
      sell: itemVM(cat, o.swap.sell), buy: itemVM(cat, o.swap.buy),
      netText: o.swap.netCost >= 0 ? `netto ${fmt(o.swap.netCost)}` : `+${fmt(-o.swap.netCost)} übrig`, gain: o.swap.gain, loss: o.swap.loss,
    } : null,
    swapNote: o.swapNote,
    alert: latest, alertsHistory: hist,
    threats: o.threats.slice(0, 6).map((t) => ({
      hero: t.heroName, pct: Math.round(t.threat * 100), level: t.threat >= 0.6 ? 'hoch' : t.threat >= 0.3 ? 'mittel' : 'gering',
      factors: t.factors.slice(0, 3).map((f) => f.label),
      mix: `Waffe ${Math.round(t.damageMix.bullet * 100)} % · Spirit ${Math.round(t.damageMix.spirit * 100)} %${t.damageMix.melee > 0.05 ? ` · Nahkampf ${Math.round(t.damageMix.melee * 100)} %` : ''}`,
      mixSource: PROV_LABEL[t.damageMix.provenance] ?? t.damageMix.provenance,
      cc: t.ccTypes.slice(0, 3).join(', ') || '–', sustain: t.sustainSources.slice(0, 2).join(', ') || '–',
    })),
    needs: (Object.entries(o.needs.values) as [keyof typeof o.needs.values, number][])
      .filter(([k]) => k !== 'offense' && k !== 'mobility').sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: needLabel(k), value: Math.round(v * 100), focus: o.needs.focus.includes(k) })),
    alternatives: o.ranking.slice(0, 6).map((c) => ({ item: itemVM(cat, c.item), priceText: fmt(c.price), score: c.score.toFixed(2), note: c.restricted })),
    slotsText, budgetText, warnings: o.warnings, patchText,
  };
}
