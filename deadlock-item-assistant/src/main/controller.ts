import * as fs from 'node:fs';
import * as path from 'node:path';
import { Catalog } from '../gamedata/catalog';
import { extractGameData } from '../gamedata/extract';
import { fetchRawGameFiles } from '../gamedata/fetchRaw';
import { fetchLocalizedAssets } from '../gamedata/assetsSync';
import { installedBuild } from '../gamedata/localInstall';
import { Engine } from '../engine/engine';
import { DEMO_SCENARIOS, DemoProvider } from '../providers/demo';
import { ManualProvider, type ManualState, emptyManualState } from '../providers/manual';
import type { Provider, ProviderDiagnostics } from '../providers/provider';
import { SpectatorProvider } from '../providers/spectator';
import { AutoProvider } from '../providers/auto';
import { type GepApi, GepProvider } from '../providers/gep';
import { type OverlayVM, buildOverlayVM } from '../present/viewModel';
import type { AdvisorOutput, EnemyAlert, ProviderSnapshot, ReportedProblem } from '../shared/types';
import type { AppSettings } from './settings';

// Verbindet Provider, Engine und Anzeige. Unabhängig von Electron (testbar).

export interface ControlSnapshot {
  settings: AppSettings;
  diag: ProviderDiagnostics | null;
  output: AdvisorOutput | null;
  manual: ManualState;
  catalog: {
    build: number; versionDate: string; source: string; extractedAt: string; items: number; heroes: number;
    unverified: string[]; languageLoaded: string | null; installed: { build: number; versionDate: string; path: string } | null;
    buildMatch: 'match' | 'mismatch' | 'unknown';
  };
  items: { cls: string; name: string; slot: string; tier: number; cost: number }[];
  heroes: { cls: string; name: string }[];
  scenarios: { id: string; title: string; description: string }[];
  store: { snapshots: number; rejectedOutOfOrder: number; duplicates: number; matchResets: number; matchId: string | null; events: string[] };
  perf: PerfSample[];
  jobs: Record<string, string>;
  auto: { active: boolean; mode: string; account: { name: string | null; id: number } | null; gameRunning: boolean | null; gepStatus: string; gepReady: boolean; soulsSemantics: string | null };
}

export interface PerfSample { at: number; cpuPct: number; memMB: number; gpuCpuPct: number | null; label: string }

export class Controller {
  cat: Catalog;
  engine: Engine;
  provider: Provider | null = null;
  output: AdvisorOutput | null = null;
  alerts: EnemyAlert[] = [];
  manual = new ManualProvider(emptyManualState());
  perf: PerfSample[] = [];
  jobs: Record<string, string> = {};
  private installed: ReturnType<typeof installedBuild> = null;
  private languageLoaded: string | null = null;
  private pendingDemoBuy: NodeJS.Timeout | null = null;
  /** Overwolf-GEP (nur unter ow-electron mit gültigem Entwicklerzugang verfügbar) */
  gep: GepApi | null = null;
  gepStatus = 'Overwolf-Laufzeit nicht vorhanden – Spectator-Fallback';

  setGep(gep: GepApi | null, status: string) {
    this.gep = gep;
    this.gepStatus = status;
    if (this.settings.source === 'auto') this.startSource(); else this.onChange();
  }

  constructor(private dataDir: string, private userDir: string, public settings: AppSettings, private onChange: () => void) {
    this.cat = this.loadCatalog();
    this.engine = new Engine(this.cat);
    this.manual.on('snapshot', (s: ProviderSnapshot) => { if (this.provider === this.manual) this.ingest(s); });
    try { this.installed = installedBuild(); } catch { this.installed = null; }
  }

  private loadCatalog(): Catalog {
    // Aktualisierte Spieldaten im Nutzerordner haben Vorrang vor den mitgelieferten
    const userData = path.join(this.userDir, 'gamedata-override');
    const useOverride = fs.existsSync(path.join(userData, 'gamedata', 'manifest.json'));
    const dir = useOverride ? userData : this.dataDir;
    if (useOverride && !fs.existsSync(path.join(userData, 'knowledge'))) fs.cpSync(path.join(this.dataDir, 'knowledge'), path.join(userData, 'knowledge'), { recursive: true });
    const cat = Catalog.load(dir);
    const loc = path.join(this.userDir, `localized-${this.settings.language}.json`);
    if (this.settings.language !== 'english' && fs.existsSync(loc)) {
      try { cat.applyLocalization(JSON.parse(fs.readFileSync(loc, 'utf8'))); this.languageLoaded = this.settings.language; } catch { /* ignorieren */ }
    }
    cat.language = this.settings.language;
    return cat;
  }

