"use client";
import { useCallback, useState } from "react";
import { GradeBadge, GRADE_STYLE } from "./GradeBadge";
import { HeroBackdrop, HeroPortrait, RankEmblem, useHero, useHeroName } from "./GameAssets";
import { NavLink } from "./NavLink";
import { useInterval } from "./useTracker";
import { fmtDuration, fmtK } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import type { MatchDetails, MatchPlayer, Rating, TeamId } from "@/lib/types";

interface Res {
  matchId: number;
  details: MatchDetails | null;
  ratings: Record<number, Rating | null>;
  lobbyBadge: number | null;
  pending: boolean;
  attempts: number;
  history: Record<string, { heroId: number; kills: number; deaths: number; assists: number; won: boolean; durationS: number }>;
}

const TEAMS = [
  { name: "Hidden King", color: "#f0b44c" },
  { name: "Archmother", color: "#4aa3ff" },
] as const;

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
  useInterval(() => { if (!res || res.pending) load(); }, 8000);

  const back = <NavLink href="/matches" className="btn btn-ghost !w-fit !px-3 !py-1.5 text-xs">← Alle Matches</NavLink>;
  if (err) return <div className="space-y-4">{back}<div className="surface p-6 text-loss">{err}</div></div>;
  if (!res) return <div className="space-y-4">{back}<div className="skeleton h-56" /><div className="skeleton h-80" /></div>;
  if (!res.details) return <Pending res={res} account={account} back={back} />;
  return <Summary res={res} d={res.details} account={account} back={back} />;
}

function Pending({ res, account, back }: { res: Res; account: number; back: React.ReactNode }) {
  const mine = res.history[String(account)];
  const heroName = useHeroName();
  const { color } = useHero(mine?.heroId);
  return (
    <>
      {back}
      <section className="surface relative overflow-hidden p-8" style={{ boxShadow: `0 0 0 1px ${color}33` }}>
        <HeroBackdrop id={mine?.heroId} />
        <div className="relative flex flex-wrap items-center gap-6">
          {mine && <HeroPortrait id={mine.heroId} size={96} ring={color} />}
          <div>
            <div className="label">Match #{res.matchId} erkannt</div>
            <h1 className="display text-3xl font-extrabold">{mine ? heroName(mine.heroId) : "Match"}</h1>
            {mine && <p className="num mt-1 text-lg">{mine.kills} / {mine.deaths} / {mine.assists} · <span className={mine.won ? "text-win" : "text-loss"}>{mine.won ? "Sieg" : "Niederlage"}</span></p>}
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted">
            <span className="live-dot" /> Beide Teams, Ränge und Rating werden geladen … (Versuch {res.attempts + 1})
          </div>
        </div>
      </section>
      <div className="skeleton h-72" />
    </>
  );
}

