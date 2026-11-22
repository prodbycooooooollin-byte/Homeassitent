import type { Metadata } from "next";
import { Map } from "lucide-react";
import { IntelMap } from "@/components/map/IntelMap";
import { getMapPins } from "@/lib/map/points";

export const metadata: Metadata = { title: "Map", description: "Searchable map of locations, secrets, missions and activities in Leonida." };

export default function MapPage({ searchParams }: { searchParams: { focus?: string } }) {
  const pins = getMapPins();
  return (
    <div className="container-page pt-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-400/30 bg-violet-500/15 text-violet-300">
          <Map className="h-6 w-6" />
        </span>
        <div>
          <h1 className="h-display text-2xl sm:text-3xl">Intel Map</h1>
          <p className="text-sm text-fg-muted">Every place-based record in the knowledge base. Tap a pin for a preview.</p>
        </div>
      </div>
      <IntelMap pins={pins} initialFocus={searchParams.focus} />
    </div>
  );
}
