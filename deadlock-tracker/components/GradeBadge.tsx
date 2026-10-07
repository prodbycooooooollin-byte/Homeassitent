import type { Grade } from "@/lib/types";

export const GRADE_STYLE: Record<Grade, { bg: string; glow: string; text: string; label: string }> = {
  S: { bg: "linear-gradient(145deg,#fff1c9,#f0b44c 55%,#b8741a)", glow: "rgba(240,180,76,.65)", text: "#2a1a00", label: "Überragend" },
  A: { bg: "linear-gradient(145deg,#8bf0c0,#3ecf8e 55%,#1d8a5c)", glow: "rgba(62,207,142,.5)", text: "#02281a", label: "Stark" },
  B: { bg: "linear-gradient(145deg,#a8d4ff,#4aa3ff 55%,#2a62b8)", glow: "rgba(74,163,255,.5)", text: "#021a33", label: "Solide" },
  C: { bg: "linear-gradient(145deg,#e4e8f0,#a3acbd 55%,#6c7589)", glow: "rgba(163,172,189,.35)", text: "#10141c", label: "Durchschnitt" },
  D: { bg: "linear-gradient(145deg,#ffc08a,#ff8a3d 55%,#b8501a)", glow: "rgba(255,138,61,.45)", text: "#2e1100", label: "Schwach" },
  F: { bg: "linear-gradient(145deg,#ff9ea6,#f0616d 55%,#a02535)", glow: "rgba(240,97,109,.5)", text: "#33060c", label: "Katastrophal" },
};

export function GradeBadge({ grade, size = "md", title }: { grade: Grade | null; size?: "xs" | "sm" | "md" | "xl"; title?: string }) {
  const dim = { xs: "h-6 w-6 text-[12px] rounded-md", sm: "h-8 w-8 text-base rounded-lg", md: "h-11 w-11 text-2xl rounded-xl", xl: "h-28 w-28 text-7xl rounded-3xl" }[size];
  if (!grade) {
    return (
      <span title="Details werden geladen …" className={`skeleton inline-flex ${dim} items-center justify-center text-muted`}>
        <span className="relative z-10 text-xs">…</span>
      </span>
    );
  }
  const s = GRADE_STYLE[grade];
  return (
    <span
      title={title ?? `${grade} – ${s.label}`}
      className={`display inline-flex ${dim} shrink-0 items-center justify-center font-extrabold ${grade === "S" ? "grade-s" : ""}`}
      style={{ background: s.bg, color: s.text, boxShadow: `0 0 ${size === "xl" ? 48 : 16}px -4px ${s.glow}, inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 0 rgba(0,0,0,.2)` }}
    >
      {grade}
    </span>
  );
}
