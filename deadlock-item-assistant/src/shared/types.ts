// Normalisierter Matchzustand und Engine-Ausgaben. Alle Datenprovider liefern
// ProviderSnapshot; der MatchStore macht daraus einen validierten MatchState.

export type SourceId = 'demo' | 'manual' | 'spectator';

/** observed = direkt gemeldet; derived = aus anderen Werten abgeleitet; stale = zu alt; unknown = nicht verfügbar. */
export type Availability = 'observed' | 'derived' | 'stale' | 'unknown';

export interface Obs<T> {
  value: T | null;
  status: Availability;
  source: SourceId | 'engine' | null;
  /** Wanduhr (ms) des Empfangs */
  observedAt: number | null;
  /** Spielzeit (s) laut Quelle, falls bekannt */
  gameTime?: number | null;
}

export const unknownObs = <T>(): Obs<T> => ({ value: null, status: 'unknown', source: null, observedAt: null });

export type Team = 0 | 1;

// ---------------- Provider → Store ----------------

export interface ProviderPlayer {
  /** Stabiler Schlüssel (Steam-Account-ID oder Demo-/Manuell-Schlüssel). */
  key: string;
  isMe?: boolean;
  team?: Team;
  heroClass?: string;
  heroId?: number;
  name?: string;
  level?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  /** Gesamtwert aus Souls (m_iGoldNetWorth). NICHT das ausgebbare Budget. */
  netWorth?: number;
  /** Aktuell ausgebbare Souls. Nur wenn die Quelle das ausdrücklich liefert (manuell/Demo). */
  spendableSouls?: number;
  /** Zeitpunkt (Wanduhr), zu dem spendableSouls beobachtet/eingegeben wurde, falls abweichend vom Snapshot */
  spendableSoulsAt?: number;
  /** Aktueller Besitz als Klassennamen. undefined = unbekannt (NICHT leer). */
  items?: string[];
  /** true = items ist eine vollständige Momentaufnahme des Besitzes. */
  itemsComplete?: boolean;
  /** Unbekannte Item-IDs aus der Quelle (Diagnose). */
  unknownItemIds?: number[];
  /** Gesamtschaden gegen alle Helden (nicht gegen mich!). */
  heroDamageTotal?: number;
}

export interface DamageWindowEntry {
  playerKey: string;
  bullet?: number;
  spirit?: number;
  melee?: number;
  total: number;
}

export interface ProviderSnapshot {
  source: SourceId;
  matchId: string | null;
  receivedAt: number;
  /** Spielzeit (s) des Snapshots laut Quelle */
  gameTime?: number | null;
  /** Bekannte Verzögerung der Quelle gegenüber dem Spiel in Sekunden (z. B. Spectator). */
  sourceLagSec?: number;
  gameMode?: string;
  players: ProviderPlayer[];
  /** Freigeschaltete Zusatzslots je Team (m_nFlexSlotsUnlocked), falls bekannt */
  extraSlotsByTeam?: Partial<Record<Team, number>>;
  /** Schaden gegen MICH in einem klar begrenzten Zeitfenster. */
  damageToMe?: { windowSec: number; entries: DamageWindowEntry[] };
  /** Vom Nutzer gemeldete Probleme (Kurz-Eingabe) */
  reportedProblems?: ReportedProblem[];
  /** true nur, wenn die Quelle neue Items als tatsächliche Käufe zum Zeitpunkt des Snapshots kennt (Demo-Skript, manuelle Eingabe) */
  purchasesKnown?: boolean;
}

export interface ReportedProblem {
  enemyKey: string;
  kind: 'cc' | 'burst' | 'sustain';
  at: number;
}

// ---------------- Store ----------------

export type ItemEventKind = 'initial' | 'new-detected' | 'purchased' | 'upgraded' | 'no-longer-seen';

export interface ItemEvent {
  playerKey: string;
  kind: ItemEventKind;
  item: string;
  /** Bei Upgrades: verbrauchte Komponenten */
  consumed?: string[];
  at: number;
  gameTime: number | null;
  source: SourceId;
}

