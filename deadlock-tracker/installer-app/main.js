// Eigener Installer für den Deadlock Tracker: zeigt eine eigene Oberfläche, lädt das aktuelle Installationspaket (NSIS) aus dem
// Update-Release, prüft die Prüfsumme und führt es still aus. Dadurch sieht der Benutzer nie den Standard-Windows-Installer.
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { spawn } = require("child_process");

const BASE = "https://github.com/prodbycooooooollin-byte/Homeassitent/releases/download/dt-latest";
const APP_EXE = "Deadlock Tracker.exe";
const defaultDir = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "Deadlock Tracker");

let win = null;
let installing = false;
const emit = (m) => { if (win && !win.isDestroyed()) win.webContents.send("setup:event", m); };

/** HTTPS-GET mit Weiterleitungen (GitHub leitet auf einen Objektspeicher um). */
function get(url, onResponse, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "user-agent": "deadlock-tracker-installer" } }, (res) => {
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

async function install(dir) {
  if (installing) return;
  installing = true;
  const tmp = path.join(os.tmpdir(), `deadlock-tracker-setup-${Date.now()}.exe`);
  try {
    emit({ type: "phase", phase: "prepare", text: "Verbindung zum Server …", pct: 0 });
    const m = await manifest();
    emit({ type: "phase", phase: "download", text: `Lade Deadlock Tracker ${m.version}`, pct: 0, version: m.version });
    await download(`${BASE}/${encodeURIComponent(m.file)}`, tmp, m, (p) => emit({ type: "download", ...p, pct: p.total ? p.got / p.total : 0 }));

    emit({ type: "phase", phase: "install", text: "Installiere Dateien", pct: 0 });
    const t0 = Date.now();
    const want = Math.max(m.size * 2.4, 200e6);
    const timer = setInterval(() => {
      const t = (Date.now() - t0) / 1000;
      const byTime = 1 - Math.exp(-t / 14); // läuft immer weiter, nähert sich 100 % an
      const bySize = Math.min(0.97, dirSize(dir) / want);
      emit({ type: "install", pct: Math.min(0.97, Math.max(byTime * 0.92, bySize)) });
    }, 500);
    const code = await new Promise((resolve, reject) => {
      // „/D=“ muss das letzte Argument sein und darf nicht in Anführungszeichen stehen
      const child = spawn(tmp, ["/S", `/D=${dir}`], { windowsVerbatimArguments: true, stdio: "ignore" });
      child.on("error", reject);
      child.on("exit", (c) => resolve(c));
    }).finally(() => clearInterval(timer));
    const exe = path.join(dir, APP_EXE);
    if (!fs.existsSync(exe)) throw new Error(code ? `Die Installation wurde mit Code ${code} beendet. Bitte schließe einen laufenden Deadlock Tracker und versuche es erneut.` : "Die Installation ist unvollständig geblieben.");
    emit({ type: "phase", phase: "finish", text: "Fertigstellen …", pct: 1 });
    await new Promise((r) => setTimeout(r, 900));
    emit({ type: "done", exe, version: m.version });
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    installing = false;
    fs.rm(tmp, { force: true }, () => {});
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 980, height: 600, frame: false, resizable: false, maximizable: false, show: false, center: true,
    backgroundColor: "#07090e", title: "Deadlock Tracker – Installation", icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false },
  });
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "ui", "index.html"));
}

if (!app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(() => {
  ipcMain.handle("setup:info", async () => {
    const dir = defaultDir();
    let version = null;
    try { version = (await manifest()).version; } catch { /* offline: wird beim Installieren gemeldet */ }
    return { dir, version, installed: fs.existsSync(path.join(dir, APP_EXE)) };
  });
  ipcMain.handle("setup:chooseDir", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Installationsordner wählen", properties: ["openDirectory", "createDirectory"], defaultPath: path.dirname(defaultDir()) });
    return r.canceled || !r.filePaths[0] ? null : path.join(r.filePaths[0], "Deadlock Tracker");
  });
  ipcMain.handle("setup:install", (_e, dir) => { install(String(dir || defaultDir())); return true; });
  ipcMain.handle("setup:launch", (_e, exe) => {
    try { spawn(String(exe), [], { detached: true, stdio: "ignore" }).unref(); } catch { /* egal */ }
    setTimeout(() => app.quit(), 400);
  });
  ipcMain.handle("setup:minimize", () => win?.minimize());
  ipcMain.handle("setup:close", () => app.quit());
  createWindow();
});
app.on("window-all-closed", () => app.quit());
