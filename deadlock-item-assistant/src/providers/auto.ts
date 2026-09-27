import type { Catalog } from '../gamedata/catalog';
import type { ProviderSnapshot } from '../shared/types';
import { type SteamAccount, activeMatchFor, deadlockDir, detectSteamAccount, isDeadlockRunning, matchIdFromConsoleLog } from './discovery';
import { type GepApi, GepProvider } from './gep';
import { Provider, type ProviderDiagnostics } from './provider';
import { type ScreenOptions, ScreenProvider } from './screen';
import { SpectatorProvider } from './spectator';

// AUTOMATISCH: wählt selbst die beste verfügbare Live-Quelle und verfolgt jedes Match.
//  1. Overwolf-Spielevents, falls die Laufzeit mit gültigem Zugang bereitsteht (für private Apps in der Regel nicht).
//  2. Bildschirmerkennung (Standard): eigenes HUD, Heldenporträts, Tab-Item-Spalten. Lokal, ohne Anmeldung.
//  3. Sonst Spectator-Stream: Steam-Konto automatisch erkannt, Match-ID automatisch gesucht, Budget berechnet.
// Kein Umschalten per Hand, kein Eintragen pro Match.

export interface AutoOptions {
  gep: GepApi | null;
  gepStatus: string;
  spectatorBaseUrl: string;
  accountOverride: number | null;
  gepLogFile?: string;
  fetchImpl?: typeof fetch;
  /** Bildschirmerkennung (null = nicht verfügbar, z. B. Referenzdaten fehlen) */
  screen?: ScreenOptions | null;
}

export class AutoProvider extends Provider {
  readonly id = 'gep' as const;
  readonly label = 'Automatisch';
  inner: Provider | null = null;
  account: SteamAccount | null = null;
  gameRunning: boolean | null = null;
  private timer: NodeJS.Timeout | null = null;
  private currentMatch: string | null = null;
  private stopped = true;
  mode: 'gep' | 'screen' | 'spectator' | 'waiting' = 'waiting';

  constructor(private cat: Catalog, private opts: AutoOptions) { super(); }

  diagnostics(): ProviderDiagnostics {
    const inner = this.inner?.diagnostics();
    const acc = this.account ? `Steam: ${this.account.personaName ?? '?'} (${this.account.accountId})` : 'Steam-Konto nicht gefunden';
    const base = { ...super.diagnostics(), id: (this.mode === 'spectator' ? 'spectator' : this.mode === 'screen' ? 'screen' : 'gep') as ProviderDiagnostics['id'] };
    if (!inner) return { ...base, notes: [acc, this.opts.gepStatus, ...base.notes] };
    return { ...inner, id: base.id, label: `Automatisch · ${inner.label}`, notes: [acc, this.opts.gepStatus, ...inner.notes] };
  }

  start() {
    this.stopped = false;
    this.diag.startedAt = Date.now();
    this.account = this.opts.accountOverride ? { steamId64: '', accountId: this.opts.accountOverride, personaName: null, source: 'Einstellung' } : detectSteamAccount();
    if (this.opts.gep) {
      this.mode = 'gep';
      this.attach(new GepProvider(this.cat, this.opts.gep, { logFile: this.opts.gepLogFile }));
      return;
    }
    if (this.opts.screen) {
      this.mode = 'screen';
      this.attach(new ScreenProvider(this.cat, this.opts.screen));
      return;
    }
    this.mode = 'spectator';
    this.setState('waiting', this.account ? 'warte auf Deadlock' : 'Steam-Konto nicht gefunden – bitte Account-ID in den Einstellungen eintragen');
    void this.loop();
  }

  private attach(p: Provider) {
    this.inner?.stop();
    this.inner?.removeAllListeners();
    this.inner = p;
    p.on('snapshot', (s: ProviderSnapshot) => this.emit('snapshot', s));
    p.on('status', () => this.emit('status', this.diagnostics()));
    p.start();
  }

  /** Spectator-Fallback: Spiel erkennen → Match suchen → verbinden; bei Matchende von vorn. */
  private async loop() {
    if (this.stopped) return;
    try {
      const running = await isDeadlockRunning();
      this.gameRunning = process.platform === 'win32' ? running : null;
      if (!running && process.platform === 'win32') {
        if (this.inner) { this.inner.stop(); this.inner = null; this.currentMatch = null; }
        this.setState('waiting', 'warte auf Deadlock');
      } else if (this.account) {
        const inner = this.inner?.diagnostics();
        const needMatch = !this.inner || inner?.state === 'ended' || inner?.state === 'error';
        if (needMatch) {
          this.setState('waiting', 'suche dein laufendes Match …');
          let id: string | null = null;
          try { id = await activeMatchFor(this.account.accountId, this.opts.fetchImpl); } catch (e) { this.error(`Match-Suche: ${(e as Error).message}`); }
          id ??= matchIdFromConsoleLog(deadlockDir());
          if (id && id !== this.currentMatch) {
            this.currentMatch = id;
            this.attach(new SpectatorProvider(this.cat, { baseUrl: this.opts.spectatorBaseUrl, matchId: id, myAccountId: this.account.accountId }, this.opts.fetchImpl));
          } else if (!id) {
            this.setState('waiting', 'Match nicht auffindbar (Community-API kennt nur ~200 meistgesehene Matches). Bildschirmerkennung einschalten für volle Automatik.');
          }
        }
      }
    } catch (e) { this.error(String(e)); }
    this.timer = setTimeout(() => void this.loop(), 20_000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.inner?.stop();
    this.inner?.removeAllListeners();
    this.inner = null;
    this.setState('idle', 'gestoppt');
  }
}
