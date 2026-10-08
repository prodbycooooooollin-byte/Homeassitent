"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HeroBackdrop, HeroPortrait, useHero, useHeroName } from "./GameAssets";
import { Icon, type IconName } from "./Icon";
import { ItemIcon } from "./match/ItemIcon";
import { useData } from "./Providers";
import type { HeroAsset, ItemAsset } from "@/lib/assets";

interface Matchup { heroId: number; matches: number; wins: number; wr: number }
interface Info {
  hero: HeroAsset | null; abilities: ItemAsset[];
  builds: { id: number; name: string; description?: string; authorId: number; favorites: number; weeklyFavorites: number; updated?: number; categories: { name: string; items: ItemAsset[] }[] }[];
  topItems: { item: ItemAsset; builds: number }[];
  strong: Matchup[]; weak: Matchup[]; synergy: Matchup[]; errors: Record<string, string>;
}
const TYPES: Record<string, { label: string; icon: IconName; text: string }> = {
  assassin: { label: "Assassine", icon: "zap", text: "Schnell, gefährlich im Einzelduell und darauf aus, verwundbare Ziele auszuschalten." },
  brawler: { label: "Brawler", icon: "fist", text: "Robust im Nahkampf, hält Schaden aus und kontrolliert die Frontlinie." },
  marksman: { label: "Schütze", icon: "target", text: "Verlässt sich auf Waffenschaden auf Distanz und präzises Zielen." },
  mystic: { label: "Mystiker", icon: "eye", text: "Setzt auf Fähigkeiten und Spirit-Schaden statt auf reine Waffenkraft." },
};