export interface PlayerState {
  key: string;
  isMe: boolean;
  team: Obs<Team>;
  heroClass: Obs<string>;
  name: string | null;
  level: Obs<number>;
  kills: Obs<number>;
  deaths: Obs<number>;
  assists: Obs<number>;
  netWorth: Obs<number>;
  spendableSouls: Obs<number>;
  items: Obs<string[]>;
  /** Items, die im letzten vollständigen Snapshot fehlten, aber noch nicht als entfernt bestätigt sind */
  pendingRemoval: Record<string, number>;
  itemHistory: ItemEvent[];
  unknownItemIds: number[];
  heroDamageTotal: Obs<number>;
}

export interface MatchState {
  matchId: string | null;
  source: SourceId | null;
  gameMode: string | null;
  gameTime: Obs<number>;
  sourceLagSec: number | null;
  myKey: string | null;
  players: Record<string, PlayerState>;
  extraSlots: Obs<number>;
  damageToMe: Obs<{ windowSec: number; entries: DamageWindowEntry[] }>;
  reportedProblems: ReportedProblem[];
  lastUpdateAt: number | null;
  /** Diagnose */
  stats: { snapshots: number; rejectedOutOfOrder: number; duplicates: number; matchResets: number };
  events: ItemEvent[];
}

// ---------------- Engine ----------------

export type NeedKey =
  | 'bulletDefense' | 'spiritDefense' | 'meleeDefense' | 'ccDefense' | 'antiHeal'
  | 'burstDefense' | 'offense' | 'mobility';

export interface ThreatFactor { label: string; value: number; provenance: Provenance }

export type Provenance = 'observed' | 'from-build' | 'from-hero-data' | 'curated' | 'reported' | 'damage-window';

export interface EnemyThreat {
  key: string;
  heroClass: string | null;
  heroName: string;
  /** 0..1, relative Relevanz für mich */
  threat: number;
  economy: { netWorth: number | null; ratioToAvg: number | null; source: Provenance | null };
  damageMix: { bullet: number; spirit: number; melee: number; provenance: Provenance };
  ccStrength: number;
  ccTypes: string[];
  sustain: number;
  sustainSources: string[];
  enabler: number;
  factors: ThreatFactor[];
}

export interface NeedVector { values: Record<NeedKey, number>; drivers: Record<NeedKey, { enemyKey: string; share: number }[]>; focus: NeedKey[] }

export interface ScoreTerm { key: string; label: string; value: number }

export interface CandidateScore {
  item: string;
  score: number;
  terms: ScoreTerm[];
  /** tatsächlicher Kaufbetrag nach Komponentenrabatt */
  price: number;
  consumes: string[];
  needsSlot: boolean;
  restricted: string | null;
}

export type PurchaseKind = 'buy' | 'save' | 'hold';

export interface Recommendation {
  kind: PurchaseKind;
  item: string | null;
  price: number | null;
  missing: number | null;
  etaSec: number | null;
  affordable: 'yes' | 'no' | 'unknown';
  consumes: string[];
  reasonShort: string;
  reasonsLong: string[];
  drawback: string | null;
  provenanceTags: string[];
  score: number;
}

export interface SwapSuggestion {
  sell: string;
  buy: string;
  refund: number;
  netCost: number;
  gain: string;
  loss: string;
  deltaScore: number;
}

export interface EnemyAlert {
  id: string;
  enemyKey: string;
  heroName: string;
  items: string[];
  wording: 'neu erkannt' | 'gekauft' | 'Upgrade erkannt';
  consequence: string;
  changedRecommendation: string | null;
  at: number;
  relevance: number;
}

export interface AdvisorOutput {
  generatedAt: number;
  status: 'ok' | 'limited' | 'stale' | 'no-data';
  statusText: string;
  buyNow: Recommendation | null;
  saveFor: Recommendation | null;
  primary: 'buy' | 'save' | 'none';
  primaryReason: string;
  swap: SwapSuggestion | null;
  swapNote: string | null;
  threats: EnemyThreat[];
  needs: NeedVector;
  ranking: CandidateScore[];
  slots: { used: number; total: number | null; totalStatus: Availability; activeUsed: number; activeTotal: number };
  budget: Obs<number>;
  warnings: string[];
}
