import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Verweist auf den fest geseedeten, öffentlichen Demo-Raum (siehe prisma/seed.ts). */
export default async function DemoRedirectPage() {
  const demoRoom = await prisma.room.findFirst({ where: { isDemo: true }, orderBy: { createdAt: "asc" } });
  redirect(demoRoom ? `/rooms/${demoRoom.code}/live` : "/");
}
