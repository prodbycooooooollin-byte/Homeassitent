// Signal-Aufnahme: Zeichnet während einer Spielrunde auf, was auf diesem PC passiert (neue/geänderte Dateien in Steam und im Spielordner,
// angehängte Logzeilen, neue Prozesse, Netzwerkverbindungen des Spiels). Damit lässt sich herausfinden, an welcher Stelle das Spiel die
// Lobby-Daten (Gegner, Helden) schon beim Laden preisgibt. Es wird nichts hochgeladen – der Bericht bleibt lokal und wird nur auf Wunsch kopiert.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const MAX_CHARS = 400_000;
let rec = null; // { t0, lines, watchers, timers, offsets, procs, dirs }

const ts = () => `+${((Date.now() - rec.t0) / 1000).toFixed(1)}s`;
const add = (kind, text) => {
  if (!rec) return;
  const line = `${ts()} ${kind} ${String(text).replace(/[\r\n]+/g, " ⏎ ").slice(0, 600)}`;
  rec.lines.push(line);
  rec.chars += line.length;
  while (rec.chars > MAX_CHARS && rec.lines.length > 10) rec.chars -= rec.lines.shift().length;
};

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (e, out) => resolve(e ? "" : String(out))));
}

async function steamRoots() {
  const roots = new Set();
  roots.add(path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"));
  if (process.platform === "win32") {
    const out = await run("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], 4000);
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out);
    if (m) roots.add(m[1].trim().replace(/\//g, path.sep));
  }
  for (const r of [...roots]) {
    try { for (const m of fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) roots.add(m[1].replace(/\\\\/g, "\\")); } catch { /* egal */ }
  }
  return [...roots].filter((r) => { try { return fs.statSync(r).isDirectory(); } catch { return false; } });
}

const TEXTY = /\.(log|txt|vdf|cfg|json|ini|lst|yml|yaml|dat)$/i;
function onFile(dir, name, label) {
  const f = path.join(dir, String(name));
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) return;
    if (/\.(vpk|bz2|dem|dll|exe|png|jpg|webp|bin)$/i.test(f) && st.size > 4096 && label !== "cache") { add("DATEI", `${label}: ${path.basename(f)} (${st.size} B)`); return; }
    if (label === "cache") {
      // Steam-Cache: Anfang der Datei (enthält die Adresse)
      fs.open(f, "r", (e2, fd) => {
        if (e2) return;
        const b = Buffer.alloc(220);
        fs.read(fd, b, 0, 220, 0, (_e, n) => { fs.close(fd, () => {}); const t = b.subarray(0, n).toString("latin1").replace(/[^\x20-\x7e]+/g, " ").trim(); if (/valve|1422450|deadlock/i.test(t)) add("CACHE", `${path.basename(f)} ${t.slice(0, 200)}`); });
      });
      return;
    }
    if (TEXTY.test(f) && st.size < 20 * 1024 * 1024) {
      // Textdateien: nur neu angehängte Zeilen
      const prev = rec.offsets.get(f) ?? Math.max(0, st.size - 0);
      if (!rec.offsets.has(f)) { rec.offsets.set(f, st.size); add("DATEI", `${label}: ${path.relative(dir, f) || path.basename(f)} (neu/aktiv, ${st.size} B)`); return; }
      if (st.size <= prev) { rec.offsets.set(f, st.size); return; }
      fs.open(f, "r", (e2, fd) => {
        if (e2) return;
        const len = Math.min(st.size - prev, 64 * 1024);
        const b = Buffer.alloc(len);
        fs.read(fd, b, 0, len, prev, (_e, n) => { fs.close(fd, () => {}); rec.offsets.set(f, prev + n); for (const l of b.subarray(0, n).toString("utf8").split(/\r?\n/)) if (l.trim()) add("LOG", `${label}/${path.basename(f)}: ${l.trim()}`); });
      });
      return;
    }
    add("DATEI", `${label}: ${path.basename(f)} (${st.size} B)`);
  });
}

