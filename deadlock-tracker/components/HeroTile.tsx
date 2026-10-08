"use client";
import { HeroPortrait, useHero, useHeroName, useTilt } from "./GameAssets";
import { NavLink } from "./NavLink";
import { HoverCard } from "./Popover";
import type { HeroAgg } from "@/lib/view";

export function HeroTile({ h }: { h: HeroAgg }) {
  const heroName = useHeroName();
  const { color } = useHero(h.heroId);
  const tilt = useTilt(6);
  const wr = h.wins / h.matches;
  const tip = (
    <div className="space-y-1.5 text-xs"><div className="flex items-center gap-2"><HeroPortrait id={h.heroId} size={34} variant="small" /><b className="text-sm">{heroName(h.heroId)}</b></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted"><span>Spiele</span><b className="num text-white">{h.matches}</b><span>Winrate</span><b className="num text-white">{Math.round(wr * 100)}%</b><span>KDA</span><b className="num text-white">{h.kda.toFixed(2)}</b><span>Souls/Min</span><b className="num text-white">{Math.round(h.soulsPerMin)}</b><span>Ø Rating</span><b className="num text-white">{h.avgScore?.toFixed(2) ?? "–"}</b></div></div>
  );
  return (
    <HoverCard width={230} className="!block" content={tip}>
    <NavLink href={`/heroes/${h.heroId}`} className="block">
      <div {...tilt} className="tilt surface relative flex items-center gap-4 overflow-hidden p-4" style={{ boxShadow: `0 0 0 1px ${color}33` }}>
        <span className="shine" />
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `radial-gradient(300px 120px at 0% 50%, ${color}, transparent)` }} />
        <HeroPortrait id={h.heroId} size={76} h={96} ring={color} className="relative !rounded-xl" />
        <div className="relative min-w-0 flex-1">
          <div className="display truncate text-xl font-bold">{heroName(h.heroId)}</div>
          <div className="num text-xs text-muted">{h.matches} Spiele · KDA {h.kda.toFixed(1)}</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${wr * 100}%`, background: wr >= 0.5 ? "linear-gradient(90deg,#1d8a5c,#3ecf8e)" : "linear-gradient(90deg,#a02535,#f0616d)" }} /></div>
            <span className="num text-xs font-semibold">{Math.round(wr * 100)}%</span>
          </div>
        </div>
      </div>
    </NavLink>
    </HoverCard>
  );
}
