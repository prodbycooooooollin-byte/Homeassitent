import { BrowserWindow, session, shell } from 'electron';
import type { RoomMode, PoolSubmission } from '@liked/protocol';
import {
  buildIndex,
  demoLikes,
  DEMO_ACCOUNT_LABEL,
  indexHashes,
  likesFromVisibleLinks,
  pushRecentPlayed,
  selectCandidates,
  type AdapterId,
  type ConnectionStatus,
  type LikeIndex,
  type LikeIndexMeta
} from '@liked/tiktok-connectors';
import type { AppSettings, ClipListEntry, TikTokOverview } from '../src/shared/ipc-types.js';
import { likeIndexStore, listStore, secretStore } from './store.js';

/**
 * Verwaltet die TikTok-Verbindung im Hauptprozess.
 *
 * - Offizieller Adapter: spricht nur mit dem eigenen Auth-Dienst (Server). Die
 *   Anmeldung erfolgt im System-Browser direkt bei TikTok; der Client sieht nie
 *   Tokens, nur ein lokales Gerätegeheimnis (DPAPI-verschlüsselt).
 * - Experimenteller Web-Adapter: separate, isolierte TikTok-Webansicht, in der sich
 *   der Nutzer selbst anmeldet. Es werden nur sichtbare Video-Links des
 *   „Gefällt mir“-Reiters gelesen. Nicht verifiziert → standardmäßig deaktiviert.
 * Demo-Daten sind vollständig getrennt und werden nie als Account-Import geführt.
 */
const WEB_PARTITION = 'persist:tiktok-web';

