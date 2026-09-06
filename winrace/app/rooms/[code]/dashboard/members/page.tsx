"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-context";
import { useRoomState } from "@/lib/client/room-state-context";
import { useSocketEvent } from "@/lib/hooks/use-room-realtime";
import { ROOM_ROLE_LABELS, MEMBER_STATUS_LABELS } from "@/lib/labels";
import { Crown, Check, UserX, Users } from "lucide-react";

interface MemberRow {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  isTeamLead: boolean;
  status: string;
  teamId: string | null;
  teamSide: "A" | "B" | null;
  twitchLogin: string | null;
}

export default function MembersPage() {
  const { state, code, online, refetch } = useRoomState();
  const toast = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<MemberRow | null>(null);
  const isHost = state.viewer.permissions.canManageMembers;

  const load = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}/members`);
    if (res.ok) setMembers((await res.json()).members);
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent("members:updated", load);
  useSocketEvent("teams:updated", load);

  async function act(memberId: string, action: string, side?: string | null) {
    try {
      const res = await fetch(`/api/rooms/${code}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aktion fehlgeschlagen.");
      await load();
      await refetch();
    } catch (err) {
      toast.push({ variant: "error", title: "Aktion fehlgeschlagen", description: err instanceof Error ? err.message : undefined });
    }
  }

  async function toggleLock(locked: boolean) {
    await fetch(`/api/rooms/${code}/lock-teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked }),
    });
    await refetch();
  }

  const pending = members.filter((m) => m.status === "PENDING");
  const active = members.filter((m) => m.status === "ACTIVE");

  return (
    <div className="space-y-6">
      {isHost && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Beitrittsanfragen ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-base-border">
            {pending.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar name={m.displayName} src={m.avatarUrl} size="sm" />
                  <span className="text-sm font-medium text-ink">{m.displayName}</span>
                </div>
                <Button size="sm" onClick={() => act(m.id, "APPROVE")}>
                  <Check className="h-4 w-4" /> Aufnehmen
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isHost && (
        <Card>
          <CardHeader>
            <CardTitle>Team-Verwaltung</CardTitle>
          </CardHeader>
          <CardContent>
            <Switch
              checked={state.room.teamsLocked}
              onChange={toggleLock}
              label="Teams gesperrt"
              description="Solange gesperrt, können Mitglieder ihr Team nicht selbst wechseln – nur du kannst manuell zuweisen."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mitglieder ({active.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="Noch keine Mitglieder" />
          ) : (
            <div className="divide-y divide-base-border">
              {active.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar name={m.displayName} src={m.avatarUrl} size="sm" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-base-card ${
                          online.has(m.userId) ? "bg-success" : "bg-ink-faint"
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{m.displayName}</span>
                        {m.isTeamLead && <Crown className="h-3.5 w-3.5 text-warning" />}
                      </div>
                      <div className="flex gap-1.5 text-xs text-ink-faint">
                        <Badge className="bg-white/5 text-ink-muted">{ROOM_ROLE_LABELS[m.role]}</Badge>
                        {m.teamSide && <span>Team {m.teamSide}</span>}
                      </div>
                    </div>
                  </div>

                  {isHost && m.role !== "HOST" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={m.teamSide ?? ""} onChange={(e) => act(m.id, "ASSIGN_TEAM", e.target.value || null)} className="h-8 w-36 text-xs">
                        <option value="">Zuschauer</option>
                        {state.teams.map((t) => (
                          <option key={t.id} value={t.side}>
                            Team {t.side} – {t.name}
                          </option>
                        ))}
                      </Select>
                      {m.teamId &&
                        (m.isTeamLead ? (
                          <Button variant="ghost" size="sm" onClick={() => act(m.id, "DEMOTE_LEAD")}>
                            Lead entfernen
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => act(m.id, "PROMOTE_LEAD")}>
                            Zum Lead ernennen
                          </Button>
                        ))}
                      <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(m)}>
                        <UserX className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) act(pendingRemoval.id, "REMOVE");
          setPendingRemoval(null);
        }}
        title={`${pendingRemoval?.displayName ?? "Mitglied"} entfernen?`}
        description="Die Person kann dem Raum nur mit einem neuen Beitritt wieder beitreten."
        confirmLabel="Entfernen"
        variant="danger"
      />
    </div>
  );
}
