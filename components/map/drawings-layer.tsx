"use client";

import { Polyline, Polygon, Marker, Popup } from "react-leaflet";
import { worldToLatLng } from "@/components/map/coordinate-utils";
import { textIcon } from "@/components/map/icons";
import { VISIBILITY_LABELS } from "@/lib/constants";
import type { DrawingView } from "@/lib/queries/map";
import type { Role } from "@/lib/constants";

export function DrawingsLayer({
  drawings,
  currentUserId,
  role,
  onDelete,
}: {
  drawings: DrawingView[];
  currentUserId: string;
  role: Role;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      {drawings.map((d) => {
        const canManage = role === "ADMIN" || d.ownerId === currentUserId;
        const positions = d.points.map((p) => worldToLatLng(p.x, p.z));
        const info = (
          <Popup>
            <div className="space-y-1">
              <p className="text-xs text-ink-muted">
                {d.ownerName} · {VISIBILITY_LABELS[d.visibility as "PRIVATE" | "SERVER"]}
              </p>
              {canManage && (
                <button onClick={() => onDelete(d.id)} className="text-xs font-medium text-danger hover:underline">
                  Löschen
                </button>
              )}
            </div>
          </Popup>
        );

        if (d.type === "TEXT") {
          return (
            <Marker key={d.id} position={positions[0]} icon={textIcon(d.text ?? "", d.color)}>
              {info}
            </Marker>
          );
        }
        if (d.type === "AREA") {
          return (
            <Polygon
              key={d.id}
              positions={positions}
              pathOptions={{ color: d.color, weight: 2, fillOpacity: 0.15 }}
            >
              {info}
            </Polygon>
          );
        }
        return (
          <Polyline key={d.id} positions={positions} pathOptions={{ color: d.color, weight: 3 }}>
            {info}
          </Polyline>
        );
      })}
    </>
  );
}
