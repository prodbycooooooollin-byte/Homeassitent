import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/codes";
import { overlayConfigSchema, type OverlayConfigInput } from "@/lib/validation";
import type { OverlayType } from "@prisma/client";

const TYPE_DEFAULTS: Partial<Record<OverlayType, Partial<OverlayConfigInput>>> = {
  COMPACT: { compact: true, fontSize: "sm", showMemberAvatars: false },
  WINNER: { showAnimations: true, soundEnabled: true, fontSize: "xl" },
  CURRENT_GAME: { fontSize: "lg", showMemberAvatars: false },
  FULL_LIST: { compact: true },
};

export function defaultOverlayConfig(type: OverlayType): OverlayConfigInput {
  return overlayConfigSchema.parse({ ...TYPE_DEFAULTS[type] });
}

export async function getOverlayConfig(roomId: string, type: OverlayType): Promise<OverlayConfigInput> {
  const row = await prisma.overlayConfiguration.findUnique({ where: { roomId_type: { roomId, type } } });
  if (!row) return defaultOverlayConfig(type);
  const parsed = overlayConfigSchema.safeParse(row.config);
  return parsed.success ? parsed.data : defaultOverlayConfig(type);
}

export async function saveOverlayConfig(roomId: string, type: OverlayType, config: OverlayConfigInput) {
  return prisma.overlayConfiguration.upsert({
    where: { roomId_type: { roomId, type } },
    update: { config },
    create: { roomId, type, config },
  });
}

export async function createOverlayToken(roomId: string, createdById: string, label?: string) {
  const { token, tokenHash } = generateOpaqueToken();
  const record = await prisma.overlayToken.create({
    data: { roomId, tokenHash, label, createdById },
  });
  return { id: record.id, token, label: record.label, createdAt: record.createdAt };
}

/** Prüft ein Overlay-Zugriffstoken für einen Raum. Wirft bei Ungültigkeit. */
export async function requireValidOverlayToken(roomId: string, token: string | null) {
  if (!token) throw new ApiError(401, "Overlay-Token fehlt.");
  const tokenHash = hashOpaqueToken(token);
  const record = await prisma.overlayToken.findUnique({ where: { tokenHash } });
  if (!record || record.roomId !== roomId || record.revokedAt) {
    throw new ApiError(401, "Overlay-Token ungültig oder widerrufen.");
  }
  // Fire-and-forget: letzten Zugriff protokollieren, ohne die Antwort zu verzögern.
  prisma.overlayToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return record;
}
