import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { Badge } from "@/components/ui/badge";

export function OnlinePlayersCard({
  online,
  max,
  list,
}: {
  online: number | null;
  max: number | null;
  list: { uuid: string; username: string }[] | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spieler online</CardTitle>
        <Badge tone="accent">
          {online ?? "?"} / {max ?? "?"}
        </Badge>
      </CardHeader>
      <CardBody>
        {list === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Users size={16} className="text-ink-faint" />
            Namen und Avatare benötigen den Connector-Agent (vollständige Anbindung).
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-ink-muted">Gerade niemand online.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {list.map((p) => (
              <Link
                key={p.uuid}
                href={`/spieler/${p.uuid}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 transition-colors hover:border-accent/40"
              >
                <PlayerAvatar uuid={p.uuid} username={p.username} size={24} />
                <span className="text-sm text-ink">{p.username}</span>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
