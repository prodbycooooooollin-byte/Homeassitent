import { ApiError, jsonOk, parseBody, withApiErrors } from "@/lib/api";
import { simulateDemoProgress } from "@/lib/server/demo";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { broadcastActivity, broadcastNotification } from "@/lib/server/activity";
import { emitToRoom } from "@/lib/socket-server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ code: z.string().min(4) });

export async function POST(req: Request) {
  return withApiErrors(async () => {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = consumeRateLimit(`demo-sim:${ip}`, RATE_LIMITS.progressUpdate.limit, RATE_LIMITS.progressUpdate.windowMs);
    if (!rl.ok) throw new ApiError(429, "Bitte kurz warten.");

    const { code } = await parseBody(req, schema);
    const result = await simulateDemoProgress(code);

    const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() } });
    if (room) {
      broadcastActivity(room.id, result.activityEvent);
      if (result.gameCompletedEvent) broadcastActivity(room.id, result.gameCompletedEvent);
      if (result.winnerNotification) broadcastNotification(room.id, result.winnerNotification);
      emitToRoom(room.id, "progress:updated", { roomId: room.id });
      if (result.challengeFinished) emitToRoom(room.id, "challenge:updated", { roomId: room.id });
    }

    return jsonOk({ ok: true });
  });
}
