import type { ProviderSnapshot, ReportedProblem, Team } from '../shared/types';
import { Provider } from './provider';

// Manuelle Kurz-Eingabe (klar gekennzeichnete Alternative ohne Live-Anbindung).
// Alles, was hier steht, hat der Nutzer selbst eingetragen – nichts wird geraten.

export interface ManualPlayer {
  key: string;
  heroClass: string | null;
  items: string[];
  netWorth: number | null;
}

export interface ManualState {
  matchId: string;
  myHero: string | null;
  myItems: string[];
  /** ausgebbare Souls laut Eingabe */
  mySouls: number | null;
  mySoulsAt: number | null;
  myNetWorth: number | null;
  extraSlots: number | null;
  enemies: ManualPlayer[];
  problems: ReportedProblem[];
}

export const emptyManualState = (): ManualState => ({
  matchId: `manual-${Date.now()}`, myHero: null, myItems: [], mySouls: null, mySoulsAt: null, myNetWorth: null, extraSlots: null,
  enemies: Array.from({ length: 6 }, (_, i) => ({ key: `m${i}`, heroClass: null, items: [], netWorth: null })), problems: [],
});

export class ManualProvider extends Provider {
  readonly id = 'manual' as const;
  readonly label = 'Manuelle Eingabe';
  state: ManualState;

  constructor(initial?: ManualState) {
    super();
    this.state = initial ?? emptyManualState();
  }

  start() { this.diag.startedAt = Date.now(); this.setState('live', 'Werte aus deiner Eingabe'); this.publish(); }
  stop() { this.setState('idle'); }

  newMatch() { this.state = emptyManualState(); this.publish(); }

  update(patch: Partial<ManualState>) {
    const souls = patch.mySouls !== undefined && patch.mySouls !== this.state.mySouls;
    this.state = { ...this.state, ...patch };
    if (souls) this.state.mySoulsAt = Date.now();
    this.publish();
  }

  report(enemyKey: string, kind: ReportedProblem['kind']) {
    this.state.problems = [...this.state.problems.filter((p) => !(p.enemyKey === enemyKey && p.kind === kind)), { enemyKey, kind, at: Date.now() }];
    this.publish();
  }

  snapshot(now = Date.now()): ProviderSnapshot {
    const s = this.state;
    const me = { key: 'me', isMe: true, team: 0 as Team, heroClass: s.myHero ?? undefined, items: s.myItems, itemsComplete: true,
      // Souls mit ihrem tatsächlichen Eingabezeitpunkt weitergeben (veralten im Store)
      spendableSouls: s.mySouls ?? undefined, spendableSoulsAt: s.mySoulsAt ?? undefined, netWorth: s.myNetWorth ?? undefined };
    return {
      source: 'manual', matchId: s.matchId, receivedAt: now, gameTime: null,
      players: [me, ...s.enemies.filter((e) => e.heroClass).map((e) => ({
        key: e.key, team: 1 as Team, heroClass: e.heroClass!, items: e.items, itemsComplete: true, netWorth: e.netWorth ?? undefined,
      }))],
      extraSlotsByTeam: s.extraSlots !== null ? { 0: s.extraSlots } : undefined,
      reportedProblems: s.problems,
      purchasesKnown: true,
    };
  }

  publish() {
    if (this.diag.state !== 'live') return;
    this.emitSnapshot(this.snapshot());
  }
}
