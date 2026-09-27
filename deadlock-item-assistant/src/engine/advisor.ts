import type { Catalog } from '../gamedata/catalog';
import type {
  AdvisorOutput, Availability, CandidateScore, MatchState, Obs, Recommendation, SwapSuggestion,
} from '../shared/types';
import { unknownObs } from '../shared/types';
import { type Assessment, assess } from './assess';
import { describeBuy, describeSave, describeSwap, primaryReasonText } from './explain';
import { evaluateItem } from './score';
import type { Weights } from './weights';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const usable = <T>(o: Obs<T>) => (o.status === 'observed' || o.status === 'stale' || o.status === 'derived') ? o.value : null;

export interface PriceInfo { price: number; consumes: string[] }

/** Kaufbetrag nach Komponentenrabatt: verbrauchte eigene Komponenten werden abgezogen und belegen keinen Slot mehr. */
export function priceFor(cat: Catalog, item: string, owned: string[]): PriceInfo {
  const it = cat.item(item);
  if (!it) return { price: Infinity, consumes: [] };
  const consumes = it.components.filter((c) => owned.includes(c));
  const discount = consumes.reduce((s, c) => s + (cat.item(c)?.cost ?? 0), 0);
  return { price: Math.max(0, it.cost - discount), consumes };
}

export interface SlotInfo { used: number; total: number | null; totalStatus: Availability; free: number | null; activeUsed: number; activeTotal: number }

export function slotInfo(cat: Catalog, state: MatchState, owned: string[]): SlotInfo {
  const base = cat.rules.baseSlots.value;
  const extra = usable(state.extraSlots);
  const total = extra !== null ? base + extra : null;
  const activeUsed = owned.filter((i) => cat.item(i)?.activation !== 'passive').length;
  return {
    used: owned.length,
    total: total ?? base,
    totalStatus: extra !== null ? 'observed' : 'unknown',
    free: (total ?? base) - owned.length,
    activeUsed,
    activeTotal: cat.rules.activeSlots.value,
  };
}

/** Kandidaten: kaufbare, noch nicht besessene Items, die nicht bereits in einem Besitz aufgegangen sind. */
export function candidateItems(cat: Catalog, owned: string[]): string[] {
  const inside = new Set(owned.flatMap((o) => cat.componentTree(o)));
  return [...cat.items.keys()].filter((i) => !owned.includes(i) && !inside.has(i));
}

export interface AdvisorOptions { now: number; weights: Weights }

export interface Decision { buy: string | null; save: string | null; primary: AdvisorOutput['primary'] }

export interface Ranked extends CandidateScore { utility: number; perNeed: ReturnType<typeof evaluateItem>['perNeed'] }

export function rankCandidates(cat: Catalog, a: Assessment, w: Weights, owned: string[], slots: SlotInfo): Ranked[] {
  const tierCost = cat.manifest.itemPricePerTier[Math.round(a.me.expectedTier)] ?? 3200;
  const out: Ranked[] = [];
  for (const item of candidateItems(cat, owned)) {
    const def = cat.item(item)!;
    const { price, consumes } = priceFor(cat, item, owned);
    // Upgrade: Komponente geht im neuen Item auf → Nutzen = neues Item minus verbrauchte Komponente(n)
    const base = consumes.length ? owned.filter((o) => !consumes.includes(o)) : owned;
    const ev = evaluateItem(cat, w, a, item, base);
    const terms = [...ev.terms];
    let utility = ev.utility;
    if (consumes.length) {
      const lost = consumes.reduce((s, c) => s + Math.max(0, evaluateItem(cat, w, a, c, base).utility), 0);
      utility += w.continuityBonus - lost;
      terms.push({ key: 'consumed', label: 'ersetzt verbrauchte Komponente', value: -lost });
      terms.push({ key: 'continuity', label: 'baut auf vorhandenem Item auf', value: w.continuityBonus });
      for (const [k, v] of Object.entries(ev.perNeed)) {
        const cv = consumes.reduce((s, c) => s + (evaluateItem(cat, w, a, c, base).perNeed[k as keyof typeof ev.perNeed] ?? 0), 0);
        ev.perNeed[k as keyof typeof ev.perNeed] = Math.max(0, (v ?? 0) - cv);
      }
    }
    let restricted: string | null = null;
    if (!cat.isMechanicVerified(item)) {
      utility *= w.unverifiedFactor;
      restricted = 'Mechanik für diesen Patch nicht bestätigt';
      terms.push({ key: 'unverified', label: restricted, value: -ev.utility * (1 - w.unverifiedFactor) });
    }
    // Preis-Nutzen: günstige Items in der Phase leicht bevorzugt, sehr teure leicht abgewertet
    const eff = clamp((tierCost / Math.max(400, price)) ** w.efficiencyExponent, 0.65, 1.3);
    const score = utility * eff;
    terms.push({ key: 'cost', label: 'Preis im Verhältnis zur Spielphase', value: score - utility });
    const needsSlot = consumes.length === 0;
    const activeBlocked = def.activation !== 'passive' && consumes.every((c) => cat.item(c)?.activation === 'passive') && slots.activeUsed >= slots.activeTotal;
    out.push({ item, score, utility, terms, price, consumes, needsSlot: needsSlot || activeBlocked, restricted, perNeed: ev.perNeed });
  }
  return out.sort((x, y) => y.score - x.score);
}

