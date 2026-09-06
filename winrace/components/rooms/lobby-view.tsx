"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Swords, LayoutDashboard, Users } from "lucide-react";
import { useRoomRealtime, useSocketEvent, usePresence } from "@/lib/hooks/use-room-realtime";
import { useToast } from "@/components/ui/toast-context";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LobbyTeamPanel } from "@/components/rooms/lobby-team-panel";
import { useOrigin } from "@/lib/hooks/use-origin";
import { CHALLENGE_STATUS_LABELS, CHALLENGE_STATUS_COLORS } from "@/lib/labels";
import type { RoomStateView } from "@/lib/types";

export function LobbyView({ code, initialState, currentUserId }: { code: string; initialState: RoomStateView; currentUserId: string }) {
  const [state, setState] = useState(initialState);
  const [joiningSide, setJoiningSide] = useState<string | null>(null);
  const toast = useToast();

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}/state`);
    if (res.ok) setState(await res.json());
  }, [code]);

  const { status } = useRoomRealtime(state.room.id, { userId: currentUserId, onReconnect: refetch });
  const online = usePresence();
  useSocketEvent("members:updated", refetch);
  useSocketEvent("room:updated", refetch);

  async function handleAssign(side: "A" | "B" | null) {
    setJoiningSide(side ?? "none");
    try {
      const res = await fetch(`/api/rooms/${code}/members/self/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aktion fehlgeschlagen.");
      await refetch();
    } catch (err) {
      toast.push({ variant: "error", title: "Konnte Team nicht ändern", description: err instanceof Error ? err.message : undefined });
    } finally {
      setJoiningSide(null);
    }
  }

  const member = state.viewer.member;
  const isHost = state.viewer.permissions.canManageRoom;
  const inviteBase = useOrigin();

  return (
    <div className="min-h-dvh">
      <ConnectionBanner status={status} />

      <header className="border-b border-base-border bg-base-raised/60 px-4 py-5 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={state.room.name} src={state.room.logoUrl} size="lg" />
            <div>
              <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{state.room.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <Badge className={CHALLENGE_STATUS_COLORS[state.challenge?.status ?? "LOBBY"]}>
                  {CHALLENGE_STATUS_LABELS[state.challenge?.status ?? "LOBBY"]}
                </Badge>
                <span className="font-mono">{state.room.code}</span>
                <CopyButton value={state.room.code} label="Code kopieren" />
                {state.room.visibility === "PUBLIC" && (
                  <CopyButton value={`${inviteBase}/rooms/${code}/live`} label="Zuschauer-Link" />
                )}
              </div>
            </div>
          </div>
          {isHost && (
            <Link href={`/rooms/${code}/dashboard`}>
              <Button variant="secondary">
                <LayoutDashboard className="h-4 w-4" /> Zum Dashboard
              </Button>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        {!member || member.status === "REMOVED" || member.status === "BANNED" ? (
          <EmptyState
            title={member?.status === "BANNED" ? "Du wurdest aus diesem Raum ausgeschlossen." : "Du bist diesem Raum nicht mehr zugeordnet."}
            description="Wende dich an den Host, falls du glaubst, dass das ein Fehler ist."
          />
        ) : member.status === "PENDING" ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="Beitrittsanfrage gesendet"
            description="Der Host muss deinen Beitritt noch bestätigen. Diese Seite aktualisiert sich automatisch."
          />
        ) : (
          <>
            <p className="mb-6 text-sm text-ink-faint">
              Wähle dein Team. {state.room.teamsLocked && "Die Teams sind aktuell durch den Host gesperrt."}
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              {state.teams.map((team) => (
                <LobbyTeamPanel
                  key={team.id}
                  side={team.side}
                  name={team.name}
                  color={team.color}
                  members={team.members}
                  maxMembers={state.room.maxMembersPerTeam}
                  online={online}
                  locked={team.locked || (state.room.teamsLocked && member.teamId !== team.id)}
                  isMine={member.teamId === team.id}
                  canJoin={state.viewer.permissions.canSelfAssignTeam}
                  joining={joiningSide === team.side}
                  onJoin={() => handleAssign(team.side)}
                  onLeave={() => handleAssign(null)}
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-faint">
          <Swords className="h-3.5 w-3.5" /> Gehostet von {state.room.hostName}
        </div>
      </main>
    </div>
  );
}
