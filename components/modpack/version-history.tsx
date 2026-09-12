import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import type { ModpackVersionView } from "@/lib/queries/modpack";
import { formatDate } from "@/lib/format";

export function VersionHistory({ versions, demoMode }: { versions: ModpackVersionView[]; demoMode: boolean }) {
  if (versions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ältere Versionen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Badge tone="neutral">v{v.versionNumber}</Badge>
              <span className="text-xs text-ink-muted">
                {v.minecraftVersion} · {v.loader} · {v.releasedAt ? formatDate(v.releasedAt) : "-"}
              </span>
            </div>
            <LinkButton
              href={demoMode ? "#" : `/api/modpack/download/${v.id}`}
              variant="secondary"
              size="sm"
              className={demoMode ? "pointer-events-none opacity-50" : ""}
            >
              Herunterladen
            </LinkButton>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