export interface IncomeTracker { add(at: number, netWorth: number): void; rate(): number | null; reset(): void }

/** Einnahmerate aus beobachtetem Gesamtwert (nicht aus ausgebbaren Souls, die durch Käufe springen). */
export function createIncomeTracker(windowMs = 120_000, minSpanMs = 45_000): IncomeTracker {
  let pts: { at: number; nw: number }[] = [];
  return {
    add(at, nw) {
      const last = pts[pts.length - 1];
      if (last && nw < last.nw) pts = []; // Rücksprung → neu beginnen
      pts.push({ at, nw });
      pts = pts.filter((p) => at - p.at <= windowMs);
    },
    rate() {
      if (pts.length < 2) return null;
      const a = pts[0], b = pts[pts.length - 1];
      if (b.at - a.at < minSpanMs) return null;
      const r = (b.nw - a.nw) / ((b.at - a.at) / 1000);
      return r > 0 ? r : null;
    },
    reset() { pts = []; },
  };
}

export class Advisor {
  private shown: (Decision & { since: number }) | null = null;
  private matchId: string | null = null;
  readonly income = createIncomeTracker();

  constructor(private cat: Catalog, public weights: Weights) {}

  reset() { this.shown = null; this.income.reset(); this.goalLedger = { goal: null, interims: 0 }; this.lastOwned = []; }

  /** Merkt sich, ob eine angezeigte Zwischenlösung für ein Sparziel gekauft wurde. */
  private goalLedger: { goal: string | null; interims: number } = { goal: null, interims: 0 };
  private lastOwned: string[] = [];
  private updateLedger(owned: string[]) {
    const shown = this.shown;
    const bought = owned.filter((i) => !this.lastOwned.includes(i));
    if (shown && shown.save && bought.length) {
      if (bought.includes(shown.save)) this.goalLedger = { goal: null, interims: 0 };
      else if (shown.buy && bought.includes(shown.buy)) {
        this.goalLedger = this.goalLedger.goal === shown.save ? { goal: shown.save, interims: this.goalLedger.interims + 1 } : { goal: shown.save, interims: 1 };
      }
    }
    this.lastOwned = [...owned];
  }