export class TikTokManager {
  private status: ConnectionStatus = { kind: 'disconnected' };
  private officialConfigured: boolean | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private webWindow: BrowserWindow | null = null;
  private webCollected = new Map<string, number>();
  private webHandle: string | null = null;
  private webTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly emit: (o: TikTokOverview) => void
  ) {}

  private get server(): string {
    return this.getSettings().serverUrl.replace(/\/$/, '');
  }

  private indexMeta(): LikeIndexMeta | null {
    const i = likeIndexStore.load();
    if (!i || i.source !== 'tiktok') return null;
    return { source: i.source, adapter: i.adapter, count: i.likes.length, syncedAt: i.syncedAt, accountLabel: i.accountLabel };
  }

  overview(): TikTokOverview {
    return {
      status: this.status,
      index: this.indexMeta(),
      officialConfigured: this.officialConfigured,
      experimentalEnabled: this.getSettings().experimentalWebAdapter
    };
  }

  private set(s: ConnectionStatus): TikTokOverview {
    this.status = s;
    const o = this.overview();
    this.emit(o);
    return o;
  }

  private async api(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET'): Promise<{ status: number; body: any }> {
    const secret = secretStore.get();
    const res = await fetch(`${this.server}${path}`, {
      method,
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(15_000)
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 503 && body?.error === 'not_configured') this.officialConfigured = false;
    else if (res.status < 500) this.officialConfigured = true;
    return { status: res.status, body };
  }

  /** Beim Start: bestehende Verbindung wiederherstellen, ohne erneute Anmeldung. */
  async restore(): Promise<void> {
    const idx = this.indexMeta();
    if (idx?.adapter === 'web-experimental') {
      this.set({ kind: 'ready', account: { displayName: idx.accountLabel, adapter: 'web-experimental' }, clipCount: idx.count, lastSyncAt: idx.syncedAt });
      return;
    }
    if (!secretStore.get()) {
      if (idx) this.set({ kind: 'ready', account: { displayName: idx.accountLabel, adapter: idx.adapter }, clipCount: idx.count, lastSyncAt: idx.syncedAt });
      return;
    }
    await this.refreshOfficial().catch(() => {
      this.set({ kind: 'error', account: null, message: 'Server nicht erreichbar.', retryable: true });
    });
  }

  private async refreshOfficial(): Promise<TikTokOverview> {
    const { status, body } = await this.api('/api/tiktok/status');
    if (status === 503) return this.set({ kind: 'unsupported', reason: 'adapter_unavailable', detail: 'Der Server hat keine TikTok-Freigabe konfiguriert.' });
    if (status >= 400) return this.set({ kind: 'error', account: null, message: 'Status konnte nicht abgefragt werden.', retryable: true });
    const account = body.account ? { displayName: String(body.account.displayName), adapter: 'portability' as const } : null;
    const idx = this.indexMeta();
    switch (body.state) {
      case 'none':
        return this.set({ kind: 'disconnected' });
      case 'authorizing':
        return this.set({ kind: 'authorizing', adapter: 'portability' });
      case 'connected':
        if (idx && account) return this.set({ kind: 'ready', account, clipCount: idx.count, lastSyncAt: idx.syncedAt });
        return this.set({ kind: 'connected_no_likes', account: account ?? { displayName: 'TikTok-Account', adapter: 'portability' } });
      case 'syncing':
        this.schedulePoll(15_000);
        return this.set({
          kind: 'syncing',
          account: account ?? { displayName: 'TikTok-Account', adapter: 'portability' },
          stage: body.sync?.stage ?? 'preparing',
          startedAt: body.sync?.startedAt ?? Date.now(),
          nextCheckAt: body.sync?.nextCheckAt ?? undefined
        });
      case 'ready':
        return this.fetchLikes(account);
      case 'expired':
        return this.set({ kind: 'expired', account });
      case 'unsupported':
        return this.set({ kind: 'unsupported', reason: 'not_approved', detail: body.error ?? undefined });
      default:
        return this.set({ kind: 'error', account, message: body.error ?? 'Unbekannter Fehler', retryable: true });
    }
  }

  private async fetchLikes(account: { displayName: string; adapter: 'portability' } | null): Promise<TikTokOverview> {
    const { body } = await this.api('/api/tiktok/likes');
    const idx = this.indexMeta();
    if (Array.isArray(body.likes)) {
      const likes = (body.likes as { id: string; t?: number }[]).filter((l) => /^\d{6,25}$/.test(l.id));
      if (likes.length === 0) {
        return this.set({
          kind: 'error',
          account,
          message: 'Der Import war erfolgreich, enthielt aber keine verfügbaren Likes.',
          retryable: true
        });
      }
      const label = account?.displayName ?? 'TikTok-Account';
      const index = buildIndex(
        { source: 'tiktok', adapter: 'portability', accountLabel: label, syncedAt: body.syncedAt ?? Date.now() },
        likes.map((l) => ({ videoId: l.id, likedAt: l.t }))
      );
      likeIndexStore.save(index);
      return this.set({ kind: 'ready', account: { displayName: label, adapter: 'portability' }, clipCount: index.likes.length, lastSyncAt: index.syncedAt });
    }
    if (idx) return this.set({ kind: 'ready', account: account ?? { displayName: idx.accountLabel, adapter: 'portability' }, clipCount: idx.count, lastSyncAt: idx.syncedAt });
    return this.set({ kind: 'connected_no_likes', account: account ?? { displayName: 'TikTok-Account', adapter: 'portability' } });
  }

  private schedulePoll(ms: number): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.refreshOfficial().catch(() => this.schedulePoll(Math.min(ms * 2, 120_000)));
    }, ms);
  }

  async connect(adapter: AdapterId): Promise<TikTokOverview> {
    if (adapter === 'web-experimental') return this.connectWeb();
    if (adapter !== 'portability') return this.overview();
    try {
      // Erst prüfen, ob der Server den offiziellen Adapter überhaupt anbietet.
      const health = await fetch(`${this.server}/healthz`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
      if (!health) return this.set({ kind: 'error', account: null, message: 'Server nicht erreichbar.', retryable: true });
      if (health.tiktokOfficialAdapter !== 'configured') {
        this.officialConfigured = false;
        return this.set({ kind: 'unsupported', reason: 'adapter_unavailable' });
      }
      if (!secretStore.get()) {
        try {
          secretStore.create();
        } catch {
          return this.set({ kind: 'error', account: null, message: 'Sichere Speicherung ist auf diesem System nicht verfügbar.', retryable: false });
        }
      }
      const { status, body } = await this.api('/api/tiktok/login', 'POST');
      if (status === 503) return this.set({ kind: 'unsupported', reason: 'adapter_unavailable', detail: 'Der Server hat keine TikTok-Freigabe konfiguriert.' });
      if (status !== 200 || typeof body.authorizeUrl !== 'string' || !body.authorizeUrl.startsWith('https://www.tiktok.com/')) {
        return this.set({ kind: 'error', account: null, message: 'Anmeldung konnte nicht gestartet werden.', retryable: true });
      }
      await shell.openExternal(body.authorizeUrl);
      this.set({ kind: 'authorizing', adapter: 'portability' });
      this.pollAuthorization(Date.now());
      return this.overview();
    } catch {
      return this.set({ kind: 'error', account: null, message: 'Server nicht erreichbar.', retryable: true });
    }
  }

  private pollAuthorization(startedAt: number): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      const o = await this.refreshOfficial().catch(() => null);
      if (o?.status.kind === 'authorizing' && Date.now() - startedAt < 10 * 60_000) this.pollAuthorization(startedAt);
      else if (o?.status.kind === 'authorizing') this.set({ kind: 'disconnected' });
    }, 3000);
  }

  async sync(): Promise<TikTokOverview> {
    const current = this.status;
    if (current.kind === 'ready' && current.account.adapter === 'web-experimental') return this.syncWeb();
    if (current.kind === 'connected_no_likes' && current.account.adapter === 'web-experimental') return this.syncWeb();
    try {
      const { status, body } = await this.api('/api/tiktok/sync', 'POST');
      if (status === 503) return this.set({ kind: 'unsupported', reason: 'adapter_unavailable' });
      if (body.error === 'not_connected') return this.set({ kind: 'disconnected' });
      return this.refreshOfficial();
    } catch {
      // Alte, funktionierende Daten bleiben erhalten.
      return this.set({ kind: 'error', account: 'account' in current ? current.account : null, message: 'Synchronisierung fehlgeschlagen.', retryable: true });
    }
  }

  async cancel(): Promise<TikTokOverview> {
    if (this.webWindow) {
      this.closeWeb();
      return this.restoreAfterCancel();
    }
    await this.api('/api/tiktok/sync/cancel', 'POST').catch(() => null);
    return this.refreshOfficial().catch(() => this.overview());
  }

  private restoreAfterCancel(): TikTokOverview {
    const idx = this.indexMeta();
    if (idx) return this.set({ kind: 'ready', account: { displayName: idx.accountLabel, adapter: idx.adapter }, clipCount: idx.count, lastSyncAt: idx.syncedAt });
    return this.set({ kind: 'disconnected' });
  }

  /** Verbindung trennen: Server widerruft Tokens; lokal werden Geheimnis, Web-Sitzung und Index gelöscht. */
  async disconnect(): Promise<TikTokOverview> {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.closeWeb();
    if (secretStore.get()) await this.api('/api/tiktok/connection', 'DELETE').catch(() => null);
    secretStore.clear();
    await session.fromPartition(WEB_PARTITION).clearStorageData().catch(() => undefined);
    likeIndexStore.clear();
    return this.set({ kind: 'disconnected' });
  }

  /* ------------------------------------------------------------ */
  /* Experimenteller Web-Adapter                                  */
  /* ------------------------------------------------------------ */

  private openWebWindow(url: string): BrowserWindow {
    if (this.webWindow && !this.webWindow.isDestroyed()) {
      void this.webWindow.loadURL(url);
      this.webWindow.focus();
      return this.webWindow;
    }
    const w = new BrowserWindow({
      width: 1100,
      height: 820,
      title: 'TikTok – experimenteller Import (LIKED)',
      autoHideMenuBar: true,
      webPreferences: {
        partition: WEB_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });
    // Nur TikTok-Seiten in diesem Fenster; alles andere im System-Browser.
    w.webContents.setWindowOpenHandler(({ url: u }) => {
      if (/^https:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(u)) void w.loadURL(u);
      return { action: 'deny' };
    });
    w.webContents.on('will-navigate', (e, u) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(u)) e.preventDefault();
    });
    w.on('closed', () => {
      this.webWindow = null;
      if (this.webTimer) clearInterval(this.webTimer);
      this.webTimer = null;
    });
    void w.loadURL(url);
    this.webWindow = w;
    return w;
  }

  private closeWeb(): void {
    if (this.webTimer) clearInterval(this.webTimer);
    this.webTimer = null;
    if (this.webWindow && !this.webWindow.isDestroyed()) this.webWindow.close();
    this.webWindow = null;
  }

  private async connectWeb(): Promise<TikTokOverview> {
    if (!this.getSettings().experimentalWebAdapter) return this.set({ kind: 'unsupported', reason: 'experimental_disabled' });
    this.openWebWindow('https://www.tiktok.com/login');
    this.set({ kind: 'authorizing', adapter: 'web-experimental' });
    // Anmeldung erkennen, ohne Cookie-Werte zu lesen oder weiterzugeben.
    if (this.webTimer) clearInterval(this.webTimer);
    this.webTimer = setInterval(async () => {
      const cookies = await session.fromPartition(WEB_PARTITION).cookies.get({ domain: 'tiktok.com', name: 'sessionid' }).catch(() => []);
      if (cookies.length > 0) {
        if (this.webTimer) clearInterval(this.webTimer);
        this.webTimer = null;
        this.set({ kind: 'connected_no_likes', account: { displayName: 'TikTok (Web, experimentell)', adapter: 'web-experimental' } });
      }
    }, 1500);
    return this.overview();
  }

  private async syncWeb(): Promise<TikTokOverview> {
    if (!this.getSettings().experimentalWebAdapter) return this.set({ kind: 'unsupported', reason: 'experimental_disabled' });
    const w = this.openWebWindow('https://www.tiktok.com/');
    this.webCollected.clear();
    const startedAt = Date.now();
    const account = { displayName: 'TikTok (Web, experimentell)', adapter: 'web-experimental' as const };
    this.set({ kind: 'syncing', account, stage: 'collecting', startedAt, found: 0 });
    if (this.webTimer) clearInterval(this.webTimer);
    this.webTimer = setInterval(async () => {
      if (w.isDestroyed()) return;
      // Liest nur sichtbare Links, wenn der „Gefällt mir“-Reiter des eigenen Profils aktiv ist.
      const snap = (await w.webContents
        .executeJavaScript(
          `(() => {
            const tab = [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map(t => (t.textContent||'').trim().toLowerCase());
            const liked = tab.some(t => t.includes('gefällt') || t.includes('liked') || t.includes('likes'));
            const m = location.pathname.match(/^\\/@([^/]+)/);
            const hrefs = liked ? [...document.querySelectorAll('a[href*="/video/"]')].map(a => a.href).slice(0, 2000) : [];
            return { liked, handle: m ? m[1] : null, hrefs };
          })()`,
          true
        )
        .catch(() => null)) as { liked: boolean; handle: string | null; hrefs: string[] } | null;
      if (!snap || !snap.liked) return;
      this.webHandle = snap.handle;
      for (const id of likesFromVisibleLinks(snap.hrefs, snap.handle)) if (!this.webCollected.has(id)) this.webCollected.set(id, Date.now());
      this.set({ kind: 'syncing', account, stage: 'collecting', startedAt, found: this.webCollected.size });
    }, 1500);
    return this.overview();
  }

  async commitCollected(): Promise<TikTokOverview> {
    if (this.webCollected.size === 0) return this.overview();
    const label = this.webHandle ? `@${this.webHandle} (Web, experimentell)` : 'TikTok (Web, experimentell)';
    // Reihenfolge der Anzeige entspricht grob der Like-Reihenfolge; ohne echtes Datum.
    const likes = [...this.webCollected.keys()].map((id) => ({ videoId: id }));
    const index = buildIndex({ source: 'tiktok', adapter: 'web-experimental', accountLabel: label, syncedAt: Date.now() }, likes);
    likeIndexStore.save(index);
    this.closeWeb();
    return this.set({ kind: 'ready', account: { displayName: label, adapter: 'web-experimental' }, clipCount: index.likes.length, lastSyncAt: index.syncedAt });
  }

  /* ------------------------------------------------------------ */
  /* Spieldaten                                                   */
  /* ------------------------------------------------------------ */

  sample(n: number): { id: string; t?: number }[] {
    return (likeIndexStore.load()?.likes ?? []).slice(0, Math.max(1, Math.min(n, 20)));
  }

  listClips(): ClipListEntry[] {
    const excluded = new Set(listStore.excluded());
    return (likeIndexStore.load()?.likes ?? []).slice(0, 500).map((l) => ({ ...l, excluded: excluded.has(l.id) }));
  }

  setExcluded(id: string, on: boolean): void {
    const set = new Set(listStore.excluded());
    if (on) set.add(id);
    else set.delete(id);
    listStore.saveExcluded([...set].slice(0, 5000));
  }

  async buildPool(mode: RoomMode, salt: string): Promise<PoolSubmission | { error: 'no_data' | 'not_ready' }> {
    const recent = new Set(listStore.recent());
    const excluded = new Set(listStore.excluded());
    let index: LikeIndex | null;
    if (mode === 'demo') {
      const s = this.getSettings();
      index = buildIndex(
        { source: 'demo', adapter: 'demo', accountLabel: DEMO_ACCOUNT_LABEL, syncedAt: Date.now() },
        demoLikes(s.profile.deviceId, 200)
      );
    } else {
      index = likeIndexStore.load();
      if (!index || index.source !== 'tiktok') return { error: 'no_data' };
    }
    const candidates = selectCandidates(index, { recentPlayed: recent, excluded, max: 40 });
    return {
      source: index.source,
      candidates,
      indexHashes: mode === 'demo' ? [] : await indexHashes(index, salt),
      totalAvailable: index.likes.length
    };
  }

  recordPlayed(ids: string[]): void {
    listStore.saveRecent(pushRecentPlayed(listStore.recent(), ids.filter((i) => typeof i === 'string').slice(0, 20)));
  }

  dispose(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.closeWeb();
  }
}
