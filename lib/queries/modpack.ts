import "server-only";
import { prisma } from "@/lib/db";

export interface ModpackVersionView {
  id: string;
  versionNumber: string;
  minecraftVersion: string;
  loader: string;
  changelog: string | null;
  isCurrent: boolean;
  source: string;
  fileSizeBytes: number | null;
  releasedAt: Date | null;
  modList: { name: string; fileName: string }[] | null;
}

export interface ModpackView {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  current: ModpackVersionView | null;
  olderVersions: ModpackVersionView[];
}

function toView(v: {
  id: string;
  versionNumber: string;
  minecraftVersion: string;
  loader: string;
  changelog: string | null;
  isCurrent: boolean;
  source: string;
  fileSizeBytes: number | null;
  releasedAt: Date | null;
  modList: string | null;
}): ModpackVersionView {
  return {
    ...v,
    modList: v.modList ? JSON.parse(v.modList) : null,
  };
}

export async function getModpackData(serverId: string): Promise<ModpackView | null> {
  const modpack = await prisma.modpack.findFirst({
    where: { serverId },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  if (!modpack) return null;

  const current = modpack.versions.find((v) => v.isCurrent) ?? null;
  const olderVersions = modpack.versions.filter((v) => !v.isCurrent);

  return {
    id: modpack.id,
    name: modpack.name,
    description: modpack.description,
    iconUrl: modpack.iconUrl,
    current: current ? toView(current) : null,
    olderVersions: olderVersions.map(toView),
  };
}
