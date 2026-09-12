import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

export interface MarkerView {
  id: string;
  dimension: string;
  x: number;
  y: number | null;
  z: number;
  title: string;
  description: string | null;
  category: string;
  ownerId: string;
  ownerName: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingView {
  id: string;
  dimension: string;
  type: string;
  points: { x: number; z: number }[];
  text: string | null;
  color: string;
  ownerId: string;
  ownerName: string;
  visibility: string;
  layerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Serverweit sichtbare Einträge + eigene private Einträge; Admins sehen
 * zusätzlich fremde private Einträge (zur Moderation), aber gekennzeichnet. */
function visibilityWhere(user: SessionUser) {
  if (user.role === "ADMIN") return {};
  return { OR: [{ visibility: "SERVER" }, { ownerId: user.id }] };
}

export async function getMarkers(serverId: string, dimension: string, user: SessionUser): Promise<MarkerView[]> {
  const markers = await prisma.mapMarker.findMany({
    where: { serverId, dimension, ...visibilityWhere(user) },
    include: { owner: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return markers.map((m) => ({
    id: m.id,
    dimension: m.dimension,
    x: m.x,
    y: m.y,
    z: m.z,
    title: m.title,
    description: m.description,
    category: m.category,
    ownerId: m.ownerId,
    ownerName: m.owner.displayName,
    visibility: m.visibility,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));
}

export async function getDrawings(serverId: string, dimension: string, user: SessionUser): Promise<DrawingView[]> {
  const drawings = await prisma.mapDrawing.findMany({
    where: { serverId, dimension, ...visibilityWhere(user) },
    include: { owner: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return drawings.map((d) => ({
    id: d.id,
    dimension: d.dimension,
    type: d.type,
    points: JSON.parse(d.points),
    text: d.text,
    color: d.color,
    ownerId: d.ownerId,
    ownerName: d.owner.displayName,
    visibility: d.visibility,
    layerName: d.layerName,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export interface LivePlayerPosition {
  uuid: string;
  username: string;
  x: number;
  y: number;
  z: number;
  dimension: string;
  updatedAt: string;
}

/** v1: alle angemeldeten Mitglieder sehen die Position aller ONLINE Spieler,
 * die der Connector meldet - keine feingranulare Pro-Spieler-ACL (siehe
 * README, "Bekannte Einschränkungen"). */
export async function getLivePlayerPositions(): Promise<LivePlayerPosition[]> {
  const accounts = await prisma.minecraftAccount.findMany({
    where: { isOnline: true, posX: { not: null } },
  });
  return accounts.map((a) => ({
    uuid: a.uuid,
    username: a.username,
    x: a.posX!,
    y: a.posY!,
    z: a.posZ!,
    dimension: a.posDimension!,
    updatedAt: a.posUpdatedAt!.toISOString(),
  }));
}
