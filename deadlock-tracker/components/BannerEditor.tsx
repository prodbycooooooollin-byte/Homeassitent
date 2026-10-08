"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { Medal } from "./Medal";
import { HoverCard } from "./Popover";
import { HeroPortrait, TIER_COLORS, useAssets, useHero, useHeroName } from "./GameAssets";
import { useSettings } from "./Providers";
import { tierOf } from "@/lib/ranks";
import { DEFAULT_PROFILE, type ProfileSettings } from "@/lib/types";
import {
  ACCENT_SWATCHES, MAX_BADGES, MAX_STATS, MAX_TITLE, STAT_DEFS, computeStat, resolveAccent, titleSuggestions, unlockedBadges,
} from "@/lib/profile-customize";
import type { MatchListItem, Overview } from "@/lib/view";

/** Akzentfarbe laut Einstellung (Auto/Rang/Held/Hex) für Banner und Vorschau. */
export function useProfileAccent(accent: string, heroId: number | undefined, badge: number | null | undefined) {
  const { color } = useHero(heroId);
  return resolveAccent(accent, { heroColor: color === "#5b6478" ? undefined : color, rankColor: badge ? TIER_COLORS[tierOf(badge)] : undefined });
}

/** Gewählte Kennzahlen als kleine Kacheln. */
export function StatTiles({ keys, items, ov, accent }: { keys: string[]; items: MatchListItem[]; ov: Overview; accent: string }) {
  const stats = keys.map((k) => ({ k, s: computeStat(k, items, ov) })).filter((x) => x.s);
  if (!stats.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {stats.map(({ k, s }) => (
        <div key={k} className="min-w-[84px] rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur" style={{ borderTopColor: `${accent}88` }}>
          <div className="label !text-[10px]">{s!.label}</div>
          <div className="display num text-lg font-bold leading-tight">{s!.value}</div>
          {s!.sub && <div className="num text-[10px] text-muted">{s!.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Ausgewählte Abzeichen (nur noch freigeschaltete) als Medaillen. */
export function BadgeRow({ keys, items, ov, size = 48 }: { keys: string[]; items: MatchListItem[]; ov: Overview; size?: number }) {
  const states = useMemo(() => unlockedBadges(items, ov), [items, ov]);
  const list = keys.map((k) => states.find((s) => s.series.key === k)).filter((s): s is NonNullable<typeof s> => !!s);
  if (!list.length) return null;
  return (
    <div className="flex items-center gap-3">
      {list.map((s) => (
        <HoverCard key={s.series.key} width={240} content={<div className="text-xs"><div className="display font-bold">{s.series.title}</div><p className="mt-1 text-muted">{s.series.desc(s.series.targets[s.tier - 1])}</p></div>}>
          <span className="block pb-1.5"><Medal icon={s.series.icon} tier={s.tier} progress={s.progress} size={size} maxTier={s.series.targets.length} /></span>
        </HoverCard>
      ))}
    </div>
  );
}

export function BannerEditor({ items, ov, name, onClose }: { items: MatchListItem[]; ov: Overview; name: string; onClose: () => void }) {
  const { settings, update } = useSettings();
  const { bundle } = useAssets();
  const heroName = useHeroName();
  const [d, setD] = useState<ProfileSettings>(settings.profile);
  const patch = (p: Partial<ProfileSettings>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);

  const autoMain = ov.heroes[0]?.heroId;
  const mainId = d.mainHero ?? autoMain;
  // Hinweis: lib/assets.ts übernimmt die Felder disabled / in_development / player_selectable aktuell nicht – daher werden alle Helden aus dem Bundle gelistet.
  const heroes = useMemo(() => Object.values(bundle.heroes).filter((h) => h.playable !== false).sort((a, b) => a.name.localeCompare(b.name, "de")), [bundle.heroes]);
  const titles = useMemo(() => titleSuggestions(items, ov), [items, ov]);
  const badges = useMemo(() => unlockedBadges(items, ov), [items, ov]);
  const accent = useProfileAccent(d.accent, mainId, ov.currentBadge);
  const { color: heroColor } = useHero(mainId);

  const toggle = (list: string[], key: string, max: number) => list.includes(key) ? list.filter((x) => x !== key) : list.length < max ? [...list, key] : list;
  const save = async () => { await update({ profile: d }); onClose(); };

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs transition ${on ? "border-white/40 bg-white/15 text-white" : "border-white/10 bg-white/[0.03] text-muted hover:border-white/25 hover:text-white"}`;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Banner anpassen" className="surface relative w-full max-w-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-xl font-bold">Banner anpassen</h2>
          <button onClick={onClose} className="btn btn-ghost !p-1.5" aria-label="Schließen"><Icon name="x" size={16} /></button>
        </div>

        {/* Live-Vorschau */}
        <div className="relative mb-5 overflow-hidden rounded-2xl border bg-black/30 p-4" style={{ borderColor: `${accent}66`, boxShadow: `0 0 0 1px ${accent}33, 0 24px 50px -30px ${accent}` }}>
          <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 12% 20%, ${accent}, transparent 60%)` }} />
          <div className="relative flex flex-wrap items-center gap-4">
            {mainId && <HeroPortrait id={mainId} size={72} h={92} ring={accent} className="!rounded-xl" />}
            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <div className="display truncate text-2xl font-extrabold">{name}</div>
                <div className="text-xs" style={{ color: accent }}>{d.title || "Kein Titel"}{mainId ? ` · Main: ${heroName(mainId)}` : ""}</div>
              </div>
              <StatTiles keys={d.stats} items={items} ov={ov} accent={accent} />
              <BadgeRow keys={d.badges} items={items} ov={ov} size={40} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <section>
            <div className="label mb-2">Titel</div>
            <div className="flex flex-wrap gap-1.5">
              {titles.map((t) => (
                <HoverCard key={t.title} width={280} content={<div className="text-xs"><div className="display font-bold">{t.title}</div><p className="mt-1 text-muted">{t.condition}.</p><p className="num mt-1.5">{t.earned ? <span className="text-win">Erfüllt</span> : <span className="text-loss">Nicht erfüllt</span>} · Aktuell: {t.current}</p></div>}>
                  <button disabled={!t.earned} onClick={() => patch({ title: t.title })} className={`${chip(d.title === t.title)} ${t.earned ? "" : "cursor-not-allowed opacity-40"}`}>{t.title}</button>
                </HoverCard>
              ))}
            </div>
            <input value={d.title} maxLength={MAX_TITLE} onChange={(e) => patch({ title: e.target.value.slice(0, MAX_TITLE) })} placeholder="Eigener Titel (max. 24 Zeichen)" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30" />
            <div className="num mt-1 text-right text-[10px] text-muted">{d.title.length}/{MAX_TITLE}</div>
          </section>

          <section>
            <div className="label mb-2">Main-Held</div>
            <button onClick={() => patch({ mainHero: null })} className={`${chip(d.mainHero === null)} mb-2`}>Automatisch (meistgespielt){autoMain ? `: ${heroName(autoMain)}` : ""}</button>
            <div className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 overflow-y-auto pr-1">
              {heroes.map((h) => (
                <button key={h.id} onClick={() => patch({ mainHero: h.id })} title={h.name} aria-label={h.name} aria-pressed={d.mainHero === h.id}
                  className={`rounded-xl p-0.5 transition ${d.mainHero === h.id ? "bg-white/20 ring-2" : "opacity-70 hover:opacity-100"}`} style={d.mainHero === h.id ? { ["--tw-ring-color" as string]: accent } : undefined}>
                  <HeroPortrait id={h.id} size={48} variant="small" />
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="label mb-2">Kennzahlen <span className="normal-case text-muted">({d.stats.length}/{MAX_STATS})</span></div>
            <div className="flex flex-wrap gap-1.5">
              {STAT_DEFS.map((s) => {
                const on = d.stats.includes(s.key);
                return <button key={s.key} title={s.desc} disabled={!on && d.stats.length >= MAX_STATS} onClick={() => patch({ stats: toggle(d.stats, s.key, MAX_STATS) })} className={`${chip(on)} disabled:cursor-not-allowed disabled:opacity-40`}>{s.label}</button>;
              })}
            </div>
          </section>

          <section>
            <div className="label mb-2">Abzeichen <span className="normal-case text-muted">({d.badges.length}/{MAX_BADGES}, höchste Stufen zuerst)</span></div>
            {badges.length === 0 ? <p className="text-sm text-muted">Noch keine Erfolge freigeschaltet.</p> : (
              <div className="flex max-h-40 flex-wrap gap-3 overflow-y-auto p-1">
                {badges.map((b) => {
                  const on = d.badges.includes(b.series.key);
                  return (
                    <button key={b.series.key} title={`${b.series.title}: ${b.series.desc(b.series.targets[b.tier - 1])}`} aria-pressed={on} disabled={!on && d.badges.length >= MAX_BADGES}
                      onClick={() => patch({ badges: toggle(d.badges, b.series.key, MAX_BADGES) })} className={`rounded-xl p-1.5 pb-2.5 transition disabled:cursor-not-allowed disabled:opacity-30 ${on ? "bg-white/15" : "hover:bg-white/[0.06]"}`}>
                      <Medal icon={b.series.icon} tier={b.tier} progress={b.progress} size={44} maxTier={b.series.targets.length} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="label mb-2">Banner- und Akzentfarbe</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {([["auto", "Auto"], ["rank", "Rang-Farbe"], ["hero", "Helden-Farbe"]] as const).map(([k, l]) => <button key={k} onClick={() => patch({ accent: k })} className={chip(d.accent === k)}>{l}</button>)}
              <span className="mx-1 h-5 w-px bg-white/10" />
              {ACCENT_SWATCHES.map((c) => (
                <button key={c} onClick={() => patch({ accent: c })} aria-label={`Farbe ${c}`} aria-pressed={d.accent === c} className={`h-6 w-6 rounded-full border-2 transition ${d.accent === c ? "scale-110 border-white" : "border-white/10 hover:border-white/50"}`} style={{ background: c }} />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Gilt für Banner und den Hintergrund der Übersicht. Dunkle Helden-Farben werden automatisch aufgehellt{d.accent === "hero" ? ` (Held: ${heroColor})` : ""}.</p>
          </section>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-4">
          <button onClick={() => setD(DEFAULT_PROFILE)} className="btn btn-ghost text-sm">Zurücksetzen</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-ghost text-sm">Abbrechen</button>
            <button onClick={save} className="btn btn-gold text-sm"><Icon name="check" size={16} />Speichern</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
