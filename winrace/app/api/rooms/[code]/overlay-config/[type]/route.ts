import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";
import { canManageOverlay } from "@/lib/server/permissions";
import { overlayConfigSchema, overlayTypeSchema } from "@/lib/validation";
import { getOverlayConfig, saveOverlayConfig } from "@/lib/server/overlay";

export async function GET(_req: Request, { params }: { params: { code: string; type: string } }) {
  return withApiErrors(async () => {
    const { room } = await requireActiveMember(params.code);
    const type = overlayTypeSchema.parse(params.type);
    const config = await getOverlayConfig(room.id, type);
    return jsonOk({ config });
  });
}

export async function PATCH(req: Request, { params }: { params: { code: string; type: string } }) {
  return withApiErrors(async () => {
    const { room, member } = await requireActiveMember(params.code);
    if (!canManageOverlay(member)) throw new ApiError(403, "Nur der Host bearbeitet Overlays.");

    const type = overlayTypeSchema.parse(params.type);
    const config = await parseBody(req, overlayConfigSchema);
    await saveOverlayConfig(room.id, type, config);

    return jsonOk({ ok: true });
  });
}
