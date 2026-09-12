import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export function ModList({ mods }: { mods: { name: string; fileName: string }[] | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Modliste {mods && `(${mods.length})`}</CardTitle>
      </CardHeader>
      <CardBody>
        {!mods ? (
          <p className="text-sm text-ink-muted">
            Nicht verfügbar - die Modliste konnte aus den Metadaten dieser Version nicht
            zuverlässig ermittelt werden.
          </p>
        ) : mods.length === 0 ? (
          <p className="text-sm text-ink-muted">Diese Version enthält keine Mod-Dateien.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {mods.map((m) => (
              <p key={m.fileName} className="truncate text-sm text-ink-muted" title={m.fileName}>
                {m.name}
              </p>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
