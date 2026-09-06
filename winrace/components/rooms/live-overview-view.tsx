"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, RotateCcw, Sparkles, Radio, Gamepad2 } from "lucide-react";
import { RoomStateProvider, useRoomState } from "@/lib/client/room-state-context";
import { useSocketEvent } from "@/lib/hooks/use-room-realtime";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChallengeTimer } from "@/components/rooms/challenge-timer";
import { TeamCompareColumn } from "@/components/rooms/team-compare-column";
import { LiveGameRow } from "@/components/rooms/live-game-row";
import { WinnerBanner } from "@/components/rooms/winner-banner";
import { CHALLENGE_STATUS_COLORS, CHALLENGE_STATUS_LABELS } from "@/lib/labels";
import { summarizeTeamProgress } from "@/lib/client/derive";
import type { RoomStateView, RoomStatsView } from "@/lib/types";

function LiveOverviewInner() {
  const { state, code, connectionStatus, refetch } = useRoomState();
  const [stats, setStats] = useState<RoomStatsView | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  async function loadStats() {
    const res = await fetch(`/api/rooms/${code}/stats`);
    if (res.ok) setStats((await res.json()).stats);
  }

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  useSocketEvent("progress:updated", loadStats);
  useSocketEvent("challenge:updated", loadStats);

  const games = state.challenge?.games ?? [];
  const [teamA, teamB] = state.teams;
  const leadingTeamId = (() => {
    if (state.teams.length !== 2) return null;
    const [a, b] = state.teams.map((t) => ({ id: t.id, pct: summarizeTeamProgress(t, games).overallPercent }));
    if (a.pct === b.pct) return null;
    return a.pct > b.pct ? a.id : b.id;
  })();

  const winnerTeam = state.challenge?.winnerTeamId
    ? state.teams.find((t) => t.id === state.challenge!.winnerTeamId)
    : state.challenge?.pendingWinnerTeamId
      ? state.teams.find((t) => t.id === state.challenge!.pendingWinnerTeamId)
      : null;

  async function runDemoSimulate() {
    setSimLoading(true);
    try {
      await fetch("/api/demo/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      await refetch();
    } finally {
      setSimLoading(false);
    }
  }

  async function runDemoReset() {
    setSimLoading(true);
    try {
      await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      await refetch();
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-grid">
      <ConnectionBanner status={connectionStatus} />

      {state.room.isDemo && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <FlaskConical className="h-4 w-4" />
          <span className="font-medium">Demo-Modus – Beispieldaten, keine echte Challenge.</span>
          <Button size="sm" variant="secondary" onClick={runDemoSimulate} loading={simLoading}>
            <Sparkles className="h-3.5 w-3.5" /> Fortschritt simulieren
          </Button>
          <Button size="sm" variant="ghost" onClick={runDemoReset} loading={simLoading}>
            <RotateCcw className="h-3.5 w-3.5" /> Zurücksetzen
          </Button>
        </div>
      )}

      <header className="border-b border-base-border px-4 py-6 text-center sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2">
          <Avatar name={state.room.name} src={state.room.logoUrl} size="lg" />
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{state.room.name}</h1>
          <div className="flex items-center gap-2">
            <Badge className={CHALLENGE_STATUS_COLORS[state.challenge?.status ?? "LOBBY"]}>{CHALLENGE_STATUS_LABELS[state.challenge?.status ?? "LOBBY"]}</Badge>
            <ChallengeTimer challenge={state.challenge} />
            <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
              <Radio className="h-3 w-3 text-success" /> Live
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-8">
        {winnerTeam && <WinnerBanner team={winnerTeam} pending={!state.challenge?.winnerTeamId} />}

        {teamA && teamB ? (
          <div className="grid gap-8 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <TeamCompareColumn team={teamA} games={games} stats={stats?.teams.find((s) => s.teamId === teamA.id) ?? null} leading={teamA.id === leadingTeamId} />
            <div className="hidden font-display text-3xl font-black text-ink-faint sm:block">VS</div>
            <TeamCompareColumn team={teamB} games={games} stats={stats?.teams.find((s) => s.teamId === teamB.id) ?? null} leading={teamB.id === leadingTeamId} align="right" />
          </div>
        ) : (
          <EmptyState title="Teams werden noch aufgestellt" />
        )}

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Spieleliste</h2>
          {games.length === 0 ? (
            <EmptyState icon={<Gamepad2 className="h-6 w-6" />} title="Noch keine Spiele konfiguriert" />
          ) : (
            <div className="space-y-2">
              {games.map((g) => (
                <LiveGameRow key={g.id} game={g} teams={state.teams} />
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4 pt-4 text-xs text-ink-faint">
          <Link href={`/rooms/${code}/streams`} className="hover:text-ink hover:underline">
            Stream-Zentrale öffnen
          </Link>
          <Link href={`/rooms/${code}/stats`} className="hover:text-ink hover:underline">
            Ausführliche Statistiken
          </Link>
        </div>
      </main>
    </div>
  );
}

export function LiveOverviewView({ code, initialState, currentUserId }: { code: string; initialState: RoomStateView; currentUserId: string | null }) {
  return (
    <RoomStateProvider code={code} currentUserId={currentUserId} initialState={initialState}>
      <LiveOverviewInner />
    </RoomStateProvider>
  );
}
