import { prisma } from "@/lib/prisma";
import { jsonOk, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";

export async function GET(req: Request, { params }: { params: { code: string } }) {
  return withApiErrors(async () => {
    const { room } = await requireActiveMember(params.code);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Number(searchParams.get("limit") ?? 30));
    const cursor = searchParams.get("cursor");

    const events = await prisma.activityEvent.findMany({
      where: { roomId: room.id },
      include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return jsonOk({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        data: e.data,
        createdAt: e.createdAt,
        actor: e.actor ? { id: e.actor.id, displayName: e.actor.displayName, avatarUrl: e.actor.avatarUrl } : null,
      })),
      nextCursor: events.length === limit ? events[events.length - 1]?.id ?? null : null,
    });
  });
}
