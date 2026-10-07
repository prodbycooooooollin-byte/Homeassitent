"use client";
import { useMemo, useState } from "react";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { MatchRow } from "@/components/MatchRow";
import { useHeroName } from "@/components/GameAssets";
import type { MatchListItem } from "@/lib/view";

const dayKey = (t: number) => new Date(t * 1000).toDateString();
function dayLabel(t: number) {
  const d = new Date(t * 1000), today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  return diff === 0 ? "Heute" : diff === 1 ? "Gestern" : d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

export default function MatchesPage() {
  return <Gate>{({ me, data }) => <MatchesView account={me.accountId} matches={data.matches} />}</Gate>;
}

function MatchesView({ account, matches }: { account: number; matches: MatchListItem[] }) {
  const heroName = useHeroName();
  const [result, setResult] = useState<"all" | "win" | "loss">("all");
  const [mode, setMode] = useState("all");
  const [hero, setHero] = useState(0);
  const [sort, setSort] = useState<"time" | "kda" | "score">("time");
  const [limit, setLimit] = useState(30);

  const modes = useMemo(() => [...new Set(matches.map((m) => m.matchMode).filter(Boolean))] as string[], [matches]);
  const heroes = useMemo(() => [...new Set(matches.map((m) => m.heroId))].sort((a, b) => heroName(a).localeCompare(heroName(b))), [matches, heroName]);
  const filtered = useMemo(() => {
    const f = matches.filter((m) => (result === "all" || (result === "win") === m.won) && (mode === "all" || m.matchMode === mode) && (!hero || m.heroId === hero));
    const kda = (m: MatchListItem) => (m.kills + m.assists) / Math.max(1, m.deaths);
    if (sort === "kda") f.sort((a, b) => kda(b) - kda(a));
    if (sort === "score") f.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return f;
  }, [matches, result, mode, hero, sort]);

  const shown = filtered.slice(0, limit);
  const wins = filtered.filter((m) => m.won).length;
  return (
    <>
      <PageTitle title="Matches" sub={`${filtered.length} Matches · ${wins} Siege (${filtered.length ? Math.round((wins / filtered.length) * 100) : 0}%)`} />
      <div className="surface flex flex-wrap items-center gap-3 p-3">
        <div className="flex gap-1">
          {([["all", "Alle"], ["win", "Siege"], ["loss", "Niederlagen"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setResult(k); setLimit(30); }} className={`tab ${result === k ? "tab-active" : ""}`}>{l}</button>
          ))}
        </div>
        {modes.length > 1 && (
          <select value={mode} onChange={(e) => { setMode(e.target.value); setLimit(30); }} className="input !w-auto !py-1.5">
            <option value="all">Alle Modi</option>{modes.map((m) => <option key={m}>{m}</option>)}
          </select>
        )}
        <select value={hero} onChange={(e) => { setHero(Number(e.target.value)); setLimit(30); }} className="input !w-auto !py-1.5">
          <option value={0}>Alle Helden</option>{heroes.map((h) => <option key={h} value={h}>{heroName(h)}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted">Sortierung
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input !w-auto !py-1.5">
            <option value="time">Neueste</option><option value="kda">Bestes KDA</option><option value="score">Beste Note</option>
          </select>
        </div>
      </div>
      {filtered.length === 0 ? <Empty title="Keine Matches" text="Mit diesen Filtern gibt es keine Treffer." /> : (
        <section className="surface overflow-hidden">
          {shown.map((m, i) => (
            <div key={m.matchId}>
              {sort === "time" && (i === 0 || dayKey(shown[i - 1].startTime) !== dayKey(m.startTime)) && (
                <div className="label border-b border-white/[0.05] bg-white/[0.02] px-4 py-2">{dayLabel(m.startTime)}</div>
              )}
              <MatchRow m={m} account={account} delay={Math.min(i, 12) * 25} />
            </div>
          ))}
          {filtered.length > limit && (
            <button onClick={() => setLimit((l) => l + 30)} className="w-full py-3.5 text-sm text-muted transition hover:bg-white/[0.04] hover:text-white">Mehr laden ({filtered.length - limit} weitere)</button>
          )}
        </section>
      )}
    </>
  );
}
