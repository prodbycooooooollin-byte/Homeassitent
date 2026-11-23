/**
 * VICE INTEL desktop app (Electron).
 * Starts the bundled Next.js server on a free local port, shows the app in a
 * native window and keeps itself up to date from GitHub Releases.
 */
const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const http = require("node:http");

const isDev = !app.isPackaged;
const BG = "#06050a";
let mainWindow = null;
let splash = null;
let server = null;
let port = 0;

/* ----------------------------- settings ----------------------------- */

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}
function writeSettings(next) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
}

/* ------------------------------ server ------------------------------ */

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port: p } = srv.address();
      srv.close(() => resolve(p));
    });
  });
}

function waitForServer(p, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: "127.0.0.1", port: p, path: "/manifest.webmanifest", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => (Date.now() - started > timeoutMs ? reject(new Error("Server did not start")) : setTimeout(tryOnce, 150)));
      req.on("timeout", () => req.destroy());
    };
    tryOnce();
  });
}

async function startServer() {
  if (server) {
    server.kill();
    server = null;
  }
  port = await freePort();
  const serverDir = isDev ? path.join(__dirname, "..", ".next", "standalone") : path.join(process.resourcesPath, "app");
  const entry = path.join(serverDir, "server.js");
  if (!fs.existsSync(entry)) throw new Error(`Bundled server not found at ${entry}. Run "npm run desktop:prepare" first.`);
  const settings = readSettings();
  server = utilityProcess.fork(entry, [], {
    cwd: serverDir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
      VICE_INTEL_DESKTOP: "1",
      ...(settings.anthropicApiKey ? { ANTHROPIC_API_KEY: settings.anthropicApiKey } : {}),
    },
  });
  await waitForServer(port);
}

/* ------------------------------ windows ----------------------------- */

function createSplash() {
  splash = new BrowserWindow({ width: 420, height: 280, frame: false, resizable: false, backgroundColor: BG, show: true, center: true, skipTaskbar: true });
  splash.loadFile(path.join(__dirname, "splash.html"));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 380,
    minHeight: 600,
    show: false,
    backgroundColor: BG,
    title: "VICE INTEL",
    icon: path.join(__dirname, "icons", "icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: BG, symbolColor: "#e9e4f5", height: 40 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const origin = `http://127.0.0.1:${port}`;
  // External links open in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("render-process-gone", () => mainWindow.reload());

  mainWindow.once("ready-to-show", () => {
    splash?.destroy();
    splash = null;
    mainWindow.show();
  });
  mainWindow.loadURL(origin);
}

/* ------------------------------ updates ----------------------------- */

function setupUpdates() {
  if (isDev) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `VICE INTEL ${info.version} is ready to install.`,
      detail: "Restart now to update, or it will install the next time you close the app.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (err) => console.error("[updater]", err?.message ?? err));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

/* -------------------------------- IPC ------------------------------- */

ipcMain.handle("desktop:info", () => ({
  version: app.getVersion(),
  hasApiKey: Boolean(readSettings().anthropicApiKey),
}));

ipcMain.handle("desktop:set-api-key", async (_e, key) => {
  const s = readSettings();
  if (typeof key === "string" && key.trim()) s.anthropicApiKey = key.trim();
  else delete s.anthropicApiKey;
  writeSettings(s);
  await startServer(); // restart with the new environment
  mainWindow?.loadURL(`http://127.0.0.1:${port}/settings?saved=1`);
  return { ok: true };
});

ipcMain.handle("desktop:check-updates", async () => {
  if (isDev) return { status: "dev" };
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    return { status: latest && latest !== app.getVersion() ? "downloading" : "current", latest };
  } catch (err) {
    return { status: "error", message: String(err?.message ?? err) };
  }
});

/* ------------------------------ lifecycle --------------------------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.viceintel.app");
    createSplash();
    try {
      await startServer();
      createMainWindow();
      setupUpdates();
    } catch (err) {
      splash?.destroy();
      dialog.showErrorBox("VICE INTEL could not start", String(err?.message ?? err));
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => server?.kill());
}
