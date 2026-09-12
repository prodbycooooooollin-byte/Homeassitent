import "server-only";

const API_BASE = process.env.MODRINTH_API_BASE || "https://api.modrinth.com/v2";

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog: string | null;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: { url: string; filename: string; primary: boolean }[];
}

async function modrinthFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "User-Agent": "craftboard/1.0 (self-hosted Minecraft community webapp)" },
    // Modrinth-Metadaten ändern sich selten - kurzzeitig cachen reicht.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`Modrinth-API-Fehler (${res.status}) für ${path}`);
  }
  return res.json() as Promise<T>;
}

export function getModrinthProject(idOrSlug: string): Promise<ModrinthProject> {
  return modrinthFetch<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`);
}

export function getModrinthVersion(versionId: string): Promise<ModrinthVersion> {
  return modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`);
}

/** Erlaubt Eingabe als reine ID oder als vollständige Modrinth-URL. */
export function extractModrinthVersionId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/modrinth\.com\/.*\/version\/([a-zA-Z0-9]+)/);
  if (match) return match[1];
  return trimmed;
}
