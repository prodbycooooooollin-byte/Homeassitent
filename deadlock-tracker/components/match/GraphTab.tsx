"use client";
import { useMemo, useState } from "react";
import { AdvantageChart, LineChart, type Series } from "../charts";
import { useHeroName } from "../GameAssets";
import { TEAMS } from "./Scoreboard";
import { teamAdvantage, valueAt } from "@/lib/insights";
import { fmtK } from "@/lib/format";
import type { MatchDetails } from "@/lib/types";

const METRICS = [
  { key: "nw", label: "Souls" }, { key: "dmg", label: "Heldenschaden" }, { key: "k", label: "Kills" }, { key: "heal", label: "Heilung" }, { key: "taken", label: "Erlittener Schaden" },
] as const;

export function GraphTab({ d, account }: { d: MatchDetails; account: number }) {
  const heroName = useHeroName();
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("nw");
  const [focus, setFocus] = useState<"me" | "all">("me");
  const me = d.players.find((p) => p.accountId === account);
  const adv = useMemo(() => teamAdvantage(d), [d]);
  const end = Math.max(60, ...d.players.map((p) => p.timeline?.t[p.timeline.t.length - 1] ?? 0));
  const xs = useMemo(() => Array.from({ length: Math.floor(end / 60) + 1 }, (_, i) => i * 60), [end]);

  if (!d.players.some((p) => p.timeline)) return <div className="surface p-10 text-center text-muted">Für dieses Match liegen keine Zeitreihen vor.</div>;

  const series: Series[] = d.players.filter((p) => p.timeline).map((p) => {
    const mine = p.accountId === account;
    const sameLane = !!me && !mine && p.lane === me.lane && p.team !== me.team;
    return {
      id: String(p.accountId), label: `${mine ? "Du" : p.name ?? heroName(p.heroId)} (${heroName(p.heroId)})`,
      color: mine ? "#ffffff" : TEAMS[p.team].color, width: mine ? 3.2 : sameLane ? 2.4 : 1.6,
      dim: focus === "me" ? !(mine || sameLane) : !mine && false,
      values: xs.map((t) => valueAt(p.timeline as never, metric, t)),
    };
  });
  return (
    <div className="space-y-5">
      <section className="surface p-5">
        <h2 className="label mb-3">Souls-Vorsprung <span className="normal-case tracking-normal">· Team-Souls-Differenz über die Zeit</span></h2>
        {adv.length ? <AdvantageChart data={adv} /> : <p className="text-sm text-muted">Keine Daten.</p>}
      </section>
      <section className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="label">Spielerverlauf</h2>
          <div className="flex flex-wrap gap-1">{METRICS.map((m) => <button key={m.key} onClick={() => setMetric(m.key)} className={`tab ${metric === m.key ? "tab-active" : ""}`}>{m.label}</button>)}</div>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setFocus("me")} className={`tab ${focus === "me" ? "tab-active" : ""}`}>Du & Lane-Gegner</button>
            <button onClick={() => setFocus("all")} className={`tab ${focus === "all" ? "tab-active" : ""}`}>Alle</button>
          </div>
        </div>
        <LineChart xs={xs} series={focus === "all" ? series.map((s) => ({ ...s, dim: false })) : series} fmtY={fmtK} />
        <p className="mt-2 text-[11px] text-muted">Weiß = du · <span style={{ color: TEAMS[0].color }}>Gold</span> = Hidden King · <span style={{ color: TEAMS[1].color }}>Blau</span> = Archmother. Bewege die Maus über das Diagramm für Werte.</p>
      </section>
    </div>
  );
}
