import { ratePlayer } from "./rating";
import type { MatchDetails, MatchPlayer, TeamId } from "./types";

/** Lane-Farben laut Valve (CMsgLaneColor): 1 Gelb, 3 Grün, 4 Blau, 6 Lila. */
export const LANES: Record<number, { name: string; color: string }> = {
  1: { name: "Gelb", color: "#f0c04c" },
  3: { name: "Grün", color: "#3ecf8e" },
  4: { name: "Blau", color: "#4aa3ff" },
  6: { name: "Lila", color: "#a77be8" },
};
export const laneInfo = (lane: number) => LANES[lane] ?? { name: `Lane ${lane}`, color: "#8b94a8" };

import { valueAt } from "./timeline";
export { valueAt };
const at = (p: MatchPlayer, key: "nw" | "k" | "d" | "a" | "dmg" | "heal" | "taken", t: number) => (p.timeline ? valueAt(p.timeline as never, key, t) : 0);

export interface LaneSide { players: MatchPlayer[]; souls: number; kills: number; deaths: number }
export interface LaneReport { lane: number; sides: [LaneSide, LaneSide]; diff: number; winner: TeamId | null }

/** Lane-Analyse: Souls und Kämpfe bis zum Ende der Laning-Phase (Standard 8:00). */
export function laneReports(d: MatchDetails, atS = 480): LaneReport[] {
  const lanes = [...new Set(d.players.map((p) => p.lane).filter((l): l is number => !!l))].sort((a, b) => a - b);
  return lanes.map((lane) => {
    const side = (team: TeamId): LaneSide => {
      const players = d.players.filter((p) => p.lane === lane && p.team === team);
      return {
        players,
        souls: players.reduce((a, p) => a + at(p, "nw", atS), 0),
        kills: players.reduce((a, p) => a + at(p, "k", atS), 0),
        deaths: players.reduce((a, p) => a + at(p, "d", atS), 0),
      };
    };
    const sides: [LaneSide, LaneSide] = [side(0), side(1)];
    const diff = sides[0].souls - sides[1].souls;
    return { lane, sides, diff, winner: Math.abs(diff) < 150 ? null : diff > 0 ? 0 : 1 };
  });
}

/** Souls-Vorsprung von Team 0 über die Zeit (positiv = Team 0 vorn), im Minutentakt. */
export function teamAdvantage(d: MatchDetails): { t: number; diff: number }[] {
  const withTl = d.players.filter((p) => p.timeline);
  if (withTl.length < 2) return [];
  const end = Math.max(...withTl.map((p) => p.timeline!.t[p.timeline!.t.length - 1]));
  const out: { t: number; diff: number }[] = [];
  for (let t = 0; t <= end; t += 60) {
    const s = (team: TeamId) => withTl.filter((p) => p.team === team).reduce((a, p) => a + at(p, "nw", t), 0);
    out.push({ t, diff: s(0) - s(1) });
  }
  return out;
}

export type FeedEvent =
  | { kind: "kill"; t: number; victim: MatchPlayer; killer?: MatchPlayer }
  | { kind: "objective"; t: number; id: number; team: TeamId }
  | { kind: "boss"; t: number; team: TeamId };

export function objectiveLabel(id: number): string {
  if (id === 0) return "Patron";
  if (id >= 1 && id <= 4) return `Guardian (Lane ${id})`;
  if (id >= 5 && id <= 8) return `Walker (Lane ${id - 4})`;
  if (id === 9) return "Shrine-Titan";
  if (id === 10 || id === 11) return "Schildgenerator";
  if (id >= 12 && id <= 15) return `Barracks-Boss (Lane ${id - 11})`;
  return "Objective";
}

export function feed(d: MatchDetails): FeedEvent[] {
  const bySlot = new Map(d.players.filter((p) => p.slot !== undefined).map((p) => [p.slot as number, p]));
  const ev: FeedEvent[] = [];
  for (const p of d.players) for (const x of p.deathLog ?? []) ev.push({ kind: "kill", t: x.t, victim: p, killer: x.killerSlot !== undefined ? bySlot.get(x.killerSlot) : undefined });
  for (const o of d.objectives ?? []) ev.push({ kind: "objective", t: o.t, id: o.id, team: o.team });
  for (const m of d.midBoss ?? []) ev.push({ kind: "boss", t: m.t, team: m.team });
  return ev.sort((a, b) => a.t - b.t);
}

export interface Award { key: string; title: string; player: MatchPlayer; value: string; icon: string }

/** Auszeichnungen der Lobby – „Wer war wofür der Beste?“ */
export function awards(d: MatchDetails): Award[] {
  const ps = d.players;
  if (ps.length < 2) return [];
  const top = (f: (p: MatchPlayer) => number) => ps.reduce((b, p) => (f(p) > f(b) ? p : b), ps[0]);
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
  const mvp = ps.reduce((b, p) => ((ratePlayer(d, p.accountId)?.score ?? 0) > (ratePlayer(d, b.accountId)?.score ?? 0) ? p : b), ps[0]);
  const out: Award[] = [{ key: "mvp", title: "MVP", player: mvp, value: `Score ${(ratePlayer(d, mvp.accountId)?.score ?? 0).toFixed(2)}`, icon: "★" }];
  const add = (key: string, title: string, icon: string, f: (p: MatchPlayer) => number, fmt: (v: number) => string, min = 1) => {
    const p = top(f);
    if (f(p) >= min) out.push({ key, title, player: p, value: fmt(f(p)), icon });
  };
  add("souls", "Souls-König", "◆", (p) => p.netWorth, (v) => `${k(v)} Souls`);
  add("kills", "Killer", "✦", (p) => p.kills, (v) => `${v} Kills`, 3);
  add("damage", "Schadensmacher", "⚡", (p) => p.heroDamage, (v) => `${k(v)} Schaden`);
  add("tank", "Frontline", "⛨", (p) => p.damageTaken, (v) => `${k(v)} erlitten`);
  add("heal", "Lebensretter", "✚", (p) => p.healing, (v) => `${k(v)} Heilung`, 2000);
  add("obj", "Turmbrecher", "♜", (p) => p.objectiveDamage, (v) => `${k(v)} Objective-Schaden`, 1000);
  add("dead", "Stammgast im Jenseits", "☠", (p) => p.deadTimeS ?? 0, (v) => `${Math.round(v / 60)} Min. tot`, 120);
  return out;
}

/** Größter Souls-Vorsprung/-Rückstand für das eigene Team + Comeback-Erkennung. */
export function advantageSummary(d: MatchDetails, myTeam: TeamId) {
  const adv = teamAdvantage(d).map((x) => ({ t: x.t, diff: myTeam === 0 ? x.diff : -x.diff }));
  if (!adv.length) return null;
  const max = adv.reduce((b, x) => (x.diff > b.diff ? x : b), adv[0]);
  const min = adv.reduce((b, x) => (x.diff < b.diff ? x : b), adv[0]);
  const won = d.winningTeam === myTeam;
  return { max, min, comeback: won && min.diff < -4000, throwGame: !won && max.diff > 4000 };
}
