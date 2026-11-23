// Analyse: Wie autark war das Haus, was hat die PV-Anlage gespart?
// Alle Kennzahlen stammen aus gemessenen bzw. berechneten Zeitreihen;
// Geldbeträge und CO₂ sind Schätzungen auf Basis der eigenen Tarifangaben.
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Info, Leaf, PiggyBank, Plug, Sun, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { flowValues, houseConsumption } from "@/energy/aggregate";
import { bucketSplits, bucketValues } from "@/energy/history";
import { baseLoad, computeInsights, partialSum } from "@/energy/insights";
import { formatEnergy, formatPower } from "@/energy/units";
import { rangeBounds, type BucketValue, type RangeKind } from "@/energy/series";
import { NumberField, Notice, Segmented } from "@/ui/primitives";
import { useHistory } from "./useHistory";
import { summarize, topConsumers } from "./derive";

const eur = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 }));
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)} %`);

function shift(range: RangeKind, anchor: number, dir: number) {
  const d = new Date(anchor);
  if (range === "day") d.setDate(d.getDate() + dir);
  else if (range === "week") d.setDate(d.getDate() + 7 * dir);
  else d.setMonth(d.getMonth() + dir);
  return d.getTime();
}

function Ring({ value, label, sub, color, testId }: { value: number | null; label: string; sub: string; color: string; testId?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface p-3 text-center" data-testid={testId}>
      <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" role="img" aria-label={`${label}: ${pct(value)}`}>
        <circle cx={40} cy={40} r={r} fill="none" stroke="#ECEEE8" strokeWidth={9} />
        {value !== null && <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 40 40)" />}
        <text x={40} y={44} textAnchor="middle" className="fill-ink text-[15px] font-semibold">
          {pct(value)}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-ink-2">{sub}</p>
      </div>
    </div>
  );
}

function SourceChart({ buckets, range }: { buckets: { b: BucketValue; own: number | null; grid: number | null }[]; range: RangeKind }) {
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 8, t: 8, b: 22 };
  const max = Math.max(0.1, ...buckets.map((x) => (x.own ?? 0) + (x.grid ?? 0)));
  const bw = (W - pad.l - pad.r) / Math.max(1, buckets.length);
  const y = (v: number) => (H - pad.b - pad.t) * (v / max);
  const now = Date.now();
  const every = range === "day" ? 3 : range === "month" ? 5 : 1;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Herkunft des Stroms je Zeitraum">
        <defs>
          <pattern id="src-gap" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="#9AA19D" strokeWidth={2} opacity={0.5} />
          </pattern>
        </defs>
        {buckets.map(({ b, own, grid }, i) => {
          const x = pad.l + i * bw + bw * 0.12;
          const w = bw * 0.76;
          if (b.start > now) return null;
          if (own === null || grid === null)
            return b.end > now ? null : <rect key={i} x={x} y={pad.t} width={w} height={H - pad.t - pad.b} fill="url(#src-gap)" />;
          const hOwn = y(own);
          const hGrid = y(grid);
          return (
            <g key={i}>
              <rect x={x} y={H - pad.b - hOwn} width={w} height={hOwn} rx={2} fill="#4D9A7A" />
              <rect x={x} y={H - pad.b - hOwn - hGrid} width={w} height={hGrid} rx={2} fill="#B9BEBA" />
            </g>
          );
        })}
        {buckets.map(({ b }, i) =>
          i % every === 0 ? (
            <text key={i} x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-ink-2 text-[10px]">
              {range === "day" ? new Date(b.start).getHours() : range === "week" ? ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(b.start).getDay()] : new Date(b.start).getDate()}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[#4D9A7A]" /> aus PV & Speicher
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[#B9BEBA]" /> aus dem Netz
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="hatch-gap h-3 w-3 rounded-sm border border-line" /> Lücke
        </span>
      </figcaption>
    </figure>
  );
}

export function InsightsPanel() {
  const project = useProject((s) => s.project)!;
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const ui = useUi();
  const [tariffOpen, setTariffOpen] = useState(false);
  const cur = useHistory(ui.energyRange, ui.energyAnchor);
  const prev = useHistory(ui.energyRange, shift(ui.energyRange, ui.energyAnchor, -1));
  const t = project.settings;

  const data = useMemo(() => {
    if (!cur.result) return null;
    const sum = summarize(project, cur.result);
    const ins = computeInsights(sum.flows, sum.house, t);
    const perBucket = cur.result.buckets.map((_, i) => {
      const vals = bucketValues(cur.result!, i);
      const splits = bucketSplits(cur.result!, i);
      const f = flowValues(project.meters, vals, splits);
      const c = houseConsumption(project.meters, vals, project.settings.noLocalGeneration, splits);
      const b = sum.series[i] ?? { ...cur.result!.buckets[i], value: null, coverage: 0, catchUp: false, reset: false, future: false };
      if (c.value === null || f.gridImport === null || c.basis === "tracked_devices" || c.basis === "none") return { b, own: null, grid: null };
      const grid = Math.min(c.value, f.gridImport);
      return { b, own: Math.max(0, c.value - grid), grid };
    });
    return { sum, ins, perBucket };
  }, [cur.result, project, t]);

  const comparison = useMemo(() => {
    if (!data || !prev.result) return null;
    const prevSum = summarize(project, prev.result);
    const now = Date.now();
    const elapsed = data.sum.series.filter((b) => b.end <= now).length;
    const running = rangeBounds(ui.energyRange, new Date(ui.energyAnchor)).end > now;
    const curVal = running ? partialSum(data.sum.series, elapsed) : data.sum.house.value;
    const prevVal = running ? partialSum(prevSum.series, elapsed) : prevSum.house.value;
    if (curVal === null || prevVal === null || prevVal <= 0) return null;
    return { change: curVal / prevVal - 1, running, curVal, prevVal };
  }, [data, prev.result, project, ui.energyRange, ui.energyAnchor]);

  const base = data && ui.energyRange === "day" ? baseLoad(data.sum.series) : null;
  const top = cur.result ? topConsumers(project, cur.result).slice(0, 3) : [];

  return (
    <div className="space-y-4" data-testid="insights">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Zeitraum"
          value={ui.energyRange}
          onChange={(v) => ui.patch({ energyRange: v })}
          options={[
            { value: "day", label: "Tag" },
            { value: "week", label: "Woche" },
            { value: "month", label: "Monat" },
          ]}
        />
        <button className="icon-btn border border-line" aria-label="Vorheriger Zeitraum" onClick={() => ui.patch({ energyAnchor: shift(ui.energyRange, ui.energyAnchor, -1) })}>
          <ChevronLeft size={18} />
        </button>
        <button className="icon-btn border border-line" aria-label="Nächster Zeitraum" disabled={rangeBounds(ui.energyRange, new Date(ui.energyAnchor)).end > Date.now()} onClick={() => ui.patch({ energyAnchor: shift(ui.energyRange, ui.energyAnchor, 1) })}>
          <ChevronRight size={18} />
        </button>
        <button className="chip" onClick={() => ui.patch({ energyAnchor: Date.now() })}>
          Heute
        </button>
      </div>
      {cur.loading && !data && <p className="text-sm text-ink-2">Analyse wird berechnet …</p>}
      {cur.error && <Notice tone="error">{cur.error}</Notice>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Ring value={data.ins.autarky} label="Autarkie" sub={data.ins.autarky !== null ? "Anteil des Verbrauchs ohne Netzbezug" : data.ins.autarkyReason ?? ""} color="#4D9A7A" testId="autarky" />
            <Ring
              value={data.ins.selfConsumption}
              label="Eigenverbrauch"
              sub={data.ins.selfConsumption !== null ? "Anteil des PV-Stroms, der im Haus blieb" : data.ins.selfConsumptionReason ?? ""}
              color="#E3A33B"
              testId="self-consumption"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Tile icon={<PiggyBank size={16} />} label="Ersparnis durch PV" value={eur(data.ins.savings)} note={data.ins.selfUsedPv !== null ? `${formatEnergy(data.ins.selfUsedPv)} selbst genutzt × ${t.pricePerKwh.toLocaleString("de-DE")} €` : null} testId="savings" />
            <Tile icon={<Sun size={16} />} label="Einspeisevergütung" value={eur(data.ins.feedInRevenue)} note={data.sum.flows.gridExport !== null ? `${formatEnergy(data.sum.flows.gridExport)} eingespeist` : null} />
            <Tile icon={<Plug size={16} />} label="Kosten Netzbezug" value={eur(data.ins.gridCost)} note={data.sum.flows.gridImport !== null ? `${formatEnergy(data.sum.flows.gridImport)} bezogen` : null} />
            <Tile icon={<Leaf size={16} />} label="CO₂ vermieden" value={data.ins.co2Avoided === null ? "–" : `${data.ins.co2Avoided.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg`} note={`Schätzung, ${t.co2PerKwh.toLocaleString("de-DE")} kg/kWh`} />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-ink-2">
            <Info size={12} className="mt-0.5 shrink-0" /> Geldbeträge und CO₂ sind Schätzungen aus deinen Tarifangaben; Speicherverluste sind nicht berücksichtigt.{" "}
            <button className="underline" onClick={() => setTariffOpen(!tariffOpen)}>
              Tarif anpassen
            </button>
          </p>
          {tariffOpen && (
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3">
              <NumberField label="Strompreis" unit="€/kWh" value={t.pricePerKwh} decimals={3} min={0} max={5} disabled={!canEdit} onCommit={(v) => apply((p) => ({ ...p, settings: { ...p.settings, pricePerKwh: v } }))} />
              <NumberField label="Vergütung" unit="€/kWh" value={t.feedInPerKwh} decimals={3} min={0} max={5} disabled={!canEdit} onCommit={(v) => apply((p) => ({ ...p, settings: { ...p.settings, feedInPerKwh: v } }))} />
              <NumberField label="CO₂" unit="kg/kWh" value={t.co2PerKwh} decimals={2} min={0} max={2} disabled={!canEdit} onCommit={(v) => apply((p) => ({ ...p, settings: { ...p.settings, co2PerKwh: v } }))} />
            </div>
          )}
          <section>
            <h3 className="section-title mb-1">Woher kam der Strom?</h3>
            {data.perBucket.some((x) => x.own !== null) ? (
              <SourceChart buckets={data.perBucket} range={ui.energyRange} />
            ) : (
              <p className="text-sm text-ink-2">Für die Aufteilung werden Hausverbrauch und Netzbezug benötigt.</p>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="section-title">Auffälligkeiten</h3>
            <ul className="space-y-1.5 text-sm" data-testid="findings">
              {comparison && (
                <li className="flex items-start gap-2">
                  {comparison.change > 0 ? <TrendingUp size={16} className="mt-0.5 shrink-0 text-warn" /> : <TrendingDown size={16} className="mt-0.5 shrink-0 text-sage" />}
                  <span>
                    Verbrauch {comparison.change > 0 ? "höher" : "niedriger"} als im Vorzeitraum: {comparison.change > 0 ? "+" : ""}
                    {Math.round(comparison.change * 100)} % ({formatEnergy(comparison.curVal)} statt {formatEnergy(comparison.prevVal)}
                    {comparison.running ? ", gleich langer Abschnitt" : ""}).
                  </span>
                </li>
              )}
              {top[0] && data.sum.house.value && top[0].energy?.total ? (
                <li className="flex items-start gap-2">
                  <Plug size={16} className="mt-0.5 shrink-0 text-energy" />
                  <span>
                    Größter gemessener Verbraucher: <strong>{top[0].meter.label}</strong> mit {formatEnergy(top[0].energy.total)} ({Math.round((top[0].energy.total / data.sum.house.value) * 100)} % des Hausverbrauchs)
                    {top[0].energy.calculated ? ", aus Leistung berechnet" : ""}.
                  </span>
                </li>
              ) : null}
              {base !== null && (
                <li className="flex items-start gap-2">
                  <Info size={16} className="mt-0.5 shrink-0 text-ink-2" />
                  <span>
                    Grundlast etwa <strong>{formatPower(base)}</strong> – das sind hochgerechnet ca. {formatEnergy((base * 8760) / 1000)} bzw. {eur(((base * 8760) / 1000) * t.pricePerKwh)} pro Jahr.
                  </span>
                </li>
              )}
              {!comparison && !base && !top.length && <li className="text-ink-2">Noch zu wenige Daten für Auffälligkeiten.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ icon, label, value, note, testId }: { icon: React.ReactNode; label: string; value: string; note: string | null; testId?: string }) {
  return (
    <div className={clsx("rounded-2xl border border-line bg-surface p-3")} data-testid={testId}>
      <p className="flex items-center gap-1.5 text-xs text-ink-2">
        {icon}
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-[11px] text-ink-2">{note}</p>}
    </div>
  );
}
