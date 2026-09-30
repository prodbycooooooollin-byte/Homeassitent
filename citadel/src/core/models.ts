// Versionierte Datenmodelle, die Desktop-App, Browser-Version und Backend teilen.

export const MODEL_VERSION = 1;

/** Ein nicht ermittelbarer Wert ist ausdrücklich null + Grund – nie ein geratener Wert. */
export interface Probe<T> {
  value: T | null;
  source: string;
  note?: string;
}

export interface Installation {
  id: string;
  /** Wurzel der Deadlock-Installation (…/steamapps/common/Deadlock). */
  root: string;
  libraryPath: string | null;
  appId: 1422450;
  buildId: string | null;
  lastUpdated: string | null;
  detectedVia: 'steam-library' | 'manual';
  files: { kind: 'video.txt' | 'gameinfo.gi' | 'autoexec.cfg'; relPath: string; exists: boolean }[];
  /** Weitere vorhandene .cfg-Dateien im cfg-Ordner (nur angezeigt). */
  otherCfgs: string[];
}

export interface GpuInfo {
  name: string;
  vendor: 'nvidia' | 'amd' | 'intel' | 'other';
  vramMb: number | null;
  vramNote?: string;
  driverVersion: string | null;
  driverDate: string | null;
  pnpId?: string;
}

export interface DisplayInfo {
  name: string;
  primary: boolean;
  currentWidth: number | null;
  currentHeight: number | null;
  currentHz: number | null;
  maxHzAtCurrentRes: number | null;
  modes: { w: number; h: number; hz: number }[];
}

export interface HardwareSnapshot {
  schema: number;
  capturedAt: string;
  method: 'windows-native' | 'manual' | 'browser';
  cpu: Probe<{ name: string; cores: number | null; threads: number | null }>;
  gpus: Probe<GpuInfo[]>;
  /** Vom Nutzer gewählte oder eindeutig ermittelte aktive GPU (Index in gpus). */
  activeGpuIndex: number | null;
  ramTotalMb: Probe<number>;
  ramUsedMb: Probe<number>;
  os: Probe<{ name: string; version: string; build: string | null }>;
  displays: Probe<DisplayInfo[]>;
  laptop: Probe<boolean>;
  powerPlan: Probe<string>;
}

export interface BackupEntry {
  id: string;
  createdAt: string;
  installationId: string;
  buildId: string | null;
  reason: string;
  files: { kind: string; relPath: string; sha256: string | null; existed: boolean; size: number }[];
  changeSummary: string[];
  /** Vom Nutzer als funktionierend bestätigt oder durch Spielstart-Prüfung belegt. */
  working?: { at: string; how: 'user' | 'game-kept-values' };
}

export type ApplyStage = 'saved' | 'readback-verified' | 'restart-required' | 'game-confirmed' | 'measured';

export interface ApplyResult {
  ok: boolean;
  changeSetId: string;
  backupId: string | null;
  files: { kind: string; relPath: string; newSha256: string | null; readbackOk: boolean }[];
  stages: ApplyStage[];
  error?: { code: 'conflict' | 'game-running' | 'io' | 'path' | 'rolled-back' | 'invalid'; message: string; paths?: string[] };
}

// ---------------------------------------------------------------- Öffentliche Spielerdaten (API v1)

export type PlayerCategory = 'pro' | 'high-rank' | 'unbekannt';
export type SourceType = 'primary' | 'third-party' | 'manual';
export type ValidationStatus = 'valid' | 'invalid' | 'unclear';
export type ObservationOrigin = 'auto-primary' | 'third-party' | 'manual-confirmed';

export interface PlayerIdentityDto {
  platform: string;
  handle: string;
  url: string | null;
  evidenceUrl: string;
  linkType: 'wiki-listed' | 'self-declared' | 'api-id';
}

export interface FieldValueDto {
  field: string;
  value: string;
  unit: string | null;
  context: string | null;
  origin: ObservationOrigin;
  sourceUrl: string;
  sourceType: SourceType;
  evidence: string;
  retrievedAt: string;
  publishedAt: string | null;
  extractorVersion: string;
  validation: ValidationStatus;
  /** Vom Spieler zuletzt bestätigt (nur wenn belegt). */
  playerConfirmedAt: string | null;
}

export interface PlayerDto {
  id: string;
  displayName: string;
  aliases: string[];
  category: PlayerCategory;
  categoryEvidence: string;
  identities: PlayerIdentityDto[];
  fields: FieldValueDto[];
  conflicts: { field: string; candidates: { value: string; sourceUrl: string; reason: string }[] }[];
  configArtifacts: ConfigArtifactDto[];
  firstSeenAt: string;
  lastRefreshedAt: string | null;
  isDemo: boolean;
}

export interface ConfigArtifactDto {
  id: string;
  url: string;
  fileName: string;
  kind: string;
  sha256: string;
  size: number;
  retrievedAt: string;
  attribution: string;
  license: string | null;
  /** 'player-original' nur bei belegter Zuordnung zum Spieler; sonst 'community-preset'. */
  relation: 'player-original' | 'community-preset';
  supportedValues: Record<string, string>;
  notAdopted: string[];
}

export interface ChangeEventDto {
  id: number;
  at: string;
  playerId: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  sourceUrl: string;
  kind: 'new' | 'changed' | 'conflict' | 'source-gone';
}

export interface CoverageDto {
  generatedAt: string;
  players: { total: number; pro: number; highRank: number; withAnyField: number };
  fields: Record<string, number>;
  sources: { id: string; name: string; status: string; lastSuccessAt: string | null; lastError: string | null; enabled: boolean; reason?: string }[];
  lastSuccessfulUpdate: string | null;
  searchActive: boolean;
  aiActive: boolean;
}
