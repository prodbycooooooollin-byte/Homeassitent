"use client";

import { useState } from "react";
import { Trophy, Users, Gamepad2, Settings, Pause, Play, Flag, Undo2, ScrollText } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/time";

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  data?: { logId?: string } | null;
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
}

const ICONS: Record<string, typeof Trophy> = {
  GAME_COMPLETED: Trophy,
  WINNER_CONFIRMED: Trophy,
  CHALLENGE_ENDED: Trophy,
  MEMBER_JOINED: Users,
  TEAM_ASSIGNED: Users,
  LEAD_ASSIGNED: Users,
  MEMBER_REMOVED: Users,
  JOIN_REQUESTED: Users,
  JOIN_APPROVED: Users,
  GAME_ADDED: Gamepad2,
  GAME_UPDATED: Gamepad2,
  GAME_DELETED: Gamepad2,
  GAMES_REORDERED: Gamepad2,
  CURRENT_GAME_SELECTED: Gamepad2,
  ROOM_SETTINGS_UPDATED: Settings,
  ROOM_CREATED: Settings,
  ROOM_ARCHIVED: Settings,
  CHALLENGE_PAUSED: Pause,
  CHALLENGE_RESUMED: Play,
  CHALLENGE_STARTED: Play,
  CHALLENGE_READY: Play,
  PROGRESS_UNDO: Undo2,
};

export function ActivityFeedList({
  items,
  emptyHint,
  onUndo,
}: {
  items: ActivityItem[];
  emptyHint?: string;
  /** Nur übergeben, wenn der Betrachter Host ist – blendet den "Rückgängig"-Button ein. */
  onUndo?: (logId: string) => Promise<void>;
}) {
  const [undoing, setUndoing] = useState<string | null>(null);

  if (items.length === 0) {
    return <EmptyState icon={<ScrollText className="h-6 w-6" />} title="Noch keine Aktivität" description={emptyHint} />;
  }

  async function handleUndo(logId: string) {
    if (!onUndo) return;
    setUndoing(logId);
    try {
      await onUndo(logId);
    } finally {
      setUndoing(null);
    }
  }

  return (
    <ol className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.type] ?? ScrollText;
        const logId = item.type === "PROGRESS_UPDATE" ? item.data?.logId : undefined;
        return (
          <li key={item.id} className="flex items-start gap-3 rounded-lg px-1 py-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-ink-faint">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-muted">{item.message}</p>
              <p className="text-xs text-ink-faint">{formatRelativeTime(new Date(item.createdAt))}</p>
            </div>
            {onUndo && logId && (
              <Button variant="ghost" size="sm" onClick={() => handleUndo(logId)} loading={undoing === logId}>
                <Undo2 className="h-3.5 w-3.5" /> Rückgängig
              </Button>
            )}
            {item.actor && <Avatar name={item.actor.displayName} src={item.actor.avatarUrl} size="xs" />}
          </li>
        );
      })}
    </ol>
  );
}
