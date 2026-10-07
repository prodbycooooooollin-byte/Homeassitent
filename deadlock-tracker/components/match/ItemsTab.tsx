"use client";
import { HeroPortrait, useHeroName } from "../GameAssets";
import { useItems } from "../useItems";
import { ItemIcon } from "./ItemIcon";
import { TEAMS } from "./Scoreboard";
import type { MatchDetails, MatchPlayer, TeamId } from "@/lib/types";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ItemsTab({ d, account }: { d: MatchDetails; account: number }) {
  const items = useItems();
  const heroName = useHeroName();
  if (!d.players.some((p) => p.items?.length)) return <div className="surface p-10 text-center text-muted">Für dieses Match liegen keine Item-Daten vor.</div>;
  const me = d.players.find((p) => p.accountId === account);
  const ordered = [...d.players].sort((a, b) => Number(b.accountId === account) - Number(a.accountId === account) || a.team - b.team);
  const row = (p: MatchPlayer, big: boolean) => {
    const list = [...(p.items ?? [])].sort((a, b) => a.t - b.t);
    return (
      <div key={p.accountId} className={`flex items-start gap-3 border-t border-white/[0.05] px-4 py-3 ${p.accountId === account ? "bg-amber/[0.07]" : ""}`}>
        <div className="flex w-44 shrink-0 items-center gap-2.5">
          <HeroPortrait id={p.heroId} size={big ? 52 : 40} variant="small" ring={TEAMS[p.team].color} />
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{p.accountId === account ? "Du" : p.name ?? heroName(p.heroId)}</div><div className="truncate text-[11px] text-muted">{heroName(p.heroId)}</div></div>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-2">
          {list.map((it, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <ItemIcon id={it.id} item={items?.[it.id]} size={big ? 46 : 36} sold={!!it.sold} />
              <span className="num text-[9px] text-muted">{mmss(it.t)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-5">
      {me && (
        <section className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-3"><h2 className="display font-bold">Dein Build · Kaufreihenfolge</h2><p className="text-xs text-muted">Zeit = Kaufzeitpunkt · durchgestrichen = verkauft</p></div>
          {row(me, true)}
        </section>
      )}
      {([0, 1] as TeamId[]).map((t) => (
        <section key={t} className="surface overflow-hidden">
          <div className="px-4 py-3" style={{ background: `linear-gradient(90deg, ${TEAMS[t].color}22, transparent 60%)` }}><h2 className="display font-bold" style={{ color: TEAMS[t].color }}>{TEAMS[t].name}</h2></div>
          {ordered.filter((p) => p.team === t && p.accountId !== account).map((p) => row(p, false))}
        </section>
      ))}
      {items && Object.keys(items).length === 0 && <p className="text-center text-xs text-muted">Item-Namen/Icons konnten nicht geladen werden (siehe Diagnose) – es werden nur Kaufzeiten angezeigt.</p>}
    </div>
  );
}
