"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLES, type Role } from "@/lib/constants";

export async function updateUserRoleAction(
  userId: string,
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return { ok: false, error: "Keine Berechtigung." };
  }
  if (!ROLES.includes(role as Role)) {
    return { ok: false, error: "Ungültige Rolle." };
  }
  if (admin.id === userId && role !== "ADMIN") {
    const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", id: { not: userId } } });
    if (otherAdmins === 0) {
      return { ok: false, error: "Es muss mindestens ein Admin-Konto geben." };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/einstellungen");
  return { ok: true };
}
