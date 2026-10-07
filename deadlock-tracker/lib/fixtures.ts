import type { HistoryEntry, MatchDetails, MatchPlayer, TeamId } from "./types";
import type { HeroInfo, SteamProfile } from "./api/deadlock-api";

/** Deterministische Demo-Daten (DEADLOCK_DEMO=1), damit die App ohne Netzwerk bedienbar ist. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const DEMO_HEROES: HeroInfo[] = [
  "Abrams", "Bebop", "Dynamo", "Grey Talon", "Haze", "Infernus", "Ivy", "Kelvin", "Lady Geist",
  "Lash", "McGinnis", "Mo & Krill", "Paradox", "Pocket", "Seven", "Shiv", "Vindicta", "Viscous",
  "Warden", "Wraith", "Yamato",
].map((name, i) => ({ id: i + 1, name }));

const NAMES = ["Nova", "Kestrel", "Vex", "Orion", "Lumen", "Rook", "Sable", "Tundra", "Ember", "Quill", "Zephyr", "Moth"];

export function demoProfiles(ids: number[]): SteamProfile[] {
  return ids.map((accountId) => ({ accountId, name: `Spieler ${accountId % 10000}` }));
}

const DEMO_COUNT = 30;
const matchIdFor = (i: number) => 70000000 + i;

export function demoHistory(accountId: number, now = Date.now()): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  // Das jüngste Demo-Match endete vor ~2 Min, der Rest in ~50-Min-Abständen.
  for (let i = DEMO_COUNT - 1; i >= 0; i--) {
    const d = demoMatch(matchIdFor(i), accountId, now);
    const me = d.players[0];
    out.push({
      matchId: d.matchId, accountId, heroId: me.heroId, startTime: d.startTime, durationS: d.durationS,
      won: d.winningTeam === me.team, team: me.team, kills: me.kills, deaths: me.deaths, assists: me.assists,
      netWorth: me.netWorth, lastHits: me.lastHits, denies: me.denies, heroLevel: me.level, abandoned: false,
      matchMode: "Ranked", gameMode: "Normal",
    });
  }
  return out;
}

export function demoMatch(matchId: number, focusAccount: number, now = Date.now()): MatchDetails {
  const idx = matchId - 70000000;
  const r = rng(matchId * 7919);
  const durationS = 1500 + Math.floor(r() * 1500);
  const endMs = now - 2 * 60_000 - idx * 50 * 60_000;
  const startTime = Math.floor(endMs / 1000) - durationS;
  const winningTeam: TeamId = r() < 0.5 ? 0 : 1;
  const players: MatchPlayer[] = [];
  for (let s = 0; s < 12; s++) {
    const team: TeamId = s < 6 ? 0 : 1;
    const skill = 0.6 + r() * 0.9 + (team === winningTeam ? 0.15 : 0);
    const mins = durationS / 60;
    const kills = Math.round(skill * (3 + r() * 8));
    const deaths = Math.max(0, Math.round((2 - skill) * (3 + r() * 7)));
    players.push({
      accountId: s === 0 ? focusAccount : 100000 + (matchId % 1000) * 20 + s,
      name: s === 0 ? undefined : NAMES[(s + idx) % NAMES.length],
      team, heroId: 1 + Math.floor(r() * DEMO_HEROES.length), kills, deaths,
      assists: Math.round(skill * (4 + r() * 12)), level: 18 + Math.floor(r() * 10),
      netWorth: Math.round(skill * mins * (800 + r() * 500)), lastHits: Math.round(skill * mins * (4 + r() * 3)),
      denies: Math.floor(r() * 15), heroDamage: Math.round(skill * mins * (700 + r() * 800)),
      objectiveDamage: Math.round(skill * mins * (60 + r() * 200)),
      healing: r() < 0.2 ? Math.round(mins * (800 + r() * 600)) : 0,
      damageTaken: Math.round(mins * (600 + r() * 600)),
      badge: 50 + Math.floor(r() * 3) * 10 + 1 + Math.floor(r() * 6), abandoned: false,
    });
  }
  const avg = (t: TeamId) => Math.round(players.filter((p) => p.team === t).reduce((a, p) => a + (p.badge ?? 0), 0) / 6);
  return {
    matchId, startTime, durationS, winningTeam, matchMode: "Ranked", gameMode: "Normal",
    avgBadge: [avg(0), avg(1)], players,
  };
}
