import { app, BrowserWindow, ipcMain, net, protocol, session, shell, type IpcMainInvokeEvent } from 'electron';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { RoomModeSchema } from '@liked/protocol';
import type { AppSettings, TikTokOverview, UpdateState } from '../src/shared/ipc-types.js';
import { DEFAULT_SERVER_URL, lastRoomStore, loadSettings, saveSettings, wipeLocalGameData } from './store.js';
import { TikTokManager } from './tiktok-manager.js';
import { Updater } from './updater.js';
import { LocalServer } from './local-server.js';

/* ------------------------------------------------------------------ */
/* Grundeinstellungen & Sicherheit                                     */
/* ------------------------------------------------------------------ */

const APP_ORIGIN = 'app://liked';
const SMOKE_TEST = process.argv.includes('--smoke-test');

// Clips sollen zum gemeinsamen Startzeitpunkt mit Ton starten können.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId('app.liked.desktop');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (!SMOKE_TEST && !app.requestSingleInstanceLock()) app.quit();
if (process.defaultApp) app.setAsDefaultProtocolClient('liked', process.execPath, [process.argv[1]!]);
else app.setAsDefaultProtocolClient('liked');

let mainWindow: BrowserWindow | null = null;
let settings: AppSettings;
let pendingDeepLink: string | null = null;

const rendererRoot = join(__dirname, '..', 'renderer');

function sendToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function parseDeepLink(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^liked:\/\/join\/([A-Za-z0-9]{6})\/?$/.exec(url.trim());
  return m?.[1]?.toUpperCase() ?? null;
}

function handleDeepLinkArgs(argv: string[]) {
  const code = argv.map(parseDeepLink).find(Boolean);
  if (!code) return;
  if (mainWindow) sendToRenderer('deep-link', code);
  else pendingDeepLink = code;
}

app.on('second-instance', (_e, argv) => {
  handleDeepLinkArgs(argv);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Keine Erweiterungen, keine fremden Fenster, keine Navigation weg von der App.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
  if (contents.getType() === 'window' && contents.session === session.defaultSession) {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (e, url) => {
      if (!url.startsWith(`${APP_ORIGIN}/`)) e.preventDefault();
    });
  }
});

/** IPC nur aus der eigenen Oberfläche (Hauptframe, eigenes Origin). */
function trusted(e: IpcMainInvokeEvent): boolean {
  const frame = e.senderFrame;
  return !!frame && frame === e.sender.mainFrame && frame.url.startsWith(`${APP_ORIGIN}/`) && e.sender === mainWindow?.webContents;
}

function handle<S extends z.ZodTypeAny>(channel: string, schema: S, fn: (arg: z.infer<S>) => unknown) {
  ipcMain.handle(channel, async (e, raw) => {
    if (!trusted(e)) throw new Error('Nicht erlaubt');
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error('Ungültige Eingabe');
    return fn(parsed.data);
  });
}

const None = z.undefined().or(z.null());

