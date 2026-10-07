"use client";
import { useEffect, useState } from "react";
import { Empty, PageTitle } from "@/components/ui";
import { Avatar, RankEmblem } from "@/components/GameAssets";
import { useTracker } from "@/components/Providers";
import { formatBadge } from "@/lib/ranks";
import type { Overview } from "@/lib/view";

const ROWS: { label: string; get: (o: Overview) => number | null; fmt: (v: number) => string; higher?: boolean }[] = [
  { label: "Matches", get: (o) => o.matches, fmt: (v) => String(v) },
  { label: "Winrate", get: (o) => o.winrate, fmt: (v) => `${Math.round(v * 100)}%` },
  { label: "KDA", get: (o) => o.kda, fmt: (v) => v.toFixed(2) },
  { label: "Ø Rating", get: (o) => o.avgScore, fmt: (v) => v.toFixed(2) },
  { label: "Siege", get: (o) => o.wins, fmt: (v) => String(v) },
];

export default function ComparePage() {
  const { status, account } = useTracker();
  const players = status?.players ?? [];
  const [other, setOther] = useState<number | null>(null);
  const [a, setA] = useState<Overview | null>(null);
  const [b, setB] = useState<Overview | null>(null);
  useEffect(() => { if (other === null && players.length > 1) setOther(players.find((p) => p.accountId !== account)?.accountId ?? null); }, [players, account, other]);
  useEffect(() => { if (account) fetch(`/api/matches?account=${account}`).then((r) => r.json()).then((j) => setA(j.overview)).catch(() => {}); }, [account]);
  useEffect(() => { if (other) fetch(`/api/matches?account=${other}`).then((r) => r.json()).then((j) => setB(j.overview)).catch(() => {}); }, [other]);
  const pa = players.find((p) => p.accountId === account), pb = players.find((p) => p.accountId === other);

  if (players.length < 2) return (<><PageTitle title="Vergleich" sub="Zwei getrackte Spieler direkt gegenüberstellen" /><Empty icon="⇄" title="Mindestens zwei Accounts nötig" text="Füge über die Suche oben einen Freund oder Rivalen hinzu – dann siehst du hier, wer die Nase vorn hat." /></>);
  return (
    <>
      <PageTitle title="Vergleich" sub="Wer ist besser? Direkter Vergleich zweier getrackter Spieler"
        right={<select value={other ?? ""} onChange={(e) => setOther(Number(e.target.value))} className="input !w-auto !py-1.5">{players.filter((p) => p.accountId !== account).map((p) => <option key={p.accountId} value={p.accountId}>{p.name}</option>)}</select>} />
      {pa && pb && a && b && (
        <section className="surface overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-6">
            {[{ p: pa, o: a }, null, { p: pb, o: b }].map((x, i) => x ? (
              <div key={i} className="flex flex-col items-center gap-2 text-center"><Avatar src={x.p.avatar} name={x.p.name} size={80} /><div className="display text-2xl font-extrabold">{x.p.name}</div>
                <RankEmblem badge={x.o.currentBadge} size={56} label /></div>
            ) : <div key={i} className="display text-4xl text-muted">VS</div>)}
          </div>
          {ROWS.map((r) => {
            const va = r.get(a), vb = r.get(b);
            const wa = va !== null && vb !== null && va > vb, wb = va !== null && vb !== null && vb > va;
            const total = (va ?? 0) + (vb ?? 0) || 1;
            return (
              <div key={r.label} className="border-t border-white/[0.05] px-6 py-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className={`display num text-xl font-bold ${wa ? "text-amber" : ""}`}>{va === null ? "–" : r.fmt(va)}</span>
                  <span className="label">{r.label}</span>
                  <span className={`display num text-xl font-bold ${wb ? "text-sapphire" : ""}`}>{vb === null ? "–" : r.fmt(vb)}</span>
                </div>
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full"><div style={{ width: `${((va ?? 0) / total) * 100}%`, background: "linear-gradient(90deg,#b8741a,#f0b44c)" }} /><div style={{ width: `${((vb ?? 0) / total) * 100}%`, background: "linear-gradient(90deg,#4aa3ff,#2a62b8)" }} /></div>
              </div>
            );
          })}
          <div className="border-t border-white/[0.05] px-6 py-3 text-center text-xs text-muted">{a.currentBadge && b.currentBadge ? `${formatBadge(a.currentBadge)} vs ${formatBadge(b.currentBadge)}` : ""}</div>
        </section>
      )}
    </>
  );
}
