import type { Grade } from "@/lib/types";

const COLORS: Record<Grade, string> = {
  S: "bg-amber text-black",
  A: "bg-win text-black",
  B: "bg-sapphire text-black",
  C: "bg-slate-400 text-black",
  D: "bg-orange-500 text-black",
  F: "bg-loss text-black",
};

export function GradeBadge({ grade, size = "md", title }: { grade: Grade | null; size?: "sm" | "md" | "xl"; title?: string }) {
  const dim = size === "xl" ? "h-20 w-20 text-5xl" : size === "md" ? "h-9 w-9 text-lg" : "h-6 w-6 text-xs";
  if (!grade) {
    return (
      <span title="Details werden geladen …" className={`inline-flex ${dim} items-center justify-center rounded-lg border border-line text-muted`}>
        …
      </span>
    );
  }
  return (
    <span title={title} className={`inline-flex ${dim} items-center justify-center rounded-lg font-black ${COLORS[grade]}`}>
      {grade}
    </span>
  );
}