/* ------------------------------------------------------------------ */
/* Fenster                                                            */
/* ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    backgroundColor: '#0a0a0f',
    title: 'LIKED',
    autoHideMenuBar: true,
    fullscreen: settings.display.fullscreen,
    icon: join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // Rendering bei minimiertem Fenster drosseln.
      backgroundThrottling: true
    }
  });
  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => {
    if (!SMOKE_TEST) mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingDeepLink) sendToRenderer('deep-link', pendingDeepLink);
    pendingDeepLink = null;
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

app.whenReady().then(async () => {
  settings = loadSettings();

  // Eigene Oberfläche über app:// – verhindert Pfad-Traversal.
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    if (url.host !== 'liked') return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = normalize(join(rendererRoot, rel));
    if (!target.startsWith(rendererRoot + sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });

  // Berechtigungen: nur Vollbild (für den Player) und Wiedergabe; alles andere ablehnen.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'fullscreen');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');

  const tiktok = new TikTokManager(
    () => settings,
    (o: TikTokOverview) => sendToRenderer('tiktok:status', o)
  );
  const updater = new Updater((s: UpdateState) => sendToRenderer('updates:status', s));
  const localServer = new LocalServer();

  handle('app:info', None, () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    smokeTest: SMOKE_TEST,
    defaultServerUrl: DEFAULT_SERVER_URL
  }));
  ipcMain.on('app:smoke-done', (e, ok) => {
    if (!SMOKE_TEST || e.sender !== mainWindow?.webContents) return;
    console.log(`SMOKE_TEST_RESULT=${ok === true ? 'ok' : 'fail'}`);
    app.exit(ok === true ? 0 : 1);
  });
  ipcMain.on('app:quit', (e) => {
    if (e.sender === mainWindow?.webContents) app.quit();
  });

  const SettingsPatch = z
    .object({
      profile: z.object({ name: z.string().max(40), avatar: z.string().max(20), deviceId: z.string().max(64) }).partial(),
      serverUrl: z.string().url().max(300).refine((u) => /^https?:\/\//.test(u)),
      audio: z
        .object({
          music: z.number().min(0).max(1),
          sfx: z.number().min(0).max(1),
          musicMuted: z.boolean(),
          sfxMuted: z.boolean(),
          videoStartMuted: z.boolean()
        })
        .partial(),
      display: z
        .object({
          fullscreen: z.boolean(),
          reducedMotion: z.enum(['system', 'on', 'off']),
          effects: z.enum(['high', 'low'])
        })
        .partial(),
      introSeen: z.boolean(),
      experimentalWebAdapter: z.boolean()
    })
    .partial();

  handle('settings:get', None, () => settings);
  handle('settings:set', SettingsPatch, (patch) => {
    settings = {
      ...settings,
      ...patch,
      profile: { ...settings.profile, ...patch.profile, deviceId: settings.profile.deviceId },
      audio: { ...settings.audio, ...patch.audio },
      display: { ...settings.display, ...patch.display }
    };
    if (patch.serverUrl !== undefined) settings.serverUrlCustom = patch.serverUrl.replace(/\/$/, '') !== DEFAULT_SERVER_URL.replace(/\/$/, '');
    saveSettings(settings);
    if (patch.display?.fullscreen !== undefined) mainWindow?.setFullScreen(patch.display.fullscreen);
    return settings;
  });
  handle('settings:wipe', None, async () => {
    await tiktok.disconnect();
    wipeLocalGameData();
  });
  handle('window:fullscreen', z.boolean(), (on) => {
    mainWindow?.setFullScreen(on);
  });
  handle('shell:open', z.string().url().max(500), async (url) => {
    // Nur bekannte, sichere Ziele im System-Browser öffnen.
    if (!/^https:\/\/(www\.tiktok\.com|github\.com|developers\.tiktok\.com)\//.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  const Adapter = z.enum(['portability', 'web-experimental', 'demo']);
  handle('tiktok:overview', None, () => tiktok.overview());
  handle('tiktok:connect', Adapter, (a) => tiktok.connect(a));
  handle('tiktok:sync', None, () => tiktok.sync());
  handle('tiktok:cancel', None, () => tiktok.cancel());
  handle('tiktok:commit', None, () => tiktok.commitCollected());
  handle('tiktok:disconnect', None, () => tiktok.disconnect());
  handle('tiktok:sample', z.number().int().min(1).max(20), (n) => tiktok.sample(n));
  handle('tiktok:list', None, () => tiktok.listClips());
  handle('tiktok:exclude', z.object({ id: z.string().regex(/^\d{6,25}$/), excluded: z.boolean() }), ({ id, excluded }) =>
    tiktok.setExcluded(id, excluded)
  );
  handle('tiktok:pool', z.object({ mode: RoomModeSchema, salt: z.string().regex(/^[a-f0-9]{32}$/) }), ({ mode, salt }) =>
    tiktok.buildPool(mode, salt)
  );
  handle('tiktok:played', z.array(z.string().max(40)).max(20), (ids) => tiktok.recordPlayed(ids));

  handle('updates:check', None, () => updater.check());
  handle('updates:download', None, () => updater.download());
  handle('updates:installOnQuit', None, () => updater.installOnQuit());

  handle('local:start', z.number().int(), (port) => localServer.start(port));
  handle('local:stop', None, () => localServer.stop());
  handle('local:status', None, () => localServer.status());

  const LastRoom = z
    .object({ serverUrl: z.string().max(300), code: z.string().regex(/^[A-Z0-9]{6}$/), token: z.string().max(64), at: z.number() })
    .nullable();
  handle('lastRoom:get', None, () => lastRoomStore.get());
  handle('lastRoom:set', LastRoom, (v) => lastRoomStore.set(v));

  createWindow();
  handleDeepLinkArgs(process.argv);
  if (!SMOKE_TEST) void tiktok.restore();

  if (SMOKE_TEST) {
    // Harte Obergrenze, falls der Renderer nie antwortet.
    setTimeout(() => {
      console.log('SMOKE_TEST_RESULT=timeout');
      app.exit(2);
    }, 45_000);
  }

  app.on('before-quit', () => {
    tiktok.dispose();
    void localServer.stop();
  });
});

app.on('window-all-closed', () => app.quit());
