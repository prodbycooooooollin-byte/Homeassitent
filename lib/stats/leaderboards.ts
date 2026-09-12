import "server-only";
import { prisma } from "@/lib/db";

export type LeaderboardMetric = "playtimeTicks" | "blocksMinedTotal" | "mobKillsTotal" | "deathsTotal";
export type LeaderboardPeriod = "total" | "week" | "month";

export interface LeaderboardEntry {
  rank: number;
  minecraftAccountId: string;
  uuid: string;
  username: string;
  value: number;
}

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function startOfMonth(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

export function periodStart(period: LeaderboardPeriod): Date | null {
  if (period === "total") return null;
  if (period === "week") return startOfWeek();
  return startOfMonth();
}

/**
 * Berechnet eine Rangliste für eine Kennzahl über einen Zeitraum.
 *
 * Bei "total" wird der aktuelle kumulierte Wert direkt verwendet (auch
 * importierte Alt-Statistiken zählen korrekt zum Gesamtwert).
 *
 * Bei "week"/"month" wird ein DELTA gebildet: aktueller Wert minus Wert der
 * letzten Meldung VOR Beginn des Zeitraums. Hat ein Spieler noch keine
 * Meldung vor Zeitraumbeginn (weil die Datenerfassung erst danach
 * begonnen hat), wird stattdessen seine ALLERERSTE Meldung als Basislinie
 * verwendet - so wird nie ein importierter Lebenszeit-Gesamtwert
 * fälschlich als "diese Woche erspielt" ausgewiesen.
 */
export async function computeLeaderboard(
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
): Promise<LeaderboardEntry[]> {
  const windowStart = periodStart(period);

  const snapshots = await prisma.playerStatSnapshot.findMany({
    orderBy: { capturedAt: "asc" },
    include: { account: { select: { uuid: true, username: true } } },
  });

  const byAccount = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const list = byAccount.get(s.minecraftAccountId);
    if (list) list.push(s);
    else byAccount.set(s.minecraftAccountId, [s]);
  }

  const entries: Omit<LeaderboardEntry, "rank">[] = [];
  for (const [accountId, list] of byAccount) {
    const latest = list[list.length - 1];
    let value: number;
    if (!windowStart) {
      value = latest[metric];
    } else {
      const baseline = [...list].reverse().find((s) => s.capturedAt <= windowStart) ?? list[0];
      value = Math.max(0, latest[metric] - baseline[metric]);
    }
    entries.push({
      minecraftAccountId: accountId,
      uuid: latest.account.uuid,
      username: latest.account.username,
      value,
    });
  }

  entries.sort((a, b) => b.value - a.value);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

export async function getEarliestDataDate(): Promise<Date | null> {
  const first = await prisma.playerStatSnapshot.findFirst({ orderBy: { capturedAt: "asc" } });
  return first?.capturedAt ?? null;
}
