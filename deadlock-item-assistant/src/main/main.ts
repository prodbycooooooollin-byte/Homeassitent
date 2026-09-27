import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Controller } from './controller';
import { type AppSettings, loadSettings, saveSettings } from './settings';

// Eigenständige Windows-Desktop-App. Das Overlay ist ein transparentes, klickdurchlässiges
// Fenster über dem Spiel (randloser Fenstermodus). Keine Injektion, kein Speicherzugriff,
// keine Eingaben ans Spiel – die App berät nur.

const dataDir = app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(__dirname, '..', '..', 'data');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// --- Overwolf-Spielevents (nur unter ow-electron vorhanden) ---
// Dev Mode liest den Entwicklerzugang aus der Umgebung beim Start. Ist er nur in den Einstellungen
// hinterlegt, startet sich die App einmal selbst mit gesetzter Umgebungsvariable neu.
type OwPackages = NodeJS.EventEmitter & { gep?: unknown };
const owPackages = (app as unknown as { overwolf?: { packages?: OwPackages } }).overwolf?.packages ?? null;
{
  const early = loadSettings(settingsFile());
  const key = early.overwolf.devKey.trim();
  if (owPackages && key && !process.env.OW_DEV_KEY && !process.env.DIA_RELAUNCHED) {
    spawn(process.execPath, process.argv.slice(1), { env: { ...process.env, OW_DEV_KEY: key, DIA_RELAUNCHED: '1' }, detached: true, stdio: 'ignore' }).unref();
    app.exit(0);
  }
}

function initOverwolf() {
  if (!owPackages) {
    controller.setGep(null, 'Overwolf-Laufzeit nicht vorhanden (Standard-Electron) – Spectator-Fallback');
    return;
  }
  controller.setGep(null, process.env.OW_DEV_KEY || process.env.OW_CLI_API_KEY ? 'Overwolf-Spielevents werden geladen …' : 'Overwolf-Entwicklerzugang fehlt – Spielevents inaktiv (siehe „Verbindung“)');
  owPackages.on('ready', (_e: unknown, name: string, version: string) => {
    if (name !== 'gep' || !owPackages.gep) return;
    controller.setGep(owPackages.gep as never, `Overwolf-Spielevents bereit (GEP ${version})`);
  });
  owPackages.on('failed-to-initialize', (_e: unknown, name: string) => {
    if (name === 'gep') controller.setGep(null, 'Overwolf-Spielevents konnten nicht starten – Entwicklerzugang prüfen');
  });
}

let overlay: BrowserWindow | null = null;
let control: BrowserWindow | null = null;
let editMode = false;
let controller: Controller;
let contentHeight = 220;
let pushTimer: NodeJS.Timeout | null = null;

const BASE_W = { compact: 344, expanded: 420 };

function persist() { saveSettings(settingsFile(), controller.settings); }

function targetDisplay() {
  const o = controller.settings.overlay;
  return screen.getAllDisplays().find((d) => d.id === o.displayId) ?? screen.getPrimaryDisplay();
}

/** Größe/Position aus relativen Koordinaten – robust gegenüber DPI- und Auflösungswechseln. */
function layoutOverlay() {
  if (!overlay) return;
  const o = controller.settings.overlay;
  const d = targetDisplay();
  const wa = d.workArea;
  const width = Math.round((o.expanded ? BASE_W.expanded : BASE_W.compact) * o.scale);
  const height = Math.min(wa.height - 16, Math.max(80, Math.round(contentHeight * o.scale)));
  // Standard: rechts, unterhalb der oberen HUD-Leiste, über der Minimap-/Fähigkeitszone frei
  const relX = o.relX ?? (wa.width - width - 24) / wa.width;
  const relY = o.relY ?? 0.18;
  let x = Math.round(wa.x + relX * wa.width);
  let y = Math.round(wa.y + relY * wa.height);
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - width));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - height));
  overlay.setBounds({ x, y, width, height });
  overlay.setOpacity(o.opacity);
}

