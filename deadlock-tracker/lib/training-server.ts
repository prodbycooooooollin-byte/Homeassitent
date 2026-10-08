import { fetchPerformanceCurve } from "./api";
import type { ReferencePoint, TrainingMatch } from "./training";
import { analyze, METRICS } from "./training";
import { classifyRoles, ratePlayer } from "./rating";
import { cachedHeroRole } from "./hero-roles-server";
import { getStore } from "./store";
import { lobbyBadge } from "./view";

export { METRICS };

const refCache = new Map<string, { at: number; data: ReferencePoint[] | null }>();

async function reference(heroId: number | null, badge: number | null): Promise<ReferencePoint[] | null> {
  if (!badge) return null;
  const tier = Math.floor(badge / 10);
  const key = `${heroId ?? 0}:${tier}`;
  const hit = refCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.data;
  let data: ReferencePoint[] | null = null;
  try {
    const lo = Math.max(1, tier - 1) * 10 + 1, hi = Math.min(11, tier + 1) * 10 + 6;
    data = await fetchPerformanceCurve(heroId, lo, hi);
    if (!data.length) data = null;
  } catch { data = null; }
  refCache.set(key, { at: Date.now(), data });
  return data;
}

/** Match-Eingaben für die Trainingsanalyse (neueste zuerst, optional nur ein Held). */
export function trainingMatches(accountId: number, n: number, heroId: number | null): TrainingMatch[] {
  const out: (TrainingMatch & { start: number })[] = [];
  for (const rec of Object.values(getStore().matches)) {
    const d = rec.details;
    if (!d || !rec.history[String(accountId)]) continue;
    const me = d.players.find((p) => p.accountId === accountId);
    if (!me) continue;
    if (heroId && me.heroId !== heroId) continue;
    const scores = new Map<number, number>();
    for (const p of d.players) {
      const r = ratePlayer(d, p.accountId, cachedHeroRole);
      if (r) scores.set(p.accountId, r.score);
    }
    const roles = new Map([...classifyRoles(d, cachedHeroRole)].map(([id, r]) => [id, r.key as string]));
    out.push({ details: d, me, scores, roles, won: d.winningTeam !== null && d.winningTeam === me.team, start: d.startTime });
  }
  return out.sort((a, b) => b.start - a.start).slice(0, n).map(({ start: _s, ...m }) => m);
}

export async function buildReport(accountId: number, n: number, heroId: number | null) {
  const ms = trainingMatches(accountId, n, heroId);
  const badges = ms.map((m) => lobbyBadge(m.details)).filter((b): b is number => !!b);
  const mine = ms.map((m) => m.me.badge).filter((b): b is number => !!b);
  const basis = mine.length ? mine : badges;
  const badge = basis.length ? Math.round(basis.reduce((a, b) => a + b, 0) / basis.length) : null;
  const ref = await reference(heroId, badge);
  return { report: analyze(ms, ref), hasReference: !!ref, badge };
}
