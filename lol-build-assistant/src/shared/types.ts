// Zentrale Domänentypen. Diese Datei hat keine Laufzeitabhängigkeiten und wird
// von Adapter, Engine, Simulation, Electron-Main und Tests gemeinsam genutzt.

export type DamageType = 'physical' | 'magic' | 'true';
export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';
export type TeamId = 'ORDER' | 'CHAOS';
export type TargetFocus = 'frontline' | 'backline' | 'balanced';

/**
 * Herkunft eines Werts. Die Engine trennt ausdrücklich:
 *  - observed: direkt aus einer Quelle gelesen (Live Client Data, manuelle Eingabe)
 *  - derived:  deterministisch aus beobachteten Werten berechnet
 *  - estimated: Schätzung mit bekannter Unsicherheit (z. B. Gegnerrüstung)
 *  - unknown:  nicht verfügbar – wird nicht erfunden
 */
export type DataKind = 'observed' | 'derived' | 'estimated' | 'unknown';
export type DataSource = 'live-client' | 'manual' | 'simulation' | 'profile' | 'patch-data' | 'engine';

export interface Provenance {
  kind: DataKind;
  source: DataSource;
  /** Wanduhrzeit (ms) der Beobachtung/Berechnung. */
  at: number;
  /** Spielzeit in Sekunden, falls bekannt. */
  gameTime?: number;
  /** Datensatz-/Patchkennung, gegen die der Wert interpretiert wurde. */
  patch?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Statistiken
// ---------------------------------------------------------------------------

export const STAT_KEYS = [
  'ad', 'ap', 'as', 'crit', 'critDamage', 'hp', 'armor', 'mr', 'mana', 'ah',
  'msFlat', 'msPct', 'lifesteal', 'omnivamp', 'lethality', 'armorPenPct',
  'magicPenFlat', 'magicPenPct', 'tenacity', 'healShieldPower',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** as = Bonus-Angriffstempo als Anteil (0.25 = 25 %). crit = Anteil 0..1. */
export type StatBlock = Partial<Record<StatKey, number>>;

export interface GrowthStats {
  hp: number; hpg: number;
  ar: number; arg: number;
  mr: number; mrg: number;
  ad?: number; adg?: number;
  as?: number; asg?: number; asRatio?: number;
  mana?: number; manag?: number;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemTier = 'basic' | 'epic' | 'legendary' | 'boots-basic' | 'boots' | 'consumable' | 'starter' | 'other';
export type ModelCoverage = 'full' | 'partial' | 'stats-only';

export type ItemEffect =
  | { type: 'apAmp'; value: number }
  | { type: 'baseAdPct'; value: number }
  | { type: 'onHitCurrentHp'; melee: number; ranged: number; damageType: DamageType }
  | { type: 'onHitFlat'; value: number; apRatio?: number; damageType: DamageType }
  | { type: 'everyNthHit'; n: number; baseMin: number; baseMax: number; bonusAdRatio?: number; missingHpAmpMax?: number; rangedMultiplier?: number; damageType: DamageType }
  | { type: 'burnMaxHp'; pctPerSec: number; durationSec: number; damageType: DamageType }
  | { type: 'armorShredStacking'; perStack: number; maxStacks: number }
  | { type: 'penRampInFight'; armorPenMax: number; magicPenMax: number; rampHits: number }
  | { type: 'grievousWounds'; value: number; application: 'damage' | 'hit-taken' }
  | { type: 'shieldReaver'; melee: number; ranged: number }
  | { type: 'spellblade'; baseAdRatio: number; apRatio: number; damageType: DamageType; cooldown: number }
  | { type: 'executeThreshold'; pct: number }
  | { type: 'maxHpBurst'; pct: number; cooldown: number; damageType: DamageType }
  | { type: 'damageSpike'; pctOfHp: number; bonus: number; damageType: DamageType }
  | { type: 'lowHpCritAmp'; threshold: number; amp: number }
  | { type: 'selfMaxHpOnHit'; pct: number; damageType: DamageType }
  | { type: 'lifeline'; shield: number; perLevel: number; vs: 'any' | 'magic' }
  | { type: 'stasis' }
  | { type: 'revive' }
  | { type: 'spellShield' }
  | { type: 'cleanse' }
  | { type: 'aaDamageReduction'; value: number }
  | { type: 'damageDelay'; value: number }
  | { type: 'critDamageReduction'; value: number }
  | { type: 'healAmp'; value: number }
  | { type: 'slowUtility'; strength: number }
  | { type: 'attackSpeedSlowAura'; value: number }
  | { type: 'multiTarget'; share: number; rangedOnly?: boolean; meleeOnly?: boolean }
  | { type: 'bonusResistInFight'; pct: number };

export interface ItemDef {
  id: number;
  name: string;
  /** Lokalisierter Name, falls über Patch-Sync oder Live-Daten verfügbar. */
  nameDe?: string;
  cost: number;
  recipe: number[];
  tier: ItemTier;
  tags: string[];
  /** Kaufbeschränkungsgruppen (z. B. "lastWhisper") – max. 1 Item je Gruppe. */
  groups?: string[];
  stats: StatBlock;
  effects?: ItemEffect[];
  coverage: ModelCoverage;
  unmodeled?: string[];
  rangedOnly?: boolean;
  meleeOnly?: boolean;
  /** Karten, auf denen das Item kaufbar ist (11 = Kluft der Beschwörer, 12 = ARAM). */
  maps?: number[];
}

export interface PatchManifest {
  id: string;
  /** Spielversionen (major.minor), für die dieser Datensatz fachlich geprüft wurde. */
  validatedGameVersions: string[];
  authoredAgainst: string;
  statsSource: string;
  mechanicsSource: string;
  reviewStatus: string;
  createdAt: string;
  notes?: string[];
}

export interface PatchData {
  manifest: PatchManifest;
  items: Map<number, ItemDef>;
  /** Basiswerte aller Champions (für Gegnerschätzungen), key = interner Championname. */
  championStats: Map<string, GrowthStats>;
  rules: CombatRules;
}

export interface CombatRules {
  version: string;
  provenance: string;
  baseCritDamage: number;
  attackSpeedCap: number;
  lethalityScalesWithLevel: boolean;
  grievousWoundsDefault: number;
  sellRatio: number;
  inventorySlots: number;
  statGrowth: { a: number; b: number };
  penetrationOrder: string[];
  cleansableCc: string[];
  nonCleansableCc: string[];
  tenacityIgnores: string[];
}

// ---------------------------------------------------------------------------
// Championwissen
// ---------------------------------------------------------------------------

export type ChampionClass =
  | 'tank' | 'juggernaut' | 'diver' | 'skirmisher' | 'assassin' | 'burstMage' | 'battleMage'
  | 'artillery' | 'marksman' | 'enchanter' | 'catcher' | 'specialist';

export type CcType = 'stun' | 'root' | 'knockup' | 'suppression' | 'charm' | 'taunt' | 'fear' | 'slow' | 'silence' | 'knockback' | 'polymorph' | 'sleep' | 'pull';

/** Grobes, versioniertes Wissen über JEDEN möglichen Gegner/Mitspieler. */
export interface ChampionKnowledge {
  key: string;
  name: string;
  cls: ChampionClass;
  /** 1 = reine Frontline, 0 = reine Backline. */
  line: number;
  ranged: boolean;
  dmg: { physical: number; magic: number; true: number };
  /** Anteil des Schadens aus Autoattacken (für Steelcaps/Randuin). */
  autoShare: number;
  /** 0..1 – wie stark das Schadensprofil auf Burst setzt. */
  burst: number;
  /** Fähigkeit, eine Backline zu erreichen, 0..1. */
  dive: number;
  heal: 0 | 1 | 2 | 3;
  shield: 0 | 1 | 2 | 3;
  cc: CcType[];
  notes?: string;
  /** Kit-Effekte, die Gegnerresistenzen unsicher machen. */
  resistUncertainty?: string;
}

export interface AbilityDef {
  name: string;
  damageType: DamageType;
  /** Grundschaden je Rang. */
  base?: number[];
  /** Grundschaden je Championlevel 1..18 (für Passive). */
  baseByLevel?: number[];
  adRatio?: number | number[];
  bonusAdRatio?: number | number[];
  apRatio?: number | number[];
  armorRatio?: number;
  bonusHpRatio?: number;
  targetMaxHpPct?: number | number[];
  targetMaxHpPctByLevel?: number[];
  targetMissingHpPct?: number | number[];
  /** Anteil des übrigen Combo-Schadens, der zusätzlich angewendet wird (Zed R). */
  markPct?: number[];
  cooldown?: number[];
  appliesOnHit?: boolean;
  canCrit?: boolean;
  triggersSpellblade?: boolean;
  /** Treffer pro Einsatz (z. B. Kugeln bei Syndra R). */
  hits?: number;
  maxRank: number;
  note?: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  duration: number;
  /** Anteil der Zeit, in der Autoattacken realistisch möglich sind. */
  autoUptime: number;
  weight: number;
  /** Feste Einsätze je Fähigkeit; "cd" = nach Abklingzeit innerhalb der Dauer. */
  casts: Record<string, number | 'cd'>;
  /** Multiplikator auf Autoattackschaden (z. B. Jinx-Raketen), mit Begründung. */
  autoMultiplier?: number;
  /** Multiplikator auf Fähigkeiten (z. B. Darius R bei Stapeln). */
  abilityMultipliers?: Record<string, number>;
  /** Angenommener durchschnittlicher fehlender Lebensanteil des Ziels. */
  targetMissingHp: number;
  /**
   * Obergrenze für den Anteil der Ziel-LP (Overkill). Standard: 1,25 bei kurzen
   * Combos (≤ 4 s), ungedeckelt bei längeren Kämpfen, weil Schaden dort auf
   * weitere Ziele übergeht.
   */
  overkillCap?: number;
  note?: string;
}

export interface PlaystyleDef {
  id: string;
  name: string;
  description: string;
  roles: Role[];
  /** Grundgewichte der Kriterien; Defensive wird zusätzlich nach Bedrohung angepasst. */
  weights: { offense: number; defense: number; utility: number };
  itemTags: string[];
  extraCandidates: number[];
  excluded: number[];
  scenarios: ScenarioDef[];
  /** Wie gut der Champion in dieser Spielweise Front-/Backline realistisch erreicht. */
  targetAccess: { frontline: number; backline: number };
  manaNeed: number;
  synergies: { item: number; note: string }[];
}

export interface ChampionProfile {
  key: string;
  name: string;
  profileVersion: string;
  authoredAgainst: string;
  reviewStatus: string;
  supportLevel: 'supported' | 'partial';
  cls: ChampionClass;
  ranged: boolean;
  attackRange: number;
  resource: 'mana' | 'energy' | 'none' | 'fury';
  base: GrowthStats;
  /** Reihenfolge der Fähigkeitenmaximierung (ohne R). */
  skillOrder: ('Q' | 'W' | 'E')[];
  abilities: Record<string, AbilityDef>;
  /** Eigene passive Stat-Modifikatoren (z. B. Darius E Rüstungsdurchdringung). */
  selfMods?: { stat: StatKey; byRank?: number[]; ability?: string; pct?: boolean; value?: number; note: string }[];
  /** Nur im Kampf wirksame Kit-Buffs (z. B. Jinx-Minigun-Stapel), mit angenommener Uptime. */
  combatMods?: { stat: 'as'; ability: string; byRank: number[]; uptime: number; note: string }[];
  coverage: { modeled: string[]; unmodeled: string[] };
  playstyles: PlaystyleDef[];
  defaultPlaystyle: Partial<Record<Role, string>>;
}

// ---------------------------------------------------------------------------
// Normalisierter Matchzustand
// ---------------------------------------------------------------------------

export interface InventoryItem {
  itemId: number;
  count: number;
  slot: number;
  /** Anzeigename aus der Quelle (lokalisiert), falls vorhanden. */
  displayName?: string;
}

export interface PlayerState {
  id: string;           // Riot-ID oder Summonername
  championKey: string;  // interner Name, z. B. "MonkeyKing"
  championName: string;
  team: TeamId;
  position: Role | null;
  level: number;
  items: InventoryItem[];
  itemsProvenance: Provenance;
  scores: { kills: number; deaths: number; assists: number; creepScore: number };
  isDead: boolean;
  isBot: boolean;
  keystone?: string;
}

export interface ActivePlayerState {
  id: string;
  gold: number;
  level: number;
  /** Direkt beobachtete Werte inkl. Runen und Items; fehlt im Simulationsmodus. */
  stats?: StatBlock & { attackSpeedTotal?: number; critDamageTotal?: number };
  statsProvenance: Provenance;
  abilityRanks?: Partial<Record<'Q' | 'W' | 'E' | 'R', number>>;
}

export type FeedStatus = 'waiting' | 'live' | 'stale' | 'ended' | 'simulation' | 'error';

export interface MatchState {
  mode: 'live' | 'simulation';
  feed: { status: FeedStatus; lastSuccessAt?: number; lastErrorAt?: number; error?: string };
  gameTime: number;
  gameMode: string;
  mapNumber: number;
  /** Spielversion major.minor, falls ermittelbar; null = unbekannt. */
  gameVersion: string | null;
  gameVersionProvenance: Provenance;
  me: ActivePlayerState;
  players: PlayerState[];
  /** Beobachtete Goldrate (g/s) ohne Käufe, falls aus Verlauf ableitbar. */
  goldRate?: { value: number; provenance: Provenance };
}

// ---------------------------------------------------------------------------
// Benutzereinstellungen, die Entscheidungen beeinflussen
// ---------------------------------------------------------------------------

export type EnemyItemPolicy = 'manual' | 'live-client';

export interface AdvisorSettings {
  roleOverride: Role | null;
  playstyleOverride: string | null;
  targetFocus: TargetFocus;
  pinnedItem: number | null;
  enemyItemPolicy: EnemyItemPolicy;
  /** Relativer Vorsprung, den ein neuer Favorit benötigt. */
  switchMargin: number;
  /** Ab diesem Vorsprung wird sofort gewechselt. */
  urgentMargin: number;
  /** Anzahl aufeinanderfolgender stabiler Auswertungen vor einem regulären Wechsel. */
  stabilityPolls: number;
  horizonSec: number;
  strictPatch: boolean;
}

export const DEFAULT_SETTINGS: AdvisorSettings = {
  roleOverride: null,
  playstyleOverride: null,
  targetFocus: 'balanced',
  pinnedItem: null,
  enemyItemPolicy: 'manual',
  switchMargin: 0.06,
  urgentMargin: 0.2,
  stabilityPolls: 2,
  horizonSec: 240,
  strictPatch: false,
};
