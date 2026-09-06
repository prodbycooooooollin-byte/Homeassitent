"use client";

import { useEffect, useRef } from "react";
import { useOverlayData } from "@/lib/hooks/use-overlay-data";
import { OverlayRoot } from "@/components/overlay/overlay-root";
import { TeamComparisonOverlay } from "@/components/overlay/team-comparison-overlay";
import { TeamSingleOverlay } from "@/components/overlay/team-single-overlay";
import { CompactOverlay } from "@/components/overlay/compact-overlay";
import { CurrentGameOverlay } from "@/components/overlay/current-game-overlay";
import { FullListOverlay } from "@/components/overlay/full-list-overlay";
import { WinnerOverlay } from "@/components/overlay/winner-overlay";
import { playChime } from "@/lib/client/sound";

export function OverlayContent({ code, type, token }: { code: string; type: string; token: string | null }) {
  const { data, error } = useOverlayData(code, type, token);
  const prevCompleted = useRef<number>(-1);
  const prevWinnerId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!data) return;
    const { state, config } = data;
    if (!config.soundEnabled || !state.challenge) return;

    const completedCount = state.challenge.games.reduce(
      (sum, g) => sum + Object.values(g.progress).filter((p) => p.status === "COMPLETED").length,
      0
    );
    if (prevCompleted.current !== -1 && completedCount > prevCompleted.current) playChime();
    prevCompleted.current = completedCount;

    const winnerId = state.challenge.winnerTeamId ?? state.challenge.pendingWinnerTeamId ?? null;
    if (prevWinnerId.current !== undefined && prevWinnerId.current !== winnerId && winnerId) playChime();
    prevWinnerId.current = winnerId;
  }, [data]);

  if (error) {
    return <div className="p-4 font-mono text-xs text-danger/80">Overlay-Fehler: {error}</div>;
  }
  if (!data) return null;
  const { state, config } = data;
  if (!state.challenge) return null;

  const { teams } = state;
  const challenge = state.challenge;
  const winnerTeam = challenge.winnerTeamId
    ? teams.find((t) => t.id === challenge.winnerTeamId)
    : challenge.pendingWinnerTeamId
      ? teams.find((t) => t.id === challenge.pendingWinnerTeamId)
      : null;

  if (type === "WINNER") {
    return <OverlayRoot config={config}>{winnerTeam && config.showAnimations ? <WinnerOverlay team={winnerTeam} pending={!challenge.winnerTeamId} /> : null}</OverlayRoot>;
  }

  return (
    <OverlayRoot config={config}>
      {type === "TEAM_COMPARISON" && <TeamComparisonOverlay teams={teams} challenge={challenge} config={config} />}
      {type === "TEAM_A" && teams[0] && <TeamSingleOverlay team={teams[0]} games={challenge.games} config={config} />}
      {type === "TEAM_B" && teams[1] && <TeamSingleOverlay team={teams[1]} games={challenge.games} config={config} />}
      {type === "COMPACT" && <CompactOverlay teams={teams} challenge={challenge} config={config} />}
      {type === "CURRENT_GAME" && <CurrentGameOverlay teams={teams} challenge={challenge} />}
      {type === "FULL_LIST" && <FullListOverlay teams={teams} challenge={challenge} />}
    </OverlayRoot>
  );
}
