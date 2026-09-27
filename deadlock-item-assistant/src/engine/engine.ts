import type { Catalog } from '../gamedata/catalog';
import type { AdvisorOutput, EnemyAlert, ItemEvent, ProviderSnapshot } from '../shared/types';
import { DEFAULT_STORE_OPTIONS, MatchStore } from '../state/matchStore';
import { Advisor } from './advisor';
import { AlertManager } from './alerts';
import { DEFAULT_WEIGHTS, type Weights } from './weights';

// Verbindet Matchzustand, Bewertung und Hinweise. Einziger Einstiegspunkt für Provider und UI.
export class Engine {
  readonly store: MatchStore;
  readonly advisor: Advisor;
  readonly alerts: AlertManager;
  last: AdvisorOutput | null = null;
  private pendingEvents: ItemEvent[] = [];
  private prevPrimaryItem: string | null = null;

  constructor(readonly cat: Catalog, readonly weights: Weights = DEFAULT_WEIGHTS) {
    this.store = new MatchStore({ ...DEFAULT_STORE_OPTIONS, componentsOf: (i) => cat.item(i)?.components ?? [] });
    this.advisor = new Advisor(cat, weights);
    this.alerts = new AlertManager(cat, weights);
  }

  ingest(s: ProviderSnapshot, now = s.receivedAt): { output: AdvisorOutput; alerts: EnemyAlert[]; accepted: boolean; reason?: string } {
    const r = this.store.apply(s);
    if (r.reset) { this.advisor.reset(); this.alerts.reset(); this.pendingEvents = []; this.prevPrimaryItem = null; }
    this.pendingEvents.push(...r.events);
    const t = this.tick(now);
    return { ...t, accepted: r.accepted, reason: r.reason };
  }

  /** Neubewertung ohne neue Daten (Frische, Hinweis-Bündelung). */
  tick(now: number): { output: AdvisorOutput; alerts: EnemyAlert[] } {
    const state = this.store.view(now);
    const output = this.advisor.run(state, now, { stale: this.store.isStale(now) });
    const primaryItem = output.primary === 'save' ? output.saveFor?.item ?? null : output.buyNow?.item ?? null;
    const prev = this.prevPrimaryItem;
    const events = this.pendingEvents;
    this.pendingEvents = [];
    const alerts = this.alerts.process(state, events, now, () =>
      prev !== null && primaryItem !== null && prev !== primaryItem ? `Neue Empfehlung: ${this.cat.itemName(primaryItem)}` : null);
    this.prevPrimaryItem = primaryItem;
    this.last = output;
    return { output, alerts };
  }
}
