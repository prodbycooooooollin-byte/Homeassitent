import * as fs from 'node:fs';
import * as path from 'node:path';
import { Advisor, type AdvisorOutput } from '../engine/advisor';
import { buildEngineInput, type ManualEnemyItems } from '../engine/input';
import { loadData, type LoadedData, majorMinor } from '../patch/patchData';
import { buildViewModel, type OverlayVM } from '../present/viewModel';
import { type SimCursor, type SimScenario, simToMatchState } from '../sim/simulation';
import { type AdvisorSettings, DEFAULT_SETTINGS, type MatchState } from '../shared/types';

// Elektron-unabhängige Steuerlogik (auch von CLI/Tests nutzbar).

export interface AppSettings {
  advisor: AdvisorSettings;
  pollIntervalMs: number;
  manualGameVersion: string | null;
  useLcuForVersion: boolean;
  lockfilePath: string;
  riotCaFile: string | null;
  ddVersion: string;
  overlay: { x: number | null; y: number | null; scale: number; expanded: boolean; visible: boolean };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  advisor: DEFAULT_SETTINGS,
  pollIntervalMs: 2000,
  manualGameVersion: null,
  useLcuForVersion: false,
  lockfilePath: 'C:\\Riot Games\\League of Legends\\lockfile',
  riotCaFile: null,
  ddVersion: '15.1.1',
  overlay: { x: null, y: null, scale: 1, expanded: false, visible: true },
};

export interface ControlSnapshot {
  mode: 'live' | 'simulation';
  settings: AppSettings;
  patchStatus: LoadedData['status'];
  dataProblems: string[];
  enemies: { championKey: string; name: string; apiItems: number[]; manualItems: number[] | null }[];
  itemCatalog: { id: number; name: string; tier: string }[];
  playstyles: { id: string; name: string }[];
  scenarios: { id: string; name: string }[];
  sim: { scenarioId: string | null; step: number; steps: { t: number; label: string }[]; manual: SimCursor['manual'] };
  pollerStats: unknown;
  schema: { field: string; present: boolean; sample?: string }[];
  inventoryEvents: unknown[];
  waitingReason: string | null;
}

export class Controller {
  data: LoadedData;
  advisor: Advisor;
  mode: 'live' | 'simulation' = 'live';
  state: MatchState | null = null;
  output: AdvisorOutput | null = null;
  manual: ManualEnemyItems = {};
  scenarios = new Map<string, SimScenario>();
  sim: { scenario: SimScenario | null; cursor: SimCursor } = { scenario: null, cursor: { step: -1, manual: [] } };
  waitingReason: string | null = null;
  private loadedVersion: string | null | undefined = undefined;

  constructor(private dataDir: string, public settings: AppSettings) {
    this.data = loadData(dataDir, settings.manualGameVersion, { strict: settings.advisor.strictPatch });
    this.advisor = new Advisor(this.data, settings.advisor);
    this.loadScenarios();
  }

