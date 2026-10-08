"use client";
import { useState } from "react";
import { Avatar, HeroBackdrop } from "./GameAssets";
import { BadgeRow, BannerEditor, useProfileAccent } from "./BannerEditor";
import { MainHeroCard } from "./header/MainHeroCard";
import { RankStage } from "./header/RankStage";
import { StatReadout } from "./header/StatReadout";
import { TopHeroChips } from "./header/TopHeroChips";
import { Icon } from "./Icon";
import { useSettings } from "./Providers";
import type { MatchListItem, Overview } from "@/lib/view";

/** Kopfbereich: links Main-Held, Mitte Identität und Kennzahlen, rechts großer Rang-Auftritt. */
export function PlayerCard({ name, avatar, accountId, ov, items, onRemove }: { name: string; avatar?: string; accountId: number; ov: Overview; items: MatchListItem[]; onRemove?: () => void }) {
  const { settings } = useSettings();
  const p = settings.profile;
  const [editing, setEditing] = useState(false);
  const mainId = p.mainHero ?? ov.heroes[0]?.heroId;
  const color = useProfileAccent(p.accent, mainId, ov.currentBadge);

  return (
    <section className="surface relative overflow-hidden" style={{ boxShadow: `0 0 0 1px ${color}40, 0 40px 80px -48px ${color}77` }}>
      <div className="absolute inset-0 opacity-60"><HeroBackdrop id={mainId} /></div>
      <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(100deg, #07080cd9 0%, #07080c99 45%, transparent 100%), radial-gradient(520px 260px at 92% 40%, ${color}22, transparent 70%)` }} />
      <button onClick={() => setEditing(true)} title="Banner anpassen" aria-label="Banner anpassen" className="group absolute right-3 top-3 z-10 flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 text-[11px] text-muted opacity-60 backdrop-blur transition hover:border-white/30 hover:text-white hover:opacity-100 focus-visible:opacity-100">
        <Icon name="sliders" size={14} /><span className="hidden group-hover:inline group-focus-visible:inline">Anpassen</span>
      </button>
      {editing && <BannerEditor items={items} ov={ov} name={name} onClose={() => setEditing(false)} />}

      <div className="relative grid gap-6 p-5 min-[1100px]:grid-cols-[230px_minmax(0,1fr)_290px] min-[1100px]:items-stretch min-[1100px]:gap-8 min-[1100px]:p-6">
        <div className="mx-auto h-[300px] w-[230px] max-w-full min-[1100px]:mx-0 min-[1100px]:h-auto min-[1100px]:w-full">
          <MainHeroCard heroId={mainId} accent={color} />
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-5">
          <div className="flex items-center gap-4">
            <Avatar src={avatar} name={name} size={68} ring={color} />
            <div className="min-w-0">
              <h1 className="display truncate pr-24 text-4xl font-extrabold leading-tight tracking-tight">{name}</h1>
              {p.title && <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color }}>{p.title}</div>}
              <p className="text-xs text-muted">
                Account {accountId}{onRemove && <> · <button onClick={onRemove} className="underline-offset-2 hover:text-loss hover:underline">nicht mehr tracken</button></>}
              </p>
            </div>
          </div>
          {p.badges.length > 0 && <BadgeRow keys={p.badges} items={items} ov={ov} size={44} />}
          <StatReadout keys={p.stats} items={items} ov={ov} accent={color} />
          <TopHeroChips ov={ov} mainId={mainId} />
        </div>

        <div className="flex items-center justify-center border-t border-white/10 pt-6 min-[1100px]:border-l min-[1100px]:border-t-0 min-[1100px]:pl-8 min-[1100px]:pt-0">
          <RankStage ov={ov} showRing={!p.stats.includes("winrate")} />
        </div>
      </div>
    </section>
  );
}
