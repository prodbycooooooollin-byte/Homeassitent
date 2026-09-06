import { z } from "zod";
import { jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { resetDemoRoom } from "@/lib/server/demo";
import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socket-server";

const schema = z.object({ code: z.string().min(4) });

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const { code } = await parseBody(req, schema);
    await resetDemoRoom(code);

    const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() } });
    if (room) {
      emitToRoom(room.id, "progress:updated", { roomId: room.id });
      emitToRoom(room.id, "challenge:updated", { roomId: room.id });
      emitToRoom(room.id, "teams:updated", { roomId: room.id });
    }

    return jsonOk({ ok: true });
  });
}
