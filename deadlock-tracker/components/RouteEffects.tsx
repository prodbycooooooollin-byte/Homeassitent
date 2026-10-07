"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useHero } from "./GameAssets";
import { useData } from "./Providers";

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

/** Hintergrund-Aurora, eingefärbt in der Farbe des meistgespielten Helden. */
export function Aurora() {
  const { data } = useData();
  const { color } = useHero(data?.overview.heroes[0]?.heroId);
  useEffect(() => {
    document.documentElement.style.setProperty("--hero", color === "#5b6478" ? "#f0b44c" : color);
  }, [color]);
  return <div className="aurora" aria-hidden><i /><i /><i /></div>;
}
