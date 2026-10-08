import type { HistoryEntry, MatchDetails } from "./types";

/**
 * Findet deinen Spieler in den Match-Details, auch wenn dessen Account-ID dort fehlt oder abweicht
 * (z. B. anonymisiert): Held, Team und K/D/A müssen mit dem Historien-Eintrag übereinstimmen und eindeutig sein.
 * Gibt true zurück, wenn die ID ergänzt wurde.
 */
export function alignAccount(d: MatchDetails, account: number, h: HistoryEntry | undefined): boolean {
  if (!account || !h || d.players.some((p) => p.accountId === account)) return false;
  const base = d.players.filter((p) => p.team === h.team && p.heroId === h.heroId);
  const exact = base.filter((p) => p.kills === h.kills && p.deaths === h.deaths && p.assists === h.assists);
  const pick = exact.length === 1 ? exact : base.length === 1 ? base : [];
  if (pick.length !== 1) return false;
  pick[0].accountId = account;
  return true;
}
