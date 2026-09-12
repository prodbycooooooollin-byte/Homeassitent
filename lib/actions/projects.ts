"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { canCreateContent, canEditEntity } from "@/lib/auth/permissions";
import { PROJECT_STATUSES, DIMENSIONS } from "@/lib/constants";

type Result = { ok: boolean; error?: string };

const createSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  dimension: z.enum(DIMENSIONS).optional(),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  z: z.coerce.number().optional(),
});

export async function createProjectAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  if (!canCreateContent(user.role)) return { ok: false, error: "Keine Berechtigung." };
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Kein Server eingerichtet." };

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dimension: formData.get("dimension") || undefined,
    x: formData.get("x") || undefined,
    y: formData.get("y") || undefined,
    z: formData.get("z") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const project = await prisma.buildProject.create({
    data: { serverId: server.id, createdByUserId: user.id, ...parsed.data },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id } });
  await prisma.serverEvent.create({
    data: {
      serverId: server.id,
      occurredAt: new Date(),
      type: "PROJECT_CREATED",
      title: `Neues Bauprojekt: ${project.title}`,
      isAutomatic: true,
    },
  });

  revalidatePath("/projekte");
  return { ok: true };
}

async function requireProjectAccess(projectId: string) {
  const user = await requireUser();
  const project = await prisma.buildProject.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Nicht gefunden." as const };
  if (!canEditEntity(user.role, user.id, project.createdByUserId)) {
    const isMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!isMember) return { error: "Keine Berechtigung." as const };
  }
  return { user, project };
}

export async function updateProjectStatusAction(projectId: string, status: string): Promise<Result> {
  const access = await requireProjectAccess(projectId);
  if ("error" in access) return { ok: false, error: access.error };
  if (!PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
    return { ok: false, error: "Ungültiger Status." };
  }
  await prisma.buildProject.update({ where: { id: projectId }, data: { status } });
  revalidatePath("/projekte");
  return { ok: true };
}

export async function addTaskAction(projectId: string, title: string): Promise<Result> {
  const access = await requireProjectAccess(projectId);
  if ("error" in access) return { ok: false, error: access.error };
  if (!title.trim()) return { ok: false, error: "Titel erforderlich." };
  await prisma.projectTask.create({ data: { projectId, title: title.trim() } });
  revalidatePath("/projekte");
  return { ok: true };
}

export async function toggleTaskAction(taskId: string): Promise<Result> {
  const user = await requireUser();
  const task = await prisma.projectTask.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!task) return { ok: false, error: "Nicht gefunden." };
  const access = await requireProjectAccess(task.projectId);
  if ("error" in access) return { ok: false, error: access.error };
  await prisma.projectTask.update({ where: { id: taskId }, data: { done: !task.done } });
  void user;
  revalidatePath("/projekte");
  return { ok: true };
}

export async function addMaterialAction(
  projectId: string,
  itemName: string,
  needed: number,
): Promise<Result> {
  const access = await requireProjectAccess(projectId);
  if ("error" in access) return { ok: false, error: access.error };
  if (!itemName.trim() || needed <= 0) return { ok: false, error: "Ungültige Eingabe." };
  await prisma.projectMaterial.create({ data: { projectId, itemName: itemName.trim(), needed } });
  revalidatePath("/projekte");
  return { ok: true };
}

export async function updateMaterialProgressAction(materialId: string, gathered: number): Promise<Result> {
  const material = await prisma.projectMaterial.findUnique({ where: { id: materialId } });
  if (!material) return { ok: false, error: "Nicht gefunden." };
  const access = await requireProjectAccess(material.projectId);
  if ("error" in access) return { ok: false, error: access.error };
  await prisma.projectMaterial.update({
    where: { id: materialId },
    data: { gathered: Math.max(0, gathered) },
  });
  revalidatePath("/projekte");
  return { ok: true };
}

export async function deleteProjectAction(projectId: string): Promise<Result> {
  const user = await requireUser();
  const project = await prisma.buildProject.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: "Nicht gefunden." };
  if (!canEditEntity(user.role, user.id, project.createdByUserId)) {
    return { ok: false, error: "Keine Berechtigung." };
  }
  await prisma.buildProject.delete({ where: { id: projectId } });
  revalidatePath("/projekte");
  return { ok: true };
}
