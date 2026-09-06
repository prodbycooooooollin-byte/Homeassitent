import { prisma } from "@/lib/prisma";
import { jsonOk, parseBody, withApiErrors, ApiError } from "@/lib/api";
import { twitchLinkSchema } from "@/lib/validation";
import { requireUser } from "@/lib/server/route-helpers";
import { lookupTwitchUser, isTwitchConfigured, normalizeTwitchLogin } from "@/lib/twitch";

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const user = await requireUser();
    const { login } = await parseBody(req, twitchLinkSchema);
    const normalized = normalizeTwitchLogin(login);
    if (!normalized) throw new ApiError(400, "Ungültiger Twitch-Benutzername.");

    let verified = false;
    let twitchUserId: string | null = null;
    if (isTwitchConfigured()) {
      const remote = await lookupTwitchUser(normalized);
      if (!remote) throw new ApiError(404, "Dieser Twitch-Kanal wurde nicht gefunden.");
      verified = true;
      twitchUserId = remote.id;
    }

    const connection = await prisma.twitchConnection.upsert({
      where: { userId: user.id },
      update: { twitchLogin: normalized, twitchUserId, verified },
      create: { userId: user.id, twitchLogin: normalized, twitchUserId, verified },
    });

    return jsonOk({ twitchLogin: connection.twitchLogin, verified: connection.verified });
  });
}

export async function DELETE() {
  return withApiErrors(async () => {
    const user = await requireUser();
    await prisma.twitchConnection.deleteMany({ where: { userId: user.id } });
    return jsonOk({ ok: true });
  });
}
