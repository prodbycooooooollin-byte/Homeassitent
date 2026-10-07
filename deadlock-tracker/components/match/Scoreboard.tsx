"use client";
import { HeroPortrait, RankEmblem, useHeroName } from "../GameAssets";
import { GradeBadge } from "../GradeBadge";
import { fmtK } from "@/lib/format";
import type { MatchDetails, MatchPlayer, Rating, TeamId } from "@/lib/types";

export const TEAMS = [
  { name: "Hidden King", color: "#f0b44c" },
  { name: "Archmother", color: "#4aa3ff" },
] as const;

export const sum = (d: MatchDetails, t: TeamId, f: (p: MatchPlayer) => number) => d.players.filter((p) => p.team === t).reduce((a, p) => a + f(p), 0);

export function Versus({ label, a, b, k }: { label: string; a: number; b: number; k?: boolean }) {
  const total = Math.max(1, a + b);
  const f = (n: number) => (k ? fmtK(n) : String(n));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="num font-semibold" style={{ color: TEAMS[0].color }}>{f(a)}</span>
        <span className="text-muted">{label}</span>
        <span className="num font-semibold" style={{ color: TEAMS[1].color }}>{f(b)}</span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        <div style={{ width: `${(a / total) * 100}%`, background: `linear-gradient(90deg,#b8741a,${TEAMS[0].color})` }} />
        <div style={{ width: `${(b / total) * 100}%`, background: `linear-gradient(90deg,${TEAMS[1].color},#2a62b8)` }} />
      </div>
    </div>
  );
}

export function TeamTable({ team, d, account, ratings, maxDmg }: { team: TeamId; d: MatchDetails; account: number; ratings: Record<number, Rating | null>; maxDmg: number }) {
  const heroName = useHeroName();
  const players = d.players.filter((p) => p.team === team).sort((a, b) => b.netWorth - a.netWorth);
  const won = d.winningTeam === team;
  const T = TEAMS[team];
  return (
    <section className="surface overflow-hidden" style={{ boxShadow: won ? `0 0 0 1px ${T.color}44, 0 24px 50px -30px ${T.color}66` : undefined }}>
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3" style={{ background: `linear-gradient(90deg, ${T.color}22, transparent 60%)` }}>
        <span className="h-6 w-1 rounded-full" style={{ background: T.color, boxShadow: `0 0 12px ${T.color}` }} />
        <h2 className="display text-lg font-bold" style={{ color: T.color }}>{T.name}</h2>
        <span className={`chip ${won ? "text-win" : "text-loss"}`}>{won ? "Sieg" : "Niederlage"}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">Ø Rang <RankEmblem badge={d.avgBadge[team]} size={24} label /></span>
      </div>
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[920px] text-sm">
          <thead>
            <tr className="label text-right [&>th]:px-2 [&>th]:py-2.5 [&>th]:font-semibold">
              <th className="!pl-5 text-left">Spieler</th><th>Note</th><th>Rang</th><th>K / D / A</th><th>KDA</th><th>Souls</th>
              <th>LH / DN</th><th className="w-44 text-left">Heldenschaden</th><th>Objective</th><th>Heilung</th><th className="!pr-5">Erlitten</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const isMe = p.accountId === account;
              return (
                <tr key={`${p.accountId}-${p.heroId}`} className="relative border-t border-white/[0.05] text-right transition hover:bg-white/[0.03] [&>td]:px-2 [&>td]:py-2"
                  style={isMe ? { background: "linear-gradient(90deg, rgba(240,180,76,.14), transparent 70%)" } : undefined}>
                  <td className="!pl-5 text-left">
                    <div className="flex items-center gap-3">
                      {isMe && <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-amber shadow-[0_0_12px_#f0b44c]" />}
                      <HeroPortrait id={p.heroId} size={42} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{isMe ? "Du" : p.name ?? `Spieler ${p.accountId}`}{p.abandoned && <span className="ml-1.5 text-xs font-normal text-loss">verlassen</span>}</div>
                        <div className="truncate text-xs text-muted">{heroName(p.heroId)} · Lv {p.level}</div>
                      </div>
                    </div>
                  </td>
                  <td><div className="flex justify-end"><GradeBadge grade={ratings[p.accountId]?.grade ?? null} size="sm" /></div></td>
                  <td><div className="flex justify-end"><RankEmblem badge={p.badge} size={30} /></div></td>
                  <td className="font-semibold">{p.kills}<span className="text-muted"> / </span><span className="text-loss">{p.deaths}</span><span className="text-muted"> / </span>{p.assists}</td>
                  <td>{((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(1)}</td>
                  <td>{fmtK(p.netWorth)}</td>
                  <td className="text-muted">{p.lastHits} / {p.denies}</td>
                  <td className="text-left">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-white/[0.07]"><div className="h-full rounded-full" style={{ width: `${(p.heroDamage / maxDmg) * 100}%`, background: `linear-gradient(90deg, ${T.color}88, ${T.color})` }} /></div>
                      <span className="w-12 text-right">{fmtK(p.heroDamage)}</span>
                    </div>
                  </td>
                  <td>{fmtK(p.objectiveDamage)}</td>
                  <td>{p.healing ? fmtK(p.healing) : <span className="text-muted">–</span>}</td>
                  <td className="!pr-5 text-muted">{fmtK(p.damageTaken)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
