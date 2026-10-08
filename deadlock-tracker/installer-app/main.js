// Eigener Installer für Lockscope: zeigt eine eigene Oberfläche, lädt das aktuelle Installationspaket (NSIS) aus dem
// Update-Release, prüft die Prüfsumme und führt es still aus. Dadurch sieht der Benutzer nie den Standard-Windows-Installer.
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");

const BASE = "https://github.com/prodbycooooooollin-byte/Homeassitent/releases/download/dt-latest";
const APP_EXE = "Lockscope.exe";
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
// Update-Modus: Die App hat das Update schon geladen und geprüft und startet uns mit dem Pfad – dann entfällt der Download
const UPDATE_FILE = arg("update"), UPDATE_DIR = arg("dir"), UPDATE_VERSION = arg("version");
const defaultDir = () => UPDATE_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "Lockscope");

let win = null;
let installing = false;
const emit = (m) => { if (win && !win.isDestroyed()) win.webContents.send("setup:event", m); };

/** HTTPS-GET mit Weiterleitungen (GitHub leitet auf einen Objektspeicher um). */
function get(url, onResponse, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "user-agent": "lockscope-installer" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) {
        res.resume();
        return get(new URL(res.headers.location, url).href, onResponse, hops + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Server antwortete mit HTTP ${res.statusCode}`)); }
      Promise.resolve(onResponse(res)).then(resolve, reject);
    });
    req.setTimeout(30000, () => req.destroy(new Error("Zeitüberschreitung bei der Verbindung")));
    req.on("error", reject);
  });
}
const text = (url) => get(url, (res) => new Promise((resolve, reject) => { let s = ""; res.setEncoding("utf8"); res.on("data", (c) => (s += c)); res.on("end", () => resolve(s)); res.on("error", reject); }));

async function manifest() {
  const y = await text(`${BASE}/latest.yml?t=${Date.now()}`);
  const pick = (re) => (re.exec(y) || [])[1]?.trim();
  const file = pick(/^path:\s*(.+)$/m), sha512 = pick(/^sha512:\s*(.+)$/m), version = pick(/^version:\s*(.+)$/m);
  const size = Number(pick(/^\s*size:\s*(\d+)$/m)) || 0;
  if (!file || !sha512) throw new Error("Das Update-Manifest ist unvollständig.");
  return { file, sha512, version, size };
}

function download(url, dest, expected, onProgress) {
  return get(url, (res) => new Promise((resolve, reject) => {
    const total = Number(res.headers["content-length"]) || expected.size || 0;
    const hash = crypto.createHash("sha512");
    const out = fs.createWriteStream(dest);
    let got = 0, lastT = Date.now(), lastB = 0, speed = 0;
    res.on("data", (c) => {
      got += c.length; hash.update(c);
      const now = Date.now();
      if (now - lastT >= 400) { speed = ((got - lastB) / (now - lastT)) * 1000; lastT = now; lastB = got; }
      onProgress({ got, total, speed });
    });
    res.pipe(out);
    out.on("finish", () => (hash.digest("base64") === expected.sha512 ? resolve() : reject(new Error("Die Prüfsumme des Downloads stimmt nicht – bitte erneut versuchen."))));
    out.on("error", reject); res.on("error", reject);
  }));
}

function dirSize(dir) {
  let n = 0;
  const walk = (d) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { n += fs.statSync(p).size; } catch { /* egal */ } } } };
  walk(dir);
  return n;
}

/** Beendet noch laufende Instanzen (auch die alte „Deadlock Tracker.exe“), sonst scheitert das Entfernen der alten Version mit Code 2. */
async function stopApp() {
  if (process.platform !== "win32") return;
  for (const name of ["Lockscope.exe", "Deadlock Tracker.exe"]) {
    await new Promise((r) => execFile("taskkill", ["/F", "/T", "/IM", name], { windowsHide: true }, () => r()));
  }
  await new Promise((r) => setTimeout(r, 1800));
}

async function install(dir) {
  if (installing) return;
  installing = true;
  let tmp = path.join(os.tmpdir(), `lockscope-setup-${Date.now()}.exe`);
  let timer = null;
  try {
    let m;
    if (UPDATE_FILE) {
      tmp = UPDATE_FILE; // schon geladen und von der App geprüft
      m = { version: UPDATE_VERSION, size: fs.existsSync(tmp) ? fs.statSync(tmp).size : 0 };
    } else {
      emit({ type: "phase", phase: "prepare", text: "Verbindung zum Server …", pct: 0 });
      m = await manifest();
      emit({ type: "phase", phase: "download", text: `Lade Lockscope ${m.version}`, pct: 0, version: m.version });
      await download(`${BASE}/${encodeURIComponent(m.file)}`, tmp, m, (p) => emit({ type: "download", ...p, pct: p.total ? p.got / p.total : 0 }));
    }

    emit({ type: "phase", phase: "install", text: "Beende laufende Instanz …", pct: 0 });
    await stopApp();
    emit({ type: "phase", phase: "install", text: "Installiere Dateien", pct: 0 });
    const t0 = Date.now();
    const want = Math.max(m.size * 2.4, 200e6);
    timer = setInterval(() => {
      const t = (Date.now() - t0) / 1000;
      const byTime = 1 - Math.exp(-t / 14); // läuft immer weiter, nähert sich 100 % an
      const bySize = Math.min(0.97, dirSize(dir) / want);
      emit({ type: "install", pct: Math.min(0.97, Math.max(byTime * 0.92, bySize)) });
    }, 500);
    const runSetup = () => new Promise((resolve, reject) => {
      // „/D=“ muss das letzte Argument sein und darf nicht in Anführungszeichen stehen
      const child = spawn(tmp, ["/S", `/D=${dir}`], { windowsVerbatimArguments: true, stdio: "ignore" });
      child.on("error", reject);
      child.on("exit", (c) => resolve(c));
    });
    let code = await runSetup();
    if (code && !fs.existsSync(path.join(dir, APP_EXE))) { await stopApp(); await new Promise((r) => setTimeout(r, 2500)); code = await runSetup(); } // zweiter Versuch (z. B. alte Version war noch nicht ganz beendet)
    clearInterval(timer);
    const exe = path.join(dir, APP_EXE);
    if (!fs.existsSync(exe)) throw new Error(code ? `Die Installation wurde mit Code ${code} beendet. Bitte schließe ein laufendes Lockscope und versuche es erneut.` : "Die Installation ist unvollständig geblieben.");
    emit({ type: "phase", phase: "finish", text: "Fertigstellen …", pct: 1 });
    await new Promise((r) => setTimeout(r, 900));
    emit({ type: "done", exe, version: m.version });
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    if (timer) clearInterval(timer);
    installing = false;
    if (!UPDATE_FILE) fs.rm(tmp, { force: true }, () => {});
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 980, height: 600, frame: false, resizable: false, maximizable: false, show: false, center: true,
    backgroundColor: "#07090e", title: "Lockscope – Installation", icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false },
  });
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "ui", "index.html"));
}

if (!app.requestSingleInstanceLock()) app.quit();
// Alte Fenster-/Installationsreste: bei Fehlern im Update-Modus kann der Nutzer den Standard-Installer weiter über die App-Einstellungen anstoßen.
app.whenReady().then(() => {
  ipcMain.handle("setup:info", async () => {
    const dir = defaultDir();
    let version = null;
    try { version = (await manifest()).version; } catch { /* offline: wird beim Installieren gemeldet */ }
    if (UPDATE_FILE) return { mode: "update", dir, version: UPDATE_VERSION, installed: true };
    return { mode: "install", dir, version, installed: fs.existsSync(path.join(dir, APP_EXE)) };
  });
  ipcMain.handle("setup:chooseDir", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Installationsordner wählen", properties: ["openDirectory", "createDirectory"], defaultPath: path.dirname(defaultDir()) });
    return r.canceled || !r.filePaths[0] ? null : path.join(r.filePaths[0], "Lockscope");
  });
  ipcMain.handle("setup:install", (_e, dir) => { install(String(dir || defaultDir())); return true; });
  ipcMain.handle("setup:launch", (_e, exe, args) => {
    try { spawn(String(exe), Array.isArray(args) ? args.map(String) : [], { detached: true, stdio: "ignore" }).unref(); } catch { /* egal */ }
    setTimeout(() => app.quit(), 400);
  });
  ipcMain.handle("setup:minimize", () => win?.minimize());
  ipcMain.handle("setup:close", () => app.quit());
  createWindow();
});
app.on("window-all-closed", () => app.quit());
