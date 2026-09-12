import "server-only";
import { prisma } from "@/lib/db";
import { computeCounterpart } from "@/lib/portals/coords";

export interface PortalView {
  id: string;
  name: string;
  dimension: "OVERWORLD" | "NETHER";
  x: number;
  y: number | null;
  z: number;
  ownerName: string;
  linked: { id: string; name: string; dimension: string; x: number; z: number } | null;
  calculatedTarget: { dimension: string; x: number; z: number };
}

export async function getPortals(serverId: string): Promise<PortalView[]> {
  const portals = await prisma.portal.findMany({
    where: { serverId },
    include: {
      createdByUser: { select: { displayName: true } },
      linkedPortal: true,
      linkedFrom: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return portals.map((p) => {
    const linkedEntity = p.linkedPortal ?? p.linkedFrom ?? null;
    return {
      id: p.id,
      name: p.name,
      dimension: p.dimension as "OVERWORLD" | "NETHER",
      x: p.x,
      y: p.y,
      z: p.z,
      ownerName: p.createdByUser.displayName,
      linked: linkedEntity
        ? { id: linkedEntity.id, name: linkedEntity.name, dimension: linkedEntity.dimension, x: linkedEntity.x, z: linkedEntity.z }
        : null,
      calculatedTarget: computeCounterpart(p.dimension as "OVERWORLD" | "NETHER", p.x, p.z),
    };
  });
}
