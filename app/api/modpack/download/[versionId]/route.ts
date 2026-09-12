import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Download genau der vom Admin freigegebenen (oder einer älteren, deutlich
 * gekennzeichneten) Version. Erfordert nur eine Anmeldung, keine
 * Admin-Rolle - die Website selbst erzwingt keine Zugangssperre zum
 * Minecraft-Server, das Herunterladen des Modpacks ist für alle
 * angemeldeten Nutzer gedacht.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  await requireUser();
  const { versionId } = await params;

  const version = await prisma.modpackVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    return NextResponse.json({ error: "Version nicht gefunden." }, { status: 404 });
  }

  if (version.source === "MODRINTH") {
    if (!version.modrinthDownloadUrl) {
      return NextResponse.json({ error: "Kein Download-Link hinterlegt." }, { status: 404 });
    }
    return NextResponse.redirect(version.modrinthDownloadUrl);
  }

  if (!version.filePath) {
    return NextResponse.json({ error: "Keine Datei hinterlegt." }, { status: 404 });
  }

  try {
    const buffer = await readStoredFile(version.filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${version.fileName ?? "modpack.mrpack"}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Datei konnte nicht gelesen werden." }, { status: 500 });
  }
}
