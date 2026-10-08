// Betreibt das Open-Source-Programm „deadlock-api-ingest“ (MIT, github.com/deadlock-api/deadlock-api-ingest) im Hintergrund der Desktop-App.
// Es liest Match-Salts aus dem Steam-Cache und schickt sie an die Deadlock-API – dadurch stehen eigene Matches dort deutlich schneller bereit.
// Die Datei wird beim ersten Start aus dem offiziellen GitHub-Release geladen (kein Bestandteil dieser App).
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn, execFile } = require("child_process");
const { app } = require("electron");

const URL_EXE = "https://github.com/deadlock-api/deadlock-api-ingest/releases/latest/download/deadlock-api-ingest-windows-latest.exe";
const MAX_AGE_MS = 7 * 24 * 3600_000;
const IMAGE = "deadlock-api-ingest.exe";

const state = { state: "off", message: "Aus", pid: null, since: null, restarts: 0, lines: [], version: null };
let child = null, stopping = false, timer = null, listener = () => {}, downloading = null, fails = 0;

const dir = () => path.join(app.getPath("userData"), "ingest");
const exe = () => path.join(dir(), IMAGE);
const set = (patch) => { Object.assign(state, patch); try { listener(getStatus()); } catch { /* egal */ } };
const getStatus = () => ({ ...state, lines: state.lines.slice(-30) });
const onChange = (cb) => { listener = cb; };

function log(line) {
  const t = String(line).trim();
  if (!t) return;
  state.lines.push(`${new Date().toLocaleTimeString("de-DE")} ${t.slice(0, 300)}`);
  if (state.lines.length > 80) state.lines.splice(0, state.lines.length - 80);
}

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "user-agent": "deadlock-tracker" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      resolve(res);
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("Zeitüberschreitung")));
  });
}

/** Lädt die Programmdatei (nur wenn sie fehlt oder älter als 7 Tage ist). */
async function ensureBinary() {
  const f = exe();
  let age = Infinity;
  try { age = Date.now() - fs.statSync(f).mtimeMs; } catch { /* fehlt */ }
  if (age < MAX_AGE_MS) return true;
  if (downloading) return downloading;
  downloading = (async () => {
    set({ state: "downloading", message: "Lade deadlock-api-ingest von GitHub …" });
    try {
      fs.mkdirSync(dir(), { recursive: true });
      const tmp = `${f}.download`;
      const res = await get(URL_EXE);
      await new Promise((resolve, reject) => { const out = fs.createWriteStream(tmp); res.pipe(out); out.on("finish", resolve); out.on("error", reject); res.on("error", reject); });
      const st = fs.statSync(tmp);
      const head = Buffer.alloc(2); const fd = fs.openSync(tmp, "r"); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
      if (st.size < 500_000 || head.toString("latin1") !== "MZ") throw new Error("Heruntergeladene Datei ist keine gültige Programmdatei");
      try { if (child) { /* laufende Datei kann nicht ersetzt werden */ throw new Error("läuft"); } fs.renameSync(tmp, f); } catch (e) { if (e.message !== "läuft") throw e; fs.rmSync(tmp, { force: true }); }
      log(`Programmdatei geladen (${Math.round(st.size / 1024)} KB)`);
      return true;
    } catch (e) {
      log(`Download fehlgeschlagen: ${e.message}`);
      if (fs.existsSync(f)) return true; // alte Version weiterverwenden
      set({ state: "error", message: `Download fehlgeschlagen: ${e.message}` });
      return false;
    } finally { downloading = null; }
  })();
  return downloading;
}

function isRunningElsewhere() {
  return new Promise((resolve) => {
    execFile("tasklist", ["/FI", `IMAGENAME eq ${IMAGE}`, "/FO", "CSV", "/NH"], { windowsHide: true, timeout: 8000 }, (err, out) => {
      if (err) return resolve(false);
      resolve(String(out).toLowerCase().includes(IMAGE) && !child);
    });
  });
}

async function start() {
  if (process.platform !== "win32") { set({ state: "unsupported", message: "Nur unter Windows verfügbar" }); return; }
  stopping = false;
  if (child) return;
  if (await isRunningElsewhere()) { set({ state: "external", message: "Läuft bereits separat (eigene Installation) – es wird nichts doppelt gestartet" }); return; }
  if (!(await ensureBinary())) return;
  launch();
}

function launch() {
  if (stopping || child) return;
  try {
    child = spawn(exe(), [], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], cwd: dir() });
  } catch (e) { set({ state: "error", message: `Start fehlgeschlagen: ${e.message}` }); return; }
  const startedAt = Date.now();
  set({ state: "running", message: "Läuft im Hintergrund", pid: child.pid, since: startedAt });
  const onData = (b) => { String(b).split(/\r?\n/).forEach(log); try { listener(getStatus()); } catch { /* egal */ } };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (e) => { log(`Fehler: ${e.message}`); });
  child.on("exit", (code, sig) => {
    child = null;
    log(`Beendet (Code ${code ?? sig})`);
    if (stopping) { set({ state: "off", message: "Aus", pid: null }); return; }
    // Abstürze mit wachsender Wartezeit neu starten; bei Dauerschleife aufgeben
    fails = Date.now() - startedAt < 30_000 ? fails + 1 : 0;
    if (fails >= 6) { set({ state: "error", message: "Das Programm beendet sich immer wieder sofort – Autostart pausiert (Details im Protokoll).", pid: null }); return; }
    const wait = Math.min(300_000, 5000 * 3 ** Math.min(fails, 4));
    set({ state: "running", message: `Neustart in ${Math.round(wait / 1000)} s …`, pid: null, restarts: state.restarts + 1 });
    timer = setTimeout(() => { timer = null; launch(); }, wait);
  });
}

function stop() {
  stopping = true;
  if (timer) { clearTimeout(timer); timer = null; }
  if (child) { try { child.kill(); } catch { /* egal */ } } else set({ state: "off", message: "Aus", pid: null });
}

module.exports = { start, stop, getStatus, onChange };
