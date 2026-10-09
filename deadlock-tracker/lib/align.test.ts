import { describe, expect, it } from "vitest";
import { alignAccount } from "./align";
import { demoMatch } from "./fixtures";

describe("alignAccount", () => {
  it("ergänzt eine fehlende Account-ID anhand von Held, Team und K/D/A", () => {
    const d = demoMatch(70000003, 1);
    const me = d.players[0];
    const h = { matchId: d.matchId, accountId: 777, heroId: me.heroId, team: me.team, kills: me.kills, deaths: me.deaths, assists: me.assists } as never;
    me.accountId = 0;
    expect(alignAccount(d, 777, h)).toBe(true);
    expect(me.accountId).toBe(777);
  });
  it("tut nichts, wenn die ID schon vorkommt", () => {
    const d = demoMatch(70000004, 1);
    expect(alignAccount(d, d.players[0].accountId, undefined)).toBe(false);
  });
});
