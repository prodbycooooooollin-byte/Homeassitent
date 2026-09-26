import type { PoolSubmission, RoomMode } from '@liked/protocol';
import type { AdapterId, ConnectionStatus, LikeIndexMeta } from '@liked/tiktok-connectors';

/** Gemeinsame Typen der eng begrenzten IPC-Schnittstelle (Renderer ↔ Hauptprozess). */
export interface AppSettings {
  profile: { name: string; avatar: string; deviceId: string };
  serverUrl: string;
  audio: { music: number; sfx: number; musicMuted: boolean; sfxMuted: boolean; videoStartMuted: boolean };
  display: { fullscreen: boolean; reducedMotion: 'system' | 'on' | 'off'; effects: 'high' | 'low' };
  introSeen: boolean;
  /** Experimenteller lokaler Web-Adapter – standardmäßig aus, nicht verifiziert. */
  experimentalWebAdapter: boolean;
}

export interface TikTokOverview {
  status: ConnectionStatus;
  /** Lokal verfügbare, erfolgreich importierte Daten (bleiben bei Sync-Fehlern erhalten). */
  index: LikeIndexMeta | null;
  /** null = unbekannt (Server nicht erreichbar). */
  officialConfigured: boolean | null;
  experimentalEnabled: boolean;
}

export interface UpdateState {
  kind: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'unsupported';
  version?: string;
  notes?: string;
  percent?: number;
  message?: string;
}

export interface LocalServerState {
  running: boolean;
  port: number | null;
  addresses: string[];
  error?: string;
}

export interface ClipListEntry {
  id: string;
  t?: number;
  excluded: boolean;
}

export interface LikedApi {
  app: {
    info(): Promise<{ version: string; platform: string; packaged: boolean; smokeTest: boolean }>;
    smokeTestDone(ok: boolean): void;
    quit(): void;
  };
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
    wipeLocalData(): Promise<void>;
  };
  window: { setFullscreen(on: boolean): Promise<void> };
  shell: { openExternal(url: string): Promise<boolean> };
  tiktok: {
    overview(): Promise<TikTokOverview>;
    connect(adapter: AdapterId): Promise<TikTokOverview>;
    sync(): Promise<TikTokOverview>;
    cancel(): Promise<TikTokOverview>;
    /** Experimenteller Adapter: gesammelte Links übernehmen. */
    commitCollected(): Promise<TikTokOverview>;
    disconnect(): Promise<TikTokOverview>;
    sample(n: number): Promise<{ id: string; t?: number }[]>;
    listClips(): Promise<ClipListEntry[]>;
    setExcluded(id: string, excluded: boolean): Promise<void>;
    buildPool(mode: RoomMode, salt: string): Promise<PoolSubmission | { error: 'no_data' | 'not_ready' }>;
    recordPlayed(ids: string[]): Promise<void>;
    onStatus(cb: (o: TikTokOverview) => void): () => void;
  };
  updates: {
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    installOnQuit(): Promise<void>;
    onStatus(cb: (s: UpdateState) => void): () => void;
  };
  localServer: {
    start(port: number): Promise<LocalServerState>;
    stop(): Promise<LocalServerState>;
    status(): Promise<LocalServerState>;
  };
  lastRoom: {
    get(): Promise<{ serverUrl: string; code: string; token: string; at: number } | null>;
    set(v: { serverUrl: string; code: string; token: string; at: number } | null): Promise<void>;
  };
  onDeepLink(cb: (code: string) => void): () => void;
}
