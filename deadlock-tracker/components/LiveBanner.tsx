"use client";
import { useEffect, useState } from "react";
import { HeroPortrait, useHeroName } from "./GameAssets";
import { fmtDuration } from "@/lib/format";
import type { ActiveMatchDto } from "@/lib/api";

/** Läuft gerade ein Match? Zeigt Spielzeit und beide Teams – und beschleunigt serverseitig die Erkennung danach. */
export function LiveBanner({ match, accountId }: { match: ActiveMatchDto; accountId: number }) {
  const heroName = useHeroName();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const elapsed = match.startTime ? Math.max(0, Math.floor(now / 1000) - match.startTime) : match.durationS;
  const mine = match.players.find((p) => p.accountId === accountId);
  const team = (t: 0 | 1) => match.players.filter((p) => p.team === t);
  return (
    <section className="surface live-bar relative overflow-hidden p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="live-pulse" />
          <div>
            <div className="display text-sm font-extrabold uppercase tracking-[0.25em] text-loss">Live</div>
            <div className="text-xs text-muted">{match.mode ?? "Match"} · #{match.matchId}</div>
          </div>
        </div>
        <div className="display num text-3xl font-extrabold">{fmtDuration(elapsed)}</div>
        {mine && <div className="flex items-center gap-2 text-sm"><HeroPortrait id={mine.heroId} size={36} variant="small" ring="#f0616d" />Du spielst <b>{heroName(mine.heroId)}</b></div>}
        <div className="ml-auto flex items-center gap-4">
          {([0, 1] as const).map((t) => (
            <div key={t} className="flex gap-1">
              {team(t).map((p, i) => <HeroPortrait key={i} id={p.heroId} size={30} variant="small" className="!rounded-lg" />)}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">Sobald das Match endet, prüft der Tracker die Historie im 5-Sekunden-Takt und legt es automatisch an.</p>
    </section>
  );
}
