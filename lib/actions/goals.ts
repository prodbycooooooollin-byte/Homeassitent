"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { canCreateContent } from "@/lib/auth/permissions";
import { GOAL_METRICS } from "@/lib/constants";

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  metric: z.enum(GOAL_METRICS),
  target: z.coerce.number().positive(),
});

export async function createGoalAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canCreateContent(user.role)) return { ok: false, error: "Keine Berechtigung." };

  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Kein Server eingerichtet." };

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    metric: formData.get("metric"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  await prisma.serverGoal.create({
    data: { serverId: server.id, createdByUserId: user.id, ...parsed.data },
  });

  await prisma.serverEvent.create({
    data: {
      serverId: server.id,
      occurredAt: new Date(),
      type: "OTHER",
      title: `Neues Serverziel: ${parsed.data.title}`,
      isAutomatic: false,
      createdByUserId: user.id,
    },
  });

  revalidatePath("/statistiken");
  return { ok: true };
}

export async function deleteGoalAction(goalId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const goal = await prisma.serverGoal.findUnique({ where: { id: goalId } });
  if (!goal) return { ok: false, error: "Nicht gefunden." };
  if (user.role !== "ADMIN" && goal.createdByUserId !== user.id) {
    return { ok: false, error: "Keine Berechtigung." };
  }
  await prisma.serverGoal.delete({ where: { id: goalId } });
  revalidatePath("/statistiken");
  return { ok: true };
}
