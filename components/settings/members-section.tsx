"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { updateUserRoleAction } from "@/lib/actions/members";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";

export interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  mcUsername: string | null;
  mcUuid: string | null;
}

export function MembersSection({ members, currentUserId }: { members: MemberRow[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(userId: string, role: string) {
    setErrors((e) => ({ ...e, [userId]: "" }));
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, role);
      if (!result.ok) {
        setErrors((e) => ({ ...e, [userId]: result.error ?? "Fehler." }));
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mitglieder ({members.length})</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-raised">
            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar username={m.mcUsername ?? m.displayName} uuid={m.mcUuid} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{m.displayName}</p>
                <p className="truncate text-xs text-ink-muted">{m.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {errors[m.id] && <span className="text-xs text-danger">{errors[m.id]}</span>}
              <select
                className="rounded-lg border border-line bg-surface-raised px-2 py-1.5 text-xs text-ink disabled:opacity-50"
                value={m.role}
                disabled={pending || m.id === currentUserId}
                onChange={(e) => handleChange(m.id, e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
