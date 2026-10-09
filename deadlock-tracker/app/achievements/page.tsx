"use client";
import { useMemo, useState } from "react";
import { Gate, PageTitle } from "@/components/ui";
import { HoverCard } from "@/components/Popover";
import { Icon } from "@/components/Icon";
import { Medal } from "@/components/Medal";
import { CATEGORIES, evaluate, summarize, TIERS, type AchCategory, type AchState } from "@/lib/achievements";

export default function AchievementsPage() {
  return <Gate>{({ data }) => <View items={data.matches} ov={data.overview} />}</Gate>;
}

function View({ items, ov }: { items: Parameters<typeof evaluate>[0]; ov: Parameters<typeof evaluate>[1] }) {
  const states = useMemo(() => evaluate(items, ov), [items, ov]);
  const sum = useMemo(() => summarize(states), [states]);
  const [cat, setCat] = useState<AchCategory | "Alle">("Alle");
  const [only, setOnly] = useState<"all" | "open" | "done">("all");
  const shown = states.filter((s) => (cat === "Alle" || s.series.category === cat) && (only === "all" || (only === "done" ? s.tier > 0 : s.next !== null)))
    .sort((a, b) => (b.tier > 0 ? 1 : 0) - (a.tier > 0 ? 1 : 0) || b.progress - a.progress);
  const showcase = useMemo(() => [...states].filter((s) => s.tier > 0).sort((a, b) => b.tier - a.tier || b.progress - a.progress).slice(0, 6), [states]);
  const R = 52, circ = 2 * Math.PI * R;

  return (
    <>
      <PageTitle title="Erfolge" sub="Sammle Medaillen – jede Serie hat bis zu fünf Stufen von Bronze bis Diamant" />

      {/* Sammlung: Level, Punkte, nächste Ziele */}
      <section className="surface relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-amber/20 blur-[80px]" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[auto_1fr_1.2fr]">
          <div className="relative mx-auto h-[140px] w-[140px]">
            <svg viewBox="0 0 140 140" className="-rotate-90">
              <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
              <circle cx="70" cy="70" r={R} fill="none" stroke="url(#lvl)" strokeWidth="9" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - sum.levelProgress)} style={{ transition: "stroke-dashoffset 1s ease", filter: "drop-shadow(0 0 8px #f0b44c)" }} />
              <defs><linearGradient id="lvl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1c9" /><stop offset="1" stopColor="#f0b44c" /></linearGradient></defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="label !text-[9px]">Level</div><div className="display text-5xl font-extrabold text-gold-grad">{sum.level}</div></div>
          </div>
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-3">
            <Stat label="Erfolgspunkte" value={sum.points.toLocaleString("de-DE")} />
            <Stat label="Freigeschaltet" value={`${sum.unlocked} / ${sum.total}`} />
            <Stat label="Medaillen-Stufen" value={TIERS.map((t, i) => <span key={t.name} className="mr-2 inline-flex items-center gap-1 text-sm" style={{ color: t.color }}><span className="h-2 w-2 rotate-45" style={{ background: t.color }} />{states.filter((s) => s.tier > i).length}</span>)} />
          </div>
          <div>
            <div className="label mb-3">Als Nächstes</div>
            <div className="space-y-2.5">
              {sum.nextUp.length === 0 && <p className="text-sm text-muted">Spiele weiter – hier erscheinen deine nächsten Ziele.</p>}
              {sum.nextUp.map((s) => (
                <div key={s.series.key} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
                  <Medal icon={s.series.icon} tier={s.tier} size={52} maxTier={s.series.targets.length} pips={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.series.title} <span className="text-xs font-normal text-muted">· {TIERS[s.tier].name}</span></div>
                    <div className="truncate text-xs text-muted">{s.series.desc(s.next as number)}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber to-[#fff1c9]" style={{ width: `${s.progress * 100}%` }} /></div>
                  </div>
                  <div className="num text-right text-xs text-muted">{fmt(s.value)}<br />/ {fmt(s.next as number)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {showcase.length > 0 && (
        <section className="surface relative overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber/10 to-transparent" />
          <h2 className="label relative mb-3">Vitrine <span className="normal-case tracking-normal">· deine höchsten Medaillen</span></h2>
          <div className="relative flex flex-wrap justify-center gap-x-10 gap-y-4 sm:justify-between">
            {showcase.map((s) => (
              <div key={s.series.key} className="flex w-[104px] flex-col items-center text-center">
                <Medal icon={s.series.icon} tier={s.tier} size={84} maxTier={s.series.targets.length} />
                <div className="mt-2 text-sm font-bold leading-tight">{s.series.title}</div>
                <div className="text-[11px] font-semibold" style={{ color: TIERS[s.tier - 1].color }}>{TIERS[s.tier - 1].name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["Alle", ...CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`tab ${cat === c ? "tab-active" : ""}`}>{c}{c !== "Alle" && <span className="ml-1.5 text-[10px] text-muted">{states.filter((s) => s.series.category === c && s.tier > 0).length}/{states.filter((s) => s.series.category === c).length}</span>}</button>
        ))}
        <div className="ml-auto flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {([["all", "Alle"], ["done", "Freigeschaltet"], ["open", "Offen"]] as const).map(([k, l]) => <button key={k} onClick={() => setOnly(k)} className={`tab ${only === k ? "tab-active" : ""}`}>{l}</button>)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((s, i) => <Card key={s.series.key} s={s} i={i} />)}
      </div>
    </>
  );
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n * 10) / 10));

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="label !text-[9px]">{label}</div><div className="display text-2xl font-extrabold">{value}</div></div>;
}

function Card({ s, i }: { s: AchState; i: number }) {
  const done = s.next === null;
  return (
    <HoverCard width={300} content={
      <div className="space-y-2.5">
        <div className="flex items-center gap-2"><Icon name={s.series.icon} size={16} className="text-amber" /><b>{s.series.title}</b><span className="ml-auto text-[11px] text-muted">{s.series.category}</span></div>
        <div className="space-y-1.5">
          {s.series.targets.map((t, k) => (
            <div key={t} className="flex items-center gap-2 text-xs" style={{ opacity: s.tier > k ? 1 : 0.55 }}>
              <span className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: s.tier > k ? TIERS[k].color : "rgba(255,255,255,.18)" }} />
              <span className="w-14 font-semibold" style={{ color: TIERS[k].color }}>{TIERS[k].name}</span>
              <span className="flex-1 text-muted">{s.series.desc(t)}</span>
              {s.tier > k && <Icon name="check" size={13} className="text-win" />}
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-2 text-xs text-muted">Aktueller Wert: <b className="num text-white">{fmt(s.value)}</b>{s.next !== null && <> · nächste Stufe bei <b className="num text-white">{fmt(s.next)}</b></>}</div>
      </div>}>
      <div className="surface surface-hover fade-up relative flex w-full cursor-help flex-col items-center p-4 text-center" style={{ animationDelay: `${Math.min(i, 14) * 40}ms`, boxShadow: s.tier > 0 ? `0 0 0 1px ${TIERS[s.tier - 1].color}33` : undefined, opacity: s.tier === 0 && s.progress === 0 ? 0.75 : 1 }}>
        {s.tier > 0 && <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: TIERS[s.tier - 1].color, background: `${TIERS[s.tier - 1].color}1f` }}>{TIERS[s.tier - 1].name}</span>}
        <div className="pt-2"><Medal icon={s.series.icon} tier={s.tier} size={92} maxTier={s.series.targets.length} /></div>
        <div className="display mt-3 font-bold">{s.series.title}</div>
        <div className="mt-0.5 min-h-[2rem] text-xs leading-snug text-muted">{done ? "Alle Stufen geschafft" : s.series.desc(s.next as number)}</div>
        {!done && (
          <div className="mt-2 w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(s.progress > 0 ? 4 : 0, s.progress * 100)}%`, background: `linear-gradient(90deg, ${TIERS[Math.min(s.tier, 4)].color}88, ${TIERS[Math.min(s.tier, 4)].color})` }} /></div>
            <div className="num mt-1 flex justify-between text-[11px] text-muted"><span>{fmt(s.value)}</span><span>{fmt(s.next as number)}</span></div>
          </div>
        )}
      </div>
    </HoverCard>
  );
}