function Summary({ res, d, account, back }: { res: Res; d: MatchDetails; account: number; back: React.ReactNode }) {
  const heroName = useHeroName();
  const me = d.players.find((p) => p.accountId === account);
  const rating = res.ratings[account] ?? null;
  const won = !!me && d.winningTeam === me.team;
  const { color } = useHero(me?.heroId);
  const resultColor = !me ? "#8b94a8" : won ? "#3ecf8e" : "#f0616d";
  const maxDmg = Math.max(1, ...d.players.map((p) => p.heroDamage));

  return (
    <>
      {back}

      <section className="surface relative overflow-hidden" style={{ boxShadow: `0 0 0 1px ${resultColor}33, 0 30px 60px -30px ${resultColor}44` }}>
        <HeroBackdrop id={me?.heroId} />
        <div className="relative grid items-center gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:p-8">
          <div className="flex items-center gap-5">
            <GradeBadge grade={rating?.grade ?? null} size="xl" />
            {me && <HeroPortrait id={me.heroId} size={112} ring={color} className="!rounded-2xl" />}
          </div>
          <div className="min-w-0">
            <div className="display text-sm font-extrabold uppercase tracking-[0.3em]" style={{ color: resultColor }}>
              {me ? (won ? "Sieg" : "Niederlage") : "Match"}
            </div>
            <h1 className="display text-4xl font-extrabold tracking-tight">{me ? heroName(me.heroId) : `Match #${d.matchId}`}</h1>
            {me && (
              <p className="num mt-1 text-2xl font-semibold">
                {me.kills} <span className="text-muted">/</span> <span className="text-loss">{me.deaths}</span> <span className="text-muted">/</span> {me.assists}
                <span className="ml-3 text-sm font-normal text-muted">{((me.kills + me.assists) / Math.max(1, me.deaths)).toFixed(2)} KDA</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip">⏱ {fmtDuration(d.durationS)}</span>
              {d.matchMode && <span className="chip">{d.matchMode}</span>}
              <span className="chip">{new Date(d.startTime * 1000).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="chip text-muted">#{d.matchId}</span>
              {rating && <span className="chip" style={{ borderColor: `${GRADE_STYLE[rating.grade].glow}` }}>{GRADE_STYLE[rating.grade].label} · Score {rating.score.toFixed(2)}</span>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-center backdrop-blur">
            <div className="label">Ø Lobby-Rang</div>
            <div className="mt-2 flex justify-center"><RankEmblem badge={res.lobbyBadge} size={72} /></div>
            <div className="display mt-1 text-lg font-bold">{res.lobbyBadge ? formatBadge(res.lobbyBadge) : "Unbekannt"}</div>
            <div className="mt-1 flex justify-center gap-3 text-[11px] text-muted">
              <span style={{ color: TEAMS[0].color }}>{d.avgBadge[0] ? formatBadge(d.avgBadge[0]) : "–"}</span>
              <span>vs</span>
              <span style={{ color: TEAMS[1].color }}>{d.avgBadge[1] ? formatBadge(d.avgBadge[1]) : "–"}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <section className="surface p-5">
          <h2 className="label mb-4">Teamvergleich</h2>
          <div className="space-y-3.5">
            <Versus label="Kills" a={sum(d, 0, (p) => p.kills)} b={sum(d, 1, (p) => p.kills)} />
            <Versus label="Souls" a={sum(d, 0, (p) => p.netWorth)} b={sum(d, 1, (p) => p.netWorth)} k />
            <Versus label="Heldenschaden" a={sum(d, 0, (p) => p.heroDamage)} b={sum(d, 1, (p) => p.heroDamage)} k />
            <Versus label="Objective-Schaden" a={sum(d, 0, (p) => p.objectiveDamage)} b={sum(d, 1, (p) => p.objectiveDamage)} k />
          </div>
        </section>
        {rating && (
          <section className="surface p-5">
            <h2 className="label mb-4">Deine Performance <span className="normal-case tracking-normal">· 1.00 = Lobby-Schnitt</span></h2>
            <div className="space-y-3">
              {rating.parts.map((p) => (
                <div key={p.label}>
                  <div className="mb-1 flex justify-between text-xs"><span>{p.label}</span><span className="num font-semibold" style={{ color: p.value >= 1 ? "#3ecf8e" : "#f0616d" }}>{p.value.toFixed(2)}×</span></div>
                  <div className="relative h-2 rounded-full bg-white/[0.07]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.value / 2) * 100)}%`, background: p.value >= 1 ? "linear-gradient(90deg,#1d8a5c,#3ecf8e)" : "linear-gradient(90deg,#a02535,#f0616d)" }} />
                    <span className="absolute -top-0.5 left-1/2 h-3 w-px bg-white/40" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {([0, 1] as TeamId[]).map((t) => (
        <TeamTable key={t} team={t} d={d} account={account} ratings={res.ratings} maxDmg={maxDmg} />
      ))}
    </>
  );
}

const sum = (d: MatchDetails, t: TeamId, f: (p: MatchPlayer) => number) => d.players.filter((p) => p.team === t).reduce((a, p) => a + f(p), 0);

function Versus({ label, a, b, k }: { label: string; a: number; b: number; k?: boolean }) {
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

function TeamTable({ team, d, account, ratings, maxDmg }: { team: TeamId; d: MatchDetails; account: number; ratings: Record<number, Rating | null>; maxDmg: number }) {
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
