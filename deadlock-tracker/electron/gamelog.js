// Liest die console.log des Spiels (Steam-Startoption -condebug) – eine normale Textdatei, die das Spiel selbst schreibt.
// Daraus: Spielphase (Heldenauswahl → Laden → läuft → Ende), Server-Adresse und die Helden, die im Match respawnen. Kein Zugriff auf den Spielspeicher.
// Zustand liegt in globalThis.__dlGameLog (vom eingebetteten Server und der Statusseite lesbar).
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const STATE_RE = /(?:ChangeGameState|OnGameStateChanged):\s*(\w+)\s*\((\d+)\)/;
const PHYS_RE = /\[Client\] Created physics for (\w+)/;
const RELAY_RE = /\[SteamNetSockets\] \[(\d+\.\d+\.\d+\.\d+:\d+)\]/;
const SERVER_RE = /\[Networking\]\s*server\s*@\s*([\d.]+:\d+)/i;
const HERO_RE = /\b(hero_[a-z0-9_]+)\s+respawned/i;
const LOADED_RE = /\[Server\]\s*Loaded hero\s+(\d+)\/(hero_[a-z0-9_]+)/i;
const MAP_RE = /Loading map "([^"]+)"/;
const CONNECTED_RE = /\[Client\] CL:\s*Connected to '([^']+)'/;
const PLAYERS_RE = /\[Client\] Players:\s*(\d+)\s*\((\d+) bots\)\s*\/\s*(\d+) humans/;
const HIDEOUT = "dl_hideout";
const ENDED = new Set(["PostGame", "GameEnd", "End", "Ended", "Postgame"]);

function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout: 4000 }, (e, out) => resolve(e ? "" : String(out))));
}

async function steamRoots() {
  const roots = new Set([path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam")]);
  if (process.platform === "win32") {
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(await run("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]));
    if (m) roots.add(m[1].trim().replace(/\//g, path.sep));
  }
  for (const r of [...roots]) {
    try { for (const m of fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) roots.add(m[1].replace(/\\\\/g, "\\")); } catch { /* egal */ }
  }
  return [...roots];
}

const fresh = () => ({ available: false, file: null, state: null, stateN: null, stateAt: null, server: null, heroes: [], heroIds: {}, map: null, inMatch: false, players: null, matchStartedAt: null, matchEndedAt: null, updatedAt: null });
let log = fresh();
let timer = null, file = null, pos = 0;
let listeners = [];

function publish() { globalThis.__dlGameLog = log; }
function emit(ev) { for (const l of listeners) { try { l(ev, log); } catch { /* egal */ } } }

function handle(line, now) {
  let m;
  if ((m = SERVER_RE.exec(line))) {
    if (log.server !== m[1]) log.heroes = [];
    log.server = m[1];
  }
  if ((m = MAP_RE.exec(line))) {
    // Kartenwechsel: weg vom Hideout = Match wird geladen; zurück ins Hideout = Match vorbei/verlassen
    const map = m[1];
    if (map === HIDEOUT) {
      if (log.inMatch) { log.inMatch = false; log.matchEndedAt = now; emit({ type: "matchEnd" }); }
    } else {
      log.inMatch = true; log.matchStartedAt = log.matchStartedAt || now; log.matchEndedAt = null; log.heroes = []; log.heroIds = {};
      emit({ type: "matchLoading", map });
    }
    log.map = map; log.stateAt = now;
  } else if ((m = PHYS_RE.exec(line))) {
    if (m[1] !== HIDEOUT) { log.map = m[1]; if (!log.inMatch) { log.inMatch = true; log.matchStartedAt = log.matchStartedAt || now; log.matchEndedAt = null; emit({ type: "matchLoading", map: m[1] }); } }
  } else if ((m = RELAY_RE.exec(line))) {
    if (log.inMatch) log.server = m[1];
  } else if ((m = CONNECTED_RE.exec(line))) {
    if (!/loopback/i.test(m[1])) log.server = m[1];
  } else if ((m = PLAYERS_RE.exec(line))) {
    log.players = { total: Number(m[1]), bots: Number(m[2]), humans: Number(m[3]) };
  } else if ((m = STATE_RE.exec(line))) {
    const [, name, n] = m;
    if (name === "HeroSelection" || name === "WaitForMapToLoad") { if (name === "WaitForMapToLoad") log.inMatch = true; else { log.heroes = []; log.heroIds = {}; log.matchStartedAt = null; log.matchEndedAt = null; } }
    log.state = name; log.stateN = Number(n); log.stateAt = now;
    if (name === "GameInProgress" && !log.matchStartedAt) log.matchStartedAt = now;
    if (ENDED.has(name)) { log.matchEndedAt = now; }
    emit({ type: "state", state: name });
  } else if ((m = LOADED_RE.exec(line))) {
    const h = m[2].toLowerCase();
    if (!log.heroes.includes(h)) log.heroes.push(h);
    log.heroIds[h] = Number(m[1]);
  } else if ((m = HERO_RE.exec(line))) {
    const h = m[1].toLowerCase();
    if (!log.heroes.includes(h)) log.heroes.push(h);
  }
  log.updatedAt = now;
}

function poll() {
  if (!file) return;
  let st;
  try { st = fs.statSync(file); } catch { return; }
  if (st.size < pos) pos = 0; // Spiel neu gestartet: Datei neu geschrieben
  if (st.size === pos) return;
  try {
    const fd = fs.openSync(file, "r");
    const len = Math.min(st.size - pos, 512 * 1024);
    const b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, pos);
    fs.closeSync(fd);
    pos += len;
    const now = Date.now();
    for (const l of b.toString("utf8").split(/\r?\n/)) if (l) handle(l, now);
    publish();
  } catch { /* egal */ }
}

async function start() {
  if (timer) return;
  publish();
  for (const r of await steamRoots()) {
    const f = path.join(r, "steamapps", "common", "Deadlock", "game", "citadel", "console.log");
    if (fs.existsSync(f)) { file = f; break; }
  }
  if (file) {
    log.available = true; log.file = file;
    // Nur neue Zeilen auswerten; die letzten ~64 KB lesen, damit ein bereits laufendes Match erkannt wird
    try { const size = fs.statSync(file).size; pos = Math.max(0, size - 64 * 1024); } catch { pos = 0; }
    const age = Date.now() - (fs.statSync(file).mtimeMs || 0);
    poll();
    // Alte Phasen (Spiel lange beendet) nicht als laufend melden
    if (age > 10 * 60_000) { log.state = null; log.stateN = null; log.matchStartedAt = null; }
    publish();
  }
  timer = setInterval(() => { if (!file) start_retry(); else poll(); }, 700);
}

let lastTry = 0;
async function start_retry() {
  if (Date.now() - lastTry < 30_000) return;
  lastTry = Date.now();
  clearInterval(timer); timer = null;
  await start();
}

function stop() { if (timer) clearInterval(timer); timer = null; }
function onEvent(fn) { listeners.push(fn); }
function get() { return log; }

module.exports = { start, stop, onEvent, get };
