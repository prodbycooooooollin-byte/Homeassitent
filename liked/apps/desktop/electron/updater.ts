import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../src/shared/ipc-types.js';

/**
 * Updates über electron-updater (generische Quelle: GitHub-Release „liked-latest“).
 * Integrität: SHA-512 aus latest.yml wird geprüft. Echtheit: erst mit Code-Signatur
 * (derzeit NICHT vorhanden – siehe docs/RELEASE.md). Installation nur beim Beenden,
 * nie mitten in einer Partie; Einstellungen liegen in %APPDATA% und bleiben erhalten.
 */
export class Updater {
  private state: UpdateState = { kind: 'idle' };
  private readonly u = electronUpdater.autoUpdater;

  constructor(private readonly emit: (s: UpdateState) => void) {
    this.u.autoDownload = false;
    this.u.autoInstallOnAppQuit = false;
    this.u.allowPrerelease = true;
    this.u.logger = null;
    this.u.on('checking-for-update', () => this.set({ kind: 'checking' }));
    this.u.on('update-not-available', () => this.set({ kind: 'none' }));
    this.u.on('update-available', (i) =>
      this.set({ kind: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? stripHtml(i.releaseNotes) : undefined })
    );
    this.u.on('download-progress', (p) => this.set({ ...this.state, kind: 'downloading', percent: Math.round(p.percent) }));
    this.u.on('update-downloaded', (i) => this.set({ kind: 'ready', version: i.version }));
    this.u.on('error', (e) => this.set({ kind: 'error', message: e?.message?.slice(0, 200) ?? 'Unbekannter Fehler' }));
  }

  private set(s: UpdateState): UpdateState {
    this.state = s;
    this.emit(s);
    return s;
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.set({ kind: 'unsupported', message: 'Updates nur in der installierten Version.' });
    try {
      await this.u.checkForUpdates();
    } catch (e) {
      return this.set({ kind: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'Prüfung fehlgeschlagen' });
    }
    return this.state;
  }

  async download(): Promise<UpdateState> {
    if (this.state.kind !== 'available') return this.state;
    try {
      await this.u.downloadUpdate();
    } catch (e) {
      return this.set({ kind: 'error', message: e instanceof Error ? e.message.slice(0, 200) : 'Download fehlgeschlagen' });
    }
    return this.state;
  }

  /** Installation beim nächsten Beenden der App. */
  installOnQuit(): void {
    if (this.state.kind === 'ready') this.u.autoInstallOnAppQuit = true;
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').slice(0, 2000);
}