  loadScenarios() {
    const dir = path.join(this.dataDir, 'sim');
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as SimScenario;
      this.scenarios.set(s.id, s);
    }
  }

  private ensureData(gameVersion: string | null) {
    const v = majorMinor(gameVersion ?? this.settings.manualGameVersion);
    if (v === this.loadedVersion) return;
    this.loadedVersion = v;
    this.data = loadData(this.dataDir, v, { strict: this.settings.advisor.strictPatch });
    this.advisor.setData(this.data);
  }

  updateSettings(patch: Partial<AppSettings> & { advisor?: Partial<AdvisorSettings> }) {
    const advisor = { ...this.settings.advisor, ...(patch.advisor ?? {}) };
    this.settings = { ...this.settings, ...patch, advisor, overlay: { ...this.settings.overlay, ...(patch.overlay ?? {}) } };
    this.advisor.setSettings(advisor);
    if (patch.manualGameVersion !== undefined) this.loadedVersion = undefined;
  }

  /** Live: neuer Zustand vom Poller. */
  onLiveState(state: MatchState) {
    if (this.mode !== 'live') return;
    if (this.state && this.state.me.id !== state.me.id) { this.advisor.reset(); this.manual = {}; }
    this.waitingReason = null;
    this.state = state;
    this.recompute();
  }

  onWaiting(reason: string) {
    if (this.mode !== 'live') return;
    this.waitingReason = reason;
    if (this.state?.feed.status === 'ended') { this.state = null; this.output = null; this.advisor.reset(); this.manual = {}; }
  }

  setMode(mode: 'live' | 'simulation') {
    if (mode === this.mode) return;
    this.mode = mode;
    this.state = null; this.output = null;
    this.advisor.reset();
    if (mode === 'simulation' && !this.sim.scenario) {
      const first = [...this.scenarios.values()][0];
      if (first) this.loadScenario(first.id);
    } else if (mode === 'simulation') this.simTick();
  }

  loadScenario(id: string) {
    const s = this.scenarios.get(id);
    if (!s) return;
    this.sim = { scenario: s, cursor: { step: -1, manual: [] } };
    this.advisor.reset();
    this.simTick();
  }

  simStep(delta: number) {
    const s = this.sim.scenario;
    if (!s) return;
    const max = (s.timeline?.length ?? 0) - 1;
    this.sim.cursor.step = Math.max(-1, Math.min(max, this.sim.cursor.step + delta));
    this.simTick();
  }

  simChange(who: string, add: number[], remove: number[]) {
    this.sim.cursor.manual.push({ who, add, remove });
    this.simTick();
  }

  /** Simulation: Zustand erneut einspeisen (wie ein Poll-Takt). */
  simTick() {
    if (this.mode !== 'simulation' || !this.sim.scenario) return;
    this.state = simToMatchState(this.sim.scenario, this.sim.cursor);
    this.recompute();
  }

  setManualEnemyItems(championKey: string, items: number[]) {
    this.manual[championKey] = { items, updatedAt: Date.now(), gameTime: this.state?.gameTime };
    this.recompute();
  }

  recompute() {
    if (!this.state) return;
    this.ensureData(this.state.gameVersion);
    const input = buildEngineInput(this.state, this.settings.advisor, this.manual, this.data.status);
    if (!input) return;
    this.output = this.advisor.update(input);
  }

  viewModel(): OverlayVM {
    return buildViewModel(this.output, this.state, this.data, this.settings.advisor, {
      ddVersion: this.settings.ddVersion, waitingReason: this.waitingReason ?? undefined,
    });
  }

  controlSnapshot(extra: { pollerStats?: unknown; schema?: ControlSnapshot['schema']; inventoryEvents?: unknown[] } = {}): ControlSnapshot {
    const me = this.state?.players.find((p) => p.id === this.state?.me.id);
    const enemies = (this.state?.players ?? []).filter((p) => me && p.team !== me.team).map((p) => ({
      championKey: p.championKey, name: p.championName,
      apiItems: p.items.filter((i) => i.slot !== 6).map((i) => i.itemId),
      manualItems: this.manual[p.championKey]?.items ?? null,
    }));
    const profile = me ? this.data.profiles.get(me.championKey) : undefined;
    return {
      mode: this.mode,
      settings: this.settings,
      patchStatus: this.data.status,
      dataProblems: this.data.problems,
      enemies,
      itemCatalog: [...this.data.patch.items.values()]
        .filter((i) => i.tier === 'legendary' || i.tier === 'boots' || i.tier === 'epic' || i.tier === 'basic')
        .map((i) => ({ id: i.id, name: i.nameDe ?? i.name, tier: i.tier }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      playstyles: profile?.playstyles.map((p) => ({ id: p.id, name: p.name })) ?? [],
      scenarios: [...this.scenarios.values()].map((s) => ({ id: s.id, name: s.name })),
      sim: {
        scenarioId: this.sim.scenario?.id ?? null,
        step: this.sim.cursor.step,
        steps: (this.sim.scenario?.timeline ?? []).map((s) => ({ t: s.t, label: s.label })),
        manual: this.sim.cursor.manual,
      },
      pollerStats: extra.pollerStats ?? null,
      schema: extra.schema ?? [],
      inventoryEvents: extra.inventoryEvents ?? [],
      waitingReason: this.waitingReason,
    };
  }
}
