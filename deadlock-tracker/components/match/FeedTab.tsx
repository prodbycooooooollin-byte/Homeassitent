"use client";
import { useMemo, useState } from "react";
import { HeroPortrait, useHeroName } from "../GameAssets";
import { Icon } from "../Icon";
import { TEAMS } from "./Scoreboard";
import { feed, objectiveLabel, type FeedEvent } from "@/lib/insights";
import type { MatchDetails } from "@/lib/types";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function FeedTab({ d, account }: { d: MatchDetails; account: number }) {
  const heroName = useHeroName();
  const [f, setF] = useState<"all" | "kills" | "obj" | "me">("all");
  const events = useMemo(() => feed(d), [d]);
  const shown = events.filter((e) => f === "all" || (f === "kills" && e.kind === "kill") || (f === "obj" && e.kind !== "kill") || (f === "me" && e.kind === "kill" && (e.victim.accountId === account || e.killer?.accountId === account)));
  const firstBlood = events.find((e): e is Extract<FeedEvent, { kind: "kill" }> => e.kind === "kill");
  const dead = [...d.players].filter((p) => (p.deadTimeS ?? 0) > 0).sort((a, b) => (b.deadTimeS ?? 0) - (a.deadTimeS ?? 0)).slice(0, 12);
  const maxDead = Math.max(1, ...dead.map((p) => p.deadTimeS ?? 0));
  if (!events.length) return <div className="surface p-10 text-center text-muted">Für dieses Match liegen keine Ereignisdaten vor.</div>;
  const name = (p?: { accountId: number; name?: string; heroId: number }) => (!p ? "?" : p.accountId === account ? "Du" : p.name ?? heroName(p.heroId));
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <h2 className="display font-bold">Match-Ereignisse</h2>
          <span className="chip">{events.length}</span>
          <div className="ml-auto flex gap-1">
            {([["all", "Alle"], ["kills", "Kills"], ["obj", "Objectives"], ["me", "Du"]] as const).map(([k, l]) => <button key={k} onClick={() => setF(k)} className={`tab ${f === k ? "tab-active" : ""}`}>{l}</button>)}
          </div>
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          {shown.map((e, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-sm transition hover:bg-white/[0.03]">
              <span className="num w-12 text-xs text-muted">{mmss(e.t)}</span>
              {e.kind === "kill" && (
                <>
                  {e.killer ? <HeroPortrait id={e.killer.heroId} size={30} variant="small" ring={TEAMS[e.killer.team].color} /> : <span className="w-[30px] text-center text-muted">?</span>}
                  <Icon name="sword" size={14} className="text-muted" />
                  <HeroPortrait id={e.victim.heroId} size={30} variant="small" ring={TEAMS[e.victim.team].color} />
                  <span className="min-w-0 flex-1 truncate"><b style={{ color: e.killer ? TEAMS[e.killer.team].color : undefined }}>{name(e.killer)}</b> besiegt <b style={{ color: TEAMS[e.victim.team].color }}>{name(e.victim)}</b></span>
                  {e === firstBlood && <span className="chip !py-0 text-[10px] text-loss">First Blood</span>}
                </>
              )}
              {e.kind === "objective" && (<><Icon name="tower" size={20} style={{ color: TEAMS[e.team].color }} /><span className="flex-1"><b style={{ color: TEAMS[e.team].color }}>{TEAMS[e.team].name}</b> verliert {objectiveLabel(e.id)}</span></>)}
              {e.kind === "boss" && (<><Icon name="star" size={20} className="text-amber" /><span className="flex-1"><b style={{ color: TEAMS[e.team].color }}>{TEAMS[e.team].name}</b> erobert den Mid-Boss</span></>)}
            </div>
          ))}
          {!shown.length && <div className="p-8 text-center text-muted">Keine Ereignisse für diesen Filter.</div>}
        </div>
      </section>
      <aside className="surface p-5">
        <h2 className="label mb-3">Zeit im Jenseits</h2>
        <div className="space-y-2.5">
          {dead.map((p) => (
            <div key={p.accountId} className="flex items-center gap-2.5">
              <HeroPortrait id={p.heroId} size={30} variant="small" ring={TEAMS[p.team].color} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-xs"><span className="truncate">{name(p)}</span><span className="num text-muted">{Math.floor((p.deadTimeS ?? 0) / 60)}:{String((p.deadTimeS ?? 0) % 60).padStart(2, "0")}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${((p.deadTimeS ?? 0) / maxDead) * 100}%`, background: TEAMS[p.team].color }} /></div>
              </div>
            </div>
          ))}
          {!dead.length && <p className="text-sm text-muted">Keine Todeszeiten verfügbar.</p>}
        </div>
      </aside>
    </div>
  );
}
