import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readGameVersionFromLcu } from '../data/lcuVersion';
import { LiveClient } from '../data/liveClient';
import { LivePoller } from '../data/poller';
import { type AppSettings, Controller, DEFAULT_APP_SETTINGS } from './controller';

// Windows-Desktop-App: liest ausschließlich die lokale Live Client Data API,
// zeigt ein klickdurchlässiges Overlay und steuert NICHTS im Spiel.

const dataDir = app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(__dirname, '..', '..', 'data');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Partial<AppSettings>;
    return {
      ...DEFAULT_APP_SETTINGS, ...raw,
      advisor: { ...DEFAULT_APP_SETTINGS.advisor, ...(raw.advisor ?? {}) },
      overlay: { ...DEFAULT_APP_SETTINGS.overlay, ...(raw.overlay ?? {}) },
    };
  } catch { return DEFAULT_APP_SETTINGS; }
}

function saveSettings(s: AppSettings) {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch { /* nicht kritisch */ }
}

let overlay: BrowserWindow | null = null;
let control: BrowserWindow | null = null;
let interactive = false;
let controller: Controller;
let poller: LivePoller | null = null;
let simTimer: NodeJS.Timeout | null = null;

const BASE_W = 380;
const BASE_H = 420; // Startwert; danach passt der Renderer die Höhe an den Inhalt an.

function overlaySize() {
  const s = controller.settings.overlay;
  return { width: Math.round(BASE_W * s.scale), height: overlay ? overlay.getBounds().height : Math.round(BASE_H * s.scale) };
}

