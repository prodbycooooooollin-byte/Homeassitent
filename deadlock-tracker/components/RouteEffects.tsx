"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TIER_COLORS, useHero } from "./GameAssets";
import { tierOf } from "@/lib/ranks";
import { useData } from "./Providers";

/** Lichtschein, der dem Mauszeiger über Karten folgt (setzt --gx/--gy auf der Karte unter dem Zeiger). */
export function PointerGlow() {
  useEffect(() => {
    let raf = 0;
    const move = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as HTMLElement | null)?.closest?.(".surface") as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--gx", `${e.clientX - r.left}px`);
        el.style.setProperty("--gy", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => { window.removeEventListener("mousemove", move); cancelAnimationFrame(raf); };
  }, []);
  return null;
}

/** Fortschrittsbalken oben + Entfernen der Exit-Klasse nach Navigation. */
export function RouteProgress() {
  const path = usePathname();
  const [w, setW] = useState(0);
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const start = () => { setOn(true); setW(12); timer.current = setTimeout(() => setW(72), 60); };
    window.addEventListener("nav-start", start);
    return () => window.removeEventListener("nav-start", start);
  }, []);
  useEffect(() => {
    document.documentElement.classList.remove("leaving");
    setW(100);
    const t = setTimeout(() => { setOn(false); setW(0); }, 450);
    window.scrollTo({ top: 0 });
    return () => { clearTimeout(t); if (timer.current) clearTimeout(timer.current); };
  }, [path]);
  return <div className="route-bar" style={{ width: `${w}%`, opacity: on ? 1 : 0 }} />;
}

interface Theme { pattern: string; accent?: string; art?: "main" | "route" }
const THEMES: [RegExp, Theme][] = [
  [/^\/$/, { pattern: "hex" }],
  [/^\/matches/, { pattern: "scan", accent: "#4aa3ff" }],
  [/^\/match\//, { pattern: "scan" }],
  [/^\/heroes\/\d+/, { pattern: "dots", art: "route" }],
  [/^\/heroes/, { pattern: "dots", art: "main" }],
  [/^\/rank/, { pattern: "rays", accent: "tier" as never }],
  [/^\/insights/, { pattern: "grid", accent: "#3ecf8e" }],
  [/^\/achievements/, { pattern: "sparkles", accent: "#f0b44c" }],
  [/^\/mates/, { pattern: "dots", accent: "#a77be8" }],
  [/^\/compare/, { pattern: "scan", accent: "#4aa3ff" }],
  [/^\/meta/, { pattern: "chart", accent: "#f0616d" }],
  [/^\/leaderboard/, { pattern: "spotlight", accent: "#f0b44c" }],
];

/** Hintergrund pro Seite: Aurora in Akzentfarbe + passendes Muster (und bei Helden-Seiten die Helden-Illustration). */
export function Aurora() {
  const { data } = useData();
  const path = usePathname();
  const theme = THEMES.find(([re]) => re.test(path))?.[1] ?? { pattern: "grid" };
  const mainId = data?.overview.heroes[0]?.heroId;
  const routeId = Number(path.match(/^\/heroes\/(\d+)/)?.[1]) || undefined;
  const heroId = theme.art === "route" ? routeId : mainId;
  const { color, hero } = useHero(heroId);
  const { color: mainColor } = useHero(mainId);
  const tier = data?.overview.currentBadge ? TIER_COLORS[tierOf(data.overview.currentBadge)] : undefined;
  const accent = theme.accent === ("tier" as never) ? tier ?? mainColor : theme.accent ?? (theme.art === "route" ? color : mainColor);
  useEffect(() => {
    const a = !accent || accent === "#5b6478" ? "#f0b44c" : accent;
    document.documentElement.style.setProperty("--hero", a);
    document.documentElement.style.setProperty("--accent", a);
  }, [accent]);
  const art = theme.art ? hero?.art ?? hero?.portrait : undefined;
  return (
    <>
      <div className="aurora" aria-hidden><i /><i /><i /></div>
      <div key={theme.pattern + path.split("/")[1]} className="bg-pattern" data-p={theme.pattern} aria-hidden />
      {art && <div key={art} className="bg-art" style={{ backgroundImage: `url(${art})` }} aria-hidden />}
    </>
  );
}