  startSource() {
    if (this.pendingDemoBuy) { clearTimeout(this.pendingDemoBuy); this.pendingDemoBuy = null; }
    this.provider?.stop();
    if (this.provider && this.provider !== this.manual) this.provider.removeAllListeners();
    this.engine = new Engine(this.cat);
    this.output = null;
    this.alerts = [];
    const s = this.settings;
    if (s.source === 'auto') {
      const acc = s.accountOverride.trim() ? Number(s.accountOverride) : null;
      this.provider = new AutoProvider(this.cat, {
        gep: this.gep, gepStatus: this.gepStatus, spectatorBaseUrl: s.spectator.baseUrl,
        accountOverride: acc !== null && Number.isFinite(acc) ? acc : null,
        gepLogFile: path.join(this.userDir, 'gep-rohdaten.jsonl'),
      });
    } else if (s.source === 'demo') {
      const d = new DemoProvider(this.cat, s.demoScenario);
      d.autoBuy = s.demoAutoBuy;
      this.provider = d;
    } else if (s.source === 'manual') {
      this.provider = this.manual;
    } else {
      const acc = s.spectator.accountId.trim() ? Number(s.spectator.accountId) : null;
      this.provider = new SpectatorProvider(this.cat, { baseUrl: s.spectator.baseUrl, matchId: s.spectator.matchId.trim(), myAccountId: Number.isFinite(acc) ? acc : null });
    }
    if (this.provider !== this.manual) this.provider.on('snapshot', (snap: ProviderSnapshot) => this.ingest(snap));
    this.provider.on('status', () => this.onChange());
    if (s.source === 'spectator' && !s.spectator.matchId.trim()) {
      this.jobs.source = 'Match-ID fehlt – bitte in „Datenquelle“ eintragen.';
      this.onChange();
      return;
    }
    delete this.jobs.source;
    this.provider.start();
    this.onChange();
  }

  private ingest(s: ProviderSnapshot) {
    const r = this.engine.ingest(s, Date.now());
    this.output = r.output;
    if (r.alerts.length) this.alerts.push(...r.alerts);
    if (this.alerts.length > 40) this.alerts.splice(0, this.alerts.length - 40);
    // Demo: empfohlenen Kauf automatisch ausführen (nur Beispieldaten)
    const demo = this.provider;
    if (demo instanceof DemoProvider && demo.autoBuy && !this.pendingDemoBuy) {
      const o = r.output;
      if (o.primary === 'buy' && o.buyNow?.item && o.buyNow.affordable === 'yes') {
        const sell = o.swap && o.swap.buy === o.buyNow.item ? o.swap.sell : undefined;
        const item = o.buyNow.item;
        this.pendingDemoBuy = setTimeout(() => {
          this.pendingDemoBuy = null;
          // nur, wenn dieselbe Demo noch läuft und Auto-Kauf weiterhin aktiv ist
          if (this.provider === demo && demo.autoBuy) demo.buyMine(item, sell);
        }, 2500);
      }
    }
    this.onChange();
  }

  /** Periodisch: Frische und Hinweis-Bündelung ohne neue Daten */
  tick() {
    if (!this.provider) return;
    const r = this.engine.tick(Date.now());
    this.output = r.output;
    if (r.alerts.length) this.alerts.push(...r.alerts);
    this.onChange();
  }

  overlayVM(now = Date.now()): OverlayVM {
    return buildOverlayVM(this.cat, this.output, this.provider?.diagnostics() ?? null, this.alerts, now, this.settings.overlay.alertSeconds * 1000);
  }

