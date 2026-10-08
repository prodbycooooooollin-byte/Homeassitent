"use client";
import { subOf } from "@/lib/grade";
import { GRADE_STYLE, GradeBadge } from "./GradeBadge";
import { useCountUp } from "./charts";
import { gradeFor, gradeLabel } from "@/lib/rating";
import { LobbyTile } from "./widgets";
import { HoverCard } from "./Popover";
import type { MatchListItem } from "@/lib/view";
import type { Overview } from "@/lib/view";

function Tile({ label, value, sub, accent, tip }: { label: string; value: string; sub?: string; accent?: string; tip?: React.ReactNode }) {
  const body = (
    <div className="surface surface-hover w-full p-4 text-left">
      <div className="label">{label}</div>
      <div className="display num mt-1 text-3xl font-extrabold" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
  return tip ? <HoverCard width={290} className="!flex" content={tip}>{body}</HoverCard> : body;
}

export function StatStrip({ ov, items = [] }: { ov: Overview; items?: MatchListItem[] }) {
  const kda = useCountUp(ov.kda);
  const score = useCountUp(ov.avgScore ?? 0);
  const matches = useCountUp(ov.matches);
  const avgGrade = ov.avgScore === null ? null : gradeFor(ov.avgScore);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile label="Matches" value={String(Math.round(matches))} sub={`${ov.wins} Siege · ${ov.matches - ov.wins} Niederlagen`} tip={<p className="text-xs leading-relaxed text-muted">Alle bisher getrackten Matches. Die Historie wird beim ersten Start importiert und danach laufend ergänzt. Winrate: <b className="text-white">{Math.round(ov.winrate * 100)}%</b>.</p>} />
      <Tile label="KDA" value={kda.toFixed(2)} sub="(K + A) / D" accent={ov.kda >= 3 ? "#3ecf8e" : undefined} tip={<p className="text-xs leading-relaxed text-muted"><b className="text-white">(Kills + Assists) ÷ Tode</b> über alle Matches. Über 3 gilt als stark. Für Supports ist das KDA nur ein Teil der Note – Beteiligung und Unterstützung zählen mehr.</p>} />
      <Tile label="Ø Rating" value={ov.avgScore === null ? "–" : score.toFixed(2)} sub="1.00 = Lobby-Schnitt" tip={<p className="text-xs leading-relaxed text-muted">Durchschnitt deiner Match-Scores. <b className="text-white">1.00</b> = so gut wie vergleichbare Spieler in der Lobby, darüber besser. Der Score berücksichtigt deine Rolle und vergleicht dich mit Spielern gleicher Rolle.</p>} />
      <LobbyTile items={items} myBadge={ov.currentBadge} />
      <div className="surface surface-hover flex items-center gap-4 p-4">
        <GradeBadge grade={avgGrade} size="md" sub={subOf(ov.avgScore === null ? null : gradeLabel(ov.avgScore))} />
        <div><div className="label">Ø Note</div><div className="text-sm text-muted">{avgGrade ? GRADE_STYLE[avgGrade].label : "Noch keine Bewertung"}</div></div>
      </div>
    </div>
  );
}
