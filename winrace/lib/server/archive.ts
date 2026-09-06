import { prisma } from "@/lib/prisma";

export async function listArchivedRooms(userId: string) {
  const rooms = await prisma.room.findMany({
    where: { isArchived: true, isDemo: false, members: { some: { userId } } },
    include: { teams: true, challenge: true },
    orderBy: { updatedAt: "desc" },
  });

  return rooms.map((r) => {
    const winner = r.challenge?.winnerTeamId ? r.teams.find((t) => t.id === r.challenge!.winnerTeamId) : null;
    return {
      code: r.code,
      name: r.name,
      logoUrl: r.logoUrl,
      endedAt: r.challenge?.endedAt ?? r.updatedAt,
      winnerName: winner?.name ?? null,
      winnerColor: winner?.color ?? null,
      teams: r.teams.map((t) => ({ name: t.name, color: t.color })),
    };
  });
}
