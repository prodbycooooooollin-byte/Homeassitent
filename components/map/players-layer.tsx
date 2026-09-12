"use client";

import { useEffect } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import { worldToLatLng } from "@/components/map/coordinate-utils";
import { playerIcon } from "@/components/map/icons";
import { formatCoords, formatRelativeTime } from "@/lib/format";
import type { LivePlayerPosition } from "@/lib/queries/map";

export function PlayersLayer({
  players,
  followUuid,
  onSelect,
}: {
  players: LivePlayerPosition[];
  followUuid: string | null;
  onSelect: (uuid: string | null) => void;
}) {
  const map = useMap();
  const followed = players.find((p) => p.uuid === followUuid);

  useEffect(() => {
    if (followed) {
      map.panTo(worldToLatLng(followed.x, followed.z), { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followed?.x, followed?.z]);

  return (
    <>
      {players.map((p) => (
        <Marker
          key={p.uuid}
          position={worldToLatLng(p.x, p.z)}
          icon={playerIcon(p.username, p.uuid === followUuid ? "#eab308" : "#4ade80")}
          eventHandlers={{ click: () => onSelect(p.uuid === followUuid ? null : p.uuid) }}
        >
          <Popup>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-ink">{p.username}</p>
              <p className="text-xs text-ink-muted">{formatCoords(p.x, p.y, p.z)}</p>
              <p className="text-xs text-ink-faint">Stand {formatRelativeTime(p.updatedAt)}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
