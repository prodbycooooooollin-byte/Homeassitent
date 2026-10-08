import { useId } from "react";
import type { Grade } from "@/lib/types";

export const GRADE_STYLE: Record<Grade, { bg: string; glow: string; text: string; label: string }> = {
  S: { bg: "linear-gradient(145deg,#fff1c9,#f0b44c 55%,#b8741a)", glow: "rgba(240,180,76,.65)", text: "#2a1a00", label: "Überragend" },
  A: { bg: "linear-gradient(145deg,#8bf0c0,#3ecf8e 55%,#1d8a5c)", glow: "rgba(62,207,142,.5)", text: "#02281a", label: "Stark" },
  B: { bg: "linear-gradient(145deg,#a8d4ff,#4aa3ff 55%,#2a62b8)", glow: "rgba(74,163,255,.5)", text: "#021a33", label: "Solide" },
  C: { bg: "linear-gradient(145deg,#e4e8f0,#a3acbd 55%,#6c7589)", glow: "rgba(163,172,189,.35)", text: "#10141c", label: "Durchschnitt" },
  D: { bg: "linear-gradient(145deg,#ffc08a,#ff8a3d 55%,#b8501a)", glow: "rgba(255,138,61,.45)", text: "#2e1100", label: "Schwach" },
  F: { bg: "linear-gradient(145deg,#ff9ea6,#f0616d 55%,#a02535)", glow: "rgba(240,97,109,.5)", text: "#33060c", label: "Katastrophal" },
};

type Look = {
  path: string;
  rim: [string, string, string]; // Außenkante hell -> mittel -> dunkel
  face: [string, string]; // Innenfläche oben -> unten
  line: string; // feine Innenlinie
  letter: string;
  sub: string;
  glow: string;
};

const LOOK: Record<Grade, Look> = {
  S: { path: "M50 3 L64 11 L89 8 L85 52 Q81 81 50 97 Q19 81 15 52 L11 8 L36 11 Z", rim: ["#fff6d6", "#f4bd4f", "#9a5c10"], face: ["#ffe9a8", "#d98f1e"], line: "#fff3c4", letter: "#3a2200", sub: "#fff3c4", glow: "rgba(255,196,80,.75)" },
  A: { path: "M50 3 L91 26 L91 74 L50 97 L9 74 L9 26 Z", rim: ["#b4ffd9", "#35c98a", "#0f6a47"], face: ["#5fe3aa", "#14825a"], line: "#c9ffe6", letter: "#032a1b", sub: "#d9fff0", glow: "rgba(62,207,142,.6)" },
  B: { path: "M50 3 L89 15 V50 Q89 79 50 97 Q11 79 11 50 V15 Z", rim: ["#c4e0ff", "#4a95f0", "#1f4f9c"], face: ["#78b6ff", "#2a5fb5"], line: "#d6e9ff", letter: "#021a38", sub: "#e2f0ff", glow: "rgba(74,163,255,.6)" },
  C: { path: "M32 4 H68 L96 32 V68 L68 96 H32 L4 68 V32 Z", rim: ["#f1f4fa", "#a1aabc", "#586073"], face: ["#c3cad8", "#6b7487"], line: "#eef1f7", letter: "#141a26", sub: "#f1f4fa", glow: "rgba(163,172,189,.35)" },
  D: { path: "M50 4 L95 37 L79 95 H21 L5 37 Z", rim: ["#ffd2a3", "#e8793a", "#8a3a0f"], face: ["#ffa566", "#b4521b"], line: "#ffe2c4", letter: "#2e1100", sub: "#ffe9d2", glow: "rgba(255,138,61,.5)" },
  F: { path: "M10 7 L38 13 L50 3 L62 13 L90 7 L85 38 L96 58 L77 69 L71 95 L50 84 L29 95 L23 69 L4 58 L15 38 Z", rim: ["#ffb3b9", "#e0505d", "#7a1623"], face: ["#f4727d", "#8f1f2e"], line: "#ffd0d4", letter: "#2a040a", sub: "#ffd9dc", glow: "rgba(240,97,109,.55)" },
};

const SIZES = {
  xs: { box: "h-6 w-6", letter: "text-[13px]", subCls: "text-[8px]", glow: 5 },
  sm: { box: "h-8 w-8", letter: "text-[18px]", subCls: "text-[10px]", glow: 8 },
  md: { box: "h-11 w-11", letter: "text-[26px]", subCls: "text-[13px]", glow: 12 },
  xl: { box: "h-28 w-28", letter: "text-[72px]", subCls: "text-[34px]", glow: 26 },
} as const;

