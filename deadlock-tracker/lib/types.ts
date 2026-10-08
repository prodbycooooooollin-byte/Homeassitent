export type TeamId = 0 | 1;

/** Ein Eintrag aus der Match-Historie eines Spielers (sofort nach dem Spiel verfügbar). */
export interface HistoryEntry {
  matchId: number;
  accountId: number;
  heroId: number;
  startTime: number; // unix s
  durationS: number;
  won: boolean;
  team: TeamId;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  heroLevel: number;
  abandoned: boolean;
  /** Lesbarer Modus, z. B. "Ranked" oder "Street Brawl". */
  matchMode?: string;
  gameMode?: string;
  /** Rang-Badge des Spielers nach dem Match (tier*10+subrank), falls bekannt. */
  badge?: number | null;
  rankedDelta?: number | null;
}

/** Zeitreihe eines Spielers (auf ≤ 40 Punkte reduziert); alle Arrays gleich lang. */
export interface PlayerTimeline {
  t: number[]; // Sekunden
  nw: number[]; // Souls (Net Worth)
  k: number[];
  d: number[];
  a: number[];
  dmg: number[]; // Heldenschaden (kumuliert)
  heal: number[]; // Heilung (kumuliert)
  taken: number[]; // erlittener Schaden (kumuliert)
}
export interface PlayerDeath { t: number; killerSlot?: number; durS?: number }
export interface PlayerItem { id: number; t: number; sold?: number }

/** Ein Spieler in der vollständigen Match-Summary. */
export interface MatchPlayer {
  /** Heilung + Schilde, die an Mitspieler gingen (teammate_healing + teammate_barriering) – undefined bei älteren Daten */
  allyHealing?: number;
  /** Verhinderter Schaden (damage_mitigated) */
  mitigated?: number;
  /** Lobby-Slot (für Zuordnung von Killern) */
  slot?: number;
  /** Zugewiesene Lane (Farbcode laut Valve: 1 Gelb, 3 Grün, 4 Blau, 6 Lila) */
  lane?: number;
  mvpRank?: number;
  /** Summe der Todeszeiten in Sekunden */
  deadTimeS?: number;
  timeline?: PlayerTimeline;
  deathLog?: PlayerDeath[];
  items?: PlayerItem[];
  accountId: number;
  name?: string;
  avatar?: string;
  team: TeamId;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  level: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  heroDamage: number;
  objectiveDamage: number;
  healing: number;
  damageTaken: number;
  /** Rang-Badge (Tier*10 + Subtier) falls bekannt. */
  badge: number | null;
  abandoned: boolean;
}

export interface MatchObjective { id: number; /** Team, dem das Gebäude gehörte */ team: TeamId; t: number }

export interface MatchDetails {
  /** Schema-Version der Details (2 = mit Zeitreihen, Items, Lanes, Objectives) */
  v?: number;
  matchId: number;
  objectives?: MatchObjective[];
  midBoss?: { team: TeamId; t: number }[];
  startTime: number;
  durationS: number;
  winningTeam: TeamId | null;
  matchMode?: string;
  gameMode?: string;
  /** Durchschnittliches Badge je Team (Tier*10+Subtier, ggf. mit Nachkomma nicht möglich). */
  avgBadge: [number | null, number | null];
  players: MatchPlayer[];
}

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export type RoleKey = "carry" | "support" | "tank" | "pusher" | "flex";
export type ComponentKey = "combat" | "utility" | "participation" | "survival" | "economy" | "objectives" | "lane";

/** Ein Baustein der Note – mit Wert, Gewicht und verständlicher Erklärung. */
export interface RatingComponent {
  key: ComponentKey;
  label: string;
  /** Verhältnis zum Vergleichswert (1.0 = gleich) – null, wenn nicht anwendbar */
  ratio: number | null;
  /** Bewertung des Bausteins (0–1.9, 1.0 = durchschnittlich) */
  score: number;
  /** Effektives Gewicht nach Rollen-Gewichtung (Summe = 1) */
  weight: number;
  /** Beitrag zur Gesamtnote (score × weight) */
  contribution: number;
  applicable: boolean;
  /** Konkreter Messwert, z. B. „7 Tode (Vergleich Ø 4.1)“ */
  detail: string;
}

export interface Rating {
  grade: Grade;
  /** 1.0 = durchschnittlich; > 1 besser als der Vergleich */
  score: number;
  role: { key: RoleKey; label: string; reason: string };
  components: RatingComponent[];
  /** Sieg/Niederlage-Anpassung */
  bonus: { label: string; value: number } | null;
  /** Erläuterungen (z. B. gedämpft wegen kurzem Match, Rolle) */
  notes: string[];
  /** Baustein-Scores in fester Reihenfolge (COMPONENT_ORDER) – für das Radar; nicht anwendbar = 1.0 */
  parts: number[];
}

/** Persistierter Match-Datensatz (ein Match kann von mehreren getrackten Accounts stammen). */
export interface MatchRecord {
  matchId: number;
  startTime: number;
  /** Historien-Einträge je getrackter Account (Stub, sofort verfügbar). */
  history: Record<string, HistoryEntry>;
  details?: MatchDetails;
  detailsAttempts: number;
  nextDetailsAttemptAt: number; // ms
  firstSeenAt: number; // ms – wann der Tracker das Match erstmals gesehen hat
  /** true, wenn das Match im laufenden Betrieb erkannt wurde (nicht beim Erst-Import). */
  detectedLive?: boolean;
  detailsAt?: number; // ms
  /** Letzter Fehler beim Laden der Details (für die Diagnose) */
  lastError?: string;
  /** Versuche, ältere Details auf das aktuelle Schema zu heben */
  upgradeTries?: number;
}

export interface TrackedPlayer {
  accountId: number;
  name: string;
  avatar?: string;
  addedAt: number;
  lastSyncAt?: number;
  lastSyncOk?: boolean;
  lastError?: string;
  lastNewMatchAt?: number;
  /** Aktueller Rang laut /v1/players/{id}/rank */
  rank?: { badge: number; at: number };
  /** Backoff bei Rate-Limit der Historie (ms-Zeitstempel) */
  historyBackoffUntil?: number;
}

export interface StoreShape {
  version: 1;
  players: Record<string, TrackedPlayer>;
  matches: Record<string, MatchRecord>;
}
