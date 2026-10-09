"use client";
import { Gate } from "@/components/ui";
import { PlayerCard } from "@/components/PlayerCard";
import { LiveBanner } from "@/components/LiveBanner";
import { StatStrip } from "@/components/StatStrip";
import { MatchRow } from "@/components/MatchRow";
import { NavLink } from "@/components/NavLink";
import { RankEmblem } from "@/components/GameAssets";
import { PerformanceCard } from "@/components/PerformanceCard";
import { InsightsCard, RadarCard, RecordsCard, SessionCard } from "@/components/widgets";
import { Icon } from "@/components/Icon";
import { HeroTile } from "@/components/HeroTile";
import { useData, useSettings, useTracker } from "@/components/Providers";
import { formatBadge } from "@/lib/ranks";

export default function OverviewPage() {
  const { removePlayer } = useTracker();
  const { live } = useData();
  const { settings } = useSettings();
  return (
    <Gate>
      {({ me, data }) => (
        <>
          <PlayerCard name={me.name} avatar={me.avatar} accountId={me.accountId} ov={data.overview} items={data.matches}
            onRemove={() => confirm(`${me.name} nicht mehr tracken?`) && removePlayer(me.accountId)} />
          {me.lastSyncOk === false && (
            <div className="surface border-loss/40 p-3 text-sm text-loss">Sync-Fehler: {me.lastError}. Der Tracker versucht es automatisch erneut – erkannte Matches bleiben erhalten.</div>
          )}
          {live && settings.showLive && <LiveBanner match={live} accountId={me.accountId} />}
          <StatStrip ov={data.overview} items={data.matches} />

          {/* Zeile 1: Session & Erkenntnisse | Matches | Rang & Radar – alle Spalten gleich hoch */}
          <div className="grid items-stretch gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
            <div className="order-2 flex flex-col gap-5 xl:order-1">
              <SessionCard items={data.matches} />
              <InsightsCard items={data.matches} className="flex-1" />
            </div>
            <section className="surface order-1 flex flex-col overflow-hidden xl:order-2">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <h2 className="display text-lg font-bold">Letzte Matches</h2>
                <NavLink href="/matches" className="flex items-center gap-1 text-sm text-amber hover:underline">Alle Matches<Icon name="arrowRight" size={14} /></NavLink>
              </div>
              {data.matches.length === 0 && <div className="p-10 text-center text-muted">Noch keine Matches gefunden.</div>}
              <div className="flex-1">{data.matches.slice(0, 7).map((m, i) => <MatchRow key={m.matchId} m={m} account={me.accountId} delay={i * 50} />)}</div>
            </section>
            <div className="order-3 flex flex-col gap-5">
              <NavLink href="/rank" className="surface surface-hover sheen block p-5">
                <div className="label">Rang</div>
                <div className="mt-3 flex items-center gap-4">
                  <RankEmblem badge={data.overview.currentBadge} size={72} />
                  <div>
                    <div className="display text-2xl font-extrabold leading-tight">{data.overview.currentBadge ? formatBadge(data.overview.currentBadge) : "Kein Rang"}</div>
                    <div className="text-xs text-muted">{data.overview.currentBadge ? "Verlauf & Einordnung ansehen" : "Nur Ranked-Matches tragen einen Rang"}</div>
                  </div>
                </div>
              </NavLink>
              <RadarCard items={data.matches} className="flex-1" />
            </div>
          </div>

          {/* Zeile 2: gleiche Spaltenbreiten wie oben */}
          <div className="grid items-stretch gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
            <RecordsCard items={data.matches} />
            <PerformanceCard items={data.matches} />
            <section className="surface flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="label">Top-Helden</h2><NavLink href="/heroes" className="flex items-center gap-1 text-xs text-amber hover:underline">Alle<Icon name="arrowRight" size={12} /></NavLink></div>
              <div className="flex flex-1 flex-col justify-between gap-3">{data.heroes.slice(0, 3).map((h) => <HeroTile key={h.heroId} h={h} />)}</div>
            </section>
          </div>
        </>
      )}
    </Gate>
  );
}
