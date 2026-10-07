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

/** Ein Spieler in der vollständigen Match-Summary. */
export interface MatchPlayer {
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

export interface MatchDetails {
  matchId: number;
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

export interface Rating {
  grade: Grade;
  /** 1.0 = Lobby-Durchschnitt */
  score: number;
  parts: { label: string; value: number; weight: number }[];
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
