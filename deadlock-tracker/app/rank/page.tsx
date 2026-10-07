"use client";
import { useEffect, useMemo, useState } from "react";
import { Empty, Gate, PageTitle } from "@/components/ui";
import { RankEmblem, TIER_COLORS } from "@/components/GameAssets";
import { RankChart } from "@/components/RankChart";
import { NavLink } from "@/components/NavLink";
import { badgeToLinear, formatBadge, tierOf, TIER_NAMES } from "@/lib/ranks";
import { byLobbyStrength } from "@/lib/profile";
import type { MatchListItem, Overview } from "@/lib/view";

interface Dist { rows: { badge: number; players: number }[]; percentile: number | null; error?: string }

export default function RankPage() {
  return <Gate>{({ data }) => <RankView ov={data.overview} matches={data.matches} />}</Gate>;
}

function RankView({ ov, matches }: { ov: Overview; matches: MatchListItem[] }) {
  const hist = ov.rankHistory;
  const [dist, setDist] = useState<Dist | null>(null);
  useEffect(() => {
    if (!ov.currentBadge) return;
    fetch(`/api/rank-distribution?badge=${ov.currentBadge}`).then((r) => r.json()).then(setDist).catch(() => setDist({ rows: [], percentile: null, error: "nicht verfügbar" }));
  }, [ov.currentBadge]);

  const peak = hist.reduce((m, r) => Math.max(m, r.badge), 0) || null;
  const first = hist[0]?.badge, lastB = hist[hist.length - 1]?.badge;
  const delta = first && lastB ? (badgeToLinear(lastB) ?? 0) - (badgeToLinear(first) ?? 0) : 0;
  const ranked = matches.filter((m) => m.matchMode === "Ranked");
  const wr = ranked.length ? ranked.filter((m) => m.won).length / ranked.length : null;
  const wins = hist.filter((h) => h.won && h.delta !== null), losses = hist.filter((h) => !h.won && h.delta !== null);
  const avg = (xs: { delta: number | null }[]) => (xs.length ? xs.reduce((a, x) => a + (x.delta ?? 0), 0) / xs.length : null);
  const changes = useMemo(() => hist.map((h, i) => ({ h, prev: hist[i - 1] })).filter((x) => x.prev && x.prev.badge !== x.h.badge).slice(-8).reverse(), [hist]);
  const tierDist = useMemo(() => {
    if (!dist?.rows.length) return [];
    const t = Array.from({ length: 11 }, (_, i) => ({ tier: i + 1, n: 0 }));
    for (const r of dist.rows) { const k = tierOf(r.badge); if (t[k - 1]) t[k - 1].n += r.players; }
    return t;
  }, [dist]);
  const maxN = Math.max(1, ...tierDist.map((t) => t.n));
  const lobbyBuckets = byLobbyStrength(matches);

  return (
    <>
      <PageTitle title="Rang" sub="Dein Rangverlauf, Einordnung unter allen Spielern und Fortschritt pro Match" />
      <section className="surface sheen relative overflow-hidden p-6">
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_1fr_1fr_1fr]">
          <div className="float justify-self-center"><RankEmblem badge={ov.currentBadge} size={150} /></div>
          <Stat label="Aktuell" value={ov.currentBadge ? formatBadge(ov.currentBadge) : "Kein Rang"} sub={ov.currentBadge ? undefined : "Nur Ranked-Matches tragen einen Rang"} />
          <Stat label="Peak" value={peak ? formatBadge(peak) : "–"} />
          <Stat label="Verlauf" value={`${delta > 0 ? "+" : ""}${delta} Stufen`} color={delta > 0 ? "#3ecf8e" : delta < 0 ? "#f0616d" : undefined} sub="seit dem ältesten getrackten Match" />
          <Stat label="Ranked-Winrate" value={wr === null ? "–" : `${Math.round(wr * 100)}%`} sub={`${ranked.length} Ranked-Matches`} color={wr === null ? undefined : wr >= 0.5 ? "#3ecf8e" : "#f0616d"} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="surface p-5">
          <h2 className="label mb-3">Rangverlauf <span className="normal-case tracking-normal">· Punkte = Match-Ergebnis</span></h2>
          {hist.length ? <RankChart points={hist} /> : <Empty title="Noch kein Rangverlauf" text="Ranked-Matches liefern den Rang nach dem Spiel; sie erscheinen hier automatisch." />}
        </section>
        <section className="surface p-5">
          <h2 className="label mb-3">Einordnung</h2>
          {dist?.percentile != null ? (
            <>
              <div className="display text-4xl font-extrabold"><span className="text-gold-grad">Top {Math.max(1, Math.round(100 - dist.percentile))}%</span></div>
              <p className="mb-4 text-xs text-muted">aller Ranked-Spieler (letzte 30 Tage)</p>
              <div className="flex h-28 items-end gap-1">
                {tierDist.map((t) => (
                  <div key={t.tier} className="flex flex-1 flex-col items-center gap-1" title={`${TIER_NAMES[t.tier]}: ${t.n.toLocaleString("de-DE")} Spieler`}>
                    <div className="w-full rounded-t" style={{ height: `${(t.n / maxN) * 80 + 4}px`, background: TIER_COLORS[t.tier], opacity: tierOf(ov.currentBadge) === t.tier ? 1 : 0.4, boxShadow: tierOf(ov.currentBadge) === t.tier ? `0 0 14px ${TIER_COLORS[t.tier]}` : undefined }} />
                    <span className="text-[9px] text-muted">{t.tier}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted">{ov.currentBadge ? (dist?.error ? "Verteilung gerade nicht verfügbar." : "Lade Verteilung …") : "Sobald du einen Ranked-Rang hast, siehst du hier deine Einordnung."}</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="surface p-5">
          <h2 className="label mb-3">Rang-Punkte pro Match</h2>
          {wins.length + losses.length ? (
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-sm text-muted">Ø pro Sieg</span><b className="num text-win">+{Math.round(avg(wins) ?? 0)}</b></div>
              <div className="flex justify-between"><span className="text-sm text-muted">Ø pro Niederlage</span><b className="num text-loss">{Math.round(avg(losses) ?? 0)}</b></div>
              <p className="text-[11px] text-muted">Eine Division umfasst 1000 Punkte.</p>
            </div>
          ) : <p className="text-sm text-muted">Die API liefert Rang-Punkte nur für Ranked-Matches.</p>}
        </section>
        <section className="surface p-5">
          <h2 className="label mb-3">Letzte Rangänderungen</h2>
          {changes.length ? <div className="space-y-2">{changes.map(({ h, prev }) => {
            const up = (badgeToLinear(h.badge) ?? 0) > (badgeToLinear(prev!.badge) ?? 0);
            return (<NavLink key={h.matchId} href={`/match/${h.matchId}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/[0.05]">
              <span className={up ? "text-win" : "text-loss"}>{up ? "▲" : "▼"}</span><span className="flex-1">{formatBadge(prev!.badge)} → <b>{formatBadge(h.badge)}</b></span>
              <span className="text-xs text-muted">{new Date(h.t * 1000).toLocaleDateString("de-DE")}</span></NavLink>);
          })}</div> : <p className="text-sm text-muted">Noch keine Rangwechsel erfasst.</p>}
        </section>
        <section className="surface p-5">
          <h2 className="label mb-3">Gegen wen spielst du?</h2>
          <div className="space-y-3">{lobbyBuckets.map((b) => (
            <div key={b.label}><div className="mb-1 flex justify-between text-xs"><span>{b.label}</span><span className="num text-muted">{b.n ? `${Math.round((b.wins / b.n) * 100)}% · ${b.n}×` : "–"}</span></div>
              <div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${b.n ? (b.wins / b.n) * 100 : 0}%`, background: "linear-gradient(90deg,#1d8a5c,#3ecf8e)" }} /></div></div>
          ))}</div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return <div><div className="label">{label}</div><div className="display text-2xl font-extrabold md:text-3xl" style={{ color }}>{value}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>;
}
