"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { saveUploadedFile } from "@/lib/storage";
import { parseMrpack } from "@/lib/modpack/parse-mrpack";
import { getModrinthProject, getModrinthVersion, extractModrinthVersionId } from "@/lib/modpack/modrinth-client";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Keine Berechtigung.");
  return user;
}

async function getOrCreateModpack(serverId: string, name: string, description?: string) {
  const existing = await prisma.modpack.findFirst({ where: { serverId } });
  if (existing) {
    return prisma.modpack.update({
      where: { id: existing.id },
      data: { name, description },
    });
  }
  return prisma.modpack.create({ data: { serverId, name, description } });
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const infoSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
  iconUrl: z.string().trim().url().optional().or(z.literal("")),
});

export async function saveModpackInfoAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Bitte zuerst die Serververbindung einrichten." };

  const parsed = infoSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    iconUrl: formData.get("iconUrl") || "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const modpack = await getOrCreateModpack(server.id, parsed.data.name, parsed.data.description);
  if (parsed.data.iconUrl) {
    await prisma.modpack.update({ where: { id: modpack.id }, data: { iconUrl: parsed.data.iconUrl } });
  }
  revalidatePath("/modpack");
  return { ok: true };
}

const uploadSchema = z.object({
  versionNumber: z.string().trim().min(1).max(40),
  minecraftVersion: z.string().trim().min(1).max(20),
  loader: z.string().trim().min(1).max(20),
  changelog: z.string().trim().max(4000).optional(),
});

export async function uploadModpackVersionAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Bitte zuerst die Serververbindung einrichten." };

  const parsed = uploadSchema.safeParse({
    versionNumber: formData.get("versionNumber"),
    minecraftVersion: formData.get("minecraftVersion"),
    loader: formData.get("loader"),
    changelog: formData.get("changelog") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Bitte eine .mrpack-Datei auswählen." };
  }
  if (!file.name.endsWith(".mrpack")) {
    return { ok: false, error: "Die Datei muss die Endung .mrpack haben." };
  }
  if (file.size > 100 * 1024 * 1024) {
    return { ok: false, error: "Datei ist größer als 100 MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let modList: { name: string; fileName: string }[] = [];
  try {
    modList = parseMrpack(buffer).mods;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Datei konnte nicht gelesen werden." };
  }

  const modpackName = (formData.get("modpackName") as string) || "Modpack";
  const modpack = await getOrCreateModpack(server.id, modpackName);

  const { filePath } = await saveUploadedFile("modpacks", file.name, buffer);

  await prisma.modpackVersion.create({
    data: {
      modpackId: modpack.id,
      versionNumber: parsed.data.versionNumber,
      minecraftVersion: parsed.data.minecraftVersion,
      loader: parsed.data.loader,
      changelog: parsed.data.changelog,
      source: "UPLOAD",
      fileName: file.name,
      filePath,
      fileSizeBytes: file.size,
      modList: JSON.stringify(modList),
      releasedAt: new Date(),
    },
  });

  revalidatePath("/modpack");
  return { ok: true };
}

const modrinthSchema = z.object({ versionInput: z.string().trim().min(3) });

export async function linkModrinthVersionAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const server = await getPrimaryServer();
  if (!server) return { ok: false, error: "Bitte zuerst die Serververbindung einrichten." };

  const parsed = modrinthSchema.safeParse({ versionInput: formData.get("versionInput") });
  if (!parsed.success) return { ok: false, error: "Bitte eine Modrinth-Versions-URL oder -ID angeben." };

  const versionId = extractModrinthVersionId(parsed.data.versionInput);

  let version;
  let project;
  try {
    version = await getModrinthVersion(versionId);
    project = await getModrinthProject(version.project_id);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Modrinth-Version konnte nicht geladen werden.",
    };
  }

  const primaryFile = version.files.find((f) => f.primary) ?? version.files[0];
  if (!primaryFile) return { ok: false, error: "Diese Modrinth-Version hat keine Datei." };

  // Modliste ist nur zuverlässig ermittelbar, wenn die Datei ein .mrpack ist
  // - andernfalls bleibt sie leer, statt etwas zu erfinden.
  let modList: { name: string; fileName: string }[] = [];
  if (primaryFile.filename.endsWith(".mrpack")) {
    try {
      const res = await fetch(primaryFile.url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        modList = parseMrpack(buf).mods;
      }
    } catch {
      // Modliste ist ein Bonus - ein Fehlschlag hier blockiert die Verknüpfung nicht.
    }
  }

  const modpack = await getOrCreateModpack(server.id, project.title, project.description);
  await prisma.modpack.update({ where: { id: modpack.id }, data: { iconUrl: project.icon_url, modrinthProjectId: project.id } });

  await prisma.modpackVersion.create({
    data: {
      modpackId: modpack.id,
      versionNumber: version.version_number,
      minecraftVersion: version.game_versions[version.game_versions.length - 1] ?? "unbekannt",
      loader: version.loaders[0] ?? "unbekannt",
      changelog: version.changelog,
      source: "MODRINTH",
      modrinthVersionId: version.id,
      modrinthDownloadUrl: primaryFile.url,
      fileName: primaryFile.filename,
      modList: modList.length ? JSON.stringify(modList) : null,
      releasedAt: new Date(version.date_published),
    },
  });

  revalidatePath("/modpack");
  return { ok: true };
}

export async function setCurrentVersionAction(versionId: string): Promise<ActionResult> {
  await requireAdmin();
  const version = await prisma.modpackVersion.findUnique({ where: { id: versionId } });
  if (!version) return { ok: false, error: "Version nicht gefunden." };

  await prisma.$transaction([
    prisma.modpackVersion.updateMany({
      where: { modpackId: version.modpackId },
      data: { isCurrent: false },
    }),
    prisma.modpackVersion.update({ where: { id: versionId }, data: { isCurrent: true } }),
  ]);

  revalidatePath("/modpack");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteModpackVersionAction(versionId: string): Promise<ActionResult> {
  await requireAdmin();
  const version = await prisma.modpackVersion.findUnique({ where: { id: versionId } });
  if (!version) return { ok: false, error: "Version nicht gefunden." };
  if (version.isCurrent) {
    return { ok: false, error: "Die aktuell freigegebene Version kann nicht gelöscht werden." };
  }
  await prisma.modpackVersion.delete({ where: { id: versionId } });
  revalidatePath("/modpack");
  return { ok: true };
}
