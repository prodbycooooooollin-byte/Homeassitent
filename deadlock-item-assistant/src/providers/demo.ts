import type { Catalog } from '../gamedata/catalog';
import type { ProviderSnapshot, ReportedProblem, Team } from '../shared/types';
import { Provider } from './provider';

// DEMO-MODUS: skriptgesteuerter Beispiel-Match für Entwicklung und Design.
// Keine echten Daten. Wird in der UI durchgehend als „Demo“ gekennzeichnet.

interface DemoPlayer { key: string; hero: string; team: Team; items: string[]; nw: number; rate: number; k: number; d: number; a: number; isMe?: boolean }
interface DemoEvent { t: number; who: string; buy?: string; sell?: string; problem?: ReportedProblem['kind']; kda?: [number, number, number] }

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  startTime: number;
  mySouls: number;
  myRate: number;
  extraSlots: number;
  players: DemoPlayer[];
  events: DemoEvent[];
}

// Namen → Klassen werden beim Laden über den Katalog aufgelöst (englische Originalnamen).
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'infernus-lead', title: 'Infernus mit Vorsprung', startTime: 480, mySouls: 1300, myRate: 26, extraSlots: 0,
    description: 'Du spielst Haze. Infernus farmt schnell und kauft Heilung; Warden liegt zurück.',
    players: [
      { key: 'me', hero: 'Haze', team: 0, items: ['Extended Magazine', 'Rapid Rounds', 'Headshot Booster', 'Extra Stamina'], nw: 7400, rate: 26, k: 2, d: 1, a: 3, isMe: true },
      { key: 'a1', hero: 'Abrams', team: 0, items: ['Extra Health', 'Melee Charge'], nw: 7000, rate: 24, k: 1, d: 2, a: 2 },
      { key: 'e1', hero: 'Infernus', team: 1, items: ['Extra Spirit', 'Mystic Burst', 'Extra Health', 'Extra Charge'], nw: 9800, rate: 36, k: 4, d: 0, a: 2 },
      { key: 'e2', hero: 'Warden', team: 1, items: ['Extra Health'], nw: 4200, rate: 17, k: 0, d: 4, a: 1 },
      { key: 'e3', hero: 'Seven', team: 1, items: ['Extra Spirit', 'Extended Magazine'], nw: 7200, rate: 24, k: 1, d: 1, a: 2 },
      { key: 'e4', hero: 'Wraith', team: 1, items: ['Rapid Rounds', 'Extended Magazine', 'Extra Stamina'], nw: 7600, rate: 25, k: 2, d: 2, a: 1 },
      { key: 'e5', hero: 'Kelvin', team: 1, items: ['Extra Spirit', 'Extra Health'], nw: 6500, rate: 22, k: 0, d: 1, a: 4 },
      { key: 'e6', hero: 'Lash', team: 1, items: ['Extra Health', 'Extra Spirit'], nw: 6800, rate: 23, k: 1, d: 2, a: 2 },
    ],
    events: [
      { t: 520, who: 'e1', buy: 'Spirit Lifesteal' },
      { t: 540, who: 'e1', buy: 'Healing Booster' },
      { t: 600, who: 'e4', buy: 'Swift Striker' },
      { t: 640, who: 'e1', buy: 'Improved Spirit', kda: [6, 0, 3] },
      { t: 700, who: 'e3', buy: 'Improved Spirit' },
      { t: 760, who: 'e1', buy: 'Superior Duration' },
      { t: 820, who: 'e2', buy: 'Extended Magazine' },
      { t: 900, who: 'e6', buy: 'Duration Extender' },
    ],
  },
  {
    id: 'warden-control', title: 'Warden-Kontrolle', startTime: 1500, mySouls: 3100, myRate: 32, extraSlots: 1,
    description: 'Warden ist weit vorne, seine Kontrolle führt wiederholt zu Toden; du meldest „CC-Problem“.',
    players: [
      { key: 'me', hero: 'Haze', team: 0, items: ['Titanic Magazine', 'Swift Striker', 'Headhunter', 'Kinetic Dash', 'Bullet Lifesteal', 'Hollow Point'], nw: 19500, rate: 32, k: 5, d: 6, a: 4, isMe: true },
      { key: 'e1', hero: 'Warden', team: 1, items: ['Titanic Magazine', 'Duration Extender', 'Superior Cooldown', 'Fortitude', 'Bullet Resilience'], nw: 25500, rate: 40, k: 9, d: 2, a: 6 },
      { key: 'e2', hero: 'Infernus', team: 1, items: ['Improved Spirit', 'Mystic Burst', 'Extra Health', 'Spirit Lifesteal'], nw: 20000, rate: 32, k: 5, d: 4, a: 7 },
      { key: 'e3', hero: 'Seven', team: 1, items: ['Improved Spirit', 'Extended Magazine', 'Extra Regen'], nw: 18000, rate: 30, k: 3, d: 4, a: 5 },
      { key: 'e4', hero: 'Wraith', team: 1, items: ['Swift Striker', 'Titanic Magazine', 'Extra Stamina'], nw: 18500, rate: 30, k: 4, d: 3, a: 3 },
      { key: 'e5', hero: 'Kelvin', team: 1, items: ['Improved Spirit', 'Extra Health', 'Healing Rite'], nw: 16500, rate: 27, k: 1, d: 3, a: 9 },
      { key: 'e6', hero: 'Abrams', team: 1, items: ['Extra Health', 'Melee Charge', 'Fortitude'], nw: 17500, rate: 28, k: 2, d: 5, a: 4 },
    ],
    events: [
      { t: 1520, who: 'me', problem: 'cc' },
      { t: 1560, who: 'e1', buy: 'Unstoppable' },
      { t: 1620, who: 'e2', buy: 'Toxic Bullets' },
    ],
  },
  {
    id: 'full-inventory', title: 'Volles Inventar', startTime: 2100, mySouls: 5200, myRate: 36, extraSlots: 0,
    description: 'Spätes Spiel, alle 9 Slots belegt – welches Item kann weichen?',
    players: [
      { key: 'me', hero: 'Haze', team: 0, items: ['Titanic Magazine', 'Swift Striker', 'Headhunter', 'Kinetic Dash', 'Bullet Lifesteal', 'Hollow Point', 'Extra Health', 'Sprint Boots', 'Extra Regen'], nw: 26000, rate: 36, k: 8, d: 5, a: 7, isMe: true },
      { key: 'e1', hero: 'Infernus', team: 1, items: ['Improved Spirit', 'Spirit Lifesteal', 'Healing Booster', 'Superior Duration', 'Boundless Spirit', 'Extra Health'], nw: 30000, rate: 40, k: 11, d: 3, a: 6 },
      { key: 'e2', hero: 'Lady Geist', team: 1, items: ['Improved Spirit', 'Spirit Lifesteal', 'Extra Health', 'Healing Booster'], nw: 24000, rate: 33, k: 5, d: 5, a: 8 },
      { key: 'e3', hero: 'Wraith', team: 1, items: ['Swift Striker', 'Titanic Magazine', 'Hollow Point'], nw: 22000, rate: 31, k: 4, d: 6, a: 5 },
    ],
    events: [{ t: 2160, who: 'e2', buy: 'Improved Spirit' }],
  },
];

