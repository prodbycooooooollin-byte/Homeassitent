// Electron-Hülle: startet den eingebetteten Next.js-Standalone-Server (inkl. Hintergrund-Poller)
// und zeigt die Oberfläche in einem Fenster. Daten liegen im Benutzerprofil (userData).
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const updater = require("./updater");
const desktopSettings = require("./desktop-settings");
const ingest = require("./ingest");
const matchwatch = require("./matchwatch");
const recorder = require("./recorder");
const gamelog = require("./gamelog");
const livegc = require("./livegc");
const { execFile } = require("child_process");

// Umbenennung: Daten aus dem früheren Ordner „Deadlock Tracker“ einmalig übernehmen (Spieler, Matches, Einstellungen)
try {
  const oldData = path.join(app.getPath("appData"), "Deadlock Tracker"), newData = app.getPath("userData");
  if (oldData !== newData && fs.existsSync(path.join(oldData, "store.json")) && !fs.existsSync(path.join(newData, "store.json"))) {
    fs.cpSync(oldData, newData, { recursive: true, force: false, filter: (p) => !/[\\/](Cache|Code Cache|GPUCache|DawnCache|ShaderCache|blob_storage)([\\/]|$)/i.test(p) });
  }
} catch { /* nicht kritisch */ }
app.setAppUserModelId("local.deadlock-tracker"); // gruppiert die Taskbar-Symbole und sorgt für korrekte Benachrichtigungen
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let quitting = false;
let serverPort = 0;
let settings = desktopSettings.DEFAULTS;

const asset = (name) => path.join(__dirname, "..", "app-icons", name);
/** Meldet dem eingebetteten Server „Match <id> ist zu Ende“ – er lädt es im Hintergrund, sobald es verfügbar ist. */
function postHint(matchId, source) {
  try {
    const req = http.request({ host: "127.0.0.1", port: serverPort, path: "/api/matches/hint", method: "POST", headers: { "content-type": "application/json" }, timeout: 5000 }, (res) => res.resume());
    req.on("error", () => {}); req.on("timeout", () => req.destroy());
    req.end(JSON.stringify({ matchId, source }));
  } catch { /* optional */ }
}

/** Erkennt, ob Deadlock läuft (Prozess deadlock.exe): Der Server fragt dann schneller ab, nach Spielende noch eine Weile besonders schnell. */
function startGameWatch() {
  if (process.platform !== "win32") return;
  globalThis.__dlGame = { running: false, since: null, endedAt: null };
  const check = () => execFile("tasklist", ["/NH", "/FO", "CSV"], { windowsHide: true, timeout: 8000 }, (err, out) => {
    if (err) return;
    const running = /"(deadlock|project8)\.exe"/i.test(String(out));
    const g = globalThis.__dlGame;
    if (running && !g.running) globalThis.__dlGame = { running: true, since: Date.now(), endedAt: null };
    else if (!running && g.running) globalThis.__dlGame = { running: false, since: g.since, endedAt: Date.now() };
  });
  check(); setInterval(check, 5000);
}

const standaloneDir = () => (app.isPackaged ? path.join(process.resourcesPath, "standalone") : path.join(__dirname, "..", ".next", "standalone"));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/status", timeout: 2000 }, (res) => { res.resume(); resolve(); });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => (Date.now() > deadline ? reject(new Error("Server startet nicht")) : setTimeout(attempt, 250));
    attempt();
  });
}

async function startServer() {
  const port = await freePort();
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.NODE_ENV = "production";
  process.env.TRACKER_DATA_FILE = path.join(app.getPath("userData"), "store.json");
  // Replay-Auswertung läuft als eigener Prozess; die gebündelte Datei liegt (bei installierter App) außerhalb des asar-Archivs
  const worker = path.join(__dirname, "replay-worker.bundle.mjs").replace("app.asar", "app.asar.unpacked");
  if (fs.existsSync(worker)) process.env.DL_REPLAY_WORKER = worker;
  require(path.join(standaloneDir(), "server.js"));
  await waitForServer(port);
  return port;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!settings.autoStart, args: settings.startMinimized ? ["--hidden"] : [] });
}

function buildTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(asset("tray.png"));
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(asset("icon.png")).resize({ width: 24, height: 24 }) : img);
  tray.setToolTip("Lockscope – läuft im Hintergrund");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Lockscope öffnen", click: showWindow },
    { type: "separator" },
    { label: "Beenden", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", showWindow);
}

