"use client";
import { GRADE_STYLE, GradeBadge } from "./GradeBadge";
import { useCountUp } from "./charts";
import { gradeFor } from "@/lib/rating";
import { LobbyTile } from "./widgets";
import type { MatchListItem } from "@/lib/view";
import type { Overview } from "@/lib/view";

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="surface surface-hover p-4">
      <div className="label">{label}</div>
      <div className="display num mt-1 text-3xl font-extrabold" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function StatStrip({ ov, items = [] }: { ov: Overview; items?: MatchListItem[] }) {
  const kda = useCountUp(ov.kda);
  const score = useCountUp(ov.avgScore ?? 0);
  const matches = useCountUp(ov.matches);
  const avgGrade = ov.avgScore === null ? null : gradeFor(ov.avgScore);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile label="Matches" value={String(Math.round(matches))} sub={`${ov.wins} Siege · ${ov.matches - ov.wins} Niederlagen`} />
      <Tile label="KDA" value={kda.toFixed(2)} sub="(K + A) / D" accent={ov.kda >= 3 ? "#3ecf8e" : undefined} />
      <Tile label="Ø Rating" value={ov.avgScore === null ? "–" : score.toFixed(2)} sub="1.00 = Lobby-Schnitt" />
      <LobbyTile items={items} myBadge={ov.currentBadge} />
      <div className="surface surface-hover flex items-center gap-4 p-4">
        <GradeBadge grade={avgGrade} size="md" />
        <div><div className="label">Ø Note</div><div className="text-sm text-muted">{avgGrade ? GRADE_STYLE[avgGrade].label : "Noch keine Bewertung"}</div></div>
      </div>
    </div>
  );
}