function createOverlay() {
  const wa = screen.getPrimaryDisplay().workArea;
  const o = controller.settings.overlay;
  const { width, height } = overlaySize();
  overlay = new BrowserWindow({
    width, height,
    x: o.x ?? wa.x + wa.width - width - 24,
    y: o.y ?? wa.y + 120,
    transparent: true, frame: false, resizable: true, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, hasShadow: false, show: o.visible,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlay.on('moved', () => {
    if (!overlay) return;
    const [x, y] = overlay.getPosition();
    controller.updateSettings({ overlay: { ...controller.settings.overlay, x, y } });
    saveSettings(controller.settings);
  });
}

function createControl() {
  if (control && !control.isDestroyed()) { control.show(); control.focus(); return; }
  control = new BrowserWindow({
    width: 1080, height: 820, title: 'LoL Build-Assistent – Steuerung',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  control.setMenuBarVisibility(false);
  control.loadFile(path.join(__dirname, '..', 'renderer', 'control.html'));
  control.on('closed', () => { control = null; });
}

function applyOverlayLayout() {
  if (!overlay) return;
  const { width, height } = overlaySize();
  overlay.setBounds({ ...overlay.getBounds(), width, height });
  overlay.webContents.send('overlay:layout', { scale: controller.settings.overlay.scale, expanded: controller.settings.overlay.expanded, interactive });
}

function push() {
  const vm = controller.viewModel();
  overlay?.webContents.send('vm', vm);
  if (control && !control.isDestroyed()) {
    control.webContents.send('vm', vm);
    control.webContents.send('control', controller.controlSnapshot({
      pollerStats: poller?.stats(), schema: poller?.schema, inventoryEvents: poller?.inventoryEvents.slice(-40),
    }));
  }
}

function startLive() {
  stopSim();
  const s = controller.settings;
  const client = new LiveClient({ caFile: s.riotCaFile ?? undefined });
  poller = new LivePoller(client, controller.data.patch.items, {
    intervalMs: s.pollIntervalMs, staleAfterMs: Math.max(6000, s.pollIntervalMs * 3), endedAfterMs: 60000,
    versionProvider: s.useLcuForVersion ? () => readGameVersionFromLcu({ lockfilePath: s.lockfilePath }) : undefined,
  });
  poller.on('state', (st) => { controller.onLiveState(st); push(); });
  poller.on('waiting', (reason: string) => { controller.onWaiting(reason); push(); });
  poller.start();
}

function stopLive() { poller?.stop(); poller = null; }

function startSim() {
  stopLive();
  controller.setMode('simulation');
  // Takt wie im Live-Betrieb, damit Hysterese/Stabilität identisch wirken.
  simTimer = setInterval(() => { controller.simTick(); push(); }, controller.settings.pollIntervalMs);
  push();
}

function stopSim() { if (simTimer) clearInterval(simTimer); simTimer = null; }

type Action =
  | { type: 'mode'; mode: 'live' | 'simulation' }
  | { type: 'settings'; patch: Partial<AppSettings> & { advisor?: Partial<AppSettings['advisor']> } }
  | { type: 'manual-items'; championKey: string; items: number[] }
  | { type: 'sim-load'; id: string }
  | { type: 'sim-step'; delta: number }
  | { type: 'sim-change'; who: string; add: number[]; remove: number[] }
  | { type: 'overlay-toggle' | 'overlay-expand' | 'overlay-interactive' }
  | { type: 'overlay-scale'; delta: number }
  | { type: 'overlay-height'; height: number }
  | { type: 'open-control' }
  | { type: 'request' };

function handle(a: Action) {
  switch (a.type) {
    case 'mode':
      if (a.mode === 'simulation') startSim(); else { controller.setMode('live'); startLive(); }
      break;
    case 'settings':
      controller.updateSettings(a.patch);
      saveSettings(controller.settings);
      controller.mode === 'simulation' ? controller.simTick() : controller.recompute();
      applyOverlayLayout();
      break;
    case 'manual-items': controller.setManualEnemyItems(a.championKey, a.items); break;
    case 'sim-load': controller.loadScenario(a.id); break;
    case 'sim-step': controller.simStep(a.delta); break;
    case 'sim-change': controller.simChange(a.who, a.add, a.remove); break;
    case 'overlay-toggle': {
      const visible = !(overlay?.isVisible() ?? true);
      if (visible) overlay?.showInactive(); else overlay?.hide();
      controller.updateSettings({ overlay: { ...controller.settings.overlay, visible } });
      saveSettings(controller.settings);
      break;
    }
    case 'overlay-expand':
      controller.updateSettings({ overlay: { ...controller.settings.overlay, expanded: !controller.settings.overlay.expanded } });
      saveSettings(controller.settings); applyOverlayLayout();
      break;
    case 'overlay-interactive':
      interactive = !interactive;
      overlay?.setIgnoreMouseEvents(!interactive, { forward: true });
      overlay?.setFocusable(interactive);
      applyOverlayLayout();
      break;
    case 'overlay-scale': {
      const scale = Math.max(0.7, Math.min(1.6, controller.settings.overlay.scale + a.delta));
      controller.updateSettings({ overlay: { ...controller.settings.overlay, scale } });
      saveSettings(controller.settings); applyOverlayLayout();
      break;
    }
    case 'open-control': createControl(); break;
    case 'overlay-height': {
      if (!overlay) return;
      const max = screen.getPrimaryDisplay().workArea.height - 40;
      const h = Math.max(120, Math.min(max, Math.round(a.height)));
      const b = overlay.getBounds();
      if (Math.abs(b.height - h) > 2) overlay.setBounds({ ...b, height: h });
      return;
    }
    case 'request': break;
  }
  push();
}

app.whenReady().then(() => {
  controller = new Controller(dataDir, loadSettings());
  createOverlay();
  const hotkeys: [string, Action][] = [
    ['CommandOrControl+Shift+O', { type: 'overlay-toggle' }],
    ['CommandOrControl+Shift+E', { type: 'overlay-expand' }],
    ['CommandOrControl+Shift+L', { type: 'overlay-interactive' }],
    ['CommandOrControl+Shift+Up', { type: 'overlay-scale', delta: 0.1 }],
    ['CommandOrControl+Shift+Down', { type: 'overlay-scale', delta: -0.1 }],
    ['CommandOrControl+Shift+K', { type: 'open-control' }],
  ];
  for (const [acc, action] of hotkeys) globalShortcut.register(acc, () => handle(action));
  ipcMain.on('action', (_e, a: Action) => handle(a));
  overlay?.webContents.on('did-finish-load', () => { applyOverlayLayout(); push(); });
  createControl();
  control?.webContents.on('did-finish-load', push);
  if (process.argv.includes('--simulation')) startSim(); else startLive();
  if (process.env.LOLBA_CAPTURE) void captureForVerification(process.env.LOLBA_CAPTURE);
});

// Nur für automatisierte Sichtprüfung (CI/Entwicklung): Screenshots im Simulationsmodus.
async function captureForVerification(dir: string) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (name: string) => {
    for (const [w, n] of [[overlay, `overlay-${name}`], [control, `control-${name}`]] as const) {
      if (!w || w.isDestroyed()) continue;
      const img = await w.webContents.capturePage();
      fs.writeFileSync(path.join(dir, `${n}.png`), img.toPNG());
    }
  };
  await wait(2500);
  handle({ type: 'sim-load', id: process.env.LOLBA_SCENARIO ?? 'jinx-armor-stack' });
  await wait(1500);
  await shot('start');
  for (let i = 0; i < Number(process.env.LOLBA_STEPS ?? 5); i++) { handle({ type: 'sim-step', delta: 1 }); await wait(2500); }
  await shot('after');
  handle({ type: 'overlay-expand' });
  await wait(1500);
  await shot('expanded');
  app.quit();
}

app.on('will-quit', () => { globalShortcut.unregisterAll(); stopLive(); stopSim(); });
app.on('window-all-closed', () => app.quit());
