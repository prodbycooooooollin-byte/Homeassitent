import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Health-Check für Docker/Railway/Render. Prüft zusätzlich, ob die
 * Datenbank erreichbar ist – ein "grüner" Health-Check, während Postgres
 * down ist, würde Deploy-Systeme fälschlich beruhigen.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[health] Datenbank nicht erreichbar:", err);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
