// Electron-Hülle: startet den eingebetteten Next.js-Standalone-Server (inkl. Hintergrund-Poller)
// und zeigt die Oberfläche in einem Fenster. Daten liegen im Benutzerprofil (userData).
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const updater = require("./updater");
const desktopSettings = require("./desktop-settings");
const ingest = require("./ingest");

app.setAppUserModelId("local.deadlock-tracker"); // gruppiert die Taskbar-Symbole und sorgt für korrekte Benachrichtigungen
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let quitting = false;
let serverPort = 0;
let settings = desktopSettings.DEFAULTS;

const asset = (name) => path.join(__dirname, "..", "app-icons", name);
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
  tray.setToolTip("Deadlock Tracker – läuft im Hintergrund");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Deadlock Tracker öffnen", click: showWindow },
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
    title: "Deadlock Tracker",
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
  await win.loadURL(`http://127.0.0.1:${serverPort}/`);
  if (settings.closeToTray) buildTray();
}

ipcMain.handle("desktop:get", () => settings);
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
  const note = new Notification({ title: String(n.title || "Deadlock Tracker").slice(0, 80), body: String(n.body || "").slice(0, 200), icon: asset("icon-256.png") });
  note.on("click", () => { showWindow(); if (n.path && win) win.webContents.send("desktop:navigate", String(n.path)); });
  note.show();
  return true;
});

app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; ingest.stop(); });

app.whenReady().then(() => {
  settings = desktopSettings.load();
  return createWindow().catch((e) => {
    dialog.showErrorBox("Deadlock Tracker konnte nicht starten", String(e && e.stack ? e.stack : e));
    app.quit();
  });
});

// Mit "Im Hintergrund weiterlaufen" bleibt der Poller aktiv, auch wenn das Fenster geschlossen ist.
app.on("window-all-closed", () => { if (!settings.closeToTray || quitting) app.quit(); });
