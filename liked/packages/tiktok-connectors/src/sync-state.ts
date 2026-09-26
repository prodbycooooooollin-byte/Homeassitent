/**
 * Getrennte Zustände der TikTok-Verbindung. Nur ein erfolgreicher Import mit
 * bestätigter Anzahl führt zu `ready`. Login allein → `connected_no_likes`.
 */
export type AdapterId = 'portability' | 'web-experimental' | 'demo';

export interface ConnectedAccount {
  /** Anzeigename, wie von TikTok gemeldet (keine Tokens, keine Cookies). */
  displayName: string;
  adapter: AdapterId;
}

export type SyncStage = 'requesting' | 'preparing' | 'downloading' | 'extracting' | 'collecting';

export type ConnectionStatus =
  | { kind: 'disconnected' }
  | { kind: 'authorizing'; adapter: AdapterId }
  | { kind: 'connected_no_likes'; account: ConnectedAccount }
  | {
      kind: 'syncing';
      account: ConnectedAccount;
      stage: SyncStage;
      startedAt: number;
      /** Bisher gefundene Einträge (nur bei schrittweisen Adaptern). */
      found?: number;
      /** Nächste Statusprüfung bei TikTok (asynchrone Bereitstellung). */
      nextCheckAt?: number;
    }
  | { kind: 'ready'; account: ConnectedAccount; clipCount: number; lastSyncAt: number }
  | { kind: 'expired'; account: ConnectedAccount | null }
  | { kind: 'error'; account: ConnectedAccount | null; message: string; retryable: boolean }
  | {
      kind: 'unsupported';
      reason: 'region' | 'adapter_unavailable' | 'not_approved' | 'experimental_disabled';
      detail?: string;
    };

/**
 * Verfügbare Spieldaten sind unabhängig vom Verbindungsstatus: Ein fehlgeschlagener
 * Sync lässt einen älteren, erfolgreichen Index bestehen.
 */
export interface LikeIndexMeta {
  source: 'tiktok' | 'demo';
  adapter: AdapterId;
  count: number;
  syncedAt: number;
  accountLabel: string;
}

export function isPlayable(meta: LikeIndexMeta | null, minCount: number): boolean {
  return !!meta && meta.count >= minCount;
}