function createOverlay() {
  overlay = new BrowserWindow({
    width: BASE_W.compact, height: 220, show: false, transparent: true, frame: false, resizable: false, movable: true,
    skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  applyAcrylic();
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => { layoutOverlay(); if (controller.settings.overlay.visible) overlay?.showInactive(); });
  overlay.on('moved', () => {
    if (!overlay || !editMode) return;
    const b = overlay.getBounds();
    const d = screen.getDisplayMatching(b);
    const wa = d.workArea;
    controller.settings.overlay = { ...controller.settings.overlay, displayId: d.id, relX: (b.x - wa.x) / wa.width, relY: (b.y - wa.y) / wa.height };
    persist();
  });
}

function applyAcrylic() {
  if (!overlay || process.platform !== 'win32') return;
  // Windows-11-Acrylic (nur wenn eingeschaltet). Wirkung hinter Vollbild-Spielen ungeprüft.
  const w = overlay as BrowserWindow & { setBackgroundMaterial?: (m: string) => void };
  try { w.setBackgroundMaterial?.(controller.settings.overlay.acrylic ? 'acrylic' : 'none'); } catch { /* nicht verfügbar */ }
}

function createControl() {
  if (control && !control.isDestroyed()) { control.show(); control.focus(); return; }
  control = new BrowserWindow({
    width: 1180, height: 840, minWidth: 900, minHeight: 600, title: 'Deadlock Item-Assistent', backgroundColor: '#14110e',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  control.setMenuBarVisibility(false);
  control.loadFile(path.join(__dirname, '..', 'renderer', 'control.html'));
  control.on('closed', () => { control = null; });
}

function setEditMode(on: boolean) {
  editMode = on;
  if (!overlay) return;
  overlay.setIgnoreMouseEvents(!on, { forward: true });
  overlay.setFocusable(on);
  if (on) { overlay.showInactive(); } else { overlay.blur(); }
  push();
}

function schedulePush() {
  if (pushTimer) return;
  // Bündelt schnelle Folgeänderungen (max. ~8 Updates/s an die Oberfläche)
  pushTimer = setTimeout(() => { pushTimer = null; push(); }, 120);
}

function push() {
  const vm = controller.overlayVM();
  const layout = { expanded: controller.settings.overlay.expanded, edit: editMode, scale: controller.settings.overlay.scale, opacity: controller.settings.overlay.opacity, reducedMotion: controller.settings.overlay.reducedMotion, hotkeys: controller.settings.hotkeys };
  overlay?.webContents.send('vm', { vm, layout });
  if (control && !control.isDestroyed()) control.webContents.send('control', { snap: controller.controlSnapshot(), vm, layout });
}

type SettingsPatch = Partial<Omit<AppSettings, 'overlay' | 'spectator' | 'hotkeys' | 'overwolf'>> & { overlay?: Partial<AppSettings['overlay']>; spectator?: Partial<AppSettings['spectator']>; hotkeys?: Partial<AppSettings['hotkeys']>; overwolf?: Partial<AppSettings['overwolf']> };

type Action =
  | { type: 'toggle-details' | 'toggle-edit' | 'toggle-visible' | 'open-control' | 'reset-position' | 'update-gamedata' | 'restart-source' | 'test-alert' }
  | { type: 'overlay-height'; height: number }
  | { type: 'settings'; patch: SettingsPatch }
  | { type: 'manual'; patch: Record<string, unknown> }
  | { type: 'manual-new-match' }
  | { type: 'report'; enemyKey: string; kind: 'cc' | 'burst' | 'sustain' }
  | { type: 'demo-buy'; item: string; sell?: string }
  | { type: 'sync-language'; language: string }
  | { type: 'set-language'; language: string };

function handle(a: Action) {
  const s = controller.settings;
  switch (a.type) {
    case 'toggle-details': s.overlay.expanded = !s.overlay.expanded; persist(); layoutOverlay(); break;
    case 'toggle-edit': setEditMode(!editMode); break;
    case 'toggle-visible':
      s.overlay.visible = !s.overlay.visible; persist();
      if (s.overlay.visible) overlay?.showInactive(); else overlay?.hide();
      break;
    case 'open-control': createControl(); break;
    case 'reset-position': s.overlay = { ...s.overlay, displayId: null, relX: null, relY: null }; persist(); layoutOverlay(); break;
    case 'overlay-height': contentHeight = a.height; layoutOverlay(); return;
    case 'settings': {
      const sourceChanged = (a.patch.source && a.patch.source !== s.source) || a.patch.demoScenario || a.patch.spectator || a.patch.demoAutoBuy !== undefined || a.patch.accountOverride !== undefined;
      const keyChanged = a.patch.overwolf?.devKey !== undefined && a.patch.overwolf.devKey.trim() !== s.overwolf.devKey;
      controller.settings = {
        ...s, ...a.patch,
        overlay: { ...s.overlay, ...(a.patch.overlay ?? {}) },
        spectator: { ...s.spectator, ...(a.patch.spectator ?? {}) },
        hotkeys: { ...s.hotkeys, ...(a.patch.hotkeys ?? {}) },
        overwolf: { ...s.overwolf, ...(a.patch.overwolf ?? {}), devKey: (a.patch.overwolf?.devKey ?? s.overwolf.devKey).trim() },
      };
      persist();
      if (keyChanged && owPackages) {
        // Neuer Entwicklerzugang wirkt erst nach einem Neustart
        spawn(process.execPath, process.argv.slice(1), { env: { ...process.env, OW_DEV_KEY: controller.settings.overwolf.devKey, DIA_RELAUNCHED: '1' }, detached: true, stdio: 'ignore' }).unref();
        app.exit(0);
        return;
      }
      if (a.patch.hotkeys) registerHotkeys();
      if (a.patch.overlay?.acrylic !== undefined) applyAcrylic();
      layoutOverlay();
      if (sourceChanged) controller.startSource();
      break;
    }
    case 'restart-source': controller.startSource(); break;
    case 'manual': controller.updateManual(a.patch as never); break;
    case 'manual-new-match': controller.manual.newMatch(); break;
    case 'report': controller.reportProblem(a.enemyKey, a.kind); break;
    case 'demo-buy': controller.demoBuy(a.item, a.sell); break;
    case 'update-gamedata': void controller.updateGameData(); break;
    case 'sync-language': void controller.syncLanguage(a.language); break;
    case 'set-language': controller.setLanguage(a.language); break;
    case 'test-alert':
      controller.alerts.push({ id: `test-${Date.now()}`, enemyKey: 'test', heroName: 'Test', items: [], wording: 'neu erkannt', consequence: 'So sieht ein Hinweis aus – keine echten Daten.', changedRecommendation: null, at: Date.now(), relevance: 1 });
      break;
  }
  push();
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const h = controller.settings.hotkeys;
  const failed: string[] = [];
  const reg = (acc: string, fn: () => void) => { try { if (!globalShortcut.register(acc, fn)) failed.push(acc); } catch { failed.push(acc); } };
  reg(h.details, () => handle({ type: 'toggle-details' }));
  reg(h.edit, () => handle({ type: 'toggle-edit' }));
  reg(h.toggle, () => handle({ type: 'toggle-visible' }));
  reg(h.control, () => handle({ type: 'open-control' }));
  if (failed.length) controller.jobs.hotkeys = `Hotkey nicht registrierbar (belegt?): ${failed.join(', ')}`; else delete controller.jobs.hotkeys;
}

let lastCpu = { at: Date.now() };
function samplePerf() {
  const metrics = app.getAppMetrics();
  const cpu = metrics.reduce((s, m) => s + m.cpu.percentCPUUsage, 0);
  const mem = metrics.reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024;
  const gpu = metrics.find((m) => m.type === 'GPU');
  controller.pushPerf({ at: Date.now(), cpuPct: Math.round(cpu * 10) / 10, memMB: Math.round(mem), gpuCpuPct: gpu ? Math.round(gpu.cpu.percentCPUUsage * 10) / 10 : null, label: editMode ? 'edit' : 'normal' });
  lastCpu = { at: Date.now() };
}

app.whenReady().then(() => {
  const settings = loadSettings(settingsFile());
  if (process.argv.includes('--demo')) settings.source = 'demo';
  controller = new Controller(dataDir, app.getPath('userData'), settings, schedulePush);
  createOverlay();
  registerHotkeys();
  ipcMain.on('action', (_e, a: Action) => handle(a));
  overlay?.webContents.on('did-finish-load', push);
  if (!process.env.DIA_NO_CONTROL) createControl();
  control?.webContents.on('did-finish-load', push);
  controller.startSource();
  initOverwolf();
  setInterval(() => controller.tick(), 1000);
  setInterval(samplePerf, 2000);
  screen.on('display-metrics-changed', layoutOverlay);
  screen.on('display-removed', layoutOverlay);
  screen.on('display-added', layoutOverlay);
  if (process.env.DIA_CAPTURE) void captureForVerification(process.env.DIA_CAPTURE);
  if (process.env.DIA_MEASURE) void measure(Number(process.env.DIA_MEASURE));
  void lastCpu;
});

// ---- Nur für automatisierte Prüfung (Entwicklung/CI) ----

async function captureForVerification(dir: string) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (w: BrowserWindow | null, name: string) => {
    if (!w || w.isDestroyed()) return;
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const scen = process.env.DIA_SCENARIO ?? 'infernus-lead';
  if (process.env.DIA_CAPTURE_AUTO) {
    // Automatik-Modus ohne laufendes Spiel (Wartezustand) festhalten
    handle({ type: 'settings', patch: { source: 'auto' } });
    await wait(2500);
    control?.webContents.send('select-tab', 'connect');
    await wait(1200);
    await shot(control, 'control-connect-auto');
    await shot(overlay, 'overlay-auto-waiting');
  }
  if (process.env.DIA_FILL_MANUAL) {
    // Testeinträge für die Sichtprüfung der Schnelleingabe (keine echten Matchdaten)
    const byName = (n: string) => [...controller.cat.items.values()].find((i) => i.nameEn === n)!.className;
    const hero = (n: string) => [...controller.cat.heroes.values()].find((h) => h.nameEn === n)!.className;
    const m = controller.manual.state;
    controller.updateManual({ myHero: hero('Haze'), mySouls: 2400, myItems: ['Extended Magazine', 'Rapid Rounds', 'Headshot Booster'].map(byName),
      enemies: m.enemies.map((e, i) => (i === 0 ? { ...e, heroClass: hero('Infernus'), items: ['Improved Spirit', 'Spirit Lifesteal'].map(byName) } : i === 1 ? { ...e, heroClass: hero('Warden'), items: ['Extra Health'].map(byName) } : e)) });
  }
  handle({ type: 'settings', patch: { source: 'demo', demoScenario: scen, demoAutoBuy: false, overlay: { expanded: false } } });
  await wait(4000);
  await shot(overlay, `overlay-compact-${scen}`);
  handle({ type: 'toggle-details' });
  await wait(1500);
  await shot(overlay, `overlay-expanded-${scen}`);
  handle({ type: 'toggle-details' });
  handle({ type: 'toggle-edit' });
  await wait(1200);
  await shot(overlay, `overlay-edit-${scen}`);
  handle({ type: 'toggle-edit' });
  for (const tab of (process.env.DIA_TABS ?? 'status').split(',')) {
    control?.webContents.send('select-tab', tab);
    await wait(900);
    await shot(control, `control-${tab}-${scen}`);
  }
  if (process.env.DIA_ALERT_STEPS) {
    for (let i = 0; i < Number(process.env.DIA_ALERT_STEPS); i++) { await wait(1000); }
    await shot(overlay, `overlay-later-${scen}`);
  }
  app.quit();
}

async function measure(seconds: number) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const samples = controller.perf.filter((p) => p.at >= start + 4000);
  const avg = (f: (p: (typeof samples)[number]) => number) => samples.reduce((s, p) => s + f(p), 0) / Math.max(1, samples.length);
  const out = {
    measuredAt: new Date().toISOString(), seconds, samples: samples.length, platform: process.platform, electron: process.versions.electron,
    cpuPctAvg: avg((p) => p.cpuPct), cpuPctMax: Math.max(...samples.map((p) => p.cpuPct)), memMBAvg: avg((p) => p.memMB), memMBMax: Math.max(...samples.map((p) => p.memMB)),
    gpuProcessCpuPctAvg: avg((p) => p.gpuCpuPct ?? 0),
    note: 'Summe aller Electron-Prozesse (app.getAppMetrics). Ohne laufendes Spiel gemessen – kein FPS-Einfluss messbar.',
  };
  fs.writeFileSync(process.env.DIA_MEASURE_OUT ?? 'perf.json', JSON.stringify(out, null, 2));
  app.quit();
}

app.on('will-quit', () => { globalShortcut.unregisterAll(); controller?.provider?.stop(); });
app.on('window-all-closed', () => app.quit());
