"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TIER_COLORS, useHero } from "./GameAssets";
import { tierOf } from "@/lib/ranks";
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

type Scene = "constellation" | "scan" | "embers" | "halo" | "targets" | "chart" | "sparks" | "network" | "duel" | "bars" | "stage" | "radar" | "grid";
interface Theme { pattern: string; scene: Scene; accent?: string; accent2?: string; art?: "main" | "route" }
const THEMES: [RegExp, Theme][] = [
  [/^\/$/, { pattern: "hex", scene: "constellation", accent2: "#4aa3ff" }],
  [/^\/live/, { pattern: "scan", scene: "radar", accent: "#3ecf8e", accent2: "#4aa3ff" }],
  [/^\/matches/, { pattern: "scan", scene: "scan", accent: "#4aa3ff", accent2: "#a77be8" }],
  [/^\/match\//, { pattern: "scan", scene: "scan", accent2: "#4aa3ff" }],
  [/^\/heroes\/\d+/, { pattern: "dots", scene: "embers", art: "route", accent2: "#f0616d" }],
  [/^\/heroes/, { pattern: "dots", scene: "embers", art: "main", accent2: "#f0616d" }],
  [/^\/rank/, { pattern: "rays", scene: "halo", accent: "tier", accent2: "#a77be8" }],
  [/^\/training/, { pattern: "scan", scene: "targets", accent: "#f0616d", accent2: "#ff9a3c" }],
  [/^\/insights/, { pattern: "grid", scene: "chart", accent: "#3ecf8e", accent2: "#4aa3ff" }],
  [/^\/achievements/, { pattern: "sparkles", scene: "sparks", accent: "#f0b44c", accent2: "#ef5da8" }],
  [/^\/mates/, { pattern: "dots", scene: "network", accent: "#a77be8", accent2: "#3fd0c4" }],
  [/^\/compare/, { pattern: "scan", scene: "duel", accent: "#4aa3ff", accent2: "#f0616d" }],
  [/^\/meta/, { pattern: "chart", scene: "bars", accent: "#f0616d", accent2: "#f0b44c" }],
  [/^\/leaderboard/, { pattern: "spotlight", scene: "stage", accent: "#f0b44c", accent2: "#cf8a57" }],
];

/** Deterministische Pseudo-Zufallszahlen (SSR und Client müssen identisch rendern). */
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({ x: Math.round(rnd(i, 1) * 100), s: 2 + Math.round(rnd(i, 2) * 3), d: 16 + Math.round(rnd(i, 3) * 20), l: -Math.round(rnd(i, 4) * 30), o: 0.25 + rnd(i, 5) * 0.5 }));

const ring = (cx: number, cy: number, rs: number[], cls = "") => rs.map((r, i) => <circle key={`${cx}${cy}${r}`} cx={cx} cy={cy} r={r} className={cls} style={{ animationDelay: `${i * -0.7}s` }} />);

