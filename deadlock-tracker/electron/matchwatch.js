// Erkennt das Ende eines Matches sofort: Nach dem Match lädt Deadlock die Match-Metadaten von Valve, und Steam legt die Antwort im
// httpcache ab (Dateiname enthält keine Match-ID, der Inhalt aber die Adresse „…/1422450/<MatchID>_<Salt>.meta.bz2“).
// Wir beobachten diesen Ordner und melden die Match-ID, sobald eine solche Datei auftaucht – lange bevor Verlauf und API soweit sind.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const RE = /1422450\/(\d{6,12})_(\d{5,})\.(?:meta|dem)/;
const MAX_FILE = 4 * 1024 * 1024;
// Nur wirklich neue Dateien zählen: Beim Start und beim Öffnen der Match-Historie im Spiel werden viele alte Einträge berührt –
// die dürfen kein Debrief auslösen.
const WARMUP_MS = 20_000;
const MAX_AGE_MS = 90_000; // Datei muss in den letzten 90 s angelegt worden sein
const MIN_GAP_MS = 120_000; // höchstens ein Sofort-Debrief alle 2 Minuten
let startedAt = 0;
let lastEmit = 0;

let watchers = [];
let seen = new Set();
let cb = null;
const info = { dirs: [], last: null, error: null };

function steamDirs() {
  return new Promise((resolve) => {
    const out = new Set();
    const add = (p) => { if (p) out.add(path.join(p, "appcache", "httpcache")); };
    const pf = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    add(path.join(pf, "Steam"));
    add("C:\\Program Files\\Steam");
    const done = () => resolve([...out].filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }));
    if (process.platform !== "win32") { add(path.join(process.env.HOME || "", ".steam", "steam")); return done(); }
    execFile("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], { timeout: 4000 }, (err, stdout) => {
      const m = !err && /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout || "");
      if (m) add(m[1].trim().replace(/\//g, path.sep));
      done();
    });
  });
}

function inspect(file) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile() || st.size === 0 || st.size > MAX_FILE) return;
    const born = st.birthtimeMs || st.ctimeMs;
    const fresh = Date.now() - born <= MAX_AGE_MS && born >= startedAt;
    fs.readFile(file, (e2, buf) => {
      if (e2) return;
      const m = RE.exec(buf.toString("latin1"));
      if (!m) return;
      const matchId = Number(m[1]);
      if (!matchId || seen.has(matchId)) return;
      seen.add(matchId);
      // Während der Aufwärmphase, bei alten Dateien und bei zu dichter Folge nur merken, nicht melden
      if (Date.now() - startedAt < WARMUP_MS || !fresh || Date.now() - lastEmit < MIN_GAP_MS) return;
      lastEmit = Date.now();
      info.last = { matchId, at: Date.now() };
      if (cb) cb({ matchId, at: Date.now() });
    });
  });
}

async function start(onMatch) {
  stop();
  cb = onMatch;
  startedAt = Date.now();
  seen = new Set();
  const dirs = await steamDirs();
  info.dirs = dirs;
  info.error = dirs.length ? null : "Steam-Ordner (httpcache) nicht gefunden";
  const pending = new Map();
  for (const dir of dirs) {
    try {
      const w = fs.watch(dir, { recursive: true }, (_ev, name) => {
        if (!name) return;
        const f = path.join(dir, String(name));
        clearTimeout(pending.get(f));
        // Steam schreibt Dateien in Stücken – kurz warten, bis sie fertig sind
        pending.set(f, setTimeout(() => { pending.delete(f); inspect(f); }, 800));
      });
      w.on("error", (e) => { info.error = String(e && e.message || e); });
      watchers.push(w);
    } catch (e) { info.error = String(e && e.message || e); }
  }
}

function stop() {
  for (const w of watchers) { try { w.close(); } catch { /* egal */ } }
  watchers = [];
}

module.exports = { start, stop, info: () => ({ ...info, watching: watchers.length > 0 }), _RE: RE };
