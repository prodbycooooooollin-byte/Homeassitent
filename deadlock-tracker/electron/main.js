// Electron-Hülle: startet den eingebetteten Next.js-Standalone-Server (inkl. Hintergrund-Poller)
// und zeigt die Oberfläche in einem Fenster. Daten liegen im Benutzerprofil (userData).
const { app, BrowserWindow, shell, dialog } = require("electron");
const updater = require("./updater");
const path = require("path");
const net = require("net");
const http = require("http");

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function standaloneDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.join(__dirname, "..", ".next", "standalone");
}

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
      const req = http.get({ host: "127.0.0.1", port, path: "/api/status", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
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
  // Konfiguration über Umgebungsvariablen bleibt möglich (DEADLOCK_API_KEY, POLL_INTERVAL_S, DEADLOCK_DEMO …).
  require(path.join(standaloneDir(), "server.js"));
  await waitForServer(port);
  return port;
}

async function createWindow() {
  const port = await startServer();
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#07080c",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    show: false,
    title: "Deadlock Tracker",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  // Externe Links im Standardbrowser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => win.show());
  updater.setup(win);
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() =>
  createWindow().catch((e) => {
    dialog.showErrorBox("Deadlock Tracker konnte nicht starten", String(e && e.stack ? e.stack : e));
    app.quit();
  }),
);

app.on("window-all-closed", () => app.quit());
