"use client";
import { HeroPortrait, RankEmblem, useHeroName } from "./GameAssets";
import { GradeBadge } from "./GradeBadge";
import { Icon } from "./Icon";
import { MatchPeek } from "./MatchPeek";
import { NavLink } from "./NavLink";
import { HoverCard } from "./Popover";
import { fmtAgo, fmtDuration, fmtK } from "@/lib/format";
import type { MatchListItem } from "@/lib/view";

export function MatchRow({ m, account, delay = 0, peek = true }: { m: MatchListItem; account: number; delay?: number; peek?: boolean }) {
  const heroName = useHeroName();
  const kda = (m.kills + m.assists) / Math.max(1, m.deaths);
  const col = m.won ? "#3ecf8e" : "#f0616d";
  const row = (
    <NavLink href={`/match/${m.matchId}?account=${account}`} style={{ animationDelay: `${delay}ms` }}
      className="group fade-up relative flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 transition hover:bg-white/[0.04]">
      <span className="absolute inset-y-0 left-0 w-1 transition-all group-hover:w-1.5" style={{ background: col, boxShadow: `0 0 14px ${col}` }} />
      <div className="relative transition-transform duration-300 group-hover:scale-105">
        <HeroPortrait id={m.heroId} size={54} />
        <span className="absolute -bottom-1 -right-1"><GradeBadge grade={m.grade} size="xs" title={m.grade ? `Note ${m.grade} · Score ${m.score?.toFixed(2)}` : undefined} /></span>
      </div>
      <div className="w-36 min-w-0 md:w-52">
        <div className="truncate font-semibold">{heroName(m.heroId)}</div>
        <div className="text-xs" style={{ color: col }}>{m.won ? "Sieg" : "Niederlage"} <span className="text-muted">· {fmtDuration(m.durationS)}{m.matchMode ? ` · ${m.matchMode}` : ""}</span></div>
      </div>
      <div className="num w-28">
        <div className="text-[15px] font-semibold">{m.kills}<span className="text-muted"> / </span><span className="text-loss">{m.deaths}</span><span className="text-muted"> / </span>{m.assists}</div>
        <div className="text-xs text-muted">{kda.toFixed(2)} KDA</div>
      </div>
      <div className="num hidden w-20 lg:block"><div className="text-sm font-medium">{fmtK(m.netWorth)}</div><div className="text-xs text-muted">Souls</div></div>
      <div className="hidden w-36 sm:block">{m.lobbyBadge ? <RankEmblem badge={m.lobbyBadge} size={32} label /> : <span className="text-xs text-muted">Rang folgt …</span>}</div>
      <div className="ml-auto text-right text-xs text-muted">
        {fmtAgo(m.startTime + m.durationS)}
        {m.detectedAfterS !== null && <div className="flex items-center justify-end gap-1 text-amber" title="Zeit zwischen Spielende und Erkennung"><Icon name="bolt" size={11} />{m.detectedAfterS}s</div>}
      </div>
      <Icon name="chevron" size={16} className="text-muted transition group-hover:translate-x-1 group-hover:text-white" />
    </NavLink>
  );
  if (!peek) return row;
  return <HoverCard width={380} className="!flex w-full [&>a]:w-full" content={<MatchPeek matchId={m.matchId} account={account} />}>{row}</HoverCard>;
}
