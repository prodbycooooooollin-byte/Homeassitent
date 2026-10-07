"use client";
import { useCallback, useState } from "react";
import { GradeBadge } from "./GradeBadge";
import { RankBadge } from "./RankBadge";
import { useInterval } from "./useTracker";
import { fmtDuration, fmtK } from "@/lib/format";
import type { MatchDetails, MatchPlayer, Rating, TeamId } from "@/lib/types";

interface Res {
  matchId: number;
  details: MatchDetails | null;
  ratings: Record<number, Rating | null>;
  lobbyBadge: number | null;
  pending: boolean;
  attempts: number;
  nextAttemptAt: number | null;
  heroes: Record<number, { name: string }>;
  history: Record<string, { heroId: number; kills: number; deaths: number; assists: number; won: boolean }>;
}

const TEAM_NAMES = ["Hidden King", "Archmother"];

export function MatchView({ matchId, account }: { matchId: number; account: number }) {
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/matches/${matchId}?account=${account}`);
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setRes(await r.json());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [matchId, account]);
  // Solange Details fehlen, alle 10 s erneut versuchen.
  useInterval(() => {
    if (!res || res.pending) load();
  }, 10000);

  if (err) return <p className="text-loss">{err}</p>;
  if (!res) return <p className="text-muted">Lade …</p>;
  const hero = (id: number) => res.heroes[id]?.name ?? `Held #${id}`;
  const d = res.details;
  const mine = res.history[String(account)];

  if (!d) {
    return (
      <div className="card p-6">
        <a href="/" className="text-sm text-muted hover:text-white">← Zurück</a>
        <h1 className="mt-2 text-xl font-bold">Match #{matchId}</h1>
        {mine && <p className="mt-1">{hero(mine.heroId)} · {mine.kills}/{mine.deaths}/{mine.assists} · {mine.won ? "Sieg" : "Niederlage"}</p>}
        <p className="mt-4 text-sm text-muted">
          Match erkannt. Die vollständigen Daten beider Teams stellt Valve meist erst einige Minuten nach Spielende bereit –
          diese Seite lädt automatisch nach (Versuch {res.attempts}).
        </p>
      </div>
    );
  }

  const myRating = res.ratings[account] ?? null;
  const me = d.players.find((p) => p.accountId === account);
  const won = me && d.winningTeam === me.team;
  const maxDmg = Math.max(1, ...d.players.map((p) => p.heroDamage));

  return (
    <div className="space-y-5">
      <a href="/" className="text-sm text-muted hover:text-white">← Zurück</a>
      <div className="card flex flex-wrap items-center gap-5 p-5">
        <GradeBadge grade={myRating?.grade ?? null} size="xl" />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-bold uppercase tracking-wide ${won ? "text-win" : "text-loss"}`}>
            {me ? (won ? "Sieg" : "Niederlage") : "Match"}
          </div>
          <h1 className="text-2xl font-bold">{me ? hero(me.heroId) : `Match #${matchId}`}</h1>
          <p className="text-sm text-muted">
            #{matchId} · {fmtDuration(d.durationS)} · {d.matchMode ?? "–"} · {new Date(d.startTime * 1000).toLocaleString("de-DE")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Ø Lobby-Rang</div>
          <div className="text-lg font-semibold"><RankBadge badge={res.lobbyBadge} /></div>
          <div className="mt-1 text-xs text-muted">
            {TEAM_NAMES[0]}: <RankBadge badge={d.avgBadge[0]} /> · {TEAM_NAMES[1]}: <RankBadge badge={d.avgBadge[1]} />
          </div>
        </div>
      </div>

      {myRating && (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">
            Performance-Rating · Score {myRating.score.toFixed(2)} <span className="font-normal">(1.00 = Lobby-Schnitt)</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-5">
            {myRating.parts.map((p) => (
              <div key={p.label}>
                <div className="flex justify-between text-xs"><span>{p.label}</span><span className="num">{p.value.toFixed(2)}×</span></div>
                <div className="mt-1 h-1.5 rounded bg-panel2">
                  <div className={`h-full rounded ${p.value >= 1 ? "bg-win" : "bg-loss"}`} style={{ width: `${Math.min(100, (p.value / 2) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {([0, 1] as TeamId[]).map((t) => (
        <TeamTable key={t} team={t} d={d} account={account} hero={hero} ratings={res.ratings} maxDmg={maxDmg} />
      ))}
    </div>
  );
}

function TeamTable({ team, d, account, hero, ratings, maxDmg }: {
  team: TeamId; d: MatchDetails; account: number; hero: (id: number) => string;
  ratings: Record<number, Rating | null>; maxDmg: number;
}) {
  const players = d.players.filter((p) => p.team === team).sort((a, b) => b.netWorth - a.netWorth);
  const won = d.winningTeam === team;
  const sum = (f: (p: MatchPlayer) => number) => players.reduce((a, p) => a + f(p), 0);
  return (
    <div className="card overflow-x-auto">
      <div className={`flex items-center justify-between border-b border-line px-4 py-2 ${won ? "text-win" : "text-loss"}`}>
        <span className="font-semibold">{TEAM_NAMES[team]} · {won ? "Sieg" : "Niederlage"}</span>
        <span className="num text-xs text-muted">
          {sum((p) => p.kills)} Kills · {fmtK(sum((p) => p.netWorth))} Souls · Ø <RankBadge badge={d.avgBadge[team]} />
        </span>
      </div>
      <table className="num w-full min-w-[820px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="text-right">
            <th className="px-3 py-2 text-left">Spieler</th><th>Note</th><th>Rang</th><th>K / D / A</th><th>KDA</th>
            <th>Souls</th><th>LH / DN</th><th className="w-40 text-left pl-3">Heldenschaden</th><th>Objective</th><th>Heilung</th><th className="pr-3">Erlitten</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const isMe = p.accountId === account;
            return (
              <tr key={p.accountId + "-" + p.heroId} className={`border-t border-line text-right ${isMe ? "bg-amber/10" : ""}`}>
                <td className="px-3 py-2 text-left">
                  <div className="font-medium">{isMe ? "Du" : p.name ?? `ID ${p.accountId}`}{p.abandoned && <span className="ml-1 text-xs text-loss">(abgebrochen)</span>}</div>
                  <div className="text-xs text-muted">{hero(p.heroId)} · Lv {p.level}</div>
                </td>
                <td><GradeBadge grade={ratings[p.accountId]?.grade ?? null} size="sm" /></td>
                <td className="whitespace-nowrap"><RankBadge badge={p.badge} /></td>
                <td>{p.kills} / {p.deaths} / {p.assists}</td>
                <td>{((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(1)}</td>
                <td>{fmtK(p.netWorth)}</td>
                <td>{p.lastHits} / {p.denies}</td>
                <td className="pl-3 text-left">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded bg-panel2"><div className="h-full rounded bg-sapphire" style={{ width: `${(p.heroDamage / maxDmg) * 100}%` }} /></div>
                    <span className="w-12 text-right">{fmtK(p.heroDamage)}</span>
                  </div>
                </td>
                <td>{fmtK(p.objectiveDamage)}</td>
                <td>{p.healing ? fmtK(p.healing) : "–"}</td>
                <td className="pr-3">{fmtK(p.damageTaken)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
