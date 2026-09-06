"use client";

import { useCallback, useEffect, useState } from "react";
import { useRoomState } from "@/lib/client/room-state-context";
import { useSocketEvent } from "@/lib/hooks/use-room-realtime";
import { ActivityFeedList, type ActivityItem } from "@/components/rooms/activity-feed-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityPage() {
  const { code, state } = useRoomState();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/rooms/${code}/activity?limit=25`);
    const data = await res.json();
    setItems(data.events ?? []);
    setCursor(data.nextCursor);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent("members:updated", load);
  useSocketEvent("teams:updated", load);
  useSocketEvent("challenge:updated", load);
  useSocketEvent("games:updated", load);
  useSocketEvent("progress:updated", load);

  async function handleUndo(logId: string) {
    const res = await fetch(`/api/rooms/${code}/progress/${logId}/undo`, { method: "POST" });
    if (res.ok) await load();
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await fetch(`/api/rooms/${code}/activity?limit=25&cursor=${cursor}`);
    const data = await res.json();
    setItems((prev) => [...prev, ...(data.events ?? [])]);
    setCursor(data.nextCursor);
    setLoadingMore(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivitätsprotokoll</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ActivityFeedList items={items} onUndo={state.viewer.permissions.canManageRoom ? handleUndo : undefined} />
            {cursor && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                  Mehr laden
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
