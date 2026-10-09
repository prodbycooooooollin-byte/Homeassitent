import { parseAccountId } from "./steamid";

const ENDPOINT = "https://steamcommunity.com/openid/login";

/** URL, zu der der Nutzer für die Steam-Anmeldung geschickt wird. */
export function steamLoginUrl(origin: string): string {
  const q = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${origin}/api/steam/callback`,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${ENDPOINT}?${q}`;
}

export interface SteamVerifyResult { ok: boolean; steamId?: string; accountId?: number; error?: string }

/**
 * Prüft die Steam-OpenID-Antwort: Rücksprung-URL muss zu uns gehören, die Identität muss eine Steam-ID sein und
 * Steam selbst muss die Signatur per `check_authentication` bestätigen (nur das beweist, dass der Nutzer wirklich
 * dieser Steam-Account ist).
 */
export async function verifySteamAssertion(params: URLSearchParams, origin: string, doFetch: typeof fetch = fetch): Promise<SteamVerifyResult> {
  if (params.get("openid.mode") !== "id_res") return { ok: false, error: "Anmeldung abgebrochen" };
  if (params.get("openid.return_to") !== `${origin}/api/steam/callback`) return { ok: false, error: "Ungültige Rücksprung-Adresse" };
  const claimed = params.get("openid.claimed_id") ?? "";
  const m = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{15,20})$/);
  if (!m) return { ok: false, error: "Keine gültige Steam-ID" };

  const body = new URLSearchParams();
  params.forEach((v, k) => { if (k.startsWith("openid.")) body.set(k, v); });
  body.set("openid.mode", "check_authentication");
  try {
    const res = await doFetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    if (!/is_valid\s*:\s*true/i.test(text)) return { ok: false, error: "Steam hat die Anmeldung nicht bestätigt" };
  } catch (e) {
    return { ok: false, error: `Steam nicht erreichbar (${e instanceof Error ? e.message : String(e)})` };
  }
  const accountId = parseAccountId(m[1]);
  if (!accountId) return { ok: false, error: "Steam-ID nicht lesbar" };
  return { ok: true, steamId: m[1], accountId };
}
