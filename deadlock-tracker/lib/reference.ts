import { fetchPerformanceCurve } from "./api";
import { averageBadge } from "./ranks";
import { getStore, saveStore } from "./store";
import type { MatchDetails, RefStats } from "./types";

/* Referenzwerte: Durchschnitt eines abgeschlossenen Ranked-Matches je Rang-Tier (API player-performance-curve, letzter Fortschritts-Punkt).
 * Die Note vergleicht damit zusätzlich gegen das Niveau deines Ranges – nicht nur gegen die Lobby. */

const STALE_MS = 12 * 3600_000;
const tierOfBadge = (b: number) => Math.floor(b / 10);

function lobbyTier(d: MatchDetails): number | null {
  const b = averageBadge([...d.avgBadge]) ?? averageBadge(d.players.map((p) => p.badge));
  return b ? Math.min(11, Math.max(1, tierOfBadge(Math.round(b)))) : null;
}

/** Referenz für ein Match (sofort aus dem Speicher; null solange noch nichts geladen wurde). */
export function refFor(d: MatchDetails): RefStats | null {
  const refs = getStore().refs;
  const t = lobbyTier(d);
  if (!refs || t === null) return null;
  // nächstliegendes vorhandenes Tier (±1) verwenden
  for (const dt of [0, -1, 1]) { const r = refs[String(t + dt)]; if (r) return r; }
  return null;
}

/** Lädt fehlende/veraltete Referenzen für die Tiers der letzten Matches (höchstens 3 pro Aufruf). */
export async function refreshRefs(now = Date.now()): Promise<number> {
  const store = getStore();
  const tiers = new Map<number, number>();
  for (const rec of Object.values(store.matches).sort((a, b) => b.startTime - a.startTime).slice(0, 60)) {
    const t = rec.details ? lobbyTier(rec.details) : null;
    if (t !== null) tiers.set(t, (tiers.get(t) ?? 0) + 1);
  }
  const need = [...tiers.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => !store.refs?.[String(t)] || now - (store.refs[String(t)].at ?? 0) > STALE_MS).slice(0, 3);
  let n = 0;
  for (const t of need) {
    try {
      const curve = await fetchPerformanceCurve(null, Math.max(1, t - 1) * 10 + 1, Math.min(11, t + 1) * 10 + 6);
      const last = curve[curve.length - 1];
      if (!last || !(last.d[0] > 0) || !(last.nw[0] > 0)) continue;
      store.refs = { ...(store.refs ?? {}), [String(t)]: { k: last.k[0], d: last.d[0], a: last.a[0], nw: last.nw[0], dmg: last.dmg[0], at: now } };
      n++;
    } catch { /* Referenz ist optional */ }
  }
  if (n) saveStore();
  return n;
}
