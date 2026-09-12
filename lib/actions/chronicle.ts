"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { canCreateContent } from "@/lib/auth/permissions";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  occurredAt: z.string().optional(),
});

export async function addMilestoneAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canCreateContent(user.role)) return { ok: false, error: "Keine Berechtigung." };
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Kein Server eingerichtet." };

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    occurredAt: formData.get("occurredAt") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  await prisma.serverEvent.create({
    data: {
      serverId: server.id,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
      type: "MILESTONE",
      title: parsed.data.title,
      description: parsed.data.description,
      isAutomatic: false,
      createdByUserId: user.id,
    },
  });

  revalidatePath("/");
  return { ok: true };
}
