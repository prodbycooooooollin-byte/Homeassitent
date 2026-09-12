"use client";

import { Marker, Popup } from "react-leaflet";
import { worldToLatLng } from "@/components/map/coordinate-utils";
import { categoryIcon } from "@/components/map/icons";
import { MARKER_CATEGORY_LABELS, VISIBILITY_LABELS, type MarkerCategory } from "@/lib/constants";
import { CopyButton } from "@/components/ui/copy-button";
import { formatCoords } from "@/lib/format";
import type { MarkerView } from "@/lib/queries/map";
import type { Role } from "@/lib/constants";

export function MarkersLayer({
  markers,
  currentUserId,
  role,
  onEdit,
  onDelete,
}: {
  markers: MarkerView[];
  currentUserId: string;
  role: Role;
  onEdit: (m: MarkerView) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      {markers.map((m) => {
        const canManage = role === "ADMIN" || m.ownerId === currentUserId;
        return (
          <Marker key={m.id} position={worldToLatLng(m.x, m.z)} icon={categoryIcon(m.category as MarkerCategory)}>
            <Popup minWidth={200}>
              <div className="space-y-1.5">
                <p className="font-semibold text-ink">{m.title}</p>
                <p className="text-xs text-ink-muted">
                  {MARKER_CATEGORY_LABELS[m.category as MarkerCategory]} · {m.ownerName} ·{" "}
                  {VISIBILITY_LABELS[m.visibility as "PRIVATE" | "SERVER"]}
                </p>
                {m.description && <p className="text-sm text-ink">{m.description}</p>}
                <div className="flex items-center gap-1.5 pt-1">
                  <code className="text-xs">{formatCoords(m.x, m.y, m.z)}</code>
                  <CopyButton value={formatCoords(m.x, m.y, m.z)} label="" />
                </div>
                {canManage && (
                  <div className="flex gap-2 pt-1.5">
                    <button onClick={() => onEdit(m)} className="text-xs font-medium text-accent hover:underline">
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => onDelete(m.id)}
                      className="text-xs font-medium text-danger hover:underline"
                    >
                      Löschen
                    </button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