async function start() {
  if (rec) return status();
  rec = { t0: Date.now(), lines: [], chars: 0, watchers: [], timers: [], offsets: new Map(), procs: new Set(), dirs: [] };
  const roots = await steamRoots();
  const watch = (dir, label, recursive) => {
    try {
      if (!fs.statSync(dir).isDirectory()) return;
      rec.dirs.push(`${label}: ${dir}`);
      // Vorhandene Textdateien als Ausgangspunkt (nur ab jetzt neue Zeilen)
      try { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); try { const st = fs.statSync(p); if (st.isFile() && TEXTY.test(p)) rec.offsets.set(p, st.size); } catch { /* egal */ } } } catch { /* egal */ }
      const w = fs.watch(dir, { recursive }, (_ev, name) => { if (name) onFile(dir, name, label); });
      w.on("error", () => {});
      rec.watchers.push(w);
    } catch { /* Ordner existiert nicht */ }
  };
  for (const r of roots) {
    watch(path.join(r, "logs"), "steam-logs", false);
    watch(path.join(r, "appcache", "httpcache"), "cache", true);
    const game = path.join(r, "steamapps", "common", "Deadlock", "game", "citadel");
    watch(game, "spiel", false);
    for (const sub of ["cfg", "save", "replays", "logs"]) watch(path.join(game, sub), `spiel-${sub}`, true);
  }
  add("INFO", `Aufnahme gestartet. Beobachtet: ${rec.dirs.join(" | ") || "nichts gefunden"}`);
  const hasConsole = roots.some((r) => fs.existsSync(path.join(r, "steamapps", "common", "Deadlock", "game", "citadel", "console.log")));
  add("INFO", hasConsole ? "console.log des Spiels vorhanden" : "keine console.log des Spiels (Startoption -condebug nicht gesetzt?)");
  // Prozesse und Verbindungen des Spiels
  const tick = async () => {
    if (!rec) return;
    const out = await run("tasklist", ["/FO", "CSV", "/NH"]);
    let gamePid = null;
    for (const l of out.split(/\r?\n/)) {
      const m = /^"([^"]+)","(\d+)"/.exec(l);
      if (!m) continue;
      if (!rec.procs.has(m[1])) { rec.procs.add(m[1]); if (rec.t0 + 6000 < Date.now()) add("PROZESS", `neu: ${m[1]}`); }
      if (/^project8\.exe$/i.test(m[1])) gamePid = m[2];
    }
    if (gamePid && !rec.gamePid) add("PROZESS", `Spiel läuft (project8.exe, PID ${gamePid})`);
    if (!gamePid && rec.gamePid) add("PROZESS", "Spiel beendet");
    rec.gamePid = gamePid;
    if (gamePid) {
      const net = await run("netstat", ["-ano", "-p", "TCP"]);
      const now = new Set(net.split(/\r?\n/).filter((l) => new RegExp(`\\s${gamePid}\\s*$`).test(l) && /ESTABLISHED/.test(l)).map((l) => l.trim().split(/\s+/)[2]));
      rec.conns ??= new Set();
      for (const c of now) if (!rec.conns.has(c)) { rec.conns.add(c); add("NETZ", `TCP-Verbindung zu ${c}`); }
      for (const c of [...rec.conns]) if (!now.has(c)) { rec.conns.delete(c); add("NETZ", `TCP-Verbindung beendet: ${c}`); }
    }
  };
  tick();
  rec.timers.push(setInterval(tick, 3000));
  return status();
}

function stop() {
  if (!rec) return status();
  add("INFO", "Aufnahme beendet");
  for (const w of rec.watchers) { try { w.close(); } catch { /* egal */ } }
  for (const t of rec.timers) clearInterval(t);
  rec.watchers = []; rec.timers = []; rec.stopped = true;
  return status();
}

function reset() { if (rec && !rec.stopped) stop(); rec = null; return status(); }

function status() {
  return rec ? { running: !rec.stopped, startedAt: rec.t0, count: rec.lines.length, text: rec.lines.slice(-4000).join("\n") } : { running: false, startedAt: null, count: 0, text: "" };
}

module.exports = { start, stop, reset, status };
