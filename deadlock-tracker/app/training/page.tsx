"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gate, PageTitle, Empty } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { HeroPortrait, useHeroName } from "@/components/GameAssets";
import { AimPanel, AimTrainer, CurveChart, LastHitTrainer } from "@/components/TrainingParts";
import { goalProgress, type TrainingReport } from "@/lib/training";
import type { Goal } from "@/lib/types";

interface Resp { report: TrainingReport; hasReference: boolean; badge: number | null }
const SEV = { high: ["#f0616d", "Priorität"], mid: ["#f0b44c", "Verbesserbar"], good: ["#3ecf8e", "Stärke"] } as const;
const GOAL_PRESETS = [
  { metric: "deaths", label: "Höchstens 6 Tode", target: 6, needed: 3, window: 5 },
  { metric: "lane8", label: "Lane bei 8:00 nicht verlieren", target: 0, needed: 3, window: 5 },
  { metric: "soulsMin", label: "800+ Souls pro Minute", target: 800, needed: 3, window: 5 },
  { metric: "accuracy", label: "40 % Trefferquote", target: 40, needed: 3, window: 5 },
];

function Training({ account }: { account: number }) {
  const [n, setN] = useState(20);
  const [res, setRes] = useState<Resp | null>(null);
  const [err, setErr] = useState(false);
  const [curve, setCurve] = useState<"nw" | "k" | "d" | "dmg">("nw");
  const [goals, setGoals] = useState<Goal[]>([]);
  const heroName = useHeroName();

  useEffect(() => { setRes(null); fetch(`/api/training?account=${account}&n=${n}`).then((r) => r.json()).then(setRes).catch(() => setErr(true)); }, [account, n]);
  const loadGoals = useCallback(() => fetch("/api/goals").then((r) => r.json()).then((j) => setGoals(j.goals ?? [])).catch(() => {}), []);
  useEffect(() => { loadGoals(); }, [loadGoals]);
  const addGoal = async (p: (typeof GOAL_PRESETS)[number]) => { const r = await fetch("/api/goals", { method: "POST", body: JSON.stringify(p) }); setGoals((await r.json()).goals ?? []); };
  const delGoal = async (id: string) => { const r = await fetch(`/api/goals?id=${id}`, { method: "DELETE" }); setGoals((await r.json()).goals ?? []); };

  const rep = res?.report;
  const series = rep?.curves.find((c) => c.key === curve);
  const avgMin = useMemo(() => 30, []);
  if (err) return <Empty icon="alert" title="Analyse nicht verfügbar" />;
  if (!rep) return <div className="surface h-64 animate-pulse" />;
  if (!rep.matches) return <Empty icon="target" title="Noch keine auswertbaren Matches" text="Sobald Match-Details geladen sind (mindestens 10 Minuten Spielzeit), erscheint hier deine Analyse." />;
  const maxH = Math.max(1, ...rep.deaths.histogram);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mr-1">Zeitraum</span>
        {[10, 20, 40].map((v) => <button key={v} onClick={() => setN(v)} className={`btn ${n === v ? "btn-gold" : "btn-ghost"} px-3 py-1 text-xs`}>Letzte {v}</button>)}
        <span className="ml-auto text-xs text-muted">{rep.matches} Matches ausgewertet · {res?.hasReference ? "Rang-Referenz geladen" : "Vergleich mit den Besten deiner Lobbys"}</span>
      </div>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rep.focus.slice(0, 6).map((f) => (
          <div key={f.id} className="surface p-4" style={{ borderColor: `${SEV[f.severity][0]}44` }}>
            <div className="mb-1 flex items-center gap-2"><span style={{ color: SEV[f.severity][0] }}><Icon name={f.severity === "good" ? "check" : f.severity === "high" ? "alert" : "target"} size={16} /></span><span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: SEV[f.severity][0] }}>{SEV[f.severity][1]}</span></div>
            <div className="font-semibold">{f.title}</div>
            <p className="mt-1 text-sm text-muted">{f.detail}</p>
          </div>
        ))}
      </section>

      <section className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="label mr-auto">Soll gegen Ist über die Spielzeit</h3>
          {rep.curves.map((c) => <button key={c.key} onClick={() => setCurve(c.key)} className={`btn ${curve === c.key ? "btn-gold" : "btn-ghost"} px-3 py-1 text-xs`}>{c.label}</button>)}
        </div>
        {series && series.mine.length ? <CurveChart series={series} avgMinutes={avgMin} /> : <p className="text-sm text-muted">Keine Zeitreihen vorhanden.</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {rep.phases.map((p) => (
            <div key={p.phase} className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
              <div className="text-xs text-muted">{p.phase} (bis {p.at} % der Spielzeit)</div>
              <div className={`num font-semibold ${p.gapPct == null ? "" : p.gapPct >= 0 ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}>{p.gapPct == null ? "–" : `${p.gapPct >= 0 ? "+" : ""}${Math.round(p.gapPct * 100)} % Souls`}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5">
          <h3 className="label mb-3">Wann du stirbst</h3>
          <div className="flex items-end gap-2">
            {rep.deaths.histogram.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[10px] text-muted">{v}</span>
                <div className="flex h-24 w-full items-end"><div className="w-full rounded-t bg-gradient-to-t from-[#f0616d]/50 to-[#f0616d]" style={{ height: `${(v / maxH) * 100}%`, minHeight: 3 }} /></div>
                <span className="text-[10px] text-muted">{i * 5}–{i * 5 + 5}′</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            <span>Ø <b className="num text-white">{rep.deaths.perMatch.toFixed(1)}</b> Tode/Match</span>
            <span><b className="num text-white">{rep.deaths.early.toFixed(1)}</b> in den ersten 4′</span>
            {rep.deaths.avgRespawnS && <span>Ø Respawn <b className="num text-white">{Math.round(rep.deaths.avgRespawnS)} s</b></span>}
          </div>
          {rep.deaths.killers.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-xs text-muted">Tötet dich am häufigsten:</span>
              {rep.deaths.killers.map((k) => <span key={k.heroId} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] py-1 pl-1 pr-2 text-xs"><HeroPortrait id={k.heroId} size={22} variant="small" className="!rounded-md" />{heroName(k.heroId)} <b className="num">{k.count}×</b></span>)}
            </div>
          )}
        </section>

        <section className="surface p-5">
          <h3 className="label mb-3">Lane und Zielgenauigkeit</h3>
          {rep.lane ? (
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <div><div className={`display num text-2xl font-bold ${rep.lane.avgDiff >= 0 ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}>{rep.lane.avgDiff >= 0 ? "+" : ""}{Math.round(rep.lane.avgDiff)}</div><div className="text-xs text-muted">Ø Souls bei 8:00</div></div>
              <div><div className="display num text-2xl font-bold">{Math.round(rep.lane.winRate * 100)} %</div><div className="text-xs text-muted">Lanes gewonnen</div></div>
              <div><div className="display num text-2xl font-bold">{rep.lane.matches}</div><div className="text-xs text-muted">Matches</div></div>
            </div>
          ) : <p className="mb-4 text-sm text-muted">Keine Lane-Daten.</p>}
          {rep.aim ? <AimPanel aim={rep.aim} /> : <p className="text-sm text-muted">Für die Zielgenauigkeit fehlen Trefferdaten in den Match-Details.</p>}
        </section>
      </div>

      <section className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="label mr-auto">Ziele</h3>
          {GOAL_PRESETS.map((p) => <button key={p.label} onClick={() => addGoal(p)} className="btn btn-ghost px-3 py-1 text-xs"><Icon name="plusSign" size={12} /> {p.label}</button>)}
        </div>
        {goals.length === 0 ? <p className="text-sm text-muted">Setze dir ein Ziel – gezählt werden nur Matches, die du ab jetzt spielst.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {goals.map((g) => {
              const p = goalProgress(g, rep.metrics), mt = rep.metrics.find((m) => m.id === g.metric);
              return (
                <div key={g.id} className="rounded-xl bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2 text-sm"><span className="font-medium">{mt?.label ?? g.metric} {g.lowerIsBetter ? "≤" : "≥"} {g.target}</span><span className="ml-auto text-xs text-muted">{p.hits}/{g.needed} in {g.window} Matches</span>
                    <button aria-label="Ziel löschen" onClick={() => delGoal(g.id)} className="text-muted hover:text-white"><Icon name="x" size={14} /></button></div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${p.done ? "bg-[#3ecf8e]" : "bg-[#4aa3ff]"}`} style={{ width: `${p.pctDone * 100}%` }} /></div>
                  <div className="mt-1 text-[11px] text-muted">{p.done ? "Ziel erreicht" : p.played ? `${p.played} Match(es) seit Start gespielt` : "Noch kein Match seit Start"}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5"><h3 className="label mb-3">Last-Hit-Trainer</h3><LastHitTrainer /></section>
        <section className="surface p-5"><h3 className="label mb-3">Aim-Trainer</h3><AimTrainer /></section>
      </div>
    </>
  );
}

export default function TrainingPage() {
  return (
    <Gate>
      {({ me }) => (<><PageTitle title="Training" sub="Dein Spiel gegen das Ideal – was du falsch machst und wie du es übst" /><Training account={me.accountId} /></>)}
    </Gate>
  );
}