export class DemoProvider extends Provider {
  readonly id = 'demo' as const;
  readonly label = 'DEMO (Beispieldaten)';
  private timer: NodeJS.Timeout | null = null;
  private t = 0;
  private souls = 0;
  private players: DemoPlayer[] = [];
  private events: DemoEvent[] = [];
  private problems: ReportedProblem[] = [];
  private matchId = '';
  scenario: DemoScenario;
  /** Demo: empfohlenen Kauf automatisch ausführen, sobald bezahlbar */
  autoBuy = true;
  /** Spielsekunden pro Echtzeit-Sekunde */
  speed = 5;

  constructor(private cat: Catalog, scenarioId = DEMO_SCENARIOS[0].id) {
    super();
    this.scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId) ?? DEMO_SCENARIOS[0];
    this.load(this.scenario.id);
  }

  private cls(name: string): string {
    for (const it of this.cat.items.values()) if (it.nameEn === name) return it.className;
    throw new Error(`Demo: Item ${name} fehlt im Datensatz`);
  }
  private hero(name: string): string {
    for (const h of this.cat.heroes.values()) if (h.nameEn === name) return h.className;
    throw new Error(`Demo: Hero ${name} fehlt im Datensatz`);
  }

  load(id: string) {
    const sc = DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0];
    this.scenario = sc;
    this.t = sc.startTime;
    this.souls = sc.mySouls;
    this.players = sc.players.map((p) => ({ ...p, hero: this.hero(p.hero), items: p.items.map((i) => this.cls(i)) }));
    this.events = sc.events.map((e) => ({ ...e, buy: e.buy ? this.cls(e.buy) : undefined })).sort((a, b) => a.t - b.t);
    this.problems = [];
    this.matchId = `demo-${sc.id}-${Date.now()}`;
    this.diag.notes = [`Szenario: ${sc.title} – ${sc.description}`];
  }

  start() {
    this.diag.startedAt = Date.now();
    this.setState('live', `DEMO · ${this.scenario.title}`);
    this.emitSnapshot(this.snapshot());
    this.timer = setInterval(() => this.step(), 1000);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.setState('idle'); }

  step(gameSeconds = this.speed) {
    const t0 = this.t;
    this.t += gameSeconds;
    for (const p of this.players) p.nw += p.rate * gameSeconds;
    this.souls += this.scenario.myRate * gameSeconds;
    for (const e of this.events.filter((x) => x.t > t0 && x.t <= this.t)) {
      const p = this.players.find((x) => x.key === e.who);
      if (!p) continue;
      if (e.buy) this.applyBuy(p, e.buy);
      if (e.sell) p.items = p.items.filter((i) => i !== e.sell);
      if (e.kda) [p.k, p.d, p.a] = e.kda;
      if (e.problem) this.problems.push({ enemyKey: this.players.find((x) => x.team === 1 && x !== p)!.key, kind: e.problem, at: Date.now() });
    }
    this.emitSnapshot(this.snapshot());
  }

  private applyBuy(p: DemoPlayer, item: string) {
    const def = this.cat.item(item);
    if (!def || p.items.includes(item)) return;
    p.items = [...p.items.filter((i) => !def.components.includes(i)), item];
  }

  /** Eigener Kauf im Demo-Modus (per Steuerfenster oder Auto-Kauf). */
  buyMine(item: string, sell?: string): boolean {
    const me = this.players.find((p) => p.isMe)!;
    const def = this.cat.item(item);
    if (!def) return false;
    const consumes = def.components.filter((c) => me.items.includes(c));
    const price = def.cost - consumes.reduce((s, c) => s + (this.cat.item(c)?.cost ?? 0), 0);
    let budget = this.souls;
    if (sell && me.items.includes(sell)) budget += Math.floor((this.cat.item(sell)?.cost ?? 0) * this.cat.rules.sellRefundFraction.value);
    if (price > budget) return false;
    if (sell && me.items.includes(sell)) { me.items = me.items.filter((i) => i !== sell); this.souls = budget; }
    this.souls -= price;
    this.applyBuy(me, item);
    this.emitSnapshot(this.snapshot());
    return true;
  }

  reportProblem(enemyKey: string, kind: ReportedProblem['kind']) {
    this.problems.push({ enemyKey, kind, at: Date.now() });
    this.emitSnapshot(this.snapshot());
  }

  snapshot(): ProviderSnapshot {
    const now = Date.now();
    return {
      source: 'demo', matchId: this.matchId, receivedAt: now, gameTime: this.t, gameMode: 'Demo',
      players: this.players.map((p) => ({
        key: p.key, isMe: p.isMe, team: p.team, heroClass: p.hero, kills: p.k, deaths: p.d, assists: p.a,
        netWorth: Math.round(p.nw), items: [...p.items], itemsComplete: true,
        spendableSouls: p.isMe ? Math.round(this.souls) : undefined,
      })),
      extraSlotsByTeam: { 0: this.scenario.extraSlots },
      reportedProblems: this.problems,
      purchasesKnown: true,
    };
  }
}
