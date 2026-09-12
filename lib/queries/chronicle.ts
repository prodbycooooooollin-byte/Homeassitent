import "server-only";
import { prisma } from "@/lib/db";

export async function getRecentEvents(serverId: string, limit = 25) {
  return prisma.serverEvent.findMany({
    where: { serverId },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { createdByUser: { select: { displayName: true } } },
  });
}
