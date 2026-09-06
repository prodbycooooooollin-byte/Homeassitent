"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatDuration } from "@/lib/time";
import type { ChallengeView } from "@/lib/types";

/**
 * Rein clientseitige Ticker-Anzeige zwischen zwei Server-Syncs. Maßgeblich
 * für Timer/Gewinner-Ermittlung bleibt ausschließlich der serverseitig
 * berechnete `elapsedMs`-Wert (siehe lib/time.ts) – hier wird nur zwischen
 * zwei Fetches linear hochgezählt, damit die Anzeige nicht "einfriert".
 */
export function useTicker(challenge: ChallengeView | null) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (challenge?.status !== "RUNNING") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [challenge?.status]);

  if (!challenge) return { elapsedLabel: "00:00", remainingLabel: null as string | null };

  const liveElapsed = challenge.status === "RUNNING" ? challenge.elapsedMs + tick * 1000 : challenge.elapsedMs;
  const remaining = challenge.remainingMs !== null ? Math.max(0, challenge.remainingMs - (challenge.status === "RUNNING" ? tick * 1000 : 0)) : null;

  return {
    elapsedLabel: formatDuration(liveElapsed),
    remainingLabel: remaining !== null ? formatDuration(remaining) : null,
  };
}

export function ChallengeTimer({ challenge }: { challenge: ChallengeView | null }) {
  const { elapsedLabel, remainingLabel } = useTicker(challenge);

  return (
    <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm font-medium text-ink tabular-nums">
      <Clock className="h-4 w-4 text-ink-faint" />
      {elapsedLabel}
      {remainingLabel && <span className="text-ink-faint">· {remainingLabel} übrig</span>}
    </div>
  );
}
