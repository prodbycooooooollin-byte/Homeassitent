"use client";
import { Gate } from "@/components/ui";
import { PlayerCard } from "@/components/PlayerCard";
import { LiveBanner } from "@/components/LiveBanner";
import { StatStrip } from "@/components/StatStrip";
import { MatchRow } from "@/components/MatchRow";
import { NavLink } from "@/components/NavLink";
import { RankEmblem } from "@/components/GameAssets";
import { HeroTile } from "@/components/HeroTile";
import { FormDots, Sparkline } from "@/components/charts";
import { useData, useTracker } from "@/components/Providers";
import { formatBadge } from "@/lib/ranks";

export default function OverviewPage() {
  const { removePlayer } = useTracker();
  const { live } = useData();
  return (
    <Gate>
      {({ me, data }) => (
        <>
          <PlayerCard name={me.name} avatar={me.avatar} accountId={me.accountId} ov={data.overview}
            onRemove={() => confirm(`${me.name} nicht mehr tracken?`) && removePlayer(me.accountId)} />
          {me.lastSyncOk === false && (
            <div className="surface border-loss/40 p-3 text-sm text-loss">Sync-Fehler: {me.lastError}. Der Tracker versucht es automatisch erneut – erkannte Matches bleiben erhalten.</div>
          )}
          {live && <LiveBanner match={live} accountId={me.accountId} />}
          <StatStrip ov={data.overview} />
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <section className="surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <h2 className="display text-lg font-bold">Letzte Matches</h2>
                <NavLink href="/matches" className="text-sm text-amber hover:underline">Alle Matches →</NavLink>
              </div>
              {data.matches.length === 0 && <div className="p-10 text-center text-muted">Noch keine Matches gefunden.</div>}
              {data.matches.slice(0, 7).map((m, i) => <MatchRow key={m.matchId} m={m} account={me.accountId} delay={i * 50} />)}
            </section>
            <aside className="space-y-6">
              <NavLink href="/rank" className="surface surface-hover sheen block p-5">
                <div className="label">Rang</div>
                <div className="mt-3 flex items-center gap-4">
                  <RankEmblem badge={data.overview.currentBadge} size={84} />
                  <div className="display text-2xl font-extrabold leading-tight">{data.overview.currentBadge ? formatBadge(data.overview.currentBadge) : "Noch ohne Rang"}</div>
                </div>
                <div className="mt-3 text-xs text-muted">Rangverlauf ansehen →</div>
              </NavLink>
              <section className="surface p-5">
                <h3 className="label mb-3">Leistungsverlauf</h3>
                <Sparkline values={data.overview.trend} />
                <div className="mt-1 flex justify-between text-[10px] text-muted"><span>älter</span><span>aktuell</span></div>
              </section>
              <section className="surface p-5">
                <h3 className="label mb-3">Form · letzte {data.overview.form.length}</h3>
                <FormDots form={data.overview.form} />
              </section>
            </aside>
          </div>
          {data.heroes.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="display text-lg font-bold">Top-Helden</h2>
                <NavLink href="/heroes" className="text-sm text-amber hover:underline">Alle Helden →</NavLink>
              </div>
              <div className="grid gap-4 md:grid-cols-3">{data.heroes.slice(0, 3).map((h) => <HeroTile key={h.heroId} h={h} />)}</div>
            </section>
          )}
        </>
      )}
    </Gate>
  );
}
