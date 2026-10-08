"use client";
import { HeroPortrait, RankEmblem, useHeroName } from "../GameAssets";
import { Icon, type IconName } from "../Icon";
import { TeamTable, TEAMS, Versus, sum } from "./Scoreboard";
import { awards, advantageSummary } from "@/lib/insights";
import { formatBadge, tierOf } from "@/lib/ranks";
import { TIER_COLORS } from "../GameAssets";
import type { MatchDetails, Rating, TeamId } from "@/lib/types";

export function OverviewTab({ d, account, ratings, lobbyBadge }: { d: MatchDetails; account: number; ratings: Record<number, Rating | null>; lobbyBadge: number | null }) {
  const heroName = useHeroName();
  const me = d.players.find((p) => p.accountId === account);
  const maxDmg = Math.max(1, ...d.players.map((p) => p.heroDamage));
  const aw = awards(d, ratings);
  const adv = me ? advantageSummary(d, me.team) : null;
  const ranks = d.players.map((p) => p.badge).filter((b): b is number => !!b);
  const tiers = Array.from({ length: 12 }, (_, t) => ({ t, n: ranks.filter((b) => tierOf(b) === t).length })).filter((x) => x.n > 0);
  const maxN = Math.max(1, ...tiers.map((x) => x.n));
  const mine = me?.badge ?? null;

  return (
    <div className="space-y-6">
      {aw.length > 0 && (
        <section>
          <h2 className="label mb-3">Auszeichnungen</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {aw.map((a, i) => (
              <div key={a.key} className="surface surface-hover fade-up relative overflow-hidden p-3 text-center" style={{ animationDelay: `${i * 50}ms`, ...(a.player.accountId === account ? { boxShadow: "0 0 0 1px #f0b44c88" } : {}) }}>
                <div className="flex justify-center text-amber"><Icon name={a.icon as IconName} size={20} /></div>
                <div className="label !text-[9px]">{a.title}</div>
                <div className="my-2 flex justify-center"><HeroPortrait id={a.player.heroId} size={48} variant="small" ring={TEAMS[a.player.team].color} /></div>
                <div className="truncate text-xs font-semibold">{a.player.accountId === account ? "Du" : a.player.name ?? heroName(a.player.heroId)}</div>
                <div className="num text-[11px] text-muted">{a.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="label mb-4">Teamvergleich</h2>
          <div className="space-y-3.5">
            <Versus label="Kills" a={sum(d, 0, (p) => p.kills)} b={sum(d, 1, (p) => p.kills)} />
            <Versus label="Souls" a={sum(d, 0, (p) => p.netWorth)} b={sum(d, 1, (p) => p.netWorth)} k />
            <Versus label="Heldenschaden" a={sum(d, 0, (p) => p.heroDamage)} b={sum(d, 1, (p) => p.heroDamage)} k />
            <Versus label="Objective-Schaden" a={sum(d, 0, (p) => p.objectiveDamage)} b={sum(d, 1, (p) => p.objectiveDamage)} k />
          </div>
          {adv && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted">
              Größter Souls-Vorsprung <b className="text-win">+{(adv.max.diff / 1000).toFixed(1)}k</b> bei {Math.round(adv.max.t / 60)}′ · größter Rückstand <b className="text-loss">{(adv.min.diff / 1000).toFixed(1)}k</b> bei {Math.round(adv.min.t / 60)}′
              {adv.comeback && <div className="mt-1 flex items-center gap-1.5 font-semibold text-amber"><Icon name="flame" size={14} />Comeback-Sieg!</div>}
              {adv.throwGame && <div className="mt-1 font-semibold text-loss">Ein sicher geglaubtes Match wurde noch verloren.</div>}
            </div>
          )}
        </section>

        <section className="surface p-5">
          <h2 className="label mb-4">Lobby-Ränge</h2>
          <div className="flex items-center gap-4">
            <RankEmblem badge={lobbyBadge} size={64} />
            <div>
              <div className="label !text-[9px]">Ø Lobby</div>
              <div className="display text-xl font-bold">{lobbyBadge ? formatBadge(lobbyBadge) : "Unbekannt"}</div>
              {mine && <div className="text-xs text-muted">Du: <b className="text-white">{formatBadge(mine)}</b>{lobbyBadge && mine !== lobbyBadge ? (tierOf(mine) * 6 + (mine % 10) > tierOf(lobbyBadge) * 6 + (lobbyBadge % 10) ? " · über dem Schnitt" : " · unter dem Schnitt") : ""}</div>}
            </div>
          </div>
          {tiers.length > 0 ? (
            <div className="mt-4 flex h-20 items-end gap-1.5">
              {tiers.map((x) => (
                <div key={x.t} className="flex flex-1 flex-col items-center gap-1" title={`${x.n}× ${formatBadge(x.t * 10 + 1).replace(/ \d$/, "")}`}>
                  <span className="num text-[10px] text-muted">{x.n}</span>
                  <div className="w-full rounded-t" style={{ height: `${(x.n / maxN) * 44 + 6}px`, background: TIER_COLORS[x.t], opacity: .9 }} />
                  <span className="text-[9px] text-muted">{x.t}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 text-xs text-muted">Für dieses Match liegen keine Spielerränge vor (z. B. Unranked/Privat).</p>}
          <div className="mt-3 flex justify-between text-[11px]"><span style={{ color: TEAMS[0].color }}>{d.avgBadge[0] ? formatBadge(d.avgBadge[0]) : "–"}</span><span className="text-muted">Team-Ø</span><span style={{ color: TEAMS[1].color }}>{d.avgBadge[1] ? formatBadge(d.avgBadge[1]) : "–"}</span></div>
        </section>
      </div>

      {([0, 1] as TeamId[]).map((t) => <TeamTable key={t} team={t} d={d} account={account} ratings={ratings} maxDmg={maxDmg} />)}
    </div>
  );
}
