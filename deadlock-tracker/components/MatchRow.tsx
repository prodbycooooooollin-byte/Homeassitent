"use client";
import { HeroPortrait, RankEmblem, useHeroName } from "./GameAssets";
import { GradeBadge } from "./GradeBadge";
import { NavLink } from "./NavLink";
import { fmtAgo, fmtDuration, fmtK } from "@/lib/format";
import type { MatchListItem } from "@/lib/view";

export function MatchRow({ m, account, delay = 0 }: { m: MatchListItem; account: number; delay?: number }) {
  const heroName = useHeroName();
  const kda = (m.kills + m.assists) / Math.max(1, m.deaths);
  const col = m.won ? "#3ecf8e" : "#f0616d";
  return (
    <NavLink href={`/match/${m.matchId}?account=${account}`} style={{ animationDelay: `${delay}ms` }}
      className="group fade-up relative flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 transition hover:bg-white/[0.04]">
      <span className="absolute inset-y-0 left-0 w-1 transition-all group-hover:w-1.5" style={{ background: col, boxShadow: `0 0 14px ${col}` }} />
      <div className="relative transition-transform duration-300 group-hover:scale-105">
        <HeroPortrait id={m.heroId} size={54} />
        <span className="absolute -bottom-1 -right-1"><GradeBadge grade={m.grade} size="xs" /></span>
      </div>
      <div className="w-52 min-w-0">
        <div className="truncate font-semibold">{heroName(m.heroId)}</div>
        <div className="text-xs" style={{ color: col }}>{m.won ? "Sieg" : "Niederlage"} <span className="text-muted">· {fmtDuration(m.durationS)}{m.matchMode ? ` · ${m.matchMode}` : ""}</span></div>
      </div>
      <div className="num w-28">
        <div className="text-[15px] font-semibold">{m.kills}<span className="text-muted"> / </span><span className="text-loss">{m.deaths}</span><span className="text-muted"> / </span>{m.assists}</div>
        <div className="text-xs text-muted">{kda.toFixed(2)} KDA</div>
      </div>
      <div className="num hidden w-20 md:block"><div className="text-sm font-medium">{fmtK(m.netWorth)}</div><div className="text-xs text-muted">Souls</div></div>
      <div className="hidden w-36 lg:block">{m.lobbyBadge ? <RankEmblem badge={m.lobbyBadge} size={32} label /> : <span className="text-xs text-muted">Rang folgt …</span>}</div>
      <div className="ml-auto text-right text-xs text-muted">
        {fmtAgo(m.startTime + m.durationS)}
        {m.detectedAfterS !== null && <div className="text-amber" title="Zeit zwischen Spielende und Erkennung">⚡ {m.detectedAfterS}s</div>}
      </div>
      <span className="text-muted transition group-hover:translate-x-1 group-hover:text-white">›</span>
    </NavLink>
  );
}
