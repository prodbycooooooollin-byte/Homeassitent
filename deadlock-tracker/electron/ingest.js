// Betreibt das Open-Source-Programm „deadlock-api-ingest“ (MIT, github.com/deadlock-api/deadlock-api-ingest) im Hintergrund der Desktop-App.
// Es liest Match-Salts aus dem Steam-Cache und schickt sie an die Deadlock-API – dadurch stehen eigene Matches dort deutlich schneller bereit.
// Die Datei wird beim ersten Start aus dem offiziellen GitHub-Release geladen (kein Bestandteil dieser App).
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn, execFile } = require("child_process");
const { app, shell } = require("electron");

const URL_EXE = "https://github.com/deadlock-api/deadlock-api-ingest/releases/latest/download/deadlock-api-ingest-windows-latest.exe";
const MAX_AGE_MS = 7 * 24 * 3600_000;
const IMAGE = "deadlock-api-ingest.exe";

const MAX_LINES = 500;
const MATCH_RE = /\b(match|salt)/i;
const ERR_RE = /\b(error|fehler|panic|fatal|failed|fehlgeschlagen)\b/i;
// lines: strukturierte Protokollzeilen { t: Zeitstempel (ms), src: "app" | "stdout" | "stderr", text }
const state = { state: "off", message: "Aus", pid: null, since: null, restarts: 0, lines: [], version: null, matches: 0, errors: 0, dir: "" };
let child = null, stopping = false, timer = null, listener = () => {}, downloading = null, fails = 0, exitWaiters = [];

const dir = () => path.join(app.getPath("userData"), "ingest");
const exe = () => path.join(dir(), IMAGE);
const set = (patch) => { Object.assign(state, patch); try { listener(getStatus()); } catch { /* egal */ } };
const getStatus = () => ({ ...state, dir: dir(), lines: state.lines.slice(-MAX_LINES) });
const onChange = (cb) => { listener = cb; };

function log(line, src = "app") {
  const t = String(line).replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (!t) return;
  const text = t.slice(0, 400);
  state.lines.push({ t: Date.now(), src, text });
  if (src !== "app" && MATCH_RE.test(text)) state.matches++;
  if (src === "stderr" ? ERR_RE.test(text) : src === "app" && /^(Fehler|Download fehlgeschlagen)/.test(text)) state.errors++;
  if (state.lines.length > MAX_LINES) state.lines.splice(0, state.lines.length - MAX_LINES);
}

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "user-agent": "lockscope" } }, (res) => {
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
  const onData = (src) => (b) => { String(b).split(/\r?\n/).forEach((l) => log(l, src)); try { listener(getStatus()); } catch { /* egal */ } };
  child.stdout.on("data", onData("stdout"));
  child.stderr.on("data", onData("stderr"));
  log(`Gestartet (PID ${child.pid})`);
  child.on("error", (e) => { log(`Fehler: ${e.message}`); });
  child.on("exit", (code, sig) => {
    child = null;
    log(`Beendet (Code ${code ?? sig})`);
    const waiters = exitWaiters; exitWaiters = [];
    if (stopping) { set({ state: "off", message: "Aus", pid: null }); waiters.forEach((w) => w()); return; }
    waiters.forEach((w) => w());
    // Abstürze mit wachsender Wartezeit neu starten; bei Dauerschleife aufgeben
    fails = Date.now() - startedAt < 30_000 ? fails + 1 : 0;
    if (fails >= 6) { set({ state: "error", message: "Das Programm beendet sich immer wieder sofort – Autostart pausiert (Details im Protokoll).", pid: null }); return; }
    const wait = Math.min(300_000, 5000 * 3 ** Math.min(fails, 4));
    set({ state: "running", message: `Neustart in ${Math.round(wait / 1000)} s …`, pid: null, restarts: state.restarts + 1 });
    timer = setTimeout(() => { timer = null; launch(); }, wait);
  });
}

/** Stoppt den Helfer; die Zusage erfüllt sich, sobald der Prozess wirklich beendet ist. */
function stop() {
  stopping = true;
  if (timer) { clearTimeout(timer); timer = null; }
  if (!child) { set({ state: "off", message: "Aus", pid: null }); return Promise.resolve(); }
  return new Promise((resolve) => {
    exitWaiters.push(resolve);
    setTimeout(resolve, 5000);
    try { child.kill(); } catch { /* egal */ }
  });
}

/** Steuerung aus der Konsole: start | stop | restart | clear | openFolder – liefert den neuen Status. */
async function control(action) {
  switch (action) {
    case "start": fails = 0; log("Start angefordert"); await start(); break;
    case "stop": log("Stopp angefordert"); await stop(); break;
    case "restart": fails = 0; log("Neustart angefordert"); await stop(); await start(); break;
    case "clear": state.lines = []; state.matches = 0; state.errors = 0; break;
    case "openFolder": fs.mkdirSync(dir(), { recursive: true }); await shell.openPath(dir()); break;
    default: break;
  }
  const s = getStatus();
  try { listener(s); } catch { /* egal */ }
  return s;
}

module.exports = { start, stop, getStatus, onChange, control };
