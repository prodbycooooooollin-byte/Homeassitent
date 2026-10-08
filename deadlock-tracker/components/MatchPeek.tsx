"use client";
import { useEffect, useState } from "react";
import { HeroPortrait, RankEmblem, useHeroName } from "./GameAssets";
import { GradeBadge } from "./GradeBadge";
import { fmtDuration, fmtK } from "@/lib/format";
import type { MatchDetails, Rating } from "@/lib/types";

interface Res { details: MatchDetails | null; ratings: Record<number, Rating | null>; lobbyBadge: number | null }
const cache = new Map<string, Res>();

/** Vorschau eines Matches beim Überfahren: beide Teams mit Helden, K/D/A und Noten. */
export function MatchPeek({ matchId, account }: { matchId: number; account: number }) {
  const key = `${matchId}:${account}`;
  const [res, setRes] = useState<Res | null>(cache.get(key) ?? null);
  const [err, setErr] = useState(false);
  const heroName = useHeroName();
  useEffect(() => {
    if (cache.has(key)) return;
    fetch(`/api/matches/${matchId}?account=${account}&peek=1`).then((r) => r.json()).then((j) => { cache.set(key, j); setRes(j); }).catch(() => setErr(true));
  }, [key, matchId, account]);

  if (err) return <p className="text-xs text-muted">Vorschau nicht verfügbar.</p>;
  if (!res) return <div className="skeleton h-28" />;
  const d = res.details;
  if (!d) return <p className="text-xs text-muted">Details für dieses Match werden noch geladen. Die Vorschau erscheint, sobald beide Teams verfügbar sind.</p>;
  const team = (t: 0 | 1) => d.players.filter((p) => p.team === t).sort((a, b) => b.netWorth - a.netWorth);
  const col = ["#f0b44c", "#4aa3ff"];
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{d.matchMode ?? "Match"} · {fmtDuration(d.durationS)}</span>
        <span className="flex items-center gap-1.5">Ø Lobby <RankEmblem badge={res.lobbyBadge} size={20} label /></span>
      </div>
      {([0, 1] as const).map((t) => (
        <div key={t}>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: col[t] }}>
            <span>{t === 0 ? "Hidden King" : "Archmother"}{d.winningTeam === t ? " · Sieg" : ""}</span>
            <span className="num text-muted">{fmtK(team(t).reduce((a, p) => a + p.netWorth, 0))} Souls</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {team(t).map((p) => (
              <div key={p.accountId} className={`rounded-lg p-1 text-center ${p.accountId === account ? "bg-amber/15 ring-1 ring-amber/60" : "bg-white/[0.03]"}`} title={heroName(p.heroId)}>
                <div className="relative mx-auto w-fit"><HeroPortrait id={p.heroId} size={34} variant="small" className="!rounded-md" /><span className="absolute -bottom-1 -right-1.5"><GradeBadge grade={res.ratings[p.accountId]?.grade ?? null} size="xs" title="" /></span></div>
                <div className="num mt-1.5 text-[9.5px] leading-none text-muted">{p.kills}/{p.deaths}/{p.assists}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
