"use client";
import { useCallback, useState } from "react";
import { GradeBadge, GRADE_STYLE } from "./GradeBadge";
import { HeroBackdrop, HeroPortrait, RankEmblem, useHero, useHeroName } from "./GameAssets";
import { NavLink } from "./NavLink";
import { useInterval } from "./useTracker";
import { FeedTab } from "./match/FeedTab";
import { GraphTab } from "./match/GraphTab";
import { ItemsTab } from "./match/ItemsTab";
import { LaneTab } from "./match/LaneTab";
import { OverviewTab } from "./match/OverviewTab";
import { RatingHint } from "./match/RatingExplainer";
import { TEAMS } from "./match/Scoreboard";
import { fmtDuration } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import type { MatchDetails, Rating } from "@/lib/types";

interface Res {
  matchId: number;
  details: MatchDetails | null;
  ratings: Record<number, Rating | null>;
  lobbyBadge: number | null;
  pending: boolean;
  attempts: number;
  lastError: string | null;
  history: Record<string, { heroId: number; kills: number; deaths: number; assists: number; won: boolean; durationS: number }>;
}

const TABS = [
  { key: "overview", label: "Übersicht" },
  { key: "lane", label: "Lane" },
  { key: "graphs", label: "Verlauf" },
  { key: "items", label: "Items" },
  { key: "feed", label: "Ereignisse" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function MatchView({ matchId, account }: { matchId: number; account: number }) {
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/matches/${matchId}?account=${account}`);
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      setRes(await r.json());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [matchId, account]);
  useInterval(() => { if (!res || res.pending) load(); }, 8000);

  const back = <NavLink href="/matches" className="btn btn-ghost !w-fit !px-3 !py-1.5 text-xs">← Alle Matches</NavLink>;
  if (err) return <div className="space-y-4">{back}<div className="surface p-6 text-loss">{err}</div></div>;
  if (!res) return <>{back}<div className="skeleton h-56" /><div className="skeleton h-80" /></>;
  if (!res.details) return <Pending res={res} account={account} back={back} />;
  return <Summary res={res} d={res.details} account={account} back={back} />;
}

function Pending({ res, account, back }: { res: Res; account: number; back: React.ReactNode }) {
  const mine = res.history[String(account)];
  const heroName = useHeroName();
  const { color } = useHero(mine?.heroId);
  return (
    <>
      {back}
      <section className="surface relative overflow-hidden p-8" style={{ boxShadow: `0 0 0 1px ${color}33` }}>
        <HeroBackdrop id={mine?.heroId} />
        <div className="relative flex flex-wrap items-center gap-6">
          {mine && <HeroPortrait id={mine.heroId} size={96} ring={color} />}
          <div>
            <div className="label">Match #{res.matchId} erkannt</div>
            <h1 className="display text-3xl font-extrabold">{mine ? heroName(mine.heroId) : "Match"}</h1>
            {mine && <p className="num mt-1 text-lg">{mine.kills} / {mine.deaths} / {mine.assists} · <span className={mine.won ? "text-win" : "text-loss"}>{mine.won ? "Sieg" : "Niederlage"}</span></p>}
          </div>
          <div className="ml-auto max-w-sm text-sm text-muted">
            <div className="flex items-center gap-3"><span className="live-dot" /> Beide Teams, Ränge und Rating werden geladen … (Versuch {res.attempts + 1})</div>
            {res.lastError && <div className="mt-1 text-xs">Status: {res.lastError}. Valve stellt die Details meist erst einige Minuten nach Spielende bereit.</div>}
          </div>
        </div>
      </section>
      <div className="skeleton h-72" />
    </>
  );
}

function Summary({ res, d, account, back }: { res: Res; d: MatchDetails; account: number; back: React.ReactNode }) {
  const heroName = useHeroName();
  const [tab, setTab] = useState<TabKey>("overview");
  const me = d.players.find((p) => p.accountId === account);
  const rating = res.ratings[account] ?? null;
  const won = !!me && d.winningTeam === me.team;
  const draw = d.winningTeam === null;
  const { color } = useHero(me?.heroId);
  const resultColor = !me || draw ? "#8b94a8" : won ? "#3ecf8e" : "#f0616d";

  return (
    <>
      {back}
      <section className="surface relative overflow-hidden" style={{ boxShadow: `0 0 0 1px ${resultColor}33, 0 30px 60px -30px ${resultColor}44` }}>
        <HeroBackdrop id={me?.heroId} />
        <div className="relative grid items-center gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:p-8">
          <div className="flex items-center gap-5">
            <GradeBadge grade={rating?.grade ?? null} size="xl" />
            {me && <HeroPortrait id={me.heroId} size={120} h={150} ring={color} className="!rounded-2xl" />}
          </div>
          <div className="min-w-0">
            <div className="display text-sm font-extrabold uppercase tracking-[0.3em]" style={{ color: resultColor }}>{!me ? "Match" : draw ? "Unentschieden" : won ? "Sieg" : "Niederlage"}</div>
            <h1 className="display text-4xl font-extrabold tracking-tight">{me ? heroName(me.heroId) : `Match #${d.matchId}`}</h1>
            {me && (
              <p className="num mt-1 text-2xl font-semibold">
                {me.kills} <span className="text-muted">/</span> <span className="text-loss">{me.deaths}</span> <span className="text-muted">/</span> {me.assists}
                <span className="ml-3 text-sm font-normal text-muted">{((me.kills + me.assists) / Math.max(1, me.deaths)).toFixed(2)} KDA</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip">⏱ {fmtDuration(d.durationS)}</span>
              {d.matchMode && <span className="chip">{d.matchMode}</span>}
              <span className="chip">{new Date(d.startTime * 1000).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span className="chip text-muted">#{d.matchId}</span>
              {rating && <span className="chip" style={{ borderColor: GRADE_STYLE[rating.grade].glow }}>{GRADE_STYLE[rating.grade].label} · Score {rating.score.toFixed(2)}<RatingHint rating={rating} who="Du" /></span>}
              {me?.mvpRank === 1 && <span className="chip text-amber">★ MVP</span>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-center backdrop-blur">
            <div className="label">Ø Lobby-Rang</div>
            <div className="mt-2 flex justify-center"><RankEmblem badge={res.lobbyBadge} size={72} /></div>
            <div className="display mt-1 text-lg font-bold">{res.lobbyBadge ? formatBadge(res.lobbyBadge) : "Unbekannt"}</div>
            <div className="mt-1 flex justify-center gap-3 text-[11px] text-muted">
              <span style={{ color: TEAMS[0].color }}>{d.avgBadge[0] ? formatBadge(d.avgBadge[0]) : "–"}</span><span>vs</span>
              <span style={{ color: TEAMS[1].color }}>{d.avgBadge[1] ? formatBadge(d.avgBadge[1]) : "–"}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="relative flex gap-1 overflow-x-auto border-b border-white/[0.08]">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`relative px-4 py-3 text-sm font-semibold transition ${tab === t.key ? "text-white" : "text-muted hover:text-white"}`}>
            {t.label}
            {tab === t.key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-gradient-to-r from-amber to-[#fff1c9] shadow-[0_0_10px_#f0b44c]" />}
          </button>
        ))}
      </div>

      <div key={tab} className="page-enter">
        {tab === "overview" && <OverviewTab d={d} account={account} ratings={res.ratings} lobbyBadge={res.lobbyBadge} />}
        {tab === "lane" && <LaneTab d={d} account={account} />}
        {tab === "graphs" && <GraphTab d={d} account={account} />}
        {tab === "items" && <ItemsTab d={d} account={account} />}
        {tab === "feed" && <FeedTab d={d} account={account} />}
      </div>
    </>
  );
}
