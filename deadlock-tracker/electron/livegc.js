// Live-Lobby über ein ZWEITES Steam-Konto: Meldet sich per QR-Code an (Bestätigung in der Steam-App des Zweitkontos), fragt beim Spiele-Koordinator
// von Deadlock die Zuschauer-Adresse (SpectateLobby) deiner laufenden Lobby an und liest den Live-Strom (Spielerliste) mit dem Broadcast-Worker.
// Der Anmelde-Schlüssel (Refresh-Token) wird mit der Windows-Verschlüsselung (safeStorage) im Benutzerordner abgelegt, nie im Klartext.
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");

const APP_ID = 1422450;
const MSG_HELLO = 4006, MSG_WELCOME = 4004, MSG_SPECTATE = 9109, MSG_SPECTATE_RESP = 9110;
const RESULT = { 0: "interner Fehler", 1: "ok", 2: "deaktiviert", 3: "zu viel los", 4: "Rate-Limit", 5: "Spieler nicht im Spiel", 6: "für dieses Spiel deaktiviert", 7: "Server voll", 8: "nicht befreundet", 9: "Region fehlt", 10: "Zeitkontrolle", 11: "Client-Version ungültig", 12: "Region ungültig" };

const live = { state: "aus", account: null, qr: null, error: null, matchId: null, lobbyId: null, url: null, result: null, players: [], playersAt: null, log: [] };
globalThis.__dlLive = live;
const note = (t) => { live.log.push(`${new Date().toLocaleTimeString("de-DE")} ${t}`); if (live.log.length > 40) live.log.shift(); };

let ctx = { dir: null, worker: null, gamelog: null, safeStorage: null };
let user = null, session = null, welcome = false, helloTimer = null, spectateTimer = null, workerProc = null;

/* ---- kleine Protobuf-Helfer (64-Bit-IDs bleiben exakt, deshalb von Hand) ---- */
const varint = (v) => { let n = BigInt(v); const out = []; while (n > 0x7fn) { out.push(Number(n & 0x7fn) | 0x80); n >>= 7n; } out.push(Number(n)); return Buffer.from(out); };
const field = (num, v) => Buffer.concat([varint((num << 3) | 0), varint(v)]);
const encodeSpectate = (lobbyId, version, matchId) => Buffer.concat([field(1, lobbyId), version ? field(3, version) : Buffer.alloc(0), field(4, 1), matchId ? field(5, matchId) : Buffer.alloc(0)]);
function readMsg(buf) {
  const out = []; let i = 0;
  const rv = () => { let r = 0n, s = 0n; for (;;) { const b = buf[i++]; if (b === undefined) throw new Error("zu kurz"); r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) break; s += 7n; } return r; };
  while (i < buf.length) {
    const tag = Number(rv()), f = tag >> 3, w = tag & 7;
    if (w === 0) out.push({ f, v: rv() });
    else if (w === 2) { const l = Number(rv()); out.push({ f, b: buf.subarray(i, i + l) }); i += l; }
    else if (w === 1) { out.push({ f, b: buf.subarray(i, i + 8) }); i += 8; }
    else if (w === 5) { out.push({ f, b: buf.subarray(i, i + 4) }); i += 4; }
    else break;
  }
  return out;
}
function decodeSpectateResponse(buf) {
  const outer = readMsg(buf).find((x) => x.f === 1 && x.b);
  if (!outer) return { result: -1 };
  const inner = readMsg(outer.b);
  const r = inner.find((x) => x.f === 1);
  const u = inner.find((x) => x.f === 8 && x.b);
  return { result: r ? Number(r.v) : 0, url: u ? u.b.toString("utf8") : null };
}

/* ---- Token speichern ---- */
const tokenFile = () => path.join(ctx.dir, "live-account.json");
function saveToken(accountName, token) {
  try {
    if (!ctx.safeStorage?.isEncryptionAvailable()) { note("Verschlüsselung nicht verfügbar – Anmeldung gilt nur bis zum Beenden"); return; }
    fs.writeFileSync(tokenFile(), JSON.stringify({ accountName, token: ctx.safeStorage.encryptString(token).toString("base64") }));
  } catch (e) { note(`Token nicht gespeichert: ${e.message}`); }
}
function loadToken() {
  try {
    const j = JSON.parse(fs.readFileSync(tokenFile(), "utf8"));
    return { accountName: j.accountName, token: ctx.safeStorage.decryptString(Buffer.from(j.token, "base64")) };
  } catch { return null; }
}

/* ---- Steam + GC ---- */
function disconnect() {
  clearInterval(helloTimer); clearInterval(spectateTimer); helloTimer = spectateTimer = null; welcome = false;
  try { user?.logOff(); } catch { /* egal */ }
  user = null;
}

function connect(token, accountName) {
  const SteamUser = require("steam-user");
  disconnect();
  live.state = "verbinde"; live.error = null; live.account = accountName || live.account;
  user = new SteamUser({ autoRelogin: true, enablePicsCache: false, dataDirectory: null });
  user.on("error", (e) => { live.state = "fehler"; live.error = `Steam: ${e.message || e}`; note(live.error); });
  user.on("loggedOn", () => {
    note("bei Steam angemeldet");
    user.gamesPlayed([APP_ID]);
    const hello = () => { if (!welcome) try { user.sendToGC(APP_ID, MSG_HELLO, {}, Buffer.alloc(0)); } catch (e) { note(`Hello: ${e.message}`); } };
    hello(); helloTimer = setInterval(hello, 5000);
  });
  user.on("disconnected", () => { welcome = false; if (live.state === "bereit") live.state = "verbinde"; });
  user.on("receivedFromGC", (appid, msgType, payload) => {
    const mt = msgType & 0x7fffffff;
    if (mt === MSG_WELCOME) { welcome = true; clearInterval(helloTimer); live.state = "bereit"; note("Spiele-Koordinator verbunden"); if (live.lobbyId) startSpectating(); return; }
    if (mt === MSG_SPECTATE_RESP) onSpectateResponse(payload);
  });
  user.logOn({ refreshToken: token });
}

