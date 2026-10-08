"use client";
import { HeroPortrait, useHero, useHeroName, useTilt } from "../GameAssets";

/** Linke Zone: Main-Held als große Karte, Illustration füllt die gesamte Fläche. */
export function MainHeroCard({ heroId, accent }: { heroId: number | undefined; accent: string }) {
  const tilt = useTilt(6);
  const name = useHeroName();
  const { color } = useHero(heroId);
  return (
    <div {...tilt} className="tilt relative h-full min-h-[260px] w-full overflow-hidden rounded-2xl" style={{ boxShadow: `0 0 0 1px ${accent}55, 0 24px 48px -28px ${color}` }}>
      <div className="absolute inset-0">
        {heroId ? <HeroPortrait id={heroId} fill ratio={0.8} className="!rounded-none" /> : <div className="skeleton h-full w-full" />}
      </div>
      <div className="absolute inset-0" style={{ background: `linear-gradient(to top, #07080cf2 0%, #07080c80 32%, transparent 62%), linear-gradient(135deg, ${accent}33, transparent 55%)` }} />
      <span className="shine" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="label !text-[10px]" style={{ color: accent }}>Main-Held</div>
        <div className="display truncate text-2xl font-extrabold leading-tight">{heroId ? name(heroId) : "Noch kein Held"}</div>
      </div>
    </div>
  );
}
