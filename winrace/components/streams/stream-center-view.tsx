"use client";

import { useMemo, useRef, useState } from "react";
import { Maximize2, MessageSquare, Grid2x2, Radio, Tv } from "lucide-react";
import { RoomStateProvider, useRoomState } from "@/lib/client/room-state-context";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { TwitchPlayer } from "@/components/streams/twitch-player";
import { TwitchChat } from "@/components/streams/twitch-chat";
import { StreamThumbnail, type StreamerInfo } from "@/components/streams/stream-thumbnail";
import { useTwitchLiveStatus } from "@/lib/hooks/use-twitch-live-status";
import { deriveCurrentGame, summarizeTeamProgress } from "@/lib/client/derive";
import { cn } from "@/lib/cn";
import type { RoomStateView, TeamSide } from "@/lib/types";

function ProgressSidebar() {
  const { state } = useRoomState();
  const games = state.challenge?.games ?? [];
  return (
    <div className="space-y-3">
      {state.teams.map((team) => {
        const summary = summarizeTeamProgress(team, games);
        const current = deriveCurrentGame(team, games);
        return (
          <div key={team.id} className="rounded-xl border border-base-border p-3">
            <p className="text-sm font-semibold" style={{ color: team.color }}>
              {team.name}
            </p>
            <p className="text-xs text-ink-faint">
              {summary.overallPercent}% · {summary.completedGames}/{summary.totalGames} Spiele
            </p>
            {current && <p className="mt-1 text-xs text-ink-muted">{current.name}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function StreamCenterContent() {
  const { state, connectionStatus } = useRoomState();
  const [teamFilter, setTeamFilter] = useState<"ALL" | TeamSide>("ALL");
  const [onlyLive, setOnlyLive] = useState(false);
  const [mainId, setMainId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showAllLive, setShowAllLive] = useState(false);
  const [theater, setTheater] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const streamers: StreamerInfo[] = useMemo(
    () =>
      state.teams.flatMap((team) =>
        team.members
          .filter((m) => m.twitchLogin)
          .map((m) => ({ memberId: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl, twitchLogin: m.twitchLogin!, teamColor: team.color, teamSide: team.side }))
      ),
    [state.teams]
  );

  const { statusByLogin } = useTwitchLiveStatus(streamers.map((s) => s.twitchLogin));

  const filtered = streamers.filter((s) => (teamFilter === "ALL" || s.teamSide === teamFilter) && (!onlyLive || statusByLogin[s.twitchLogin]?.isLive));

  const main = filtered.find((s) => s.memberId === mainId) ?? filtered.find((s) => statusByLogin[s.twitchLogin]?.isLive) ?? filtered[0] ?? null;
  const others = filtered.filter((s) => s.memberId !== main?.memberId);

  const teamA = filtered.filter((s) => s.teamSide === "A");
  const teamB = filtered.filter((s) => s.teamSide === "B");
  const sideBySideMode = !mainId && !showAllLive && filtered.length === 2 && teamA.length === 1 && teamB.length === 1;

  async function toggleFullscreen() {
    if (!mainRef.current) return;
    if (!document.fullscreenElement) await mainRef.current.requestFullscreen().catch(() => {});
    else await document.exitFullscreen().catch(() => {});
  }

  return (
    <div className="min-h-dvh">
      <ConnectionBanner status={connectionStatus} />

      <header className="border-b border-base-border px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            <Tv className="h-5 w-5 text-brand" /> Stream-Zentrale
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex rounded-lg border border-base-border-strong p-0.5">
              {(["ALL", "A", "B"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTeamFilter(f)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium", teamFilter === f ? "bg-brand text-white" : "text-ink-faint hover:text-ink")}
                >
                  {f === "ALL" ? "Alle" : `Team ${f}`}
                </button>
              ))}
            </div>
            <Button variant={onlyLive ? "primary" : "outline"} size="sm" onClick={() => setOnlyLive((v) => !v)}>
              <Radio className="h-3.5 w-3.5" /> Nur Live
            </Button>
            <Button variant={showAllLive ? "primary" : "outline"} size="sm" onClick={() => setShowAllLive((v) => !v)}>
              <Grid2x2 className="h-3.5 w-3.5" /> Alle gleichzeitig
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        {streamers.length === 0 ? (
          <EmptyState icon={<Tv className="h-8 w-8" />} title="Noch keine Twitch-Kanäle hinterlegt" description="Mitglieder können ihren Kanal im Profil eintragen." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Tv className="h-8 w-8" />} title="Keine Streams für diesen Filter" />
        ) : sideBySideMode ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[teamA[0], teamB[0]].map((s) => (
              <div key={s.memberId} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar name={s.displayName} src={s.avatarUrl} size="sm" />
                  <span className="text-sm font-medium" style={{ color: s.teamColor }}>
                    {s.displayName}
                  </span>
                </div>
                <div className="aspect-video overflow-hidden rounded-xl border-2" style={{ borderColor: s.teamColor }}>
                  <TwitchPlayer login={s.twitchLogin} muted={s.memberId !== main?.memberId} className="h-full w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-6", !theater && "lg:grid-cols-[1fr_260px]")}>
            <div className="space-y-3">
              {main && (
                <div ref={mainRef} className="overflow-hidden rounded-xl border-2 bg-black" style={{ borderColor: main.teamColor }}>
                  <div className="aspect-video w-full">
                    <TwitchPlayer login={main.twitchLogin} muted={false} className="h-full w-full" />
                  </div>
                </div>
              )}
              {main && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={main.displayName} src={main.avatarUrl} size="sm" />
                    <span className="text-sm font-medium text-ink">{main.displayName}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowChat((v) => !v)}>
                      <MessageSquare className="h-3.5 w-3.5" /> Chat
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setTheater((v) => !v)}>
                      Theater
                    </Button>
                    <Button variant="outline" size="sm" onClick={toggleFullscreen}>
                      <Maximize2 className="h-3.5 w-3.5" /> Vollbild
                    </Button>
                  </div>
                </div>
              )}
              {showChat && main && <TwitchChat login={main.twitchLogin} className="h-96 w-full rounded-xl border border-base-border" />}

              {others.length > 0 && (
                <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                  {others.map((s) =>
                    showAllLive && statusByLogin[s.twitchLogin]?.isLive ? (
                      <div key={s.memberId} className="w-full shrink-0 space-y-1 sm:w-56">
                        <div className="aspect-video overflow-hidden rounded-lg border" style={{ borderColor: s.teamColor }}>
                          <TwitchPlayer login={s.twitchLogin} muted className="h-full w-full" />
                        </div>
                        <button onClick={() => setMainId(s.memberId)} className="text-xs text-ink-faint hover:text-ink">
                          {s.displayName} als Hauptstream
                        </button>
                      </div>
                    ) : (
                      <StreamThumbnail key={s.memberId} streamer={s} status={statusByLogin[s.twitchLogin]} active={false} onClick={() => setMainId(s.memberId)} />
                    )
                  )}
                </div>
              )}
            </div>
            {!theater && (
              <aside className="hidden lg:block">
                <ProgressSidebar />
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export function StreamCenterView({ code, initialState, currentUserId }: { code: string; initialState: RoomStateView; currentUserId: string | null }) {
  return (
    <RoomStateProvider code={code} currentUserId={currentUserId} initialState={initialState}>
      <StreamCenterContent />
    </RoomStateProvider>
  );
}