async function createWindow() {
  serverPort = await startServer();
  const hidden = process.argv.includes("--hidden"); // Autostart im Hintergrund
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#07080c",
    title: "Lockscope",
    icon: asset("icon.ico"),
    autoHideMenuBar: true,
    show: false,
    // Eigene Titelleiste: Die System-Leiste verschwindet, Minimieren/Maximieren/Schließen sitzen in der App-Leiste.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#080a10", symbolColor: "#e8ebf2", height: 64 },
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  // Steam-Anmeldung läuft im selben Fenster; andere externe Seiten öffnen im Standardbrowser
  win.webContents.on("will-navigate", (e, url) => {
    const u = new URL(url);
    const ok = u.hostname === "127.0.0.1" || u.hostname === "steamcommunity.com";
    if (!ok) { e.preventDefault(); shell.openExternal(url); }
  });
  win.once("ready-to-show", () => { if (!hidden) win.show(); });
  win.on("close", (e) => {
    if (!quitting && settings.closeToTray) { e.preventDefault(); win.hide(); buildTray(); }
  });
  updater.setup(win);
  ingest.onChange((s) => { if (win && !win.isDestroyed()) win.webContents.send("ingest:state", s); });
  if (settings.ingest) ingest.start();
  ingest.onHint((id) => postHint(id, "ingest"));
  startGameWatch();
  // Match-ID aus dem Spiel-Log: sobald das Match vorbei ist (PostGame / Lobby zerstört / zurück ins Hideout), sofort laden
  const hinted = new Set();
  livegc.init({ dir: app.getPath("userData"), worker: path.join(__dirname, "broadcast-worker.bundle.mjs").replace("app.asar", "app.asar.unpacked"), gamelog, safeStorage: require("electron").safeStorage });
  gamelog.onEvent((ev) => {
    if (ev.type === "lobby") livegc.onMatch({ matchId: ev.matchId, lobbyId: ev.lobbyId });
    if (ev.type === "matchOver" || ev.type === "matchEnd") livegc.onMatchOver();
    if (ev.type !== "matchOver" && ev.type !== "matchEnd") return;
    const id = ev.matchId || (gamelog.get().matchId);
    if (!id || hinted.has(id)) return;
    hinted.add(id);
    postHint(id, "log");
    if (win && !win.isDestroyed()) win.webContents.send("match:ended", { matchId: id, source: "log" });
  });
  gamelog.start().catch(() => { /* optional */ });
  matchwatch.start((m) => { postHint(m.matchId, "cache"); if (win && !win.isDestroyed()) win.webContents.send("match:ended", m); }).catch(() => { /* optional */ });
  await win.loadURL(`http://127.0.0.1:${serverPort}/`);
  if (settings.closeToTray) buildTray();
}

ipcMain.handle("desktop:get", () => settings);
// Der Installer startet die App nach einem Update mit „--updated“
ipcMain.handle("desktop:updated", () => process.argv.includes("--updated"));
ipcMain.handle("recorder:control", (_e, a) => (a === "start" ? recorder.start() : a === "stop" ? recorder.stop() : a === "reset" ? recorder.reset() : recorder.status()));
ipcMain.handle("live:control", (_e, a, p) => (a === "login" ? livegc.loginQR() : a === "credentials" ? livegc.loginCredentials(String(p?.account || ""), String(p?.password || "")) : a === "guard" ? livegc.submitGuard(p?.code) : a === "logout" ? livegc.logout() : livegc.status()));
ipcMain.handle("matchwatch:info", () => matchwatch.info());
ipcMain.handle("ingest:status", () => ingest.getStatus());
ipcMain.handle("ingest:control", (_e, action) => ingest.control(String(action)));
ipcMain.handle("desktop:set", (_e, patch) => {
  settings = { ...settings, ...desktopSettings.sanitize(patch || {}) };
  desktopSettings.save(settings);
  applyLoginItem();
  if (settings.ingest) ingest.start(); else ingest.stop();
  if (settings.closeToTray) buildTray();
  else if (tray) { tray.destroy(); tray = null; }
  return settings;
});
ipcMain.handle("desktop:notify", (_e, n) => {
  if (!settings.desktopNotifications || !Notification.isSupported()) return false;
  const note = new Notification({ title: String(n.title || "Lockscope").slice(0, 80), body: String(n.body || "").slice(0, 200), icon: asset("icon-256.png") });
  note.on("click", () => { showWindow(); if (n.path && win) win.webContents.send("desktop:navigate", String(n.path)); });
  note.show();
  return true;
});

app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; ingest.stop(); matchwatch.stop(); });

app.whenReady().then(() => {
  settings = desktopSettings.load();
  return createWindow().catch((e) => {
    dialog.showErrorBox("Lockscope konnte nicht starten", String(e && e.stack ? e.stack : e));
    app.quit();
  });
});

// Mit "Im Hintergrund weiterlaufen" bleibt der Poller aktiv, auch wenn das Fenster geschlossen ist.
app.on("window-all-closed", () => { if (!settings.closeToTray || quitting) app.quit(); });
