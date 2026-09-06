import { prisma } from "@/lib/prisma";
import { jsonOk, parseBody, withApiErrors, ApiError } from "@/lib/api";
import { profileUpdateSchema } from "@/lib/validation";
import { requireUser } from "@/lib/server/route-helpers";

export async function GET() {
  return withApiErrors(async () => {
    const user = await requireUser();
    const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return jsonOk({ id: full.id, displayName: full.displayName, avatarUrl: full.avatarUrl, soundEnabled: full.soundEnabled, reduceMotion: full.reduceMotion });
  });
}

export async function PATCH(req: Request) {
  return withApiErrors(async () => {
    const user = await requireUser();
    const input = await parseBody(req, profileUpdateSchema);
    if (Object.keys(input).length === 0) throw new ApiError(400, "Keine Änderungen übergeben.");

    const updated = await prisma.user.update({ where: { id: user.id }, data: input });
    return jsonOk({ id: updated.id, displayName: updated.displayName, avatarUrl: updated.avatarUrl, soundEnabled: updated.soundEnabled, reduceMotion: updated.reduceMotion });
  });
}
