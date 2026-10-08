"use client";
import { useCallback, useEffect, useState } from "react";
import { Gate, PageTitle, Empty } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { HeroPortrait, useHeroName } from "@/components/GameAssets";
import { AimPanel, CurveChart, SoulPlanPanel } from "@/components/TrainingParts";
import { goalProgress, type Focus, type GoalSuggestion, type TrainingReport } from "@/lib/training";
import type { SkillId, SkillView, TrainingView } from "@/lib/training-view";
import type { Goal } from "@/lib/types";

interface Resp { report: TrainingReport; view: TrainingView; hasReference: boolean; badge: number | null }
const col = (pct: number | null) => (pct === null ? "#5b6478" : pct >= 92 ? "#3ecf8e" : pct >= 75 ? "#f0b44c" : "#f0616d");
const ICON: Record<SkillId, string> = { lane: "swap", farming: "gem", jungle: "flame", survival: "heart", teamplay: "users", objectives: "tower", items: "layers", aim: "target" };

function Training({ account }: { account: number }) {
  const [n, setN] = useState(20);
  const [res, setRes] = useState<Resp | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<SkillId | null>(null);
  const [curve, setCurve] = useState<"nw" | "k" | "d" | "dmg">("nw");
  const [showCurve, setShowCurve] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const heroName = useHeroName();

  useEffect(() => { setRes(null); setSel(null); fetch(`/api/training?account=${account}&n=${n}`).then((r) => r.json()).then(setRes).catch(() => setErr(true)); }, [account, n]);
  const loadGoals = useCallback(() => fetch("/api/goals").then((r) => r.json()).then((j) => setGoals(j.goals ?? [])).catch(() => {}), []);
  useEffect(() => { loadGoals(); }, [loadGoals]);
  const addGoal = async (g: GoalSuggestion) => { const r = await fetch("/api/goals", { method: "POST", body: JSON.stringify(g) }); setGoals((await r.json()).goals ?? []); };
  const delGoal = async (id: string) => { const r = await fetch(`/api/goals?id=${id}`, { method: "DELETE" }); setGoals((await r.json()).goals ?? []); };

  if (err) return <Empty icon="alert" title="Analyse nicht verfügbar" />;
  if (!res) return <div className="grid gap-4"><div className="skeleton h-56" /><div className="skeleton h-40" /></div>;
  const { report: rep, view } = res;
  if (!rep.matches) return <Empty icon="target" title="Noch keine auswertbaren Matches" text="Sobald Match-Details geladen sind (mindestens 10 Minuten Spielzeit), erscheint hier deine Analyse." />;
  const pr = view.problem;
  const active = sel ?? pr?.skill ?? view.skills.find((s) => s.pct !== null)?.id ?? "lane";
  const skill = view.skills.find((s) => s.id === active) as SkillView;
  const details: Focus[] = rep.focus.filter((f) => skill.focusIds.includes(f.id));
  const series = rep.curves.find((c) => c.key === curve);
  const maxH = Math.max(1, ...rep.deaths.histogram);
  const hasGoal = (g: GoalSuggestion) => goals.some((x) => x.metric === g.metric);
  const open = goals.slice(-3);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mr-1">Zeitraum</span>
        {[10, 20, 40].map((v) => <button key={v} onClick={() => setN(v)} className={`btn ${n === v ? "btn-gold" : "btn-ghost"} px-3 py-1 text-xs`}>Letzte {v}</button>)}
        <span className="ml-auto text-xs text-muted">{rep.matches} Matches · Vergleich: {res.hasReference ? "Rang-Referenz + " : ""}die Besten deiner Lobbys (gleiche Rolle)</span>
      </div>

      {/* 1. Hauptproblem */}
      {pr ? (
        <section className="surface relative overflow-hidden p-6" style={{ borderColor: "#f0616d55", boxShadow: "0 0 60px -30px #f0616d" }}>
          <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#f0616d]"><Icon name="alert" size={14} />Dein Hauptproblem</div>
              <h2 className="display text-3xl font-extrabold leading-tight">{pr.headline}</h2>
              {pr.impact && <div className="mt-2 inline-block rounded-full bg-white/[0.07] px-3 py-1 text-sm text-muted">{pr.impact}</div>}
              <div className="mt-4 rounded-xl border border-[#3ecf8e]/30 bg-[#3ecf8e]/[0.06] p-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#3ecf8e]">Mach das im nächsten Match</div>
                <div className="text-base font-medium">{pr.action}</div>
              </div>
              {pr.goal && <button disabled={hasGoal(pr.goal)} onClick={() => addGoal(pr.goal!)} className="btn btn-gold mt-4 disabled:opacity-50"><Icon name="flag" size={15} /> {hasGoal(pr.goal) ? "Ziel gesetzt" : `Ziel setzen: ${pr.goal.label}`}</button>}
            </div>
            <div>
              <div className="label mb-3 !text-[10px]">{pr.figure.label}</div>
              <Bar label="Du" value={pr.figure.mine} ratio={Math.min(1, pr.figure.ratio)} color="#f0616d" />
              <Bar label={pr.figure.refLabel} value={pr.figure.ref} ratio={1} color="#3ecf8e" />
            </div>
          </div>
        </section>
      ) : (
        <section className="surface p-6" style={{ borderColor: "#3ecf8e55" }}><div className="flex items-center gap-3"><Icon name="check" size={22} className="text-[#3ecf8e]" /><div><div className="display text-xl font-bold">Keine große Schwäche erkennbar</div><div className="text-sm text-muted">Alle bewertbaren Fähigkeiten liegen bei mindestens 92 % der Besten deiner Lobbys. Setze dir ein Ziel, um weiter zu wachsen.</div></div></div></section>
      )}

      {/* 2. Scorecard */}
      <section>
        <div className="mb-2 flex items-baseline gap-3"><h3 className="label">Deine Fähigkeiten</h3><span className="text-xs text-muted">100 % = Niveau der Besten deiner Lobbys · Klick für Details</span></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {view.skills.map((s) => {
            const c = col(s.pct), weakest = pr?.skill === s.id;
            return (
              <button key={s.id} onClick={() => setSel(s.id)} disabled={s.pct === null} className={`surface surface-hover p-3.5 text-left transition disabled:opacity-40 ${active === s.id ? "ring-1 ring-white/40" : ""}`} style={weakest ? { borderColor: `${c}88` } : undefined}>
                <div className="flex items-center gap-2"><span style={{ color: c }}><Icon name={ICON[s.id] as never} size={16} /></span><span className="text-sm font-semibold">{s.label}</span>
                  {s.trend !== null && Math.abs(s.trend) >= 4 && <span className={`ml-auto flex items-center gap-0.5 text-[11px] font-bold ${s.trend > 0 ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}><Icon name={s.trend > 0 ? "trendUp" : "trendDown"} size={12} />{s.trend > 0 ? "+" : ""}{s.trend}</span>}</div>
                <div className="display num mt-1 text-3xl font-extrabold" style={{ color: c }}>{s.pct === null ? "–" : `${s.pct}`}<span className="text-base font-bold text-muted">{s.pct === null ? "" : " %"}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-white/[0.07]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, s.pct ?? 0)}%`, background: c }} /></div>
                <div className="mt-1.5 truncate text-[11px] text-muted">{s.line}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Detail zur gewählten Fähigkeit */}
      <section className="surface p-5">
        <div className="mb-3 flex items-center gap-2"><span style={{ color: col(skill.pct) }}><Icon name={ICON[skill.id] as never} size={18} /></span><h3 className="display text-xl font-bold">{skill.label}</h3><span className="text-sm text-muted">· {skill.line}</span></div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {details.length === 0 && <p className="text-sm text-muted">Hier gibt es aktuell nichts Auffälliges – deine Werte liegen nah an den Besten.</p>}
            {details.map((f) => (
              <div key={f.id}>
                <div className="font-semibold">{f.title}</div>
                <ul className="mt-1 space-y-0.5 text-sm text-muted">{f.evidence.map((e, k) => <li key={k}>· {e}</li>)}</ul>
                <ol className="mt-2 space-y-1.5 text-sm">{f.fix.map((e, k) => <li key={k} className="flex gap-2"><span className="num mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber/20 text-[10px] font-bold text-amber">{k + 1}</span>{e}</li>)}</ol>
              </div>
            ))}
          </div>
          <div>
            {(active === "farming" || active === "jungle") && rep.soulPlan && <SoulPlanPanel plan={rep.soulPlan} phases={rep.phaseRates} compact />}
            {(active === "survival" || active === "teamplay") && (
              <div>
                <div className="label mb-2 !text-[9px]">Wann du stirbst (je 5 Minuten)</div>
                <div className="flex items-end gap-2">
                  {rep.deaths.histogram.map((v, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1"><span className="num text-[10px] text-muted">{v}</span>
                      <div className="flex h-24 w-full items-end"><div className="w-full rounded-t bg-gradient-to-t from-[#f0616d]/50 to-[#f0616d]" style={{ height: `${(v / maxH) * 100}%`, minHeight: 3 }} /></div>
                      <span className="text-[10px] text-muted">{i * 5}′</span></div>
                  ))}
                </div>
                {rep.deaths.killers.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Tötet dich am häufigsten:</span>{rep.deaths.killers.map((k) => <span key={k.heroId} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] py-1 pl-1 pr-2 text-xs"><HeroPortrait id={k.heroId} size={22} variant="small" className="!rounded-md" />{heroName(k.heroId)} <b className="num">{k.count}×</b></span>)}</div>}
              </div>
            )}
            {active === "aim" && rep.aim && <AimPanel aim={rep.aim} />}
            {active === "lane" && rep.lane && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className={`display num text-3xl font-extrabold ${rep.lane.avgDiff >= 0 ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}>{rep.lane.avgDiff >= 0 ? "+" : ""}{Math.round(rep.lane.avgDiff)}</div><div className="text-xs text-muted">Ø Souls bei 8:00</div></div>
                <div><div className="display num text-3xl font-extrabold">{Math.round(rep.lane.winRate * 100)} %</div><div className="text-xs text-muted">Lanes gewonnen</div></div>
                <div><div className="display num text-3xl font-extrabold">{rep.lane.matches}</div><div className="text-xs text-muted">Matches</div></div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 4. Letztes Match */}
        {view.last && (
          <section className="surface p-5">
            <div className="mb-3 flex items-center gap-2"><HeroPortrait id={view.last.heroId} size={34} variant="small" className="!rounded-lg" /><h3 className="label mr-auto">Dein letztes Match im Check</h3><span className={`text-xs font-bold ${view.last.won ? "text-[#3ecf8e]" : "text-[#f0616d]"}`}>{view.last.won ? "Sieg" : "Niederlage"}</span></div>
            <ul className="space-y-1.5">{view.last.lines.map((l, i) => <li key={i} className="flex items-center gap-2.5 text-sm"><span className={l.tone === "good" ? "text-[#3ecf8e]" : "text-[#f0616d]"}><Icon name={l.tone === "good" ? "check" : "x"} size={15} /></span>{l.text}</li>)}</ul>
          </section>
        )}
        {/* 5. Ziele */}
        <section className="surface p-5">
          <h3 className="label mb-3">Fokus für dein nächstes Match</h3>
          {open.length === 0 ? <p className="text-sm text-muted">Noch kein Ziel. Setze oben beim Hauptproblem ein Ziel – gezählt werden Matches ab jetzt.</p> : (
            <div className="space-y-3">{open.map((g) => {
              const p = goalProgress(g, rep.metrics), mt = rep.metrics.find((m) => m.id === g.metric);
              return (
                <div key={g.id}>
                  <div className="flex items-center gap-2 text-sm"><span className={p.done ? "text-[#3ecf8e]" : "text-muted"}><Icon name={p.done ? "check" : "flag"} size={14} /></span><span className="font-medium">{mt?.label ?? g.metric} {g.lowerIsBetter ? "≤" : "≥"} {g.target}{mt?.unit ? ` ${mt.unit}` : ""}</span><span className="ml-auto text-xs text-muted">{p.hits}/{g.needed} · {p.played} gespielt</span>
                    <button aria-label="Ziel löschen" onClick={() => delGoal(g.id)} className="text-muted hover:text-white"><Icon name="x" size={14} /></button></div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${p.done ? "bg-[#3ecf8e]" : "bg-[#4aa3ff]"}`} style={{ width: `${p.pctDone * 100}%` }} /></div>
                </div>
              );
            })}</div>
          )}
        </section>
      </div>

      {/* 6. Verlauf */}
      <section className="surface p-5">
        <button onClick={() => setShowCurve((v) => !v)} className="flex w-full items-center gap-2 text-left"><h3 className="label mr-auto">Verlauf über die Spielzeit (Soll gegen Ist)</h3><span className="text-xs text-muted">{showCurve ? "einklappen" : "anzeigen"}</span><span className={`text-muted transition ${showCurve ? "rotate-90" : ""}`}><Icon name="chevron" size={14} /></span></button>
        {showCurve && (
          <div className="mt-3">
            <div className="mb-2 flex flex-wrap gap-2">{rep.curves.map((c) => <button key={c.key} onClick={() => setCurve(c.key)} className={`btn ${curve === c.key ? "btn-gold" : "btn-ghost"} px-3 py-1 text-xs`}>{c.label}</button>)}</div>
            {series && series.mine.length ? <CurveChart series={series} avgMinutes={30} /> : <p className="text-sm text-muted">Keine Zeitreihen vorhanden.</p>}
          </div>
        )}
      </section>
    </>
  );
}

function Bar({ label, value, ratio, color }: { label: string; value: string; ratio: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between"><span className="text-xs text-muted">{label}</span><span className="display num text-2xl font-extrabold" style={{ color }}>{value}</span></div>
      <div className="h-3 rounded-full bg-white/[0.07]"><div className="h-full rounded-full" style={{ width: `${Math.max(4, ratio * 100)}%`, background: color }} /></div>
    </div>
  );
}

export default function TrainingPage() {
  return (
    <Gate>
      {({ me }) => (<><PageTitle title="Training" sub="Was du falsch machst – in drei Sekunden erfasst" /><Training account={me.accountId} /></>)}
    </Gate>
  );
}
