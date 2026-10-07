"use client";
import { useEffect, useState } from "react";
import { Empty, PageTitle } from "@/components/ui";
import { HeroPortrait, RankEmblem } from "@/components/GameAssets";

interface Row { rank: number; name: string; heroIds: number[]; badge?: number }
const REGIONS = [["Europe", "Europa"], ["NAmerica", "Nordamerika"], ["Asia", "Asien"], ["SAmerica", "Südamerika"], ["Oceania", "Ozeanien"]] as const;

export default function LeaderboardPage() {
  const [region, setRegion] = useState("Europe");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null); setErr(null);
    fetch(`/api/leaderboard?region=${region}`).then((r) => r.json()).then((j) => { setRows(j.rows ?? []); if (j.error) setErr(j.error); }).catch((e) => { setRows([]); setErr(String(e)); });
  }, [region]);
  return (
    <>
      <PageTitle title="Bestenliste" sub="Ranked-Leaderboard · wird von Valve stündlich aktualisiert" right={
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {REGIONS.map(([k, l]) => <button key={k} onClick={() => setRegion(k)} className={`tab ${region === k ? "tab-active" : ""}`}>{l}</button>)}
        </div>} />
      {rows === null && <div className="skeleton h-[480px]" />}
      {rows !== null && !rows.length && <Empty title="Bestenliste nicht verfügbar" text={err ?? "Für diese Region gibt es gerade keine Einträge."} />}
      {rows !== null && rows.length > 0 && (
        <section className="surface overflow-hidden">
          {rows.slice(0, 100).map((r, i) => (
            <div key={r.rank + r.name} className="fade-up flex items-center gap-4 border-b border-white/[0.04] px-4 py-2.5 transition hover:bg-white/[0.04]" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
              <span className="display w-10 text-center text-xl font-extrabold" style={{ color: r.rank === 1 ? "#f0b44c" : r.rank === 2 ? "#cfd6e4" : r.rank === 3 ? "#cf8a57" : "#8b94a8" }}>{r.rank}</span>
              {r.badge ? <RankEmblem badge={r.badge} size={32} /> : null}
              <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
              <div className="flex gap-1">{r.heroIds.map((h, k) => <HeroPortrait key={k} id={h} size={32} variant="small" className="!rounded-lg" />)}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
