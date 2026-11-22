"use client";
import { useEffect } from "react";
import { actions, type SavedItem } from "@/lib/client/store";

/** Records a detail-page visit in "recently viewed" (device-local). */
export function TrackView({ item }: { item: Omit<SavedItem, "savedAt"> }) {
  useEffect(() => {
    actions.pushRecent(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  return null;
}
