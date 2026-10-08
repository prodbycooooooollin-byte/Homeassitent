// Replay-Worker: lädt ein Deadlock-Replay (.dem.bz2) von Valve, entpackt es im Strom und liest mit „deadem“ Positionen, Leben und Kill-Ereignisse aus.
// Läuft als eigener Prozess (Aufruf durch lib/replay-server.ts), damit die Oberfläche währenddessen nicht ruckelt. Die Replay-Datei selbst wird
// nie gespeichert – nur das kleine Ergebnis (JSON, gzip).
// Aufruf: node replay-worker.mjs '{"matchId":123,"url":"http://…","out":"/pfad/replay-123.json.gz"}'
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Readable, Transform } from "node:stream";
import unbzip2 from "unbzip2-stream";
import { EntityOperation, InterceptorStage, MessagePacketType, Parser } from "deadem";

const job = JSON.parse(process.argv[2] || "{}");
const send = (m) => { try { process.send?.(m); } catch { /* Elternprozess weg */ } };
const fail = (message) => { console.error(message); send({ type: "error", message }); process.exit(1); };

const STEP = 0.5; // Sekunden zwischen zwei Messpunkten
const CELL = 512; // Source-2-Zellgröße der quantisierten Positionen

const num = (v) => (typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : v);
const toAccount = (v) => { try { const b = typeof v === "bigint" ? v : BigInt(v); return Number(b & 0xffffffffn); } catch { return 0; } };