  controlSnapshot(): ControlSnapshot {
    const st = this.engine.store.state;
    const inst = this.installed;
    return {
      settings: this.settings, diag: this.provider?.diagnostics() ?? null, output: this.output, manual: this.manual.state,
      catalog: {
        build: this.cat.manifest.build, versionDate: this.cat.manifest.versionDate, source: this.cat.manifest.source, extractedAt: this.cat.manifest.extractedAt,
        items: this.cat.items.size, heroes: this.cat.heroes.size, unverified: this.cat.unverifiedMechanics, languageLoaded: this.languageLoaded, installed: inst,
        buildMatch: inst ? (inst.build === this.cat.manifest.build ? 'match' : 'mismatch') : 'unknown',
      },
      items: [...this.cat.items.values()].map((i) => ({ cls: i.className, name: this.cat.itemName(i.className), slot: i.slot, tier: i.tier, cost: i.cost })),
      heroes: [...this.cat.heroes.values()].map((h) => ({ cls: h.className, name: this.cat.heroName(h.className) })).sort((a, b) => a.name.localeCompare(b.name)),
      scenarios: DEMO_SCENARIOS.map((s) => ({ id: s.id, title: s.title, description: s.description })),
      store: { ...st.stats, matchId: st.matchId, events: st.events.slice(-15).reverse().map((e) => `${e.kind} · ${this.cat.heroName(st.players[e.playerKey]?.heroClass.value)} · ${this.cat.itemName(e.item)}`) },
      perf: this.perf.slice(-30),
      jobs: this.jobs,
      auto: this.autoInfo(),
    };
  }

  private autoInfo(): ControlSnapshot['auto'] {
    const p = this.provider;
    const auto = p instanceof AutoProvider ? p : null;
    const inner = auto ? (auto as unknown as { inner: unknown }).inner : null;
    const gepInner = inner instanceof GepProvider ? inner : null;
    return {
      active: !!auto, mode: auto?.mode ?? 'aus',
      account: auto?.account ? { name: auto.account.personaName, id: auto.account.accountId } : null,
      gameRunning: gepInner ? gepInner.gameRunning : auto?.gameRunning ?? null,
      gepStatus: this.gepStatus, gepReady: !!this.gep,
      soulsSemantics: gepInner ? gepInner.semantics : null,
    };
  }

  updateManual(patch: Partial<ManualState>) { this.manual.update(patch); }
  reportProblem(enemyKey: string, kind: ReportedProblem['kind']) {
    if (this.provider instanceof DemoProvider) this.provider.reportProblem(enemyKey, kind);
    else this.manual.report(enemyKey, kind);
  }
  demoBuy(item: string, sell?: string) { if (this.provider instanceof DemoProvider) this.provider.buyMine(item, sell); }

  /** Spieldaten aus dem SteamDB-Spiegel neu laden und extrahieren (Netzwerk). */
  async updateGameData() {
    this.jobs.gamedata = 'lädt Rohdateien …';
    this.onChange();
    try {
      const raw = await fetchRawGameFiles(fetch);
      this.jobs.gamedata = 'extrahiert …';
      this.onChange();
      const ds = extractGameData(raw, 'github.com/SteamDatabase/GameTracking-Deadlock (Spiegel der Spieldateien)');
      const dir = path.join(this.userDir, 'gamedata-override', 'gamedata');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(ds.manifest, null, 2));
      fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify(ds.items));
      fs.writeFileSync(path.join(dir, 'heroes.json'), JSON.stringify(ds.heroes));
      this.cat = this.loadCatalog();
      this.jobs.gamedata = `aktualisiert: Build ${ds.manifest.build}, ${ds.items.length} Items${this.cat.knowledgeBuildMismatch ? ' – kuratierte Mechaniken stammen aus älterem Build (eingeschränkt)' : ''}`;
      this.startSource();
    } catch (e) {
      this.jobs.gamedata = `Fehler: ${(e as Error).message}`;
      this.onChange();
    }
  }

  /** Offizielle Namen in der Spielsprache laden (Netzwerk). */
  async syncLanguage(language: string) {
    this.jobs.language = `lädt ${language} …`;
    this.onChange();
    try {
      const data = await fetchLocalizedAssets(language);
      fs.writeFileSync(path.join(this.userDir, `localized-${language}.json`), JSON.stringify(data));
      this.settings.language = language;
      this.cat = this.loadCatalog();
      this.jobs.language = `${Object.keys(data.items).length} Itemnamen (${language}) geladen`;
      this.startSource();
    } catch (e) {
      this.jobs.language = `Fehler: ${(e as Error).message}`;
      this.onChange();
    }
  }

  setLanguage(language: string) {
    this.settings.language = language;
    this.cat = this.loadCatalog();
    this.startSource();
  }

  pushPerf(sample: PerfSample) {
    this.perf.push(sample);
    if (this.perf.length > 600) this.perf.shift();
  }
}