/** Seitenpanel mit Fakten zum Helden: Spielstil, Werte, Fähigkeiten, Community-Builds (mit Build-ID), Items, Counter und Synergien. */
export function HeroDrawer({ heroId, onClose }: { heroId: number | null; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const [lore, setLore] = useState(false);
  const name = useHeroName();
  const { color } = useHero(heroId ?? undefined);
  const { data } = useData();
  const mine = data?.heroes.find((h) => h.heroId === heroId);

  useEffect(() => {
    if (!heroId) return;
    setInfo(null); setErr(false); setTab(0); setLore(false);
    fetch(`/api/hero-info?id=${heroId}`).then((r) => r.json()).then(setInfo).catch(() => setErr(true));
  }, [heroId]);
  useEffect(() => {
    if (!heroId) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [heroId, onClose]);
  if (!heroId || typeof document === "undefined") return null;

  const h = info?.hero?.info;
  const type = h?.type ? TYPES[h.type] : undefined;
  const b = info?.builds[tab];
  const copy = async (id: number) => { try { await navigator.clipboard.writeText(String(id)); setCopied(id); setTimeout(() => setCopied(null), 1600); } catch { /* ignorieren */ } };
  const maxTop = Math.max(1, ...(info?.topItems ?? []).map((t) => t.builds));

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" style={{ animation: "bg-in .25s ease both" }} onClick={onClose} />
      <aside className="drawer absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-white/10 bg-[#0b0e15]/95 shadow-2xl" style={{ boxShadow: `-30px 0 80px -30px ${color}66` }}>
        <div className="relative overflow-hidden p-6 pb-5" style={{ background: `linear-gradient(180deg, ${color}26, transparent)` }}>
          <HeroBackdrop id={heroId} />
          <button onClick={onClose} aria-label="Schließen" className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-black/40 p-1.5 text-muted transition hover:text-white"><Icon name="x" size={16} /></button>
          <div className="relative flex items-center gap-4">
            <HeroPortrait id={heroId} size={96} h={124} ring={color} className="float !rounded-2xl" />
            <div className="min-w-0">
              <h2 className="display text-3xl font-extrabold">{name(heroId)}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {type && <span className="chip"><Icon name={type.icon} size={12} className="text-amber" />{type.label}</span>}
                {h?.role && <span className="chip">{h.role}</span>}
                {h?.complexity != null && <span className="chip" title="Komplexität">Komplexität {Array.from({ length: 3 }, (_, i) => <i key={i} className="ml-0.5 inline-block h-1.5 w-1.5 rotate-45" style={{ background: i < Math.round(h.complexity! / (h.complexity! > 3 ? 2 : 1)) ? "#f0b44c" : "rgba(255,255,255,.2)" }} />)}</span>}
              </div>
              {mine && <div className="num mt-2 text-xs text-muted">Du: {mine.matches} Spiele · {Math.round((mine.wins / mine.matches) * 100)}% Winrate · KDA {mine.kda.toFixed(1)}</div>}
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6 pt-2">
          {!info && !err && <div className="space-y-3"><div className="skeleton h-24" /><div className="skeleton h-40" /><div className="skeleton h-32" /></div>}
          {err && <p className="text-sm text-loss">Helden-Infos konnten nicht geladen werden.</p>}
          {info && (
            <>
              <section>
                <h3 className="label mb-2 flex items-center gap-1.5"><Icon name="book" size={13} />So wird er gespielt</h3>
                <p className="text-sm leading-relaxed text-white/85">{h?.playstyle ?? type?.text ?? "Für diesen Helden liegen keine Spielstil-Beschreibung in den Spieldaten vor."}</p>
                {h?.lore && (<><button onClick={() => setLore((l) => !l)} className="mt-2 text-xs text-amber hover:underline">{lore ? "Hintergrundgeschichte ausblenden" : "Hintergrundgeschichte lesen"}</button>{lore && <p className="mt-2 text-xs leading-relaxed text-muted">{h.lore}</p>}</>)}
                {h?.tags?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{h.tags.slice(0, 8).map((t) => <span key={t} className="chip !py-0.5 text-[10px]">{t.replace(/^#/, "")}</span>)}</div> : null}
              </section>

              {h && h.stats.length > 0 && (
                <section><h3 className="label mb-2">Startwerte</h3>
                  <div className="grid grid-cols-2 gap-2">{h.stats.map((s) => <div key={s.key} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm"><span className="text-muted">{s.label}</span><b className="num">{Math.round(s.value * 10) / 10}</b></div>)}</div></section>
              )}

              {info.abilities.length > 0 && (
                <section><h3 className="label mb-2">Fähigkeiten</h3><div className="flex gap-3">{info.abilities.map((a) => <div key={a.id} className="w-16 text-center"><ItemIcon id={a.id} item={{ ...a, tier: 0 }} size={52} /><div className="mt-1 truncate text-[10px] text-muted">{a.name}</div></div>)}</div></section>
              )}

              <section>
                <h3 className="label mb-2 flex items-center gap-1.5"><Icon name="layers" size={13} />Community-Builds</h3>
                {info.builds.length === 0 ? <p className="text-sm text-muted">{info.errors.builds ? "Builds konnten nicht geladen werden." : "Keine Builds gefunden."}</p> : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-1">{info.builds.map((x, i) => <button key={x.id} onClick={() => setTab(i)} className={`tab !py-1 ${tab === i ? "tab-active" : ""}`}>{x.name.length > 22 ? x.name.slice(0, 21) + "…" : x.name}</button>)}</div>
                    {b && (
                      <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                        <div className="flex items-center gap-2 text-xs text-muted"><Icon name="star" size={13} className="text-amber" />{b.favorites.toLocaleString("de-DE")} Favoriten{b.weeklyFavorites ? ` · ${b.weeklyFavorites} diese Woche` : ""}</div>
                        {b.description && <p className="text-xs leading-relaxed text-muted">{b.description.slice(0, 220)}</p>}
                        {b.categories.filter((c) => c.items.length).map((c) => (
                          <div key={c.name}><div className="label mb-1.5 !text-[9px]">{c.name || "Items"}</div><div className="flex flex-wrap gap-1.5">{c.items.map((it, k) => <ItemIcon key={k} id={it.id} item={it} size={38} />)}</div></div>
                        ))}
                        <div className="flex items-center gap-2 border-t border-white/[0.07] pt-3">
                          <div className="min-w-0 flex-1"><div className="label !text-[9px]">Build-ID</div><div className="num font-bold">{b.id}</div></div>
                          <button onClick={() => copy(b.id)} className="btn btn-gold !px-3 !py-1.5 text-xs"><Icon name={copied === b.id ? "check" : "copy"} size={14} />{copied === b.id ? "Kopiert" : "ID kopieren"}</button>
                        </div>
                        <p className="text-[10.5px] leading-snug text-muted">Im Spiel beim Helden den Build-Browser öffnen, nach der Build-ID suchen und den Build speichern.</p>
                      </div>
                    )}
                  </>
                )}
              </section>

              {info.topItems.length > 0 && (
                <section><h3 className="label mb-2">Beliebteste Items</h3>
                  <div className="space-y-1.5">{info.topItems.slice(0, 8).map((t) => (
                    <div key={t.item.id} className="flex items-center gap-2.5"><ItemIcon id={t.item.id} item={t.item} size={30} /><span className="w-36 truncate text-xs">{t.item.name}</span><div className="h-1.5 flex-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber/60 to-amber" style={{ width: `${(t.builds / maxTop) * 100}%` }} /></div><span className="num w-10 text-right text-[10px] text-muted">{t.builds}</span></div>
                  ))}</div><p className="mt-1 text-[10px] text-muted">Anzahl Community-Builds, die das Item enthalten</p></section>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Matchups title="Stark gegen" icon="trendUp" list={info.strong} tone="#3ecf8e" />
                <Matchups title="Schwach gegen" icon="trendDown" list={info.weak} tone="#f0616d" />
              </div>
              <Matchups title="Beste Partner im Team" icon="users" list={info.synergy} tone="#4aa3ff" />
              {Object.keys(info.errors).length > 0 && <p className="text-[10.5px] text-muted">Teilweise nicht verfügbar: {Object.keys(info.errors).join(", ")}.</p>}
            </>
          )}
        </div>
      </aside>
    </div>, document.body);
}

function Matchups({ title, icon, list, tone }: { title: string; icon: IconName; list: Matchup[]; tone: string }) {
  const name = useHeroName();
  if (!list.length) return null;
  return (
    <section><h3 className="label mb-2 flex items-center gap-1.5" style={{ color: tone }}><Icon name={icon} size={13} />{title}</h3>
      <div className="space-y-1.5">{list.map((m) => <div key={m.heroId} className="flex items-center gap-2.5"><HeroPortrait id={m.heroId} size={28} variant="small" className="!rounded-md" /><span className="min-w-0 flex-1 truncate text-xs">{name(m.heroId)}</span><b className="num text-xs" style={{ color: tone }}>{Math.round(m.wr * 100)}%</b></div>)}</div></section>
  );
}
