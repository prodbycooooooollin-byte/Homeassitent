"use client";

import { useMemo, useState } from "react";
import { Users, Layers, MapPin, type LucideIcon } from "lucide-react";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { MARKER_CATEGORY_LABELS, type MarkerCategory } from "@/lib/constants";
import { formatCoords } from "@/lib/format";
import type { MarkerView, DrawingView, LivePlayerPosition } from "@/lib/queries/map";
import { cn } from "@/lib/cn";

export function MapSidebar({
  markers,
  drawings,
  players,
  followUuid,
  onSelectPlayer,
  onFlyToMarker,
  hiddenOwners,
  hiddenCategories,
  onToggleOwner,
  onToggleCategory,
}: {
  markers: MarkerView[];
  drawings: DrawingView[];
  players: LivePlayerPosition[];
  followUuid: string | null;
  onSelectPlayer: (uuid: string | null) => void;
  onFlyToMarker: (m: MarkerView) => void;
  hiddenOwners: Set<string>;
  hiddenCategories: Set<string>;
  onToggleOwner: (owner: string) => void;
  onToggleCategory: (cat: string) => void;
}) {
  const [tab, setTab] = useState<"marker" | "spieler" | "ebenen">("marker");
  const TABS: { key: typeof tab; label: string; icon: LucideIcon }[] = [
    { key: "marker", label: "Marker", icon: MapPin },
    { key: "spieler", label: "Spieler", icon: Users },
    { key: "ebenen", label: "Ebenen", icon: Layers },
  ];

  const owners = useMemo(() => {
    const set = new Map<string, string>();
    [...markers, ...drawings].forEach((e) => set.set(e.ownerId, e.ownerName));
    return [...set.entries()];
  }, [markers, drawings]);

  return (
    <div className="flex w-full flex-col border-l border-line bg-surface md:w-72">
      <div className="flex border-b border-line">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
              tab === key ? "border-b-2 border-accent text-accent" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "marker" && (
          <div className="space-y-1.5">
            {markers.length === 0 && <p className="text-xs text-ink-muted">Keine Markierungen in dieser Dimension.</p>}
            {markers.map((m) => (
              <button
                key={m.id}
                onClick={() => onFlyToMarker(m)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-raised"
              >
                <span className="truncate text-ink">{m.title}</span>
                <span className="shrink-0 text-ink-faint">{MARKER_CATEGORY_LABELS[m.category as MarkerCategory]}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "spieler" && (
          <div className="space-y-1.5">
            {players.length === 0 && (
              <p className="text-xs text-ink-muted">
                Keine Live-Positionen - braucht den Connector-Agent mit Positions-Meldung.
              </p>
            )}
            {players.map((p) => (
              <button
                key={p.uuid}
                onClick={() => onSelectPlayer(p.uuid === followUuid ? null : p.uuid)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  followUuid === p.uuid ? "bg-accent-soft" : "hover:bg-surface-raised",
                )}
              >
                <PlayerAvatar uuid={p.uuid} username={p.username} size={24} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink">{p.username}</p>
                  <p className="truncate text-[11px] text-ink-faint">{formatCoords(p.x, p.y, p.z)}</p>
                </div>
                <CopyButton value={formatCoords(p.x, p.y, p.z)} label="" className="shrink-0" />
              </button>
            ))}
          </div>
        )}

        {tab === "ebenen" && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-muted">Nach Ersteller</p>
              <div className="space-y-1">
                {owners.map(([id, name]) => (
                  <label key={id} className="flex items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={!hiddenOwners.has(id)}
                      onChange={() => onToggleOwner(id)}
                      className="accent-accent"
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-muted">Nach Kategorie</p>
              <div className="space-y-1">
                {Object.entries(MARKER_CATEGORY_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={!hiddenCategories.has(key)}
                      onChange={() => onToggleCategory(key)}
                      className="accent-accent"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
