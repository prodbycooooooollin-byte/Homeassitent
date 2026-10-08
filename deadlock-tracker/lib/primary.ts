/** Auswahl des „Ich"-Accounts: rein, damit testbar. Fremde Spieler werden nie automatisch gewählt. */
export interface PlayerRef { accountId: number }

/**
 * Primärer Account: 1. gespeicherte Markierung (falls getrackt), 2. per Steam verbundener (falls getrackt),
 * 3. der zuerst hinzugefügte Account (kleinstes addedAt, sonst Listenreihenfolge).
 */
export function resolvePrimary(players: (PlayerRef & { addedAt?: number })[], stored: number | null, steamAccountId?: number | null): number | null {
  if (!players.length) return null;
  const has = (id?: number | null) => !!id && players.some((p) => p.accountId === id);
  if (has(stored)) return stored!;
  if (has(steamAccountId)) return steamAccountId!;
  const sorted = [...players].sort((a, b) => (a.addedAt ?? Infinity) - (b.addedAt ?? Infinity));
  return sorted[0].accountId;
}

/** Aktuell angezeigter Account: temporäre Auswahl nur, wenn sie noch getrackt ist – sonst der primäre. */
export function effectiveAccount(players: PlayerRef[], primary: number | null, picked: number | null): number | null {
  if (picked && players.some((p) => p.accountId === picked)) return picked;
  return primary;
}

export const profileViewHref = (accountId: number) => `/live?mode=player&id=${accountId}`;