async function main() {
  if (!job.url || !job.out) return fail("Aufruf ohne url/out");
  send({ type: "progress", phase: "download", pct: 0 });
  const res = await fetch(job.url, { signal: AbortSignal.timeout(60_000) }).catch((e) => { fail(`Download nicht möglich: ${e.message}`); });
  if (!res) return;
  if (res.status === 404 || res.status === 403) return fail("Replay bei Valve nicht (mehr) verfügbar – sie liegen nur begrenzte Zeit bereit.");
  if (!res.ok) return fail(`Replay-Download fehlgeschlagen (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  let got = 0, lastPct = -1;
  const counter = new Transform({ transform(chunk, _e, cb) {
    got += chunk.length;
    if (total) { const p = Math.min(99, Math.floor((got / total) * 100)); if (p !== lastPct) { lastPct = p; send({ type: "progress", phase: "parse", pct: p }); } }
    cb(null, chunk);
  } });
  const input = Readable.fromWeb(res.body).pipe(counter).pipe(unbzip2());

  const parser = new Parser();
  const demo = () => parser.getDemo();

  const diag = { pawnFields: null, controllerFields: null, posSource: null, samples: 0, noPos: 0, kills: 0, killsUnmapped: 0, errors: [] };
  const players = []; // { accountId, name, rawTeam, heroId, ctrl }
  const byCtrl = new Map(); // Controller-Index -> Spielerindex
  const frames = []; // pro Messpunkt: Map<pi, [x,y,hp,mhp,alive]>
  const kills = [];
  let nextTick = 0, tStart = null, tickRate = 64, posAccessor = null;

  const classOf = (e) => e?.class?.name;

  function findPosAccessor(pawn) {
    const names = [...pawn.fieldNames()];
    diag.pawnFields = names.slice(0, 120);
    const has = (n) => names.includes(n);
    const base = names.find((n) => /m_cellX$/.test(n));
    if (base) {
      const pre = base.replace(/m_cellX$/, "");
      if (has(pre + "m_cellY") && has(pre + "m_vecX") && has(pre + "m_vecY")) {
        diag.posSource = `${pre}m_cell/m_vec`;
        return (e) => { const cx = num(e.getField(pre + "m_cellX")), cy = num(e.getField(pre + "m_cellY")), vx = num(e.getField(pre + "m_vecX")), vy = num(e.getField(pre + "m_vecY")); return [cx, cy, vx, vy].every(Number.isFinite) ? [cx * CELL + vx, cy * CELL + vy] : null; };
      }
    }
    const o = names.find((n) => /m_vecOrigin$/.test(n)) ?? names.find((n) => /origin/i.test(n));
    if (o) {
      diag.posSource = o;
      return (e) => { const v = e.getField(o); return v && Number.isFinite(num(v.x)) ? [num(v.x), num(v.y)] : Array.isArray(v) ? [num(v[0]), num(v[1])] : null; };
    }
    return null;
  }

  function registerPlayers() {
    const d = demo();
    if (!d) return;
    for (const c of d.getEntitiesByClassName("CCitadelPlayerController")) {
      if (byCtrl.has(c.index)) continue;
      const names = [...c.fieldNames()];
      if (!diag.controllerFields) diag.controllerFields = names.slice(0, 120);
      const team = num(c.getField("m_iTeamNum"));
      if (team !== 2 && team !== 3) continue;
      const sid = names.find((n) => /steam/i.test(n) && /id/i.test(n));
      const account = sid ? toAccount(c.getField(sid)) : 0;
      const hn = names.find((n) => /hero/i.test(n) && /id/i.test(n) && Number.isFinite(num(c.getField(n))));
      const name = c.getField("m_iszPlayerName");
      if (!account && !name) continue;
      byCtrl.set(c.index, players.length);
      players.push({ accountId: account, name: typeof name === "string" ? name : undefined, team: team - 2, heroId: hn ? num(c.getField(hn)) : undefined, ctrl: c.index });
    }
  }

  const piOfEntity = (idx) => {
    const d = demo();
    const e = idx >= 0 ? d?.getEntity(idx) : null;
    if (!e) return -1;
    if (classOf(e) === "CCitadelPlayerController") return byCtrl.get(e.index) ?? -1;
    const h = e.getField?.("m_hController");
    const c = h !== undefined ? d.getEntityByHandle(h) : null;
    return c ? byCtrl.get(c.index) ?? -1 : -1;
  };

  function sample(tick) {
    const d = demo();
    if (!d) return;
    registerPlayers();
    const frame = new Map();
    for (const pawn of d.getEntitiesByClassName("CCitadelPlayerPawn")) {
      if (!posAccessor) posAccessor = findPosAccessor(pawn);
      const c = d.getEntityByHandle(pawn.getField("m_hController"));
      const pi = c ? byCtrl.get(c.index) : undefined;
      if (pi === undefined) continue;
      const pos = posAccessor?.(pawn);
      if (!pos) { diag.noPos++; continue; }
      const hp = num(pawn.getField("m_iHealth")) ?? 0, mhp = num(pawn.getField("m_iMaxHealth")) ?? 0;
      const ls = pawn.getField("m_lifeState");
      frame.set(pi, [Math.round(pos[0]), Math.round(pos[1]), Math.round(hp), Math.round(mhp), hp > 0 && (ls === undefined || num(ls) === 0) ? 1 : 0]);
    }
    if (!frame.size) return;
    if (tStart === null) tStart = tick / tickRate;
    frames.push(frame);
    diag.samples++;
  }

  parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (dp) => {
    try {
      const d = demo();
      if (d?.server?.tickRate) tickRate = d.server.tickRate;
      if (dp.tick < nextTick) return;
      const stepTicks = Math.max(1, Math.round(tickRate * STEP));
      nextTick = dp.tick + stepTicks;
      sample(dp.tick);
    } catch (e) { if (diag.errors.length < 5) diag.errors.push(String(e?.stack ?? e).slice(0, 300)); }
  });

  parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, (dp, mp) => {
    try {
      if (mp.type !== MessagePacketType.CITADEL_USER_MESSAGE_HERO_KILLED) return;
      registerPlayers();
      const m = mp.data;
      const victim = piOfEntity(m.entindexVictim), attacker = piOfEntity(m.entindexAttacker);
      const assisters = (m.entindexAssisters ?? []).map(piOfEntity).filter((x) => x >= 0 && x !== attacker);
      diag.kills++;
      if (victim < 0) { diag.killsUnmapped++; return; }
      const pos = m.damagePos;
      kills.push({ t: dp.tick / tickRate, victim, attacker, assisters, x: pos && Number.isFinite(pos.x) ? Math.round(pos.x) : undefined, y: pos && Number.isFinite(pos.y) ? Math.round(pos.y) : undefined, damage: Number.isFinite(m.damage) ? Math.round(m.damage) : undefined });
    } catch (e) { if (diag.errors.length < 5) diag.errors.push(String(e?.stack ?? e).slice(0, 300)); }
  });

  try { await parser.parse(input); } catch (e) { return fail(`Replay konnte nicht gelesen werden: ${e?.message ?? e}`); }
  try { await parser.dispose(); } catch { /* egal */ }

  if (!frames.length || !players.length) return fail(`Keine Spielerdaten im Replay gefunden (Messpunkte ${diag.samples}, Spieler ${players.length}). Diagnose: ${JSON.stringify(diag).slice(0, 400)}`);

  const n = frames.length;
  const mk = () => players.map(() => new Array(n).fill(0));
  const x = mk(), y = mk(), hp = mk(), maxHp = mk(), alive = mk();
  frames.forEach((f, i) => {
    for (const [pi, v] of f) { x[pi][i] = v[0]; y[pi][i] = v[1]; hp[pi][i] = v[2]; maxHp[pi][i] = v[3]; alive[pi][i] = v[4]; }
    // Lücken (Spieler kurz nicht in der Liste): letzten Wert halten
    players.forEach((_, pi) => { if (!f.has(pi) && i > 0) { x[pi][i] = x[pi][i - 1]; y[pi][i] = y[pi][i - 1]; maxHp[pi][i] = maxHp[pi][i - 1]; } });
  });
  const data = {
    version: 1, matchId: job.matchId, step: STEP, tStart: tStart ?? 0, tickRate,
    players: players.map(({ accountId, name, team, heroId }) => ({ accountId, name, team, heroId })),
    x, y, hp, maxHp, alive, kills, diag,
  };
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  const tmp = `${job.out}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(data))));
  fs.renameSync(tmp, job.out);
  send({ type: "done", samples: n, players: players.length, kills: kills.length });
  process.exit(0);
}

main().catch((e) => fail(String(e?.stack ?? e)));