let versions = [], vIdx = 0, tries = 0;
function startSpectating() {
  clearInterval(spectateTimer); tries = 0;
  const gl = ctx.gamelog?.get?.() || {};
  versions = [...new Set([gl.versions?.compat, gl.versions?.build, 0].filter((x) => x !== undefined && x !== null))];
  vIdx = 0;
  const go = () => {
    if (!welcome || !live.lobbyId || live.url) return;
    if (++tries > 60) { clearInterval(spectateTimer); live.error = "Keine Zuschauer-Adresse erhalten (60 Versuche)"; note(live.error); return; }
    try { user.sendToGC(APP_ID, MSG_SPECTATE, {}, encodeSpectate(live.lobbyId, versions[vIdx] || 0, live.matchId)); note(`SpectateLobby (Versuch ${tries}, Version ${versions[vIdx] || 0})`); } catch (e) { note(`Senden: ${e.message}`); }
  };
  go(); spectateTimer = setInterval(go, 20000);
}

function onSpectateResponse(payload) {
  let r; try { r = decodeSpectateResponse(payload); } catch (e) { note(`Antwort unlesbar: ${e.message} (${payload.length} B, hex ${payload.toString("hex").slice(0, 120)})`); return; }
  live.result = RESULT[r.result] || String(r.result);
  note(`Antwort: ${live.result}${r.url ? ` · ${r.url}` : ""}`);
  if (r.result === 11 && vIdx < versions.length - 1) { vIdx++; return; }
  if (r.result === 8) { live.error = "Zweitkonto muss mit deinem Hauptkonto auf Steam befreundet sein"; return; }
  if (r.result === 1 && r.url) { live.url = r.url; live.error = null; clearInterval(spectateTimer); startWorker(r.url); }
}

function startWorker(url) {
  try { workerProc?.kill(); } catch { /* egal */ }
  if (!ctx.worker || !fs.existsSync(ctx.worker)) { live.error = "Broadcast-Worker fehlt"; return; }
  workerProc = fork(ctx.worker, [JSON.stringify({ url })], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] });
  workerProc.on("message", (m) => {
    if (m?.type === "players") { live.players = m.players; live.playersAt = Date.now(); live.state = "live"; }
    else if (m?.type === "error") { live.error = m.message; note(`Broadcast: ${m.message}`); }
    else if (m?.type === "warn") note(`Broadcast-Warnung: ${m.message}`);
  });
  workerProc.stderr?.on("data", (d) => note(`Worker: ${String(d).slice(0, 200)}`));
  workerProc.on("exit", () => { if (live.state === "live") live.state = "bereit"; });
  note("Broadcast-Worker gestartet");
}

/* ---- Öffentliche Funktionen ---- */
function init(c) {
  ctx = { ...ctx, ...c };
  const t = loadToken();
  if (t) { live.account = t.accountName; live.state = "gespeichert"; note(`Zweitkonto ${t.accountName} gespeichert`); }
}

/** Beim Start des Spiels/Matches: ab hier wird (falls angemeldet) beim Koordinator verbunden */
function onMatch({ matchId, lobbyId }) {
  if (matchId) { live.matchId = matchId; live.players = []; live.url = null; live.result = null; live.error = null; }
  if (lobbyId) live.lobbyId = lobbyId;
  const t = loadToken();
  if (!t) return;
  if (!user) connect(t.token, t.accountName);
  else if (welcome && live.lobbyId) startSpectating();
}

function onMatchOver() {
  clearInterval(spectateTimer);
  try { workerProc?.kill(); } catch { /* egal */ }
  workerProc = null; live.url = null; live.lobbyId = null;
  disconnect();
  if (live.state !== "aus") live.state = loadToken() ? "gespeichert" : "aus";
}

async function loginQR() {
  const { LoginSession, EAuthTokenPlatformType } = require("steam-session");
  const QRCode = require("qrcode");
  try { session?.cancelLoginAttempt(); } catch { /* egal */ }
  session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  live.state = "qr"; live.error = null;
  const r = await session.startWithQR();
  live.qr = await QRCode.toDataURL(r.qrChallengeUrl, { margin: 1, width: 240 });
  session.on("authenticated", () => {
    const name = session.accountName, token = session.refreshToken;
    saveToken(name, token); live.account = name; live.qr = null; live.state = "gespeichert"; note(`Zweitkonto ${name} angemeldet`);
    if (live.lobbyId || ctx.gamelog?.get?.()?.inMatch) onMatch({ matchId: ctx.gamelog.get().matchId, lobbyId: ctx.gamelog.get().lobbyId });
  });
  session.on("timeout", () => { live.qr = null; live.state = "aus"; live.error = "QR-Code abgelaufen – bitte erneut anmelden"; });
  session.on("error", (e) => { live.qr = null; live.state = "fehler"; live.error = `Anmeldung: ${e.message || e}`; });
  return status();
}

function logout() {
  disconnect(); try { workerProc?.kill(); } catch { /* egal */ }
  try { fs.rmSync(tokenFile(), { force: true }); } catch { /* egal */ }
  Object.assign(live, { state: "aus", account: null, qr: null, error: null, url: null, players: [], result: null });
  return status();
}

const status = () => ({ ...live });
module.exports = { _t: { encodeSpectate, decodeSpectateResponse, readMsg }, init, onMatch, onMatchOver, loginQR, logout, status };
