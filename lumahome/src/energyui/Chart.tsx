// Verlaufsdiagramm. Messlücken bleiben sichtbar (schraffiert), der laufende
// Zeitraum ist gekennzeichnet, berechnete Werte sind markiert.
import { clsx } from "clsx";
import { useMemo, useRef, useState } from "react";
import type { BucketValue, RangeKind } from "@/energy/series";
import { formatEnergy, formatPower } from "@/energy/units";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function bucketLabel(b: BucketValue, range: RangeKind, long = false) {
  const d = new Date(b.start);
  if (range === "day") return long ? `${String(d.getHours()).padStart(2, "0")}:00–${String(new Date(b.end).getHours()).padStart(2, "0")}:00` : String(d.getHours());
  if (range === "week") return long ? d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }) : WEEKDAYS[d.getDay()];
  return long ? d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) : String(d.getDate());
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function HistoryChart({ buckets, range, mode, calculated, height = 220, testId }: { buckets: BucketValue[]; range: RangeKind; mode: "energy" | "power"; calculated: boolean; height?: number; testId?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 640;
  const H = height;
  const pad = { l: 52, r: 8, t: 12, b: 26 };
  const now = Date.now();
  const max = useMemo(() => niceMax(Math.max(0, ...buckets.map((b) => b.value ?? 0)) * 1.05), [buckets]);
  const n = buckets.length || 1;
  const bw = (W - pad.l - pad.r) / n;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const fmt = (v: number) => (mode === "energy" ? formatEnergy(v) : formatPower(v));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = range === "day" ? 3 : range === "month" ? 5 : 1;

  const pathSegs: string[] = [];
  if (mode === "power") {
    let cur = "";
    buckets.forEach((b, i) => {
      const x = pad.l + bw * (i + 0.5);
      if (b.value === null) {
        if (cur) pathSegs.push(cur);
        cur = "";
        return;
      }
      cur += `${cur ? "L" : "M"}${x.toFixed(1)},${y(b.value).toFixed(1)}`;
    });
    if (cur) pathSegs.push(cur);
  }

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((x - pad.l) / bw);
    setHover(i >= 0 && i < n ? i : null);
  };

  const hb = hover !== null ? buckets[hover] : null;
  const gaps = buckets.filter((b) => b.value === null && !b.future).length;
  return (
    <figure className="relative" data-testid={testId}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Verlauf ${mode === "energy" ? "Energie in kWh" : "Leistung in W"}, ${gaps} Lücken`}>
        <defs>
          <pattern id="gap-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="#9AA19D" strokeWidth={2} opacity={0.5} />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#E3E5DE" />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="fill-ink-2 text-[10px] tabular-nums">
              {mode === "energy" ? (t < 1 && max < 2 ? `${Math.round(t * 1000)} Wh` : `${Number(t.toFixed(2)).toLocaleString("de-DE")} kWh`) : t >= 1000 ? `${(t / 1000).toLocaleString("de-DE")} kW` : `${Math.round(t)} W`}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = pad.l + bw * i;
          const running = b.start <= now && b.end > now;
          const future = b.start > now;
          if (future) return null;
          if (b.value === null) {
            return running ? (
              <rect key={i} x={x + 1} y={y(max * 0.04)} width={bw - 2} height={H - pad.b - y(max * 0.04)} fill="#E3E5DE" rx={2} data-running />
            ) : (
              <rect key={i} x={x + 1} y={pad.t} width={bw - 2} height={H - pad.t - pad.b} fill="url(#gap-hatch)" data-gap />
            );
          }
          if (mode === "power") return null;
          const partial = b.coverage < 0.98 && !running;
          return (
            <rect
              key={i}
              x={x + Math.max(1, bw * 0.12)}
              y={y(b.value)}
              width={Math.max(1, bw * 0.76)}
              height={Math.max(0, H - pad.b - y(b.value))}
              rx={Math.min(4, bw * 0.2)}
              className={clsx(hover === i ? "fill-energy-dark" : running ? "fill-energy/45" : "fill-energy")}
              opacity={partial || b.catchUp ? 0.6 : 1}
              stroke={b.catchUp || b.reset ? "#5E4E97" : "none"}
              strokeDasharray={b.catchUp ? "3 2" : undefined}
            />
          );
        })}
        {mode === "power" && pathSegs.map((d, i) => <path key={i} d={d} fill="none" stroke="#7866B2" strokeWidth={2} strokeLinejoin="round" />)}
        {buckets.map((b, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={pad.l + bw * (i + 0.5)} y={H - 8} textAnchor="middle" className="fill-ink-2 text-[10px]">
              {bucketLabel(b, range)}
            </text>
          ) : null,
        )}
        {hover !== null && <rect x={pad.l + bw * hover} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="#242A28" opacity={0.04} />}
      </svg>
      {hb && (
        <figcaption className="pointer-events-none absolute right-2 top-0 max-w-[16rem] rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-soft">
          <p className="font-medium">{bucketLabel(hb, range, true)}</p>
          {hb.start > now ? (
            <p className="text-ink-2">Liegt in der Zukunft</p>
          ) : hb.value === null ? (
            <p className="text-ink-2">{hb.end > now ? "Läuft noch – Wert folgt nach Abschluss" : "Messlücke – keine Daten vorhanden"}</p>
          ) : (
            <>
              <p className="tabular-nums text-energy-dark">
                {fmt(hb.value)}
                {mode === "power" ? " (Mittel)" : ""}
              </p>
              {hb.coverage < 0.98 && hb.end <= now && <p className="text-ink-2">Daten für {Math.round(hb.coverage * 100)} % des Zeitraums</p>}
              {hb.catchUp && <p className="text-ink-2">Enthält Verbrauch über eine vorangehende Lücke</p>}
              {hb.reset && <p className="text-ink-2">Zählerrücksetzung/-wechsel berücksichtigt</p>}
              {calculated && mode === "energy" && <p className="text-ink-2">Aus Leistung berechnet</p>}
            </>
          )}
        </figcaption>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-energy" /> {mode === "energy" ? "Energie je Zeitraum" : "mittlere Leistung"}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="hatch-gap h-3 w-3 rounded-sm border border-line" /> Messlücke ({gaps})
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[#E3E5DE]" /> läuft noch
        </span>
        {calculated && mode === "energy" && <span className="badge bg-energy-soft text-energy-dark">berechnet</span>}
      </div>
    </figure>
  );
}
