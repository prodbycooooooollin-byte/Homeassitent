"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberRow, type MemberRowData } from "@/components/rooms/member-row";
import { Users, Lock } from "lucide-react";

interface LobbyTeamPanelProps {
  side: "A" | "B";
  name: string;
  color: string;
  members: MemberRowData[];
  maxMembers: number;
  online: Set<string>;
  locked: boolean;
  isMine: boolean;
  canJoin: boolean;
  joining: boolean;
  onJoin: () => void;
  onLeave: () => void;
}

export function LobbyTeamPanel({ side, name, color, members, maxMembers, online, locked, isMine, canJoin, joining, onJoin, onLeave }: LobbyTeamPanelProps) {
  const full = members.filter((m) => m.status === "ACTIVE").length >= maxMembers;

  return (
    <Card className="flex flex-col overflow-hidden" style={{ boxShadow: `inset 3px 0 0 0 ${color}` }}>
      <CardHeader>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Team {side}</p>
          <CardTitle style={{ color }}>{name}</CardTitle>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-ink-muted">
          <Users className="h-3.5 w-3.5" />
          {members.filter((m) => m.status === "ACTIVE").length}/{maxMembers}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {members.length === 0 ? (
          <EmptyState title="Noch niemand hier" description="Sei die/der Erste in diesem Team." />
        ) : (
          members.map((m) => <MemberRow key={m.id} member={m} online={online.has(m.userId)} />)
        )}
      </CardContent>
      <div className="border-t border-base-border p-4">
        {isMine ? (
          <Button variant="outline" className="w-full" onClick={onLeave} loading={joining}>
            Team verlassen
          </Button>
        ) : (
          <Button
            className="w-full"
            style={{ background: canJoin && !full ? color : undefined }}
            disabled={!canJoin || full || locked}
            onClick={onJoin}
            loading={joining}
          >
            {locked ? (
              <>
                <Lock className="h-4 w-4" /> Gesperrt
              </>
            ) : full ? (
              "Team ist voll"
            ) : (
              `${name} beitreten`
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}
