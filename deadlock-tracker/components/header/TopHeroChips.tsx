"use client";
import { HeroPortrait, useHeroName } from "../GameAssets";
import type { Overview } from "@/lib/view";

/** Bis zu drei weitere Top-Helden als kleine Porträt-Chips ohne Rahmen. */
export function TopHeroChips({ ov, mainId }: { ov: Overview; mainId: number | undefined }) {
  const name = useHeroName();
  const list = ov.heroes.filter((h) => h.heroId !== mainId && h.matches > 0).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="label !text-[10px]">Top-Helden</span>
      {list.map((h) => (
        <div key={h.heroId} className="flex items-center gap-2" title={`${name(h.heroId)}: ${h.matches} Spiele`}>
          <HeroPortrait id={h.heroId} size={28} variant="small" className="!rounded-full" />
          <span className="num text-xs"><span className="font-semibold">{name(h.heroId)}</span> <span className="text-muted">{Math.round((h.wins / h.matches) * 100)}%</span></span>
        </div>
      ))}
    </div>
  );
}
