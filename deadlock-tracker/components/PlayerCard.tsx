"use client";
import { Avatar, HeroBackdrop, HeroPortrait, RankEmblem, useHero, useHeroName, useTilt } from "./GameAssets";
import { WinRing } from "./charts";
import { formatBadge } from "@/lib/ranks";
import type { Overview } from "@/lib/view";

/** Große Spielerkarte: Steam-Profil, Main-Held als neigbare Karte, Rang, Winrate – mit Parallax-Hintergrund. */
export function PlayerCard({ name, avatar, accountId, ov, onRemove }: { name: string; avatar?: string; accountId: number; ov: Overview; onRemove?: () => void }) {
  const mainId = ov.heroes[0]?.heroId;
  const { color } = useHero(mainId);
  const heroName = useHeroName();
  const tilt = useTilt(9);
  const peak = ov.rankHistory.reduce((m, r) => Math.max(m, r.badge), 0) || null;

  return (
    <section
      className="surface relative overflow-hidden"
      style={{ boxShadow: `0 0 0 1px ${color}40, 0 40px 80px -40px ${color}77` }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--px", String((e.clientX - r.left) / r.width - 0.5));
        e.currentTarget.style.setProperty("--py", String((e.clientY - r.top) / r.height - 0.5));
      }}
    >
      <div className="absolute -inset-6 transition-transform duration-200 ease-out" style={{ transform: "translate3d(calc(var(--px,0) * -26px), calc(var(--py,0) * -14px), 0)" }}>
        <HeroBackdrop id={mainId} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#07080c]/70 via-transparent to-transparent" />
      <div className="relative grid items-center gap-7 p-6 md:grid-cols-[auto_1fr_auto] md:p-8">
        <div {...tilt} className="tilt relative cursor-default rounded-2xl" style={{ width: 168 }}>
          <div className="float">
            {mainId ? <HeroPortrait id={mainId} size={168} h={216} ring={color} className="!rounded-2xl" /> : <div className="skeleton h-[216px] w-[168px]" />}
          </div>
          <span className="shine" />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 bg-black/80 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] shadow-lg backdrop-blur">
            <span className="text-gold-grad">Main</span> · {mainId ? heroName(mainId) : "…"}
          </div>
        </div>

        <div className="min-w-0 pt-2 md:pt-0">
          <div className="flex items-center gap-4">
            <Avatar src={avatar} name={name} size={72} ring={color} />
            <div className="min-w-0">
              <h1 className="display truncate text-4xl font-extrabold tracking-tight md:text-5xl">{name}</h1>
              <p className="text-xs text-muted">
                Account {accountId}{onRemove && <> · <button onClick={onRemove} className="underline-offset-2 hover:text-loss hover:underline">nicht mehr tracken</button></>}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="sheen flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 py-2 pl-3 pr-5 backdrop-blur">
              <RankEmblem badge={ov.currentBadge} size={56} />
              <div>
                <div className="label">Aktueller Rang</div>
                <div className="display text-xl font-bold leading-tight">{ov.currentBadge ? formatBadge(ov.currentBadge) : "Noch ohne Rang"}</div>
                {peak && <div className="text-[11px] text-muted">Peak: {formatBadge(peak)}</div>}
              </div>
            </div>
            {ov.heroes.slice(1, 4).map((h) => (
              <div key={h.heroId} className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/40 p-2 pr-4 backdrop-blur transition hover:border-white/25">
                <HeroPortrait id={h.heroId} size={44} variant="small" />
                <div className="num text-xs"><div className="font-semibold">{heroName(h.heroId)}</div><div className="text-muted">{Math.round((h.wins / h.matches) * 100)}% · {h.matches} Spiele</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="justify-self-center"><WinRing value={ov.winrate} wins={ov.wins} losses={ov.matches - ov.wins} size={132} /></div>
      </div>
    </section>
  );
}
