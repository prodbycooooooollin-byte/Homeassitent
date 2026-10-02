import { useEffect, useMemo, useState } from "react";
import { useLive } from "@/store/live";
import { useProject } from "@/store/project";
import { loadHistory, type HistoryResult } from "@/energy/history";
import type { RangeKind } from "@/energy/series";
import { rangeBounds } from "@/energy/series";

const cache = new Map<string, HistoryResult>();

export function useHistory(range: RangeKind, anchor: number) {
  const source = useLive((s) => s.source);
  const statMeta = useLive((s) => s.statMeta);
  const states = useLive((s) => s.states);
  const synced = useLive((s) => s.synced);
  const meters = useProject((s) => s.project?.meters);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const units = useMemo(() => {
    const u: Record<string, string | null> = {};
    for (const m of meters ?? []) {
      for (const id of [m.powerEntityId, m.energyEntityId]) {
        if (id) {
          const a = states[id]?.attributes;
          u[id] = typeof a?.unit_of_measurement === "string" ? a.unit_of_measurement : null;
        }
      }
    }
    return u;
    // Einheiten ändern sich selten – nur bei Messpunktänderungen neu bestimmen
  }, [meters, synced]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = useMemo(() => {
    const day = new Date(anchor);
    day.setHours(0, 0, 0, 0);
    return `${source?.mode}:${range}:${day.getTime()}:${JSON.stringify(meters?.map((m) => [m.id, m.powerEntityId, m.energyEntityId, m.invertPower, m.flow]))}:${tick}`;
  }, [source, range, anchor, meters, tick]);

  useEffect(() => {
    if (!source || !meters || statMeta === null) return;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.loadedAt < 5 * 60_000) {
      setResult(hit);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadHistory(source, meters, range, new Date(anchor), statMeta, units)
      .then((r) => {
        if (cancelled) return;
        cache.set(key, r);
        setResult(r);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, statMeta, source]); // eslint-disable-line react-hooks/exhaustive-deps

  // Laufenden Zeitraum alle 5 Minuten aktualisieren
  useEffect(() => {
    const { end } = rangeBounds(range, new Date(anchor));
    if (end < Date.now()) return;
    const t = setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => clearInterval(t);
  }, [range, anchor]);

  return { result: result && cache.has(key) ? result : result, loading, error, reload: () => setTick((n) => n + 1) };
}
