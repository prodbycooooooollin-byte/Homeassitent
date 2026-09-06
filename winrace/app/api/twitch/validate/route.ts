import { jsonOk, withApiErrors } from "@/lib/api";
import { lookupTwitchUser, isTwitchConfigured, normalizeTwitchLogin } from "@/lib/twitch";

export async function GET(req: Request) {
  return withApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    const login = searchParams.get("login") ?? "";
    const normalized = normalizeTwitchLogin(login);
    if (!normalized) return jsonOk({ valid: false, reason: "invalid-format" });

    if (!isTwitchConfigured()) {
      // Ohne Twitch-API-Zugangsdaten kann nur das Format geprüft werden.
      return jsonOk({ valid: true, unverified: true, login: normalized });
    }

    const user = await lookupTwitchUser(normalized);
    if (!user) return jsonOk({ valid: false, reason: "not-found" });
    return jsonOk({ valid: true, login: user.login, displayName: user.displayName, avatarUrl: user.profileImageUrl });
  });
}
