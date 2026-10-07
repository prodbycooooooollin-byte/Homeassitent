import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getCallLog, steamBudgetLeft } from "@/lib/diag";
import { formatBadge } from "@/lib/ranks";
import { isDemo } from "@/lib/api";

export const dynamic = "force-dynamic";

const BASE = () => (process.env.DEADLOCK_API_URL || "https://api.deadlock-api.com").replace(/\/$/, "");
interface Check { name: string; url: string; ok: boolean; status: number | "ERR"; ms: number; summary: string; limits?: string }

async function probe(name: string, path: string, summarize: (j: unknown) => string): Promise<Check> {
  const url = `${BASE()}${path}`;
  const t0 = Date.now();
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.DEADLOCK_API_KEY) headers["x-api-key"] = process.env.DEADLOCK_API_KEY;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000), cache: "no-store" });
    const limits = [...res.headers.entries()].filter(([k]) => /ratelimit|retry-after/i.test(k)).map(([k, v]) => `${k}: ${v}`).join(" · ");
    let summary = `HTTP ${res.status}`;
    if (res.ok) summary = summarize(await res.json().catch(() => null));
    else if (res.status === 404) summary = "404 – (noch) nicht vorhanden";
    else if (res.status === 429) summary = "429 – Rate-Limit erreicht";
    return { name, url: path, ok: res.ok, status: res.status, ms: Date.now() - t0, summary, limits: limits || undefined };
  } catch (e) {
    return { name, url: path, ok: false, status: "ERR", ms: Date.now() - t0, summary: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST() {
  if (isDemo()) return NextResponse.json({ demo: true, checks: [] });
  const store = getStore();
  const me = Object.values(store.players)[0];
  const checks: Check[] = [];
  const arr = (j: unknown) => (Array.isArray(j) ? j : []);
  checks.push(await probe("Helden-Assets", "/v1/assets/heroes", (j) => `${arr(j).length} Helden`));
  checks.push(await probe("Rang-Assets", "/v1/assets/ranks", (j) => `${arr(j).length} Ränge`));
  checks.push(await probe("Rang-Bild (Beispiel)", "/v1/assets/ranks/1/5/image", () => "Bild erreichbar"));
  if (me) {
    let newest = 0;
    checks.push(await probe("Match-Historie", `/v1/players/${me.accountId}/match-history`, (j) => {
      const a = arr(j) as { match_id?: number; start_time?: number }[];
      newest = a.sort((x, y) => (y.start_time ?? 0) - (x.start_time ?? 0))[0]?.match_id ?? 0;
      return `${a.length} Matches${newest ? `, neuestes #${newest}` : ""}`;
    }));
    checks.push(await probe("Aktueller Rang", `/v1/players/${me.accountId}/rank`, (j) => {
      const b = Number((j as { badge?: number } | null)?.badge);
      return b > 0 ? `${formatBadge(b)} (Badge ${b})` : "kein Ranked-Rang bekannt (nur Ranked-Matches tragen einen Rang)";
    }));
    checks.push(await probe("Steam-Profil", `/v1/players/steam?account_ids=${me.accountId}`, (j) => String((arr(j)[0] as { personaname?: string } | undefined)?.personaname ?? "kein Profil")));
    checks.push(await probe("Laufende Matches", `/v1/matches/active?account_ids=${me.accountId}`, (j) => `${arr(j).length} laufend`));
    if (newest) checks.push(await probe("Match-Details (ohne Steam-Fallback)", `/v1/matches/${newest}/metadata?disable_steam=true`, (j) => {
      const info = ((j as { match_info?: { players?: unknown[] } } | null)?.match_info) ?? {};
      return `${(info.players ?? []).length} Spieler`;
    }));
  } else {
    checks.push({ name: "Account", url: "-", ok: false, status: "ERR", ms: 0, summary: "Noch kein Account getrackt – Historie/Rang/Details können nicht geprüft werden." });
  }
  checks.push(await probe("Meta (Analytics)", `/v1/analytics/hero-stats?min_unix_timestamp=${Math.floor(Date.now() / 1000) - 7 * 86400}&match_mode=ranked&bucket=no_bucket`, (j) => `${arr(j).length} Helden`));
  checks.push(await probe("Bestenliste", "/v1/leaderboard/Europe", (j) => `${((j as { entries?: unknown[] } | null)?.entries ?? []).length} Einträge`));

  const matches = Object.values(store.matches);
  return NextResponse.json({
    demo: false,
    base: BASE(),
    apiKey: !!process.env.DEADLOCK_API_KEY,
    checks,
    store: {
      players: Object.keys(store.players).length,
      matches: matches.length,
      withDetails: matches.filter((m) => m.details).length,
      pending: matches.filter((m) => !m.details && m.nextDetailsAttemptAt < Number.MAX_SAFE_INTEGER).length,
      steamBudgetLeft: steamBudgetLeft(),
      errors: matches.filter((m) => !m.details && m.lastError).sort((a, b) => b.startTime - a.startTime).slice(0, 8)
        .map((m) => ({ matchId: m.matchId, attempts: m.detailsAttempts, error: m.lastError })),
    },
    log: getCallLog().slice(0, 40),
  });
}

export async function GET() {
  const store = getStore();
  const matches = Object.values(store.matches);
  return NextResponse.json({ log: getCallLog().slice(0, 40), pending: matches.filter((m) => !m.details).length });
}