  run(state: MatchState, now: number, opts: { stale: boolean }): AdvisorOutput {
    const cat = this.cat, w = this.weights;
    if (state.matchId !== this.matchId) { this.reset(); this.matchId = state.matchId; }
    const a = assess(cat, state, w, now);
    const warnings = [...a.warnings];
    const me = a.me.player;
    const owned = a.me.items;
    const slots = slotInfo(cat, state, owned);
    const budgetObs: Obs<number> = me ? me.spendableSouls : unknownObs();
    const budget = budgetObs.status === 'observed' ? budgetObs.value : null;
    const myNw = me ? me.netWorth : unknownObs<number>();
    if (myNw.status === 'observed' && myNw.value !== null && myNw.observedAt !== null) this.income.add(myNw.observedAt, myNw.value);
    const income = this.income.rate();

    if (!me || !a.me.heroClass) {
      return this.empty(now, 'no-data', me ? 'Eigener Hero unbekannt.' : 'Kein eigener Spieler erkannt.', a, slots, budgetObs, warnings);
    }
    if (!a.me.itemsKnown) warnings.push('Eigenes Inventar unbekannt – Empfehlung ohne Rücksicht auf vorhandene Items.');
    if (budgetObs.status === 'stale') warnings.push('Ausgebbare Souls veraltet – nicht als bezahlbar gewertet.');
    else if (budget === null) warnings.push('Ausgebbare Souls unbekannt – kein Kauf wird als sicher bezahlbar markiert.');
    if (cat.knowledgeBuildMismatch) warnings.push('Kuratierte Mechanikdaten stammen aus einem anderen Build – Empfehlungen eingeschränkt.');
    if (a.me.profile?.confidence === 'low') warnings.push(`Profil für ${cat.heroName(a.me.heroClass)} ist nur grob geschätzt.`);

    const ranked = rankCandidates(cat, a, w, owned, slots);
    const byItem = new Map(ranked.map((c) => [c.item, c]));
    const slotOk = (c: Ranked) => {
      const active = cat.item(c.item)!.activation !== 'passive';
      if (active && c.consumes.every((x) => cat.item(x)?.activation === 'passive') && slots.activeUsed >= slots.activeTotal) return false;
      return !c.needsSlot || (slots.free !== null && slots.free > 0);
    };
    const reach = budget !== null ? budget + (income !== null ? Math.max(w.decision.reachSouls, income * 180) : w.decision.reachSouls) : Infinity;

    // 1) Entscheidung über Items (ohne Texte)
    this.updateLedger(owned);
    const d = this.decide(ranked, budget, income, reach, slotOk, slots, a.me.expectedTier);
    // 2) Stabilisierung der sichtbaren Auswahl
    const s = this.stabilize(now, byItem, owned, budget, d);
    // 3) Texte aus denselben Faktoren
    const A = s.buy ? byItem.get(s.buy) ?? null : null;
    const B = s.save ? byItem.get(s.save) ?? null : null;
    let buyNow: Recommendation | null = null;
    let saveFor: Recommendation | null = null;
    let primaryReason = '';
    const isComponent = A && B ? cat.componentTree(B.item).includes(A.item) : false;
    const delaySec = A && B && income ? A.price / income : null;
    if (budget === null) {
      if (A) buyNow = describeBuy(cat, a, A, { affordable: 'unknown', budget: null, income, slotFree: slotOk(A) });
      if (B) saveFor = describeSave(cat, a, B, { budget: null, income, versus: A, interimWorth: true });
      primaryReason = budgetObs.status === 'stale' ? 'Budget veraltet – nur kaufen, wenn du genug Souls hast.' : 'Budget unbekannt – nur kaufen, wenn du genug Souls hast.';
    } else {
      if (A) buyNow = describeBuy(cat, a, A, { affordable: A.price <= budget ? 'yes' : 'no', budget, income, slotFree: slotOk(A), interimFor: s.primary === 'buy' && B && B.score > A.score ? B : null, isComponentOf: isComponent ? B : null, delaySec });
      if (B) saveFor = describeSave(cat, a, B, { budget: A && s.primary === 'buy' && B.score <= A.score ? budget - A.price : budget, income, versus: A, interimWorth: s.primary === 'buy' });
      primaryReason = primaryReasonText(cat, s.primary, A, B && A && B.score <= A.score ? A : B, { isComponent, delaySec, ratio: A && B ? A.score / Math.max(0.001, B.score) : 0, missing: B ? Math.max(0, B.price - budget) : 0, far: B ? B.price - budget >= w.decision.farAwaySouls : false });
    }

    // Austausch: wenn die Hauptempfehlung an Platzmangel scheitert
    let swap: SwapSuggestion | null = null;
    let swapNote: string | null = null;
    const main = s.primary === 'save' ? B : A;
    const blocked = main && !slotOk(main) ? main : (slots.free !== null && slots.free <= 0 ? ranked.find((c) => c.needsSlot && c.score > 0) ?? null : null);
    if (blocked && owned.length) {
      const r = this.bestSwap(a, owned, blocked, ranked, budget, slots);
      swap = r.swap; swapNote = r.note;
    }

    const status: AdvisorOutput['status'] = opts.stale ? 'stale' : (budget === null || warnings.length || !a.me.itemsKnown) ? 'limited' : 'ok';
    if (opts.stale) {
      if (buyNow) buyNow = { ...buyNow, affordable: buyNow.affordable === 'yes' ? 'unknown' : buyNow.affordable };
      warnings.unshift('Daten veraltet – Empfehlung nicht aktuell.');
    }
    return {
      generatedAt: now, status, statusText: statusText(status, state), buyNow, saveFor, primary: s.primary, primaryReason, swap, swapNote,
      threats: a.threats, needs: a.needs, ranking: ranked.slice(0, 30).map(({ item, score, terms, price, consumes, needsSlot, restricted }) => ({ item, score, terms, price, consumes, needsSlot, restricted })),
      slots: { used: slots.used, total: slots.total, totalStatus: slots.totalStatus, activeUsed: slots.activeUsed, activeTotal: slots.activeTotal },
      budget: budgetObs, warnings,
    };
  }

