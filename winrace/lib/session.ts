import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Liest den eingeloggten Nutzer aus der Session (Server Components, Route Handlers). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

/** Lädt die Mitgliedschaft eines Nutzers in einem Raum (inkl. Team), falls vorhanden. */
export async function getRoomMembership(roomId: string, userId: string) {
  return prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    include: { team: true },
  });
}
