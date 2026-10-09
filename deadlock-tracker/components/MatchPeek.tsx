"use client";
import { subOf } from "@/lib/grade";
import { useEffect, useState } from "react";
import { HeroPortrait, ItemIcon, RankEmblem, useHeroName } from "./GameAssets";
import { GradeBadge } from "./GradeBadge";
import { useItems } from "./useItems";
import { fmtDuration } from "@/lib/format";
import type { MatchDetails, Rating } from "@/lib/types";

interface Res { details: MatchDetails | null; ratings: Record<number, Rating | null>; lobbyBadge: number | null }
const cache = new Map<string, Res>();
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Vorschau eines Matches beim Überfahren: Held, K/D/A, Note und die gekauften Items in Kaufreihenfolge. */
export function MatchPeek({ matchId, account }: { matchId: number; account: number }) {
  const key = `${matchId}:${account}`;
  const [res, setRes] = useState<Res | null>(cache.get(key) ?? null);
  const [err, setErr] = useState(false);
  const heroName = useHeroName();
  const items = useItems();
  useEffect(() => {
    if (cache.has(key)) return;
    fetch(`/api/matches/${matchId}?account=${account}&peek=1`).then((r) => r.json()).then((j) => { cache.set(key, j); setRes(j); }).catch(() => setErr(true));
  }, [key, matchId, account]);

  if (err) return <p className="text-xs text-muted">Vorschau nicht verfügbar.</p>;
  if (!res) return <div className="skeleton h-28" />;
  const d = res.details;
  if (!d) return <p className="text-xs text-muted">Details für dieses Match werden noch geladen. Die gekauften Items erscheinen hier, sobald sie verfügbar sind.</p>;
  const p = d.players.find((x) => x.accountId === account);
  if (!p) return <p className="text-xs text-muted">Dieser Spieler ist in den Match-Details nicht enthalten.</p>;
  const list = [...(p.items ?? [])].sort((a, b) => a.t - b.t);
  const kept = list.filter((i) => !i.sold).length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <HeroPortrait id={p.heroId} size={40} variant="small" className="!rounded-lg" ring={d.winningTeam === p.team ? "#3ecf8e" : "#f0616d"} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{heroName(p.heroId)}</div>
          <div className="num text-[11px] text-muted">{p.kills}/{p.deaths}/{p.assists} · {d.matchMode ?? "Match"} · {fmtDuration(d.durationS)}</div>
        </div>
        <GradeBadge grade={res.ratings[account]?.grade ?? null} size="sm" sub={subOf(res.ratings[account]?.label)} title="" />
      </div>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>Gekaufte Items{list.length ? ` · ${list.length}` : ""}</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">Ø Lobby <RankEmblem badge={res.lobbyBadge} size={16} label /></span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted">Für dieses Match liegen keine Item-Daten vor.</p>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-x-1.5 gap-y-2">
            {list.map((it, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5" title={`${items?.[it.id]?.name ?? `Item #${it.id}`} · ${mmss(it.t)}${it.sold ? " · verkauft" : ""}`}>
                <ItemIcon id={it.id} item={items?.[it.id]} size={38} sold={!!it.sold} hover={false} />
                <span className="num text-[9px] leading-none text-muted">{mmss(it.t)}</span>
              </div>
            ))}
          </div>
          {kept !== list.length && <p className="text-[10px] text-muted">Abgedunkelt = später verkauft ({list.length - kept}).</p>}
        </>
      )}
    </div>
  );
}
