import { Download, Package2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { ModpackVersionView } from "@/lib/queries/modpack";
import { formatDate } from "@/lib/format";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function CurrentVersionCard({ version, demoMode }: { version: ModpackVersionView | null; demoMode: boolean }) {
  if (!version) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Package2}
            title="Noch keine Modpack-Version freigegeben"
            description="Ein Admin kann eine .mrpack-Datei hochladen oder eine Modrinth-Version verknüpfen und freigeben."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Für diesen Server vorgeschrieben</CardTitle>
        <Badge tone="accent">v{version.versionNumber}</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-ink-muted">Minecraft-Version</p>
            <p className="text-ink">{version.minecraftVersion}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Modloader</p>
            <p className="capitalize text-ink">{version.loader}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Größe</p>
            <p className="text-ink">{formatBytes(version.fileSizeBytes) || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Veröffentlicht</p>
            <p className="text-ink">{version.releasedAt ? formatDate(version.releasedAt) : "-"}</p>
          </div>
        </div>

        <LinkButton
          href={demoMode ? "#" : `/api/modpack/download/${version.id}`}
          aria-disabled={demoMode}
          className={demoMode ? "pointer-events-none opacity-50" : ""}
        >
          <Download size={16} /> Modpack herunterladen (.mrpack)
        </LinkButton>

        {version.changelog && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-muted">Änderungsprotokoll</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface-raised p-3 text-xs text-ink-muted">
              {version.changelog}
            </pre>
          </div>
        )}

        <InstallInstructions />
      </CardBody>
    </Card>
  );
}

function InstallInstructions() {
  return (
    <details className="rounded-lg border border-line bg-surface-raised p-3 text-sm text-ink-muted">
      <summary className="cursor-pointer font-medium text-ink">
        Installationsanleitung für die Modrinth-App
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Modrinth-App installieren: modrinth.com/app</li>
        <li>
          Heruntergeladene .mrpack-Datei per Doppelklick öffnen (oder in der App &bdquo;Datei
          importieren&ldquo;).
        </li>
        <li>Die App installiert Minecraft-Version, Modloader und alle Mods automatisch in ein eigenes Profil.</li>
        <li>Profil in der App starten - fertig.</li>
      </ol>
    </details>
  );
}
