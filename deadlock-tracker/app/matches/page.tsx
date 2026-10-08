"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { MatchRow } from "@/components/MatchRow";
import { MatchCard } from "@/components/MatchCard";
import { Icon } from "@/components/Icon";
import { GradeBadge } from "@/components/GradeBadge";
import { WinRing, useCountUp } from "@/components/charts";
import { useHeroName } from "@/components/GameAssets";
import { fmtDuration } from "@/lib/format";
import type { Grade } from "@/lib/types";
import type { MatchListItem } from "@/lib/view";

const dayKey = (t: number) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(t: number) {
  const d = new Date(t * 1000), today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  return diff === 0 ? "Heute" : diff === 1 ? "Gestern" : d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}
const GRADES: Grade[] = ["S", "A", "B", "C", "D", "F"];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function MatchesPage() {
  return <Gate>{({ me, data }) => <MatchesView account={me.accountId} matches={data.matches} />}</Gate>;
}

function MatchesView({ account, matches }: { account: number; matches: MatchListItem[] }) {
  const heroName = useHeroName();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<"all" | "win" | "loss">("all");
  const [mode, setMode] = useState("all");
  const [hero, setHero] = useState(0);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sort, setSort] = useState<"time" | "kda" | "score" | "kills">("time");
  const [view, setView] = useState<"list" | "grid">("list");
  const [limit, setLimit] = useState(40);
  const more = useRef<HTMLDivElement>(null);

  const modes = useMemo(() => [...new Set(matches.map((m) => m.matchMode).filter(Boolean))] as string[], [matches]);
  const heroes = useMemo(() => [...new Set(matches.map((m) => m.heroId))].sort((a, b) => heroName(a).localeCompare(heroName(b))), [matches, heroName]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const kda = (m: MatchListItem) => (m.kills + m.assists) / Math.max(1, m.deaths);
    const f = matches.filter((m) =>
      (result === "all" || (result === "win") === m.won) && (mode === "all" || m.matchMode === mode) && (!hero || m.heroId === hero) &&
      (!grades.length || (m.grade !== null && grades.includes(m.grade))) && (!needle || heroName(m.heroId).toLowerCase().includes(needle) || String(m.matchId).includes(needle)));
    if (sort === "kda") f.sort((a, b) => kda(b) - kda(a));
    if (sort === "score") f.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    if (sort === "kills") f.sort((a, b) => b.kills - a.kills);
    return f;
  }, [matches, result, mode, hero, grades, q, sort, heroName]);

  // Endloses Nachladen beim Scrollen
  useEffect(() => {
    const el = more.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setLimit((l) => l + 40); }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length, view]);
  useEffect(() => setLimit(40), [q, result, mode, hero, grades, sort, view]);

  const shown = filtered.slice(0, limit);
  const wins = filtered.filter((m) => m.won).length;
  const scores = filtered.map((m) => m.score).filter((x): x is number => x !== null);
  const kdaAll = (filtered.reduce((a, m) => a + m.kills + m.assists, 0)) / Math.max(1, filtered.reduce((a, m) => a + m.deaths, 0));
  const count = useCountUp(filtered.length);
  // Gewinnkurve: kumulierte Siege minus Niederlagen, älteste zuerst
  const curve = useMemo(() => { let v = 0; return [0, ...[...filtered].reverse().map((m) => (v += m.won ? 1 : -1))]; }, [filtered]);
  const toggleGrade = (g: Grade) => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  const active = result !== "all" || mode !== "all" || hero || grades.length || q;

  return (
    <>
      <PageTitle title="Matches" sub="Deine komplette Match-Historie – filtern, sortieren, vergleichen" />

      {/* Auswertung der aktuellen Auswahl */}
      <section className="surface relative overflow-hidden p-5">
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_1.3fr]">
          <WinRing value={filtered.length ? wins / filtered.length : 0} wins={wins} losses={filtered.length - wins} size={108} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Metric label="Matches" value={String(Math.round(count))} />
            <Metric label="KDA" value={kdaAll.toFixed(2)} />
            <Metric label="Ø Rating" value={scores.length ? avg(scores).toFixed(2) : "–"} />
            <Metric label="Ø Dauer" value={filtered.length ? fmtDuration(Math.round(avg(filtered.map((m) => m.durationS)))) : "–"} />
          </div>
          <div>
            <div className="label mb-1">Gewinnkurve <span className="normal-case tracking-normal">· Siege minus Niederlagen</span></div>
            <Curve values={curve} />
          </div>
        </div>
      </section>

      {/* Filterleiste */}
      <section className="surface sticky top-[68px] z-20 space-y-3 p-3 backdrop-blur-xl xl:top-[72px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Held oder Match-ID suchen …" className="input !rounded-full !py-2 pl-9" />
          </div>
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {([["all", "Alle"], ["win", "Siege"], ["loss", "Niederlagen"]] as const).map(([k, l]) => <button key={k} onClick={() => setResult(k)} className={`tab !py-1 ${result === k ? "tab-active" : ""}`}>{l}</button>)}
          </div>
          {modes.length > 1 && (
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="input !w-auto !py-2"><option value="all">Alle Modi</option>{modes.map((m) => <option key={m}>{m}</option>)}</select>
          )}
          <select value={hero} onChange={(e) => setHero(Number(e.target.value))} className="input !w-auto !py-2"><option value={0}>Alle Helden</option>{heroes.map((h) => <option key={h} value={h}>{heroName(h)}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input !w-auto !py-2">
            <option value="time">Neueste zuerst</option><option value="kda">Bestes KDA</option><option value="kills">Meiste Kills</option><option value="score">Beste Note</option>
          </select>
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button onClick={() => setView("list")} title="Liste" className={`tab !px-2.5 !py-1 ${view === "list" ? "tab-active" : ""}`}><Icon name="list" size={16} /></button>
            <button onClick={() => setView("grid")} title="Kacheln" className={`tab !px-2.5 !py-1 ${view === "grid" ? "tab-active" : ""}`}><Icon name="grid" size={16} /></button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1">Note</span>
          {GRADES.map((g) => (
            <button key={g} onClick={() => toggleGrade(g)} className={`rounded-lg p-0.5 transition ${grades.includes(g) ? "scale-110 ring-2 ring-white/60" : grades.length ? "opacity-40 hover:opacity-80" : "hover:scale-105"}`}><GradeBadge grade={g} size="xs" /></button>
          ))}
          {active ? <button onClick={() => { setQ(""); setResult("all"); setMode("all"); setHero(0); setGrades([]); }} className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-white"><Icon name="x" size={13} />Filter zurücksetzen</button> : <span className="ml-auto text-xs text-muted">{filtered.length} Treffer</span>}
        </div>
      </section>

      {filtered.length === 0 ? <Empty icon="search" title="Keine Matches" text="Mit diesen Filtern gibt es keine Treffer." /> : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map((m, i) => <MatchCard key={m.matchId} m={m} account={account} i={i} />)}</div>
      ) : (
        <section className="surface overflow-hidden">
          {shown.map((m, i) => {
            const newDay = sort === "time" && (i === 0 || dayKey(shown[i - 1].startTime) !== dayKey(m.startTime));
            const day = newDay ? filtered.filter((x) => dayKey(x.startTime) === dayKey(m.startTime)) : [];
            return (
              <div key={m.matchId}>
                {newDay && <DayHeader t={m.startTime} day={day} />}
                <MatchRow m={m} account={account} delay={Math.min(i, 12) * 25} />
              </div>
            );
          })}
        </section>
      )}
      <div ref={more} className="h-8 text-center text-xs text-muted">{filtered.length > limit ? "Lade weitere Matches …" : filtered.length > 40 ? "Ende der Liste" : ""}</div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="label !text-[9px]">{label}</div><div className="display num text-2xl font-extrabold">{value}</div></div>;
}