export function GradeBadge({ grade, size = "md", title, sub }: { grade: Grade | null; size?: "xs" | "sm" | "md" | "xl"; title?: string; sub?: "+" | "−" }) {
  const uid = useId().replace(/:/g, "");
  const d = SIZES[size];
  if (!grade) {
    const dim = { xs: "h-6 w-6 rounded-md", sm: "h-8 w-8 rounded-lg", md: "h-11 w-11 rounded-xl", xl: "h-28 w-28 rounded-3xl" }[size];
    return (
      <span title="Details werden geladen …" className={`skeleton inline-flex ${dim} items-center justify-center text-muted`}>
        <span className="relative z-10 text-xs">…</span>
      </span>
    );
  }
  const k = LOOK[grade];
  const big = size === "md" || size === "xl";
  const id = (n: string) => `${n}-${uid}`;
  return (
    <span
      title={title ?? `${grade}${sub ?? ""} – ${GRADE_STYLE[grade].label}`}
      className={`grade-emblem grade-emblem-${grade} relative inline-flex ${d.box} shrink-0 items-center justify-center`}
      style={{ filter: `drop-shadow(0 ${size === "xl" ? 4 : 1}px ${d.glow}px ${k.glow})` }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={id("r")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={k.rim[0]} />
            <stop offset=".5" stopColor={k.rim[1]} />
            <stop offset="1" stopColor={k.rim[2]} />
          </linearGradient>
          <linearGradient id={id("f")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={k.face[0]} />
            <stop offset="1" stopColor={k.face[1]} />
          </linearGradient>
          <linearGradient id={id("g")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id("s")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".7" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={id("c")}><path d={k.path} /></clipPath>
        </defs>
        <path d={k.path} fill={`url(#${id("r")})`} />
        <g transform="translate(50 50) scale(.84) translate(-50 -50)">
          <path d={k.path} fill={`url(#${id("f")})`} stroke={k.line} strokeOpacity=".7" strokeWidth={size === "xs" ? 3 : 2} strokeLinejoin="round" />
        </g>
        {/* Glanzkante oben */}
        <g clipPath={`url(#${id("c")})`}>
          <rect x="0" y="0" width="100" height="46" fill={`url(#${id("g")})`} opacity=".7" />
          {grade === "S" && size !== "xs" && <rect className="grade-shine" x="-30" y="-10" width="26" height="120" fill={`url(#${id("s")})`} transform="skewX(-20)" />}
        </g>
        <path d={k.path} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.6" strokeLinejoin="round" />
        {big && grade === "F" && (
          <path className="grade-crack" d="M58 12 L52 30 L60 40 L50 54 L57 66 L47 88" fill="none" stroke="#2a040a" strokeOpacity=".75" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {big && grade === "C" && <path d="M18 50 H82" stroke="#fff" strokeOpacity=".18" strokeWidth="1.5" />}
        {grade === "S" && size !== "xs" && (
          <>
            <path className="grade-spark" d="M86 18 L88 24 L94 26 L88 28 L86 34 L84 28 L78 26 L84 24 Z" fill="#fff" style={{ transformOrigin: "86px 26px" }} />
            {big && <path className="grade-spark grade-spark-2" d="M12 62 L13.6 66.4 L18 68 L13.6 69.6 L12 74 L10.4 69.6 L6 68 L10.4 66.4 Z" fill="#fff" style={{ transformOrigin: "12px 68px" }} />}
          </>
        )}
      </svg>
      <span className={`display relative z-10 inline-block font-extrabold leading-none ${d.letter}`} style={{ color: k.letter, textShadow: "0 1px 0 rgba(255,255,255,.35)", marginTop: grade === "F" ? "0.02em" : "0.04em" }}>
        {grade}
        {sub && (
          <sup className={`absolute font-black leading-none ${d.subCls}`} style={{ top: "-0.12em", left: "100%", marginLeft: size === "xs" ? "-0.1em" : "0.04em", color: k.sub, textShadow: `0 0 3px ${k.rim[2]}, 0 1px 1px ${k.rim[2]}` }}>{sub}</sup>
        )}
      </span>
    </span>
  );
}
