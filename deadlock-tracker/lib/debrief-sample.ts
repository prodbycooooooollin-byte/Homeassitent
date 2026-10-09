import { demoMatch } from "./fixtures";
import { ratePlayer } from "./rating";
import type { MatchDetails, Rating } from "./types";

export type SampleKind = "win" | "loss";

/** Beispiel-Match zum Ausprobieren des Debriefs (ohne echtes Match): Sieg mit starker Leistung oder Niederlage mit schwacher. */
export function buildSample(kind: SampleKind, account: number): { details: MatchDetails; ratings: Record<number, Rating | null> } {
  const d = demoMatch(kind === "win" ? 70000000 : 70000007, account);
  const me = d.players[0];
  me.accountId = account;
  if (kind === "win") {
    Object.assign(me, { kills: 14, deaths: 3, assists: 21, heroDamage: Math.round(me.heroDamage * 1.4), netWorth: Math.round(me.netWorth * 1.2) });
    d.winningTeam = me.team;
  } else {
    Object.assign(me, { kills: 2, deaths: 11, assists: 4, heroDamage: Math.round(me.heroDamage * 0.55), netWorth: Math.round(me.netWorth * 0.7) });
    d.winningTeam = me.team === 0 ? 1 : 0;
  }
  const ratings = Object.fromEntries(d.players.map((p) => [p.accountId, ratePlayer(d, p.accountId)]));
  return { details: d, ratings };
}