function DayHeader({ t, day }: { t: number; day: MatchListItem[] }) {
  const w = day.filter((m) => m.won).length;
  const sc = day.map((m) => m.score).filter((x): x is number => x !== null);
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.05] bg-white/[0.025] px-4 py-2">
      <Icon name="calendar" size={14} className="text-muted" />
      <span className="label !text-[11px]">{dayLabel(t)}</span>
      <div className="ml-2 flex h-1.5 w-28 gap-px overflow-hidden rounded-full">{[...day].reverse().map((m) => <span key={m.matchId} className="flex-1" style={{ background: m.won ? "#3ecf8e" : "#f0616d" }} />)}</div>
      <span className="num text-xs text-muted">{day.length} Matches · <b className="text-win">{w}S</b> <b className="text-loss">{day.length - w}N</b>{sc.length ? ` · Ø ${avg(sc).toFixed(2)}` : ""}</span>
    </div>
  );
}

function Curve({ values }: { values: number[] }) {
  if (values.length < 3) return <div className="flex h-16 items-center text-xs text-muted">Zu wenige Matches für eine Kurve.</div>;
  const W = 400, H = 64, lo = Math.min(...values), hi = Math.max(...values), span = Math.max(1, hi - lo);
  const x = (i: number) => (i / (values.length - 1)) * W, y = (v: number) => 6 + (1 - (v - lo) / span) * (H - 12);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const c = last >= 0 ? "#3ecf8e" : "#f0616d";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 64 }}>
      <defs><linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".35" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.18)" strokeDasharray="4 4" />
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#cv)" /><path d={d} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
    </svg>
  );
}
