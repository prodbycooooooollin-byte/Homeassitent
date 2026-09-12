"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { canCreateContent, canEditEntity } from "@/lib/auth/permissions";
import { getPortals } from "@/lib/queries/portals";

type Result = { ok: boolean; error?: string };

export async function listPortalsAction() {
  await requireUser();
  const server = await getPrimaryServer();
  if (!server) return [];
  return getPortals(server.id);
}

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  dimension: z.enum(["OVERWORLD", "NETHER"]),
  x: z.coerce.number(),
  y: z.coerce.number().optional(),
  z: z.coerce.number(),
});

export async function createPortalAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  if (!canCreateContent(user.role)) return { ok: false, error: "Keine Berechtigung." };
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Kein Server eingerichtet." };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    dimension: formData.get("dimension"),
    x: formData.get("x"),
    y: formData.get("y") || undefined,
    z: formData.get("z"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  await prisma.portal.create({
    data: { serverId: server.id, createdByUserId: user.id, ...parsed.data },
  });
  revalidatePath("/karte");
  return { ok: true };
}

export async function linkPortalsAction(portalId: string, targetPortalId: string): Promise<Result> {
  const user = await requireUser();
  const [a, b] = await Promise.all([
    prisma.portal.findUnique({ where: { id: portalId } }),
    prisma.portal.findUnique({ where: { id: targetPortalId } }),
  ]);
  if (!a || !b) return { ok: false, error: "Portal nicht gefunden." };
  if (a.dimension === b.dimension) {
    return { ok: false, error: "Portale müssen in unterschiedlichen Dimensionen liegen." };
  }
  void user;
  await prisma.portal.update({ where: { id: portalId }, data: { linkedPortalId: targetPortalId } });
  revalidatePath("/karte");
  return { ok: true };
}

export async function deletePortalAction(portalId: string): Promise<Result> {
  const user = await requireUser();
  const portal = await prisma.portal.findUnique({ where: { id: portalId } });
  if (!portal) return { ok: false, error: "Nicht gefunden." };
  if (!canEditEntity(user.role, user.id, portal.createdByUserId)) {
    return { ok: false, error: "Keine Berechtigung." };
  }
  await prisma.portal.delete({ where: { id: portalId } });
  revalidatePath("/karte");
  return { ok: true };
}
