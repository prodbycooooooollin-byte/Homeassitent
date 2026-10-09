import type { MatchDetails } from "./types";
import type { ReplayData } from "./replay-types";

/** Erzeugt ein Beispiel-Replay aus den Demo-Match-Daten (nur für den Demo-Modus/Tests der Oberfläche). */
export function demoReplay(d: MatchDetails): ReplayData {
  const step = 0.5, dur = Math.max(300, d.durationS), n = Math.floor(dur / step);
  const rnd = (seed: number) => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };
  const players = d.players.map((p) => ({ accountId: p.accountId, name: p.name, team: p.team, heroId: p.heroId }));
  const x: number[][] = [], y: number[][] = [], hp: number[][] = [], maxHp: number[][] = [], alive: number[][] = [];
  const kills: ReplayData["kills"] = [];
  const deaths: { pi: number; t: number; dur: number }[] = [];
  d.players.forEach((p, pi) => (p.deathLog ?? []).forEach((q) => deaths.push({ pi, t: q.t, dur: q.durS ?? 25 })));
  const lanes = [-5200, 0, 5200];
  players.forEach((p, pi) => {
    const lane = lanes[pi % 3], sgn = p.team === 0 ? -1 : 1;
    const xs: number[] = [], ys: number[] = [], hs: number[] = [], ms: number[] = [], as: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i * step;
      const f = Math.min(1, t / 70);
      const sway = Math.sin(t / 37 + pi) * 900;
      const push = Math.sin(t / 150 + (p.team ? 1.7 : 0)) * 2500;
      let px = sgn * 9500 * (1 - f) + (sgn * 2500 - sgn * push) * f + sway;
      let py = lane * (0.4 + 0.6 * f) + Math.cos(t / 29 + pi * 2) * 700 + (rnd(pi) - 0.5) * 600;
      const dd = deaths.filter((q) => q.pi === pi);
      const dead = dd.find((q) => t >= q.t && t < q.t + q.dur);
      const next = dd.find((q) => q.t > t);
      let h = 1000;
      if (next && next.t - t < 5) h = Math.max(30, 1000 * ((next.t - t) / 5));
      if (next && next.t - t < 14) { const pull = 1 - (next.t - t) / 14; px += (p.team ? -1 : 1) * 1800 * pull + (rnd(pi + next.t) - 0.5) * 900; }
      if (dead) { h = 0; px = sgn * 9800; py = lane * 0.2; }
      xs.push(Math.round(px)); ys.push(Math.round(py)); hs.push(Math.round(h)); ms.push(1000); as.push(dead ? 0 : 1);
    }
    x.push(xs); y.push(ys); hp.push(hs); maxHp.push(ms); alive.push(as);
  });
  // Kills aus den Todeszeiten: Killer nach Slot, sonst ein Gegner
  d.players.forEach((p, pi) => (p.deathLog ?? []).forEach((q, qi) => {
    const kp = d.players.findIndex((o) => o.slot !== undefined && o.slot === q.killerSlot);
    const enemies = d.players.map((o, oi) => ({ o, oi })).filter(({ o }) => o.team !== p.team);
    const attacker = kp >= 0 ? kp : enemies[Math.floor(rnd(pi * 10 + qi) * enemies.length)].oi;
    const helpers = enemies.filter(({ oi }) => oi !== attacker && rnd(pi * 7 + qi * 3 + oi) > 0.62).map(({ oi }) => oi).slice(0, 3);
    const idx = Math.min(n - 1, Math.round(q.t / step));
    kills.push({ t: q.t, victim: pi, attacker, assisters: helpers, x: x[pi][Math.max(0, idx - 1)], y: y[pi][Math.max(0, idx - 1)], lostGold: 300 + Math.round(rnd(qi + pi) * 400) });
  }));
  return { version: 1, matchId: d.matchId, step, tStart: 0, tickRate: 64, players, x, y, hp, maxHp, alive, kills: kills.sort((a, b) => a.t - b.t), diag: { demo: true } };
}
