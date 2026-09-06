import { prisma } from "@/lib/prisma";
import { ApiError, jsonOk, withApiErrors } from "@/lib/api";
import { requireActiveMember } from "@/lib/server/route-helpers";

export async function GET(req: Request) {
  return withApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    if (!code) throw new ApiError(400, "code fehlt.");
    const { room, user } = await requireActiveMember(code);

    const notifications = await prisma.notification.findMany({
      where: { roomId: room.id, OR: [{ userId: null }, { userId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return jsonOk({
      notifications: notifications.map((n) => ({ id: n.id, type: n.type, message: n.message, createdAt: n.createdAt })),
    });
  });
}
