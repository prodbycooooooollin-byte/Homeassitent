// Automatische Updates über electron-updater (generic-Provider auf dem Release "dt-latest").
// Ablauf: beim Start und danach alle 30 Min. prüfen -> im Hintergrund laden -> Nutzer sieht Banner
// "Neu starten & installieren"; ohne Klick wird nichts installiert.
const { app, ipcMain } = require("electron");

const CHECK_EVERY_MS = 30 * 60 * 1000;
const RELEASES_URL = "https://github.com/prodbycooooooollin-byte/Homeassitent/releases";

// status: idle | checking | available | downloading | ready | uptodate | error | unsupported
let state = { status: "idle", version: app.getVersion(), current: app.getVersion(), percent: 0, message: "", releasesUrl: RELEASES_URL };
let win = null;
let autoUpdater = null;

const portable = !!process.env.PORTABLE_EXECUTABLE_FILE; // portable EXE kann sich nicht selbst ersetzen

function push(patch) {
  state = { ...state, ...patch };
  if (win && !win.isDestroyed()) win.webContents.send("updater:state", state);
}

function setup(mainWindow) {
  win = mainWindow;

  ipcMain.handle("updater:info", () => state);
  ipcMain.handle("updater:check", () => check());
  ipcMain.handle("updater:install", () => {
    if (state.status !== "ready" || !autoUpdater) return;
    // Erst sichtbar anzeigen, dass jetzt installiert wird – dann beenden und das Installationsfenster öffnen
    push({ status: "installing", message: "" });
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 3500);
  });

  if (!app.isPackaged) return push({ status: "unsupported", message: "Entwicklungsmodus – keine Updates." });
  if (portable) return push({ status: "unsupported", message: "Portable Version: bitte neue EXE manuell von der Release-Seite laden (oder den Installer nutzen)." });

  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (e) {
    return push({ status: "unsupported", message: "Updater nicht verfügbar: " + e.message });
  }
  autoUpdater.autoDownload = true;
  // Nie ohne Zutun installieren: erst auf Klick („Neu starten & installieren“), dann mit sichtbarem Installationsfenster
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = true;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => push({ status: "checking", message: "" }));
  autoUpdater.on("update-available", (i) => push({ status: "available", version: i.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => push({ status: "uptodate", message: "", lastCheck: Date.now() }));
  autoUpdater.on("download-progress", (p) => push({ status: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (i) => push({ status: "ready", version: i.version, percent: 100 }));
  const friendly = (e) => {
  const m = String((e && e.message) || e);
  // Prüfsummenfehler: Meist wird gerade ein neuer Build veröffentlicht (Manifest und Installer stammen aus unterschiedlichen Läufen).
  if (/sha512|checksum/i.test(m)) return "Das Update wird gerade veröffentlicht (Prüfsumme passt noch nicht). Bitte in ein paar Minuten erneut suchen.";
  return m.slice(0, 200);
};
autoUpdater.on("error", (e) => push({ status: "error", message: friendly(e), lastCheck: Date.now() }));

  setTimeout(check, 8000);
  setInterval(check, CHECK_EVERY_MS);
}

async function check() {
  if (!autoUpdater || state.status === "downloading" || state.status === "ready") return state;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    push({ status: "error", message: friendly(e), lastCheck: Date.now() });
  }
  return state;
}

module.exports = { setup };
