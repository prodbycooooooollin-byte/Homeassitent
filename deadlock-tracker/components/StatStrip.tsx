"use client";
import { STAT_DEFS, computeStat, stripKeys } from "@/lib/profile-customize";
import { useSettings } from "./Providers";
import { HoverCard } from "./Popover";
import type { MatchListItem, Overview } from "@/lib/view";

/** Bevorzugte Reihenfolge; im Banner gewählte Kennzahlen entfallen, die nächsten rücken nach. */
const POOL = ["matches", "winrate", "kda", "score", "lobby", "spm", "streakNow", "deaths", "duration", "streakBest", "peak"];
const COUNT = 5;

/** Einheitliche, kompakte Kachel: Beschriftung, Wert, höchstens eine Zusatzzeile. */
function Tile({ label, value, sub, desc }: { label: string; value: string; sub?: string; desc: string }) {
  return (
    <HoverCard width={240} className="!flex" content={<p className="text-xs leading-relaxed text-muted"><b className="text-white">{label}</b>: {desc}.</p>}>
      <div className="surface surface-hover flex h-[84px] w-full flex-col justify-center px-4 text-left">
        <div className="label !text-[10px]">{label}</div>
        <div className="display num mt-0.5 truncate text-2xl font-extrabold leading-tight">{value}</div>
        <div className="num h-3.5 truncate text-[11px] text-muted">{sub ?? ""}</div>
      </div>
    </HoverCard>
  );
}

export function StatStrip({ ov, items = [] }: { ov: Overview; items?: MatchListItem[] }) {
  const { settings } = useSettings();
  const keys = stripKeys(settings.profile.stats, POOL).slice(0, COUNT);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {keys.map((k) => {
        const s = computeStat(k, items, ov);
        const d = STAT_DEFS.find((x) => x.key === k);
        return s && d ? <Tile key={k} label={s.label} value={s.value} sub={s.sub} desc={d.desc} /> : null;
      })}
    </div>
  );
}
