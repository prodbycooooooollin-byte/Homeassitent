import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { EmptyState } from "@/components/ui/empty-state";
import { Map as MapIcon } from "lucide-react";
import { MapShellLoader } from "@/components/map/map-shell-loader";

export const metadata = { title: "Weltkarte" };

export default async function MapPage() {
  const user = await requireUser();
  const server = await getPrimaryServer();

  if (!server) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Noch kein Server eingerichtet"
        description="Marker und Zeichnungen brauchen einen eingerichteten Server. Richte ihn zuerst in den Einstellungen ein."
      />
    );
  }

  return (
    <MapShellLoader
      currentUser={{ id: user.id, role: user.role }}
      tileUrlTemplate={server.mapTileUrlTemplate}
    />
  );
}
