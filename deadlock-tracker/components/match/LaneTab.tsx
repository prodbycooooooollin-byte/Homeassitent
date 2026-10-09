"use client";
import { useState } from "react";
import { HeroPortrait, useHeroName } from "../GameAssets";
import { TEAMS } from "./Scoreboard";
import { laneInfo, laneReports, valueAt } from "@/lib/insights";
import { fmtK } from "@/lib/format";
import type { MatchDetails, MatchPlayer } from "@/lib/types";

export function LaneTab({ d, account }: { d: MatchDetails; account: number }) {
  const heroName = useHeroName();
  const [min, setMin] = useState(8);
  const me = d.players.find((p) => p.accountId === account);
  const reports = laneReports(d, min * 60);
  const hasTimeline = d.players.some((p) => p.timeline);
  if (!reports.length || !hasTimeline) {
    return <div className="surface p-10 text-center text-muted">Für dieses Match liegen keine Lane-Daten vor (Lane-Zuweisung oder Zeitreihen fehlen).</div>;
  }
  const maxEnd = Math.floor(Math.min(...d.players.map((p) => p.timeline?.t[p.timeline.t.length - 1] ?? d.durationS)) / 60);
  const myLane = me?.lane;
  const wins = reports.filter((r) => r.winner !== null && me && r.winner === me.team).length;
  const row = (p: MatchPlayer, big: number) => {
    const nw = p.timeline ? valueAt(p.timeline as never, "nw", min * 60) : 0;
    const k = p.timeline ? valueAt(p.timeline as never, "k", min * 60) : 0;
    const dd = p.timeline ? valueAt(p.timeline as never, "d", min * 60) : 0;
    return (
      <div key={p.accountId} className={`flex items-center gap-2.5 rounded-xl p-2 ${p.accountId === account ? "bg-amber/10 ring-1 ring-amber/50" : "bg-white/[0.03]"}`}>
        <HeroPortrait id={p.heroId} size={44} variant="small" ring={TEAMS[p.team].color} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.accountId === account ? "Du" : p.name ?? heroName(p.heroId)}</div>
          <div className="num text-[11px] text-muted">{Math.round(k)} / {Math.round(dd)} K/D</div>
        </div>
        <div className="w-24"><div className="num text-right text-sm font-bold">{fmtK(nw)}</div>
          <div className="mt-1 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (nw / big) * 100)}%`, background: TEAMS[p.team].color }} /></div></div>
      </div>
    );
  };
  const biggest = Math.max(1, ...d.players.map((p) => (p.timeline ? valueAt(p.timeline as never, "nw", min * 60) : 0)));
  return (
    <div className="space-y-5">
      <section className="surface flex flex-wrap items-center gap-4 p-4">
        <div>
          <div className="label">Laning-Phase</div>
          <div className="text-sm text-muted">{me ? `Du hast ${wins} von ${reports.length} Lanes gewonnen` : "Souls & Kämpfe pro Lane"} (Souls-Differenz ab ±150).</div>
        </div>
        <div className="ml-auto flex min-w-[260px] items-center gap-3">
          <span className="text-xs text-muted">bis Minute</span>
          <input type="range" min={3} max={Math.max(4, maxEnd)} value={min} onChange={(e) => setMin(Number(e.target.value))} className="flex-1 accent-amber-400" />
          <span className="display num w-12 text-right text-lg font-bold">{min}′</span>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        {reports.map((r, i) => {
          const L = laneInfo(r.lane);
          const mine = r.lane === myLane;
          const lead = r.winner === null ? null : TEAMS[r.winner];
          const width = Math.min(50, (Math.abs(r.diff) / Math.max(1500, Math.abs(r.diff) * 1.4)) * 50);
          return (
            <section key={r.lane} className="surface fade-up overflow-hidden" style={{ animationDelay: `${i * 80}ms`, boxShadow: mine ? `0 0 0 1px ${L.color}88, 0 20px 50px -30px ${L.color}` : undefined }}>
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3" style={{ background: `linear-gradient(90deg, ${L.color}26, transparent)` }}>
                <span className="h-3 w-3 rounded-full" style={{ background: L.color, boxShadow: `0 0 10px ${L.color}` }} />
                <h3 className="display font-bold">{L.name}e Lane</h3>
                {mine && <span className="chip !py-0 text-[10px] text-amber">Deine Lane</span>}
              </div>
              <div className="space-y-2 p-3">
                <div className="label !text-[9px]" style={{ color: TEAMS[0].color }}>{TEAMS[0].name}</div>
                {r.sides[0].players.map((p) => row(p, biggest))}
                <div className="my-2">
                  <div className="relative h-3 rounded-full bg-white/10">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
                    {lead && <div className="absolute inset-y-0 rounded-full transition-all duration-500" style={{ background: lead.color, width: `${width}%`, left: r.winner === 0 ? "50%" : undefined, right: r.winner === 1 ? "50%" : undefined, boxShadow: `0 0 12px ${lead.color}` }} />}
                  </div>
                  <div className="mt-1 text-center text-xs">
                    {lead ? <><b style={{ color: lead.color }}>{lead.name}</b> <span className="num">+{fmtK(Math.abs(r.diff))} Souls</span></> : <span className="text-muted">ausgeglichen</span>}
                    <span className="num ml-2 text-muted">· Kills {Math.round(r.sides[0].kills)}:{Math.round(r.sides[1].kills)}</span>
                  </div>
                </div>
                <div className="label !text-[9px]" style={{ color: TEAMS[1].color }}>{TEAMS[1].name}</div>
                {r.sides[1].players.map((p) => row(p, biggest))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
