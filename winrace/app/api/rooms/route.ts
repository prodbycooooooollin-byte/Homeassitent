import { requireUser } from "@/lib/server/route-helpers";
import { createRoomSchema } from "@/lib/validation";
import { jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { createRoom } from "@/lib/server/rooms";

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const user = await requireUser();
    const input = await parseBody(req, createRoomSchema);
    const room = await createRoom(user.id, input);
    return jsonOk({ code: room.code }, 201);
  });
}