/** Seitenspezifisches Motiv als SVG (nur Kontur, in Akzentfarbe, per Maske ausgeblendet). */
function Motif({ scene }: { scene: Scene }) {
  switch (scene) {
    case "targets":
      return (<>
        <g className="m-pulse">{ring(1280, 230, [34, 78, 130, 190, 258])}</g>
        <path d="M1280 -40v540M1010 230h540" className="m-thin" />
        <circle cx="1280" cy="230" r="9" className="m-fill" />
        <g className="m-pulse m-slow">{ring(250, 680, [24, 56, 96, 142, 196])}</g>
        <path d="M250 440v480M10 680h480" className="m-thin" />
        <circle cx="250" cy="680" r="6" className="m-fill" />
        <g className="m-pulse">{ring(860, 820, [18, 44, 76])}</g>
        <path d="M600 560 1180 330" className="m-dash" />
      </>);
    case "radar":
      return (<>
        <g>{ring(1180, 330, [70, 140, 210, 290, 380])}</g>
        <path d="M1180 -60v780M790 330h780M900 50l560 560M1460 50 900 610" className="m-thin" />
        <g className="m-sweep"><path d="M1180 330 1180-60A390 390 0 0 1 1456 54Z" className="m-wedge" /></g>
        <circle cx="1090" cy="250" r="5" className="m-fill m-blink" /><circle cx="1290" cy="420" r="4" className="m-fill m-blink" style={{ animationDelay: "-1.4s" }} />
      </>);
    case "halo":
      return (<g className="m-slow-spin">{ring(800, -40, [220, 300, 390, 490, 600, 720])}<path d="M800-40 360 760M800-40 1240 760M800-40 800 900" className="m-thin" /></g>);
    case "network": {
      const pts: [number, number][] = [[1240, 120], [1420, 260], [1130, 300], [1330, 440], [220, 560], [420, 700], [120, 760], [560, 560]];
      const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [4, 7]];
      return (<>
        {edges.map(([a, b]) => <line key={`${a}-${b}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} className="m-thin" />)}
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 7 : 4} className="m-fill m-blink" style={{ animationDelay: `${i * -0.9}s` }} />)}
        {pts.map(([x, y], i) => i % 3 === 0 && <circle key={`o${i}`} cx={x} cy={y} r="22" className="m-pulse-one" />)}
      </>);
    }
    case "duel":
      return (<>
        <path d="M-40 900 520 -40M80 900 640 -40" className="m-thin m-a" />
        <path d="M1640 900 1080 -40M1520 900 960 -40" className="m-thin m-b" />
        <g className="m-pulse">{ring(800, 450, [60, 120, 190])}</g>
        <path d="M770 450h60M800 420v60" className="m-thin" />
      </>);
    case "bars":
    case "chart": {
      const bars = Array.from({ length: 18 }, (_, i) => 60 + Math.round(rnd(i, scene === "bars" ? 9 : 4) * 260) + i * (scene === "bars" ? 0 : 6));
      return (<>
        {bars.map((h, i) => <rect key={i} x={60 + i * 86} y={900 - h} width="46" height={h} rx="4" className="m-bar" style={{ animationDelay: `${i * -0.5}s` }} />)}
        <polyline points={bars.map((h, i) => `${83 + i * 86},${900 - h - 40}`).join(" ")} className="m-line" fill="none" />
      </>);
    }
    case "stage":
      return (<>
        <path d="M800-20 420 900M800-20 1180 900M800-20 800 900" className="m-thin" />
        <ellipse cx="800" cy="880" rx="360" ry="46" className="m-thin" /><ellipse cx="800" cy="880" rx="220" ry="26" className="m-thin" />
      </>);
    case "sparks":
      return (<g className="m-slow-spin">{ring(1260, 200, [60, 110, 170])}{ring(260, 700, [40, 90, 150])}<path d="M1260 20v360M1080 200h360M260 540v320M100 700h320" className="m-thin" /></g>);
    case "embers":
      return (<g className="m-pulse m-slow">{ring(1350, 150, [90, 170, 260])}<path d="M120 800 480 560 840 760 1200 520" className="m-line" fill="none" /></g>);
    case "scan":
      return (<><path d="M0 220H1600M0 480H1600M0 740H1600" className="m-thin" /><rect x="0" y="0" width="1600" height="140" className="m-scanbar" /></>);
    case "constellation": {
      const pts: [number, number][] = [[1180, 90], [1320, 190], [1450, 110], [1250, 330], [1480, 380], [180, 640], [330, 760], [470, 680], [90, 820]];
      const edges = [[0, 1], [1, 2], [1, 3], [3, 4], [5, 6], [6, 7], [5, 8]];
      return (<>
        {edges.map(([a, b]) => <line key={`${a}-${b}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} className="m-thin" />)}
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 3 : 5} className="m-fill m-blink" style={{ animationDelay: `${i * -0.8}s` }} />)}
      </>);
    }
    default:
      return <path d="M-40 700 700-40M200 940 1000 140M600 940 1400 140M1000 940 1640 300" className="m-thin" />;
  }
}

/** Hintergrund pro Seite: Aurora, Muster, Licht-Kegel, Motiv und Partikel in Akzentfarbe sowie Vignette und Körnung. */
export function Aurora() {
  const { data } = useData();
  const path = usePathname();
  const theme = THEMES.find(([re]) => re.test(path))?.[1] ?? { pattern: "grid", scene: "grid" as Scene };
  const mainId = data?.overview.heroes[0]?.heroId;
  const routeId = Number(path.match(/^\/heroes\/(\d+)/)?.[1]) || undefined;
  const heroId = theme.art === "route" ? routeId : mainId;
  const { color, hero } = useHero(heroId);
  const { color: mainColor } = useHero(mainId);
  const tier = data?.overview.currentBadge ? TIER_COLORS[tierOf(data.overview.currentBadge)] : undefined;
  const accent = theme.accent === "tier" ? tier ?? mainColor : theme.accent ?? (theme.art === "route" ? color : mainColor);
  useEffect(() => {
    const a = !accent || accent === "#5b6478" ? "#f0b44c" : accent;
    const st = document.documentElement.style;
    st.setProperty("--hero", a);
    st.setProperty("--accent", a);
    st.setProperty("--accent2", theme.accent2 ?? "#4aa3ff");
  }, [accent, theme.accent2]);
  const art = theme.art ? hero?.art ?? hero?.portrait : undefined;
  const sceneKey = theme.scene + path.split("/")[1];
  return (
    <>
      <div className="aurora" aria-hidden><i /><i /><i /></div>
      <div key={theme.pattern + path.split("/")[1]} className="bg-pattern" data-p={theme.pattern} aria-hidden />
      {art && <div key={art} className="bg-art" style={{ backgroundImage: `url(${art})` }} aria-hidden />}
      <div key={sceneKey} className="bg-scene" data-s={theme.scene} aria-hidden>
        <div className="bg-beam b1" /><div className="bg-beam b2" /><div className="bg-beam b3" />
        <svg className="bg-motif" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><Motif scene={theme.scene} /></svg>
        <div className="bg-particles">{PARTICLES.map((p, i) => <span key={i} style={{ left: `${p.x}%`, width: p.s, height: p.s, animationDuration: `${p.d}s`, animationDelay: `${p.l}s`, ["--po" as string]: p.o }} />)}</div>
      </div>
      <div className="bg-vignette" aria-hidden />
      <div className="bg-grain" aria-hidden />
    </>
  );
}
