"use client";
import { useMemo, useState } from "react";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { RankEmblem, TIER_COLORS } from "@/components/GameAssets";
import { breakEven, buildModel, DIVISION, drift, simulate } from "@/lib/forecast";
import { badgeToLinear, formatBadge, linearToBadge, tierOf } from "@/lib/ranks";
import type { MatchListItem, Overview } from "@/lib/view";

export default function AufstiegPage() {
  return <Gate>{({ data }) => <View ov={data.overview} matches={data.matches} />}</Gate>;
}

const W = 760, H = 300, P = { l: 96, r: 16, t: 14, b: 28 };

function View({ ov, matches }: { ov: Overview; matches: MatchListItem[] }) {
  const model = useMemo(() => buildModel(ov.rankHistory), [ov.rankHistory]);
  const ranked = matches.filter((m) => m.matchMode === "Ranked");
  const myWr = ranked.length ? ranked.filter((m) => m.won).length / ranked.length : 0.5;
  const [wr, setWr] = useState<number | null>(null);
  const [n, setN] = useState(50);
  if (!ov.currentBadge || !model) return (
    <>
      <PageTitle title="Aufstieg" sub="Wie lange dauert es bis zum nächsten Rang? Prognose aus deinen echten Rang-Punkten" />
      <Empty icon="rocket" title="Noch keine Rang-Punkte" text="Die Prognose braucht Ranked-Matches, bei denen die API die Rang-Punkte pro Sieg und Niederlage liefert (mindestens je ein Sieg und eine Niederlage)." />
    </>
  );
  const p = wr ?? Math.min(0.8, Math.max(0.3, Math.round(myWr * 100) / 100));
  const sim = useMemo(() => simulate(model, p, n), [model, p, n]); // eslint-disable-line react-hooks/rules-of-hooks
  const be = breakEven(model);
  const scen = useMemo(() => [-0.05, 0, 0.05, 0.1].map((d) => ({ d, p: Math.min(0.9, Math.max(0.1, p + d)) })).map((s) => ({ ...s, sim: simulate(model, s.p, n, 700, 11) })), [model, p, n]); // eslint-disable-line react-hooks/rules-of-hooks
  const lo = Math.floor(Math.min(...sim.fan.p10, model.lin) - 0.2), hi = Math.ceil(Math.max(...sim.fan.p90, model.lin + 1) + 0.2);
  const x = (i: number) => P.l + (i / n) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const line = (xs: number[]) => xs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const band = `${line(sim.fan.p90)}${[...sim.fan.p10].reverse().map((v, k) => `L${x(n - k).toFixed(1)},${y(v).toFixed(1)}`).join("")}Z`;
  const rows = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((v) => v >= 1 && v <= 66);
  const color = TIER_COLORS[tierOf(ov.currentBadge)] ?? "#f0b44c";
  const endBadge = linearToBadge(Math.max(1, Math.floor(sim.endMedian)));
  const d = drift(model, p);
  const need = (target: number) => { // Siegquote für ≥50 % Chance auf die nächste Division in n Matches (grobe Suche)
    for (let q = Math.ceil(be * 100); q <= 90; q++) { if (simulate(model, q / 100, n, 400, 3).pUp >= 0.5) return q; }
    return null; void target;
  };
  const needWr = useMemo(() => need(0), [model, n]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/rules-of-hooks
  const nextLin = Math.floor(model.lin) + 1;

  return (
    <>
      <PageTitle title="Aufstieg" sub="Prognose deines Rangs – simuliert aus deinen echten Rang-Punkten pro Sieg und Niederlage" />

      <section className="surface sheen relative overflow-hidden p-6">
        <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr_1fr_1fr_1fr]">
          <div className="float justify-self-center"><RankEmblem badge={ov.currentBadge} size={120} /></div>
          <Kpi label="Jetzt" value={formatBadge(ov.currentBadge)} sub={`≈ ${Math.round(model.pos)} / ${DIVISION} Punkte in der Division`} />
          <Kpi label="Nächstes Ziel" value={formatBadge(linearToBadge(nextLin))} sub={sim.toNext.p50 ? `im Median in ${sim.toNext.p50} Matches` : `bei ${Math.round(p * 100)} % Siegquote in ${n} Matches unwahrscheinlich`} color={color} />
          <Kpi label="Chance auf Aufstieg" value={`${Math.round(sim.pUp * 100)} %`} sub={`innerhalb von ${n} Matches`} color={sim.pUp >= 0.5 ? "#3ecf8e" : "#f0b44c"} />
          <Kpi label="Gleichgewicht" value={`${Math.round(be * 100)} %`} sub={`ab dieser Siegquote steigst du im Mittel (Ø +${Math.round(model.avgWin)} / −${Math.round(model.avgLoss)})`} />
        </div>
      </section>

      <section className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center gap-x-8 gap-y-3">
          <h2 className="label mr-auto">Dein Rang in den nächsten {n} Matches</h2>
          <label className="flex items-center gap-3 text-sm"><span className="text-muted">Siegquote</span><input type="range" min={30} max={80} value={Math.round(p * 100)} onChange={(e) => setWr(Number(e.target.value) / 100)} className="w-40 accent-[#f0b44c]" /><b className="num w-12 text-right">{Math.round(p * 100)} %</b></label>
          <label className="flex items-center gap-3 text-sm"><span className="text-muted">Matches</span><input type="range" min={10} max={120} step={5} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-32 accent-[#4aa3ff]" /><b className="num w-10 text-right">{n}</b></label>
          {wr !== null && <button onClick={() => setWr(null)} className="btn btn-ghost px-3 py-1 text-xs">Meine Siegquote ({Math.round(myWr * 100)} %)</button>}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {rows.map((v) => (
            <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={v % 6 === 1 ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.05)"} />
              <text x={P.l - 8} y={y(v) + 3} textAnchor="end" className="text-[10px]" fill={v === Math.floor(model.lin) ? color : "#8b94a8"}>{formatBadge(linearToBadge(v))}</text></g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={x(f * n)} y={H - 8} textAnchor="middle" className="fill-[#8b94a8] text-[10px]">{Math.round(f * n)}</text>)}
          <path d={band} fill={color} opacity={0.16} />
          <path d={line(sim.fan.p90)} fill="none" stroke={color} strokeOpacity={0.35} strokeDasharray="4 4" />
          <path d={line(sim.fan.p10)} fill="none" stroke={color} strokeOpacity={0.35} strokeDasharray="4 4" />
          <path d={line(sim.fan.p50)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
          <circle cx={x(0)} cy={y(model.lin + model.pos / DIVISION)} r={5} fill="#fff" />
          <circle cx={x(n)} cy={y(sim.fan.p50[n])} r={5} fill={color} stroke="#0b0e15" strokeWidth={2} />
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span><i className="mr-1.5 inline-block h-[3px] w-5 rounded align-middle" style={{ background: color }} />Median: nach {n} Matches ≈ <b className="text-white">{formatBadge(endBadge)}</b></span>
          <span><i className="mr-1.5 inline-block h-3 w-5 rounded-sm align-middle opacity-30" style={{ background: color }} />80 % aller Verläufe liegen in diesem Band</span>
          <span>Risiko eines Abstiegs: <b className="text-white">{Math.round(sim.pDown * 100)} %</b></span>
          <span>Erwartung pro Match: <b className={d >= 0 ? "text-win" : "text-loss"}>{d >= 0 ? "+" : "−"}{Math.abs(Math.round(d))} Punkte</b></span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="surface p-5">
          <h2 className="label mb-3">Was wäre wenn?</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {scen.map((s) => (
              <button key={s.d} onClick={() => setWr(s.p)} className={`rounded-xl border p-3 text-left transition hover:border-white/30 ${s.d === 0 ? "border-white/25 bg-white/[0.06]" : "border-white/[0.08] bg-white/[0.03]"}`}>
                <div className="text-[10px] uppercase tracking-widest text-muted">{s.d === 0 ? "Aktuell" : `${s.d > 0 ? "+" : "−"}${Math.abs(Math.round(s.d * 100))} % Siegquote`}</div>
                <div className="display num text-2xl font-extrabold">{Math.round(s.p * 100)} %</div>
                <div className="mt-1 text-sm font-semibold" style={{ color: TIER_COLORS[tierOf(linearToBadge(Math.max(1, Math.floor(s.sim.endMedian))))] }}>{formatBadge(linearToBadge(Math.max(1, Math.floor(s.sim.endMedian))))}</div>
                <div className="text-[11px] text-muted">Aufstieg {Math.round(s.sim.pUp * 100)} % · Abstieg {Math.round(s.sim.pDown * 100)} %</div>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Jede Karte simuliert {n} Matches mit der jeweiligen Siegquote. Klick übernimmt sie in den Regler.</p>
        </section>
        <section className="surface p-5">
          <h2 className="label mb-3">Dein Hebel</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3"><Icon name="target" size={16} className="mt-0.5 shrink-0 text-amber" /><span>{needWr ? <>Für eine Chance von mindestens 50 % auf <b>{formatBadge(linearToBadge(nextLin))}</b> in {n} Matches brauchst du etwa <b>{needWr} %</b> Siegquote{myWr * 100 >= needWr ? " – du liegst darüber." : ` (aktuell ${Math.round(myWr * 100)} %).`}</> : <>In {n} Matches ist der Aufstieg auch bei hoher Siegquote unwahrscheinlich – erhöhe die Anzahl der Matches.</>}</span></li>
            <li className="flex gap-3"><Icon name="trendUp" size={16} className="mt-0.5 shrink-0 text-win" /><span>Jedes zusätzliche Prozent Siegquote bringt dir etwa <b>{Math.round((model.avgWin + model.avgLoss) / 100 * 10) / 10} Punkte</b> pro Match mehr.</span></li>
            <li className="flex gap-3"><Icon name="shield" size={16} className="mt-0.5 shrink-0 text-sapphire" /><span>Unter <b>{Math.round(be * 100)} %</b> sinkst du im Mittel – auch ein einzelner Verlust kostet ca. {Math.round(model.avgLoss)} Punkte, ein Sieg bringt {Math.round(model.avgWin)}.</span></li>
          </ul>
          <p className="mt-4 text-[11px] leading-snug text-muted">Grundlage: {model.samples} deiner Matches mit Rang-Punkten. Die Position innerhalb der Division ist geschätzt (die API liefert sie nicht direkt), die Simulation zieht zufällig aus deinen bisherigen Punktänderungen. Eine Schätzung, keine Garantie.</p>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return <div><div className="label">{label}</div><div className="display text-2xl font-extrabold md:text-3xl" style={{ color }}>{value}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>;
}
