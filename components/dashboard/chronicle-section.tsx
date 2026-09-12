"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Rocket, Flag, Trophy, Hammer, UserPlus, Power, Sparkles } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addMilestoneAction } from "@/lib/actions/chronicle";
import { formatDateTime } from "@/lib/format";
import type { ServerEventType } from "@/lib/constants";

const ICONS: Record<ServerEventType, typeof Rocket> = {
  MILESTONE: Flag,
  SERVER_START: Power,
  SERVER_STOP: Power,
  ADVANCEMENT: Trophy,
  GOAL_COMPLETED: Sparkles,
  PROJECT_CREATED: Hammer,
  PLAYER_FIRST_JOIN: UserPlus,
  OTHER: Rocket,
};

export interface ChronicleEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: Date;
  isAutomatic: boolean;
  createdByUser: { displayName: string } | null;
}

export function ChronicleSection({ events, canAdd }: { events: ChronicleEvent[]; canAdd: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Serverchronik</CardTitle>
        {canAdd && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            <Plus size={13} /> Meilenstein
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {open && (
          <form
            action={(fd) =>
              startTransition(async () => {
                await addMilestoneAction(fd);
                setOpen(false);
                router.refresh();
              })
            }
            className="space-y-2 rounded-lg border border-line bg-surface-raised p-3"
          >
            <input
              name="title"
              placeholder="z. B. „Spawn fertiggestellt“"
              required
              className="w-full rounded-lg border border-line bg-base px-3 py-1.5 text-sm text-ink"
            />
            <textarea
              name="description"
              placeholder="Beschreibung (optional)"
              rows={2}
              className="w-full rounded-lg border border-line bg-base px-3 py-1.5 text-sm text-ink"
            />
            <Button type="submit" size="sm" disabled={pending}>
              Hinzufügen
            </Button>
          </form>
        )}

        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">Noch keine Ereignisse aufgezeichnet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const Icon = ICONS[e.type as ServerEventType] ?? Rocket;
              return (
                <div key={e.id} className="flex gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted">
                    <Icon size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{e.title}</p>
                    {e.description && <p className="text-xs text-ink-muted">{e.description}</p>}
                    <p className="text-xs text-ink-faint">
                      {formatDateTime(e.occurredAt)}
                      {!e.isAutomatic && e.createdByUser && ` · ${e.createdByUser.displayName}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
