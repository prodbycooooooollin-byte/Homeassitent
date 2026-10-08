"use client";
import { HeroBackdrop, HeroPortrait, RankEmblem, useHero, useHeroName, useTilt } from "./GameAssets";
import { GradeBadge } from "./GradeBadge";
import { MatchPeek } from "./MatchPeek";
import { NavLink } from "./NavLink";
import { HoverCard } from "./Popover";
import { fmtAgo, fmtDuration } from "@/lib/format";
import type { MatchListItem } from "@/lib/view";

/** Kachel-Ansicht eines Matches: Heldenbild, Note, Ergebnis-Glow – neigt sich mit der Maus. */
export function MatchCard({ m, account, i = 0 }: { m: MatchListItem; account: number; i?: number }) {
  const heroName = useHeroName();
  const { color } = useHero(m.heroId);
  const tilt = useTilt(6);
  const col = m.won ? "#3ecf8e" : "#f0616d";
  return (
    <HoverCard width={380} className="!block" content={<MatchPeek matchId={m.matchId} account={account} />}>
      <NavLink href={`/match/${m.matchId}?account=${account}`} className="block fade-up" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
        <div {...tilt} className="tilt surface relative overflow-hidden p-4" style={{ boxShadow: `0 0 0 1px ${col}44, 0 18px 40px -26px ${col}` }}>
          <span className="shine" />
          <div className="pointer-events-none absolute inset-0 opacity-40"><HeroBackdrop id={m.heroId} /></div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: col, boxShadow: `0 0 12px ${col}` }} />
          <div className="relative flex items-center gap-3">
            <HeroPortrait id={m.heroId} size={56} h={70} ring={color} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{heroName(m.heroId)}</div>
              <div className="text-xs" style={{ color: col }}>{m.won ? "Sieg" : "Niederlage"} <span className="text-muted">· {fmtDuration(m.durationS)}</span></div>
            </div>
            <GradeBadge grade={m.grade} size="md" />
          </div>
          <div className="relative mt-3 flex items-end justify-between">
            <div className="num"><div className="display text-xl font-extrabold">{m.kills}<span className="text-muted"> / </span><span className="text-loss">{m.deaths}</span><span className="text-muted"> / </span>{m.assists}</div><div className="text-[11px] text-muted">{((m.kills + m.assists) / Math.max(1, m.deaths)).toFixed(2)} KDA</div></div>
            <div className="text-right text-[11px] text-muted">{m.lobbyBadge ? <RankEmblem badge={m.lobbyBadge} size={26} /> : "Rang folgt …"}<div>{fmtAgo(m.startTime + m.durationS)}</div></div>
          </div>
        </div>
      </NavLink>
    </HoverCard>
  );
}
