"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { LINK_CODE_TTL_MINUTES } from "@/lib/constants";

function generateCode(): string {
  // Kurz, gut abtippbar im Minecraft-Chat: 6 Zeichen, ohne verwechselbare
  // Zeichen (0/O, 1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
}

export interface LinkCodeResult {
  code: string;
  expiresAt: string;
}

export async function generateLinkCodeAction(): Promise<LinkCodeResult> {
  const user = await requireUser();

  const existingAccount = await prisma.minecraftAccount.findUnique({ where: { userId: user.id } });
  if (existingAccount) {
    throw new Error("Es ist bereits ein Minecraft-Account verknüpft.");
  }

  await prisma.linkCode.deleteMany({ where: { userId: user.id, usedAt: null } });

  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000);
  const code = generateCode();
  await prisma.linkCode.create({ data: { code, userId: user.id, expiresAt } });

  revalidatePath("/einstellungen");
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function unlinkMinecraftAccountAction(): Promise<void> {
  const user = await requireUser();
  await prisma.minecraftAccount.updateMany({
    where: { userId: user.id },
    data: { userId: null },
  });
  revalidatePath("/einstellungen");
}
