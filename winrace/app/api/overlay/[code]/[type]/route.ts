import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { getRoomState } from "@/lib/server/room-state";
import { getOverlayConfig, requireValidOverlayToken } from "@/lib/server/overlay";
import { overlayTypeSchema } from "@/lib/validation";

export async function GET(req: Request, { params }: { params: { code: string; type: string } }) {
  return withApiErrors(async () => {
    const typeResult = overlayTypeSchema.safeParse(params.type);
    if (!typeResult.success) throw new ApiError(404, "Unbekannter Overlay-Typ.");
    const type = typeResult.data;

    const room = await prisma.room.findUnique({ where: { code: params.code.trim().toUpperCase() } });
    if (!room) throw new ApiError(404, "Raum nicht gefunden.");

    const token = new URL(req.url).searchParams.get("token");
    // Öffentliche Demo-Räume und PUBLIC-Räume erlauben Overlays auch ohne
    // Token (praktisch zum Ausprobieren) – private Räume verlangen zwingend
    // ein gültiges, widerrufbares Overlay-Token.
    if (!room.isDemo && room.visibility !== "PUBLIC") {
      await requireValidOverlayToken(room.id, token);
    }

    const state = await getRoomState(params.code, null, { forceFullDetails: true });
    if (!state) throw new ApiError(404, "Raum nicht gefunden.");
    const config = await getOverlayConfig(room.id, type);

    return jsonOk({ state, config });
  });
}
