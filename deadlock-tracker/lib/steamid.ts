const STEAM64_BASE = BigInt("76561197960265728");

/** Akzeptiert Steam32-Account-ID, Steam64-ID oder steamcommunity.com/profiles/<id>-URL. */
export function parseAccountId(input: string): number | null {
  const s = input.trim();
  const m = s.match(/steamcommunity\.com\/profiles\/(\d+)/i);
  const digits = m ? m[1] : /^\d+$/.test(s) ? s : null;
  if (!digits) return null;
  try {
    const n = BigInt(digits);
    const id = n >= STEAM64_BASE ? n - STEAM64_BASE : n;
    if (id <= BigInt(0) || id > BigInt(0xffffffff)) return null;
    return Number(id);
  } catch {
    return null;
  }
}
