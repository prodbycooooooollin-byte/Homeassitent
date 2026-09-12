import "server-only";
import { prisma } from "@/lib/db";

export async function getProjects(serverId: string) {
  return prisma.buildProject.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
    include: {
      createdByUser: { select: { displayName: true } },
      members: { include: { user: { select: { id: true, displayName: true } } } },
      tasks: { orderBy: { createdAt: "asc" } },
      materials: true,
    },
  });
}

export type ProjectWithDetails = Awaited<ReturnType<typeof getProjects>>[number];
