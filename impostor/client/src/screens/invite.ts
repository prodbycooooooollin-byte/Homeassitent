import { isValidLobbyCode, LOBBY_CODE_ALPHABET, LIMITS } from '../../../shared/protocol.ts';

/** Lobby-Code aus dem Einladungslink (?lobby=CODE) der aktuellen Seite. */
export function invitedCode(): string | null {
  try {
    const raw = new URLSearchParams(location.search).get('lobby') ?? '';
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return isValidLobbyCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** Entfernt ?lobby= aus der Adresszeile, erhält aber andere Parameter (z. B. ?slot=). */
export function clearInviteFromUrl(): void {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('lobby')) return;
    url.searchParams.delete('lobby');
    history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch {
    /* ignorieren */
  }
}

/**
 * Liest einen Lobby-Code aus beliebiger Eingabe: „k7qxm", „K7Q XM",
 * oder einem eingefügten Einladungslink „https://…/?lobby=K7QXM".
 */
export function extractLobbyCode(input: string): string {
  const m = input.match(/[?&]lobby=([A-Za-z0-9]+)/);
  const raw = m ? m[1] : input;
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, LIMITS.lobbyCodeLength);
}

/** Erklärt, warum ein Code ungültig ist – oder null, wenn er formal passt. */
export function codeProblem(code: string): string | null {
  if (code.length < LIMITS.lobbyCodeLength) return `Der Code hat ${LIMITS.lobbyCodeLength} Zeichen.`;
  for (const ch of code) {
    if (!LOBBY_CODE_ALPHABET.includes(ch)) {
      return `„${ch}" kommt in Lobby-Codes nicht vor. Verwechslungsgefahr: 0/O, 1/I/L, 2/Z, 5/S, 8/B werden nie verwendet.`;
    }
  }
  return null;
}
