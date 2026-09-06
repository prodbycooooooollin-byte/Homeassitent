import { getCurrentUser } from "@/lib/session";
import { getRoomState } from "@/lib/server/room-state";
import { ApiError, jsonOk, withApiErrors } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const user = await getCurrentUser();
    const state = await getRoomState(params.code, user?.id ?? null);
    if (!state) throw new ApiError(404, "Raum nicht gefunden.");
    if (!state.canSeeFullDetails) throw new ApiError(403, "Dieser Raum ist privat.");
    return jsonOk(state as unknown as Record<string, unknown>);
  });
}