  /** Jetzt kaufen / darauf sparen – entscheidet ausdrücklich, ob sich eine Zwischenlösung lohnt. */
  decide(ranked: Ranked[], budget: number | null, income: number | null, reach: number, slotOk: (c: Ranked) => boolean, slots: SlotInfo, expectedTier: number): Decision {
    const w = this.weights.decision;
    const cat = this.cat;
    if (budget === null) {
      const top = ranked.find((c) => c.score > 0) ?? null;
      const second = top ? ranked.find((c) => c.item !== top.item && c.price > top.price && c.score > top.score * 0.8) ?? null : null;
      return { buy: top?.item ?? null, save: second?.item ?? null, primary: top ? 'buy' : 'none' };
    }
    const A = ranked.find((c) => c.price <= budget && c.score > 0 && slotOk(c)) ?? null;
    const B = ranked.find((c) => c.price <= reach && c.score > 0) ?? null;
    if (!B) return { buy: A?.item ?? null, save: null, primary: A ? 'buy' : 'none' };
    if (A && A.item === B.item) {
      const next = ranked.find((c) => c.item !== A.item && c.price > budget - A.price && c.score > 0 && c.price <= budget + 6400);
      return { buy: A.item, save: next?.item ?? null, primary: 'buy' };
    }
    const missing = Math.max(0, B.price - budget);
    const isComponent = A ? cat.componentTree(B.item).includes(A.item) : false;
    const delaySec = A && income ? A.price / income : null;
    const ratio = A ? A.score / Math.max(0.001, B.score) : 0;
    const far = missing >= w.farAwaySouls;
    const gain = B.score - (A?.score ?? 0);
    // Wurde für dasselbe Ziel schon eine Zwischenlösung gekauft, muss die nächste fast gleichwertig sein
    // (sonst schiebt eine Kette von Zwischenkäufen das Ziel immer weiter hinaus).
    const priorInterims = this.goalLedger.goal === B.item ? this.goalLedger.interims : 0;
    // Niedrigstufiges Item, das einen der letzten Slots belegt, muss später mit Verlust verkauft werden
    const slotPressure = A && A.needsSlot && slots.free !== null && slots.free <= 2 && (cat.item(A.item)?.tier ?? 4) < expectedTier ? 0.1 : 0;
    const minRatio = Math.min(0.97, w.interimMinRatio + 0.1 * priorInterims + slotPressure);
    const minRatioFar = Math.min(0.97, w.interimMinRatioFar + 0.15 * priorInterims + slotPressure);
    const interimWorth = !!A && (isComponent || ratio >= minRatio || (far && ratio >= minRatioFar) || (gain < w.saveMinGain && priorInterims === 0))
      && !(delaySec !== null && delaySec > w.maxDelaySec && !isComponent && ratio < 0.95);
    return { buy: A?.item ?? null, save: B.item, primary: interimWorth ? 'buy' : 'save' };
  }

