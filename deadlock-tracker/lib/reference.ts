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

/** Referenz für ein Match und einen Helden: bevorzugt der Durchschnitt dieses Helden auf diesem Rang, sonst der Rang-Durchschnitt. */
export function refFor(d: MatchDetails, heroId?: number): RefStats | null {
  const refs = getStore().refs;
  const t = lobbyTier(d);
  if (!refs || t === null) return null;
  if (heroId) for (const dt of [0, -1, 1]) { const r = refs[`h${heroId}:${t + dt}`]; if (r && r.d > 0) return { ...r, hero: true }; }
  for (const dt of [0, -1, 1]) { const r = refs[String(t + dt)]; if (r && r.d > 0) return r; }
  return null;
}

const key = (hero: number | null, t: number) => (hero ? `h${hero}:${t}` : String(t));

/** Lädt fehlende/veraltete Referenzen (Rang-Durchschnitt und Held×Rang der getrackten Spieler); höchstens 4 pro Aufruf. */
export async function refreshRefs(now = Date.now()): Promise<number> {
  const store = getStore();
  const want = new Map<string, { hero: number | null; tier: number; n: number }>();
  const add = (hero: number | null, tier: number) => { const k = key(hero, tier); const e = want.get(k) ?? { hero, tier, n: 0 }; e.n++; want.set(k, e); };
  for (const rec of Object.values(store.matches).sort((a, b) => b.startTime - a.startTime).slice(0, 80)) {
    const d = rec.details; const t = d ? lobbyTier(d) : null;
    if (!d || t === null) continue;
    add(null, t);
    for (const p of d.players) if (store.players[String(p.accountId)]) add(p.heroId, t);
  }
  const need = [...want.values()].sort((a, b) => (a.hero === null ? -1 : 0) - (b.hero === null ? -1 : 0) || b.n - a.n)
    .filter((w) => { const r = store.refs?.[key(w.hero, w.tier)]; return !r || now - (r.at ?? 0) > STALE_MS; }).slice(0, 4);
  let n = 0;
  for (const w of need) {
    try {
      const curve = await fetchPerformanceCurve(w.hero, Math.max(1, w.tier - 1) * 10 + 1, Math.min(11, w.tier + 1) * 10 + 6);
      const last = curve[curve.length - 1];
      if (!last || !(last.d[0] > 0) || !(last.nw[0] > 0)) { store.refs = { ...(store.refs ?? {}), [key(w.hero, w.tier)]: { k: 0, d: 0, a: 0, nw: 0, dmg: 0, at: now - STALE_MS + 3600_000 } }; continue; }
      store.refs = { ...(store.refs ?? {}), [key(w.hero, w.tier)]: { k: last.k[0], d: last.d[0], a: last.a[0], nw: last.nw[0], dmg: last.dmg[0], at: now } };
      n++;
    } catch { /* Referenz ist optional */ }
  }
  if (n || need.length) saveStore();
  return n;
}
