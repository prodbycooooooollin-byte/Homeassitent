import type { Catalog } from '../gamedata/catalog';
import { analyzeFrame, type FrameResult } from '../vision/frame';
import type { VisionRefs } from '../vision/hud';
import type { TextRecognizer } from '../vision/ocr';
import type { Raster } from '../vision/raster';
import { ScreenTracker, type TrackerStatus } from '../vision/tracker';
import { Provider, type ProviderState } from './provider';

// BILDSCHIRMERKENNUNG: liest das eigene HUD (Souls, Itemwert, Items), die Heldenporträts
// und – solange Tab gedrückt ist – die Item-Spalten. Alles lokal; Bilder werden nicht gespeichert.

export interface FrameSource {
  /** aktuelles Bild des Spielmonitors, null = nicht verfügbar */
  grab(): Promise<Raster | null>;
  /** Aufnahme beenden (z. B. wenn Deadlock nicht läuft) */
  release?(): void;
}

export interface ScreenOptions {
  refs: VisionRefs;
  source: FrameSource;
  createOcr: () => Promise<TextRecognizer>;
  /** Nur aufnehmen, während Deadlock läuft (null = unbekannt → aufnehmen) */
  gameRunning?: () => Promise<boolean | null>;
  intervalMs?: number;
  heroOverride?: string | null;
}

export class ScreenProvider extends Provider {
  readonly id = 'screen' as const;
  readonly label = 'Bildschirmerkennung';
  readonly tracker: ScreenTracker;
  lastFrame: FrameResult | null = null;
  lastRaster: Raster | null = null;
  private ocr: TextRecognizer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private frames = 0;
  private runningCheckedAt = 0;
  private running: boolean | null = null;

  constructor(private cat: Catalog, private opts: ScreenOptions) {
    super();
    this.tracker = new ScreenTracker({ costOf: (c) => cat.item(c)?.cost ?? 0, heroOverride: opts.heroOverride ?? null });
  }

  status(): TrackerStatus { return this.tracker.status; }

  start() {
    this.stopped = false;
    this.diag.startedAt = Date.now();
    this.setState('connecting', 'Bildschirmerkennung startet …');
    void this.loop();
  }

  private async loop() {
    if (this.stopped) return;
    const t0 = Date.now();
    try {
      if (this.opts.gameRunning && t0 - this.runningCheckedAt > 10_000) {
        this.running = await this.opts.gameRunning();
        this.runningCheckedAt = t0;
      }
      if (this.running === false) {
        this.opts.source.release?.();
        this.setIf('waiting', 'warte auf Deadlock');
      } else {
        this.ocr ??= await this.opts.createOcr();
        const r = await this.opts.source.grab();
        if (!r) {
          this.setIf('error', 'Bildschirm konnte nicht aufgenommen werden');
        } else {
          this.lastRaster = r;
          const search = this.frames % 8 === 0 || !this.tracker.knownPortraits.length;
          const f = await analyzeFrame(r, this.opts.refs, this.ocr, { knownPortraits: this.tracker.knownPortraits, searchPortraits: search });
          this.frames++;
          this.lastFrame = f;
          this.diag.rawEvents++;
          const snap = this.tracker.update(f, Date.now());
          if (snap) {
            this.setIf('live', this.describe());
            this.emitSnapshot(snap);
          } else {
            this.setIf('waiting', 'HUD nicht sichtbar (Menü, Shop, Tod oder Ladebildschirm)');
          }
        }
      }
    } catch (e) {
      this.error(String(e));
      this.setIf('error', `Fehler: ${(e as Error).message}`);
    }
    const wait = Math.max(300, (this.opts.intervalMs ?? 1500) - (Date.now() - t0));
    this.timer = setTimeout(() => void this.loop(), wait);
  }

  private describe(): string {
    const s = this.tracker.status;
    const hero = s.myHero ? this.cat.heroName(s.myHero) : 'Hero unbekannt';
    const souls = s.lineKind === 'itemValue' ? 'Sandbox (Itemwert statt Souls)' : s.souls !== null ? `${s.souls.toLocaleString('de-DE')} Souls` : 'Souls nicht lesbar';
    return `${hero} · ${souls} · ${s.items.length} Items${s.valueCheck === 'ok' ? ' (Itemwert geprüft)' : ''}`;
  }

  /** Status nur melden, wenn er sich ändert (keine Ereignisflut alle 1,5 s) */
  private setIf(state: ProviderState, detail: string) {
    if (this.diag.state !== state || this.diag.detail !== detail) this.setState(state, detail);
  }

  setHeroOverride(h: string | null) { this.tracker.setHeroOverride(h); }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.opts.source.release?.();
    const o = this.ocr;
    this.ocr = null;
    void o?.close().catch(() => undefined);
    this.setState('idle', 'gestoppt');
  }
}
