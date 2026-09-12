"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DIMENSIONS, type Dimension, type Role } from "@/lib/constants";
import { worldToLatLng } from "@/components/map/coordinate-utils";
import { ClickHandler } from "@/components/map/click-handler";
import { MapDragToggle } from "@/components/map/map-drag-toggle";
import { MarkersLayer } from "@/components/map/markers-layer";
import { DrawingsLayer } from "@/components/map/drawings-layer";
import { PlayersLayer } from "@/components/map/players-layer";
import { MapToolbar } from "@/components/map/toolbar";
import { MapSidebar } from "@/components/map/map-sidebar";
import { MarkerModal, type MarkerFormValues } from "@/components/map/marker-modal";
import { TextModal } from "@/components/map/text-modal";
import { mapApi } from "@/components/map/map-api";
import { useMapEventsStream } from "@/lib/hooks/use-map-events-stream";
import { canCreateContent } from "@/lib/auth/permissions";
import type { MarkerView, DrawingView, LivePlayerPosition } from "@/lib/queries/map";

export type MapMode = "view" | "place-marker" | "draw-freehand" | "draw-line" | "draw-area" | "draw-text";

const COLOR_STORAGE_KEY = "craftboard-map-color";

/** Erzeugt eine dem Nutzer zugeordnete Standardfarbe als Hex-Code (nicht
 * hsl(...) - <input type="color"> und die API akzeptieren nur #rrggbb). */
function distinctColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 70, 55);
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function MapShell({
  currentUser,
  tileUrlTemplate,
}: {
  currentUser: { id: string; role: Role };
  tileUrlTemplate: string | null;
}) {
  const [dimension, setDimension] = useState<Dimension>("OVERWORLD");
  const [markers, setMarkers] = useState<MarkerView[]>([]);
  const [drawings, setDrawings] = useState<DrawingView[]>([]);
  const [players, setPlayers] = useState<LivePlayerPosition[]>([]);
  const [mode, setMode] = useState<MapMode>("view");
  const [color, setColor] = useState(distinctColor(currentUser.id));
  const [followUuid, setFollowUuid] = useState<string | null>(null);
  const [hiddenOwners, setHiddenOwners] = useState<Set<string>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);

  const [pendingMarkerCoords, setPendingMarkerCoords] = useState<{ x: number; z: number } | null>(null);
  const [pendingTextCoords, setPendingTextCoords] = useState<{ x: number; z: number } | null>(null);
  const [pendingPoints, setPendingPoints] = useState<{ x: number; z: number }[]>([]);
  const freehandPoints = useRef<{ x: number; z: number }[]>([]);
  const [freehandPreview, setFreehandPreview] = useState<{ x: number; z: number }[]>([]);

  const canEdit = canCreateContent(currentUser.role);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(COLOR_STORAGE_KEY) : null;
    if (saved) setColor(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(COLOR_STORAGE_KEY, color);
  }, [color]);

  const reloadMarkers = useCallback(() => {
    mapApi.listMarkers(dimension).then(setMarkers).catch(() => {});
  }, [dimension]);
  const reloadDrawings = useCallback(() => {
    mapApi.listDrawings(dimension).then(setDrawings).catch(() => {});
  }, [dimension]);
  const reloadPlayers = useCallback(() => {
    mapApi.listPlayers().then(setPlayers).catch(() => {});
  }, []);

  useEffect(() => {
    reloadMarkers();
    reloadDrawings();
  }, [reloadMarkers, reloadDrawings]);

  useEffect(() => {
    reloadPlayers();
    const interval = setInterval(reloadPlayers, 5000);
    return () => clearInterval(interval);
  }, [reloadPlayers]);

  useMapEventsStream(
    useCallback(
      (event) => {
        if (event.kind === "players.update") reloadPlayers();
        if (event.dimension && event.dimension !== dimension) return;
        if (event.kind === "marker.upsert" || event.kind === "marker.delete") reloadMarkers();
        if (event.kind === "drawing.upsert" || event.kind === "drawing.delete") reloadDrawings();
      },
      [dimension, reloadMarkers, reloadDrawings, reloadPlayers],
    ),
  );

  function resetDrawState() {
    setPendingPoints([]);
    setPendingMarkerCoords(null);
    setPendingTextCoords(null);
    freehandPoints.current = [];
    setFreehandPreview([]);
  }

  function changeMode(next: MapMode) {
    resetDrawState();
    setMode(next);
  }

  const handlePoint = useCallback(
    (p: { x: number; z: number }) => {
      if (mode === "place-marker") {
        setPendingMarkerCoords(p);
        return;
      }
      if (mode === "draw-text") {
        setPendingTextCoords(p);
        return;
      }
      if (mode === "draw-line") {
        setPendingPoints((prev) => {
          const next = [...prev, p];
          if (next.length === 2) {
            mapApi
              .createDrawing({ dimension, type: "LINE", points: next, color, visibility: "SERVER" })
              .then((res) => setDrawings((d) => [...d, { ...res.drawing, points: next } as DrawingView]));
            setMode("view");
            return [];
          }
          return next;
        });
        return;
      }
      if (mode === "draw-area") {
        setPendingPoints((prev) => [...prev, p]);
      }
    },
    [mode, dimension, color],
  );

  function finishArea() {
    if (pendingPoints.length < 3) return;
    mapApi
      .createDrawing({ dimension, type: "AREA", points: pendingPoints, color, visibility: "SERVER" })
      .then((res) => setDrawings((d) => [...d, { ...res.drawing, points: pendingPoints } as DrawingView]));
    changeMode("view");
  }

  function handleFreehandStart(p: { x: number; z: number }) {
    freehandPoints.current = [p];
    setFreehandPreview([p]);
  }
  function handleFreehandMove(p: { x: number; z: number }) {
    if (freehandPoints.current.length === 0) return;
    const last = freehandPoints.current[freehandPoints.current.length - 1];
    const dist = Math.hypot(p.x - last.x, p.z - last.z);
    if (dist < 1.5) return; // Punktzahl begrenzen
    freehandPoints.current = [...freehandPoints.current, p];
    setFreehandPreview(freehandPoints.current);
  }
  function handleFreehandEnd() {
    const points = freehandPoints.current;
    freehandPoints.current = [];
    setFreehandPreview([]);
    if (points.length < 2) return;
    mapApi
      .createDrawing({ dimension, type: "FREEHAND", points, color, visibility: "SERVER" })
      .then((res) => setDrawings((d) => [...d, { ...res.drawing, points } as DrawingView]));
  }

  function saveMarker(values: MarkerFormValues) {
    if (!pendingMarkerCoords) return;
    mapApi
      .createMarker({ dimension, x: pendingMarkerCoords.x, z: pendingMarkerCoords.z, ...values })
      .then((res) => setMarkers((m) => [...m, res.marker]));
    changeMode("view");
  }

  function saveText(text: string) {
    if (!pendingTextCoords) return;
    mapApi
      .createDrawing({ dimension, type: "TEXT", points: [pendingTextCoords], text, color, visibility: "SERVER" })
      .then((res) => setDrawings((d) => [...d, { ...res.drawing, points: [pendingTextCoords] } as DrawingView]));
    changeMode("view");
  }

  function deleteMarker(id: string) {
    setMarkers((m) => m.filter((x) => x.id !== id));
    mapApi.deleteMarker(id).catch(reloadMarkers);
  }
  function deleteDrawing(id: string) {
    setDrawings((d) => d.filter((x) => x.id !== id));
    mapApi.deleteDrawing(id).catch(reloadDrawings);
  }

  const visibleMarkers = useMemo(
    () => markers.filter((m) => !hiddenOwners.has(m.ownerId) && !hiddenCategories.has(m.category)),
    [markers, hiddenOwners, hiddenCategories],
  );
  const visibleDrawings = useMemo(
    () => drawings.filter((d) => !hiddenOwners.has(d.ownerId)),
    [drawings, hiddenOwners],
  );

  function toggleOwner(id: string) {
    setHiddenOwners((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleCategory(cat: string) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-panel border border-line md:h-[calc(100dvh-6rem)]">
      <MapToolbar
        dimension={dimension}
        onDimensionChange={(d) => {
          setDimension(d);
          changeMode("view");
        }}
        mode={mode}
        onModeChange={changeMode}
        canEdit={canEdit}
        color={color}
        onColorChange={setColor}
        areaInProgress={mode === "draw-area" && pendingPoints.length >= 3}
        onFinishArea={finishArea}
        onCancelDraw={() => changeMode("view")}
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-0 flex-1 bg-grid-dots">
          <MapContainer
            crs={L.CRS.Simple}
            center={[0, 0]}
            zoom={0}
            minZoom={-4}
            maxZoom={6}
            attributionControl={false}
            className="h-full w-full"
            ref={mapRef}
          >
            {tileUrlTemplate && <TileLayer url={tileUrlTemplate} minZoom={-4} maxZoom={6} tileSize={256} />}
            <MapDragToggle disabled={mode === "draw-freehand"} />
            <ClickHandler
              mode={mode}
              onPoint={handlePoint}
              onFreehandStart={handleFreehandStart}
              onFreehandMove={handleFreehandMove}
              onFreehandEnd={handleFreehandEnd}
              onCursorMove={setCursor}
            />
            <MarkersLayer
              markers={visibleMarkers}
              currentUserId={currentUser.id}
              role={currentUser.role}
              onEdit={() => {}}
              onDelete={deleteMarker}
            />
            <DrawingsLayer
              drawings={visibleDrawings}
              currentUserId={currentUser.id}
              role={currentUser.role}
              onDelete={deleteDrawing}
            />
            <PlayersLayer players={players} followUuid={followUuid} onSelect={setFollowUuid} />
            {(pendingPoints.length > 0 || freehandPreview.length > 0) && (
              <Polyline
                positions={(pendingPoints.length ? pendingPoints : freehandPreview).map((p) => worldToLatLng(p.x, p.z))}
                pathOptions={{ color, weight: 2, dashArray: "4 4" }}
              />
            )}
          </MapContainer>

          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-base/80 px-2 py-1 font-mono text-xs text-ink-muted">
            {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.z)}` : "–"}
          </div>
          {mode === "draw-area" && (
            <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-base/90 px-3 py-1.5 text-xs text-ink">
              {pendingPoints.length} Punkt(e) - mind. 3, dann „Fertig“
            </div>
          )}
          {mode === "draw-line" && pendingPoints.length === 1 && (
            <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-base/90 px-3 py-1.5 text-xs text-ink">
              Zweiten Punkt klicken
            </div>
          )}
        </div>

        <MapSidebar
          markers={visibleMarkers}
          drawings={visibleDrawings}
          players={players}
          followUuid={followUuid}
          onSelectPlayer={setFollowUuid}
          onFlyToMarker={(m) => mapRef.current?.panTo(worldToLatLng(m.x, m.z))}
          hiddenOwners={hiddenOwners}
          hiddenCategories={hiddenCategories}
          onToggleOwner={toggleOwner}
          onToggleCategory={toggleCategory}
        />
      </div>

      {pendingMarkerCoords && (
        <MarkerModal coords={pendingMarkerCoords} onSave={saveMarker} onClose={() => changeMode("view")} />
      )}
      {pendingTextCoords && <TextModal onSave={saveText} onClose={() => changeMode("view")} />}
    </div>
  );
}