  private bestSwap(a: Assessment, owned: string[], target: Ranked, ranked: Ranked[], budget: number | null, slots: SlotInfo): { swap: SwapSuggestion | null; note: string | null } {
    const cat = this.cat, w = this.weights;
    const plan = new Set(ranked.slice(0, 6).flatMap((c) => cat.componentTree(c.item)));
    const refundFrac = cat.rules.sellRefundFraction.value;
    const targetActive = cat.item(target.item)!.activation !== 'passive';
    const activeLimit = targetActive && slots.activeUsed >= slots.activeTotal;
    let best: { sell: string; delta: number; keep: number; value: number; refund: number } | null = null;
    let weakest: { sell: string; keep: number } | null = null;
    for (const o of owned) {
      if (target.consumes.includes(o)) continue;
      const def = cat.item(o);
      if (!def) continue;
      if (activeLimit && def.activation === 'passive') continue; // Aktiv-Slot wird nur durch ein aktives Item frei
      const rest = owned.filter((x) => x !== o);
      const keep = evaluateItem(cat, w, a, o, rest).utility + (plan.has(o) ? w.swap.componentOfPlanBonus : 0);
      const value = evaluateItem(cat, w, a, target.item, rest).utility;
      const delta = value - keep;
      if (!weakest || keep < weakest.keep) weakest = { sell: o, keep };
      if (!best || delta > best.delta) best = { sell: o, delta, keep, value, refund: Math.floor(def.cost * refundFrac) };
    }
    if (!best || best.delta < w.swap.minGain) {
      const note = weakest
        ? `Kein sinnvoller Austausch: selbst ${cat.itemName(weakest.sell)} bringt aktuell noch etwa so viel wie ${cat.itemName(target.item)}.`
        : 'Kein sinnvoller Austausch gefunden.';
      return { swap: null, note };
    }
    const netCost = target.price - best.refund;
    const d = describeSwap(cat, a, best.sell, target.item, best.keep, best.value);
    const budgetNote = budget !== null && netCost > budget ? ` · fehlen ${netCost - budget} Souls` : '';
    return {
      swap: { sell: best.sell, buy: target.item, refund: best.refund, netCost, gain: d.gain, loss: d.loss + budgetNote, deltaScore: best.delta },
      note: null,
    };
  }

  /** Hält die sichtbare Auswahl kurz stabil, ersetzt ungültige/überholte Empfehlungen aber sofort. */
  stabilize(now: number, byItem: Map<string, Ranked>, owned: string[], budget: number | null, d: Decision): Decision {
    const w = this.weights.stability;
    const prev = this.shown;
    const commit = (x: Decision) => { this.shown = { ...x, since: now }; return x; };
    if (!prev) return commit(d);
    if (prev.buy === d.buy && prev.save === d.save && prev.primary === d.primary) return d;
    if (now - prev.since >= w.holdMs) return commit(d);
    const valid = (i: string | null, kind: 'buy' | 'save') => {
      if (i === null) return true;
      const r = byItem.get(i);
      if (!r || owned.includes(i) || r.score <= 0) return false; // gekauft/ungültig → sofort ersetzen
      if (kind === 'buy' && budget !== null && r.price > budget) return false;
      return true;
    };
    const clearlyBetter = (n: string | null, o: string | null) => {
      const ns = n ? byItem.get(n)?.score ?? 0 : 0;
      const os = o ? byItem.get(o)?.score ?? 0 : 0;
      return ns - os > Math.max(w.minAbsoluteGain, os * w.minRelativeGain);
    };
    if (!valid(prev.buy, 'buy') || !valid(prev.save, 'save')) return commit(d);
    if (clearlyBetter(d.buy, prev.buy) || clearlyBetter(d.save, prev.save)) return commit(d);
    return { buy: prev.buy, save: prev.save, primary: prev.primary };
  }

  private empty(now: number, status: AdvisorOutput['status'], text: string, a: Assessment, slots: SlotInfo, budget: Obs<number>, warnings: string[]): AdvisorOutput {
    return {
      generatedAt: now, status, statusText: text, buyNow: null, saveFor: null, primary: 'none', primaryReason: text, swap: null, swapNote: null,
      threats: a.threats, needs: a.needs, ranking: [], slots: { used: slots.used, total: slots.total, totalStatus: slots.totalStatus, activeUsed: slots.activeUsed, activeTotal: slots.activeTotal },
      budget, warnings,
    };
  }
}

function statusText(s: AdvisorOutput['status'], state: MatchState): string {
  const lag = state.sourceLagSec ? ` · Quelle ca. ${Math.round(state.sourceLagSec)} s verzögert` : '';
  if (s === 'stale') return `Daten veraltet${lag}`;
  if (s === 'limited') return `Eingeschränkt${lag}`;
  if (s === 'no-data') return 'Keine Matchdaten';
  return `Aktuell${lag}`;
}
