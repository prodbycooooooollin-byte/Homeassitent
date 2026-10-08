"use client";
import { computeStat } from "@/lib/profile-customize";
import type { MatchListItem, Overview } from "@/lib/view";

/** Gewählte Kennzahlen als eine Reihe großer Zahlen, nur durch Trennlinien getrennt (max. 4). */
export function StatReadout({ keys, items, ov, accent, size = "lg" }: { keys: string[]; items: MatchListItem[]; ov: Overview; accent: string; size?: "lg" | "sm" }) {
  const stats = keys.slice(0, 4).map((k) => ({ k, s: computeStat(k, items, ov) })).filter((x) => x.s);
  if (!stats.length) return null;
  return (
    <dl className="flex flex-wrap items-stretch gap-y-3">
      {stats.map(({ k, s }, i) => (
        <div key={k} className={`min-w-0 pr-5 ${i > 0 ? "border-l border-white/10 pl-5" : ""}`}>
          <dt className="label !text-[10px]">{s!.label}</dt>
          <dd className={`display num font-extrabold leading-none ${size === "lg" ? "mt-1.5 text-[34px]" : "mt-1 text-2xl"}`} style={i === 0 ? { color: accent } : undefined}>{s!.value}</dd>
          <div className="num mt-1 h-3.5 text-[11px] text-muted">{s!.sub ?? ""}</div>
        </div>
      ))}
    </dl>
  );
}
