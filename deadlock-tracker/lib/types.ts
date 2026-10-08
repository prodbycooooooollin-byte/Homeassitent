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
/** Woher die Souls eines Spielers stammen (kumuliert über das Match; aus den gold_*-Statistiken) */
export interface SoulsBreakdown {
  /** Kills und Kill-Orbs */
  kills: number;
  /** Lane-Creeps (inkl. Orbs) */
  lane: number;
  /** Neutrale Camps (Jungle, inkl. Orbs) */
  neutral: number;
  /** Boss/Objectives (inkl. Orbs) */
  boss: number;
  /** Kisten/Breakables */
  treasure: number;
  /** Durch Denies erhalten */
  denied: number;
  /** Durch Tode verlorene Souls */
  lost: number;
}
export interface CreepStats { lane: number; possible: number; neutral: number }
export interface PlayerDeath { t: number; killerSlot?: number; durS?: number }
export interface PlayerItem { id: number; t: number; sold?: number }

/** Ein Spieler in der vollständigen Match-Summary. */
export interface MatchPlayer {
  /** Heilung + Schilde, die an Mitspieler gingen (teammate_healing + teammate_barriering) – undefined bei älteren Daten */
  allyHealing?: number;
  /** Verhinderter Schaden (damage_mitigated) */
  mitigated?: number;
  /** Trefferstatistik: Schüsse getroffen / verfehlt, Treffer auf Helden, davon Crits */
  shotsHit?: number;
  shotsMissed?: number;
  heroHits?: number;
  heroCrits?: number;
  souls?: SoulsBreakdown;
  creeps?: CreepStats;
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

/** Schema-Version der Match-Details: 5 = mit Zeitreihen, Items, Lanes, Objectives, Mitspieler-Heilung, Trefferstatistik und Soul-Quellen */
export const DETAILS_VERSION = 5;

export interface MatchDetails {
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
  /** Note mit Zusatz, z. B. "B+" oder "D−" */
  label: string;
  /** 1.0 = durchschnittlich; > 1 besser als der Vergleich */
  score: number;
  role: { key: RoleKey; label: string; reason: string };
  components: RatingComponent[];
  /** Sieg/Niederlage-Anpassung */
  bonus: { label: string; value: number } | null;
  /** Einordnung gegen das Rang-Niveau (nur wenn Referenzdaten vorliegen) */
  absolute?: { score: number; weight: number; rows: { label: string; mine: string; ref: string; score: number }[] };
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
  /** Gast: nur zum Ansehen geöffnet (zählt nie als „Ich“, wird selten synchronisiert, höchstens 5 gleichzeitig) */
  guest?: boolean;
  lastViewedAt?: number;
}

/** Vom Nutzer einstellbare Optionen (serverseitig gespeichert). */
export interface AppSettings {
  /** Abfrage-Takt der Match-Historie in Sekunden */
  pollIntervalS: number;
  /** Alle älteren Matches im Hintergrund vollständig nachladen (für Mitspieler, Analysen, Match-Tabs) */
  backfill: boolean;
  /** Benachrichtigung bei neu erkannten Matches */
  notifyNewMatch: boolean;
  /** Live-Match-Banner anzeigen */
  showLive: boolean;
  /** Nach einem neu erkannten Match den Vollbild-Debrief zeigen */
  debrief: boolean;
  /** Heldendarstellung im Debrief: Bild (hochgerechnet) oder 3D-Modell aus der Spiel-Installation */
  hero3d: "image" | "model";
  /** Visuelle Effekte: voll, reduziert (weniger Bewegung) oder aus */
  effects: "full" | "reduced" | "off";
  /** Kompakte Darstellung */
  density: "comfortable" | "compact";
  /** Anpassbares Profil-Banner (Übersicht) */
  profile: ProfileSettings;
}
/** Persönliche Banner-Einstellungen: Titel, Main-Held (null = automatisch), Kennzahlen, Abzeichen, Akzent ("auto" | "rank" | "hero" | #rrggbb). */
export interface ProfileSettings { title: string; mainHero: number | null; stats: string[]; badges: string[]; accent: string }
export const DEFAULT_PROFILE: ProfileSettings = { title: "", mainHero: null, stats: ["winrate", "kda", "score", "matches"], badges: [], accent: "auto" };
export const DEFAULT_SETTINGS: AppSettings = { pollIntervalS: 20, backfill: true, notifyNewMatch: true, showLive: true, debrief: true, hero3d: "image", effects: "full", density: "comfortable", profile: DEFAULT_PROFILE };

/** Per Steam-OpenID verifizierte Verbindung */
export interface SteamLink { steamId: string; accountId: number; verifiedAt: number }

/** Persönliches Trainingsziel: in `window` Matches mindestens `needed`-mal `target` erreichen. */
export interface Goal {
  id: string;
  metric: string;
  /** true = Wert muss <= Ziel sein (z. B. Tode), sonst >= */
  lowerIsBetter: boolean;
  target: number;
  needed: number;
  window: number;
  createdAt: number; // unix s – gezählt werden nur Matches danach
}

/** Durchschnitt eines abgeschlossenen Ranked-Matches auf einem Rang-Niveau */
export interface RefStats { k: number; d: number; a: number; nw: number; dmg: number; /** true = Durchschnitt genau dieses Helden auf diesem Rang */ hero?: boolean }

export interface StoreShape {
  version: 1;
  players: Record<string, TrackedPlayer>;
  matches: Record<string, MatchRecord>;
  settings?: Partial<AppSettings>;
  steam?: SteamLink;
  goals?: Goal[];
  /** Durchschnittswerte je Rang-Tier (aus der API, für die Einordnung gegen das Rang-Niveau) */
  refs?: Record<string, RefStats & { at: number }>;
}
