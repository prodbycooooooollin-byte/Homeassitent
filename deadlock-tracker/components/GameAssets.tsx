"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AssetBundle, HeroAsset } from "@/lib/assets";
import { formatBadge, tierOf } from "@/lib/ranks";
import { imgUrl, rankImageUrl } from "@/lib/img";

const EMPTY: AssetBundle = { heroes: {}, ranks: {}, fetchedAt: 0, source: "none" };
const Ctx = createContext<{ bundle: AssetBundle; loaded: boolean }>({ bundle: EMPTY, loaded: false });
export const useAssets = () => useContext(Ctx);

export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ bundle: EMPTY, loaded: false });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const b: AssetBundle = await (await fetch("/api/assets")).json();
        if (alive) setState({ bundle: b, loaded: true });
        // Bei Fehlschlag (leerer Bundle) später erneut versuchen
        if (!Object.keys(b.heroes).length && alive) setTimeout(load, 30000);
      } catch {
        if (alive) {
          setState((s) => ({ ...s, loaded: true }));
          setTimeout(load, 30000);
        }
      }
    };
    load();
    return () => { alive = false; };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useHero(id: number | undefined) {
  const { bundle, loaded } = useAssets();
  const h: HeroAsset | undefined = id ? bundle.heroes[id] : undefined;
  return { hero: h, name: h?.name ?? (loaded ? "Unbekannter Held" : "…"), color: h?.color ?? "#5b6478" };
}

/** URLs, die nicht ladbar waren – nicht bei jedem Render erneut anfragen. */
const BAD = new Set<string>();
function useImg(src?: string) {
  const [, force] = useState(0);
  return { src: src && !BAD.has(src) ? src : undefined, onError: () => { if (src) { BAD.add(src); force((n) => n + 1); } } };
}

/** 3D-Neigung + Glanzpunkt, folgt dem Mauszeiger. */
export function useTilt(max = 7) {
  const ref = useRef<HTMLDivElement>(null);
  return {
    ref,
    onMouseMove: (e: React.MouseEvent) => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--ry", `${(x - 0.5) * 2 * max}deg`);
      el.style.setProperty("--rx", `${-(y - 0.5) * 2 * max}deg`);
      el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`);
    },
    onMouseLeave: () => { const el = ref.current; if (el) { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); } },
  };
}

const initials = (n: string) => n.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** Helden-Bild: echtes Asset, sonst eigenes Farb-Fallback (nie „Held #1"). */
export function HeroPortrait({ id, size = 44, h, variant = "portrait", className = "", ring }: {
  id: number; size?: number; h?: number; variant?: "portrait" | "small" | "art"; className?: string; ring?: string;
}) {
  const { hero, name, color } = useHero(id);
  const raw = hero ? (variant === "art" ? hero.art : variant === "small" ? hero.small ?? hero.portrait : hero.portrait ?? hero.small) : undefined;
  const img = useImg(raw);
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl ${className}`}
      style={{ width: size, height: h ?? size, boxShadow: ring ? `0 0 0 2px ${ring}, 0 6px 18px -6px ${ring}` : "0 0 0 1px rgba(255,255,255,.08)" }}
      title={name}
    >
      <div className="absolute inset-0" style={{ background: `linear-gradient(145deg, ${color}cc, ${color}33 60%, #0a0c12)` }} />
      {!img.src && (
        <span className="display absolute inset-0 flex items-center justify-center font-extrabold text-white/80" style={{ fontSize: size * 0.38 }}>
          {initials(name)}
        </span>
      )}
      {img.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} onError={img.onError} alt={name} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
    </div>
  );
}

/** Breite Hero-Kulisse (Header, Banner). */
export function HeroBackdrop({ id, className = "" }: { id?: number; className?: string }) {
  const { hero, color } = useHero(id);
  const img = useImg(hero?.art ?? hero?.portrait);
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(900px 400px at 85% 30%, ${color}55, transparent 65%), linear-gradient(120deg, ${color}22, transparent 60%)` }} />
      {img.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} onError={img.onError} alt="" className="absolute -right-6 top-0 h-full w-[70%] object-cover object-top opacity-45 [mask-image:linear-gradient(to_left,#000_35%,transparent)]" />
      )}
    </div>
  );
}

export const TIER_COLORS = ["#7b8497", "#9aa3b2", "#79b86b", "#cf8a57", "#5f9cf5", "#a77be8", "#3fd0c4", "#f0b44c", "#ff8559", "#ef5da8", "#ffd54f", "#ff5252"];

/** Rang-Emblem: echtes Asset, sonst eigenes facettiertes Fallback in Tier-Farbe. */
export function RankEmblem({ badge, size = 32, label = false }: { badge: number | null | undefined; size?: number; label?: boolean }) {
  const { bundle } = useAssets();
  const tier = tierOf(badge);
  const sub = badge ? badge % 10 : 0;
  const asset = bundle.ranks[tier];
  // Bevorzugt: Badge mit eingezeichneter Division; sonst direkter Rang-Endpunkt der API; sonst gezeichnetes Emblem.
  const candidates = bundle.source === "demo" ? [] : [asset?.sub[sub]?.badge, tier >= 1 && tier <= 11 && sub >= 1 && sub <= 6 ? rankImageUrl(tier, sub) : undefined, asset?.sub[sub]?.large, asset?.small];
  const raw = candidates.find((c) => c && !BAD.has(c));
  const img = useImg(raw);
  const color = asset?.color ?? TIER_COLORS[tier] ?? "#7b8497";
  const text = formatBadge(badge);
  if (!badge) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={text}>
      {img.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} onError={img.onError} alt={text} width={size} height={size} style={{ width: size, height: size }} className="object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,.65)]" />
      ) : (
        <svg width={size} height={size} viewBox="0 0 48 48" aria-label={text}>
          <defs>
            <linearGradient id={`re-${tier}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="1" /><stop offset="1" stopColor={color} stopOpacity=".35" />
            </linearGradient>
          </defs>
          <path d="M24 2 43 14v20L24 46 5 34V14Z" fill="#0c0f16" stroke={`url(#re-${tier})`} strokeWidth="3" strokeLinejoin="round" />
          <path d="M24 10 36 17v14L24 38 12 31V17Z" fill={`url(#re-${tier})`} opacity=".9" />
          <path d="M24 10v28M12 17l24 14M36 17 12 31" stroke="#000" strokeOpacity=".18" strokeWidth="1" />
          <text x="24" y="29" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0a0c12" fontFamily="Oxanium, sans-serif">{sub}</text>
        </svg>
      )}
      {label && <span className="text-sm font-semibold" style={{ color }}>{text}</span>}
    </span>
  );
}

export function Avatar({ src, name, size = 64, ring = "#f0b44c" }: { src?: string; name: string; size?: number; ring?: string }) {
  const img = useImg(imgUrl(src));
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, boxShadow: `0 0 0 3px ${ring}, 0 8px 24px -6px ${ring}88` }}>
      <div className="display absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a3146] to-[#10131c] font-extrabold text-white/80" style={{ fontSize: size * 0.4 }}>
        {initials(name)}
      </div>
      {img.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} onError={img.onError} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

export function useHeroName() {
  const { bundle, loaded } = useAssets();
  return useMemo(() => (id: number) => bundle.heroes[id]?.name ?? (loaded ? "Unbekannter Held" : "…"), [bundle, loaded]);
}
