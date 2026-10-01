// Plastisches Architekturmodell des Hauses. Alle Geometrie wird aus denselben
// Projektdaten wie der 2D-Grundriss abgeleitet (siehe geometry/walls.ts).
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Floor, Item, Opening, Project, Room } from "@/model/types";
import { entryFor, type CatalogEntry, type Part } from "@/catalog/catalog";
import { buildWalls, placeOpening, wallBoxes } from "@/geometry/walls";
import { add, scale, rotate } from "@/geometry/vec";
import type { Quality } from "@/store/ui";
import {
  doorMaterial,
  floorMaterial,
  frameMaterial,
  geometries,
  glassMaterial,
  glowMaterial,
  issueMaterial,
  openFrameMaterial,
  partMaterial,
  selectionMaterial,
  shutterMaterial,
  slabEdgeMaterial,
  slabMaterial,
  tintMaterial,
  wallMaterial,
} from "./materials";

export interface LightInfo {
  on: boolean;
  color: string;
  /** 0..1 */
  level: number;
}

export interface OverlayInfo {
  /** Raum-ID → Farbe und Deckkraft */
  roomTint: Map<string, { color: string; opacity: number }>;
  /** Öffnung → Rollladen geschlossen (0..1), null = unbekannt */
  shutters: Map<string, number | null>;
  /** Öffnung → offen/gekippt hervorheben */
  openOpenings: Set<string>;
  lights: Map<string, LightInfo>;
  issues: Set<string>;
}

export interface Handlers {
  onItem?: (item: Item, e: ThreeEvent<PointerEvent | MouseEvent>) => void;
  onItemDown?: (item: Item, e: ThreeEvent<PointerEvent>) => void;
  onOpening?: (o: Opening) => void;
  onRoom?: (r: Room) => void;
}

function shapeFrom(points: { x: number; y: number }[], holes: { x: number; y: number }[][] = []) {
  const s = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.y))));
  return s;
}

const isClick = (e: ThreeEvent<MouseEvent>) => e.delta <= 6;

function RoomFloor({ room, voids, quality, selected, tint, interactive, handlers }: {
  room: Room;
  voids: { x: number; y: number }[][];
  quality: Quality;
  selected: boolean;
  tint?: { color: string; opacity: number };
  interactive: boolean;
  handlers: Handlers;
}) {
  const geo = useMemo(() => new THREE.ShapeGeometry(shapeFrom(room.vertices, voids)), [room.vertices, voids]);
  const slab = useMemo(
    () => new THREE.ExtrudeGeometry(shapeFrom(room.vertices, voids), { depth: 0.22, bevelEnabled: false }),
    [room.vertices, voids],
  );
  return (
    <group>
      <mesh geometry={slab} rotation-x={-Math.PI / 2} position-y={-0.232} material={[slabMaterial(), slabEdgeMaterial()]} receiveShadow />
      <mesh
        geometry={geo}
        rotation-x={-Math.PI / 2}
        position-y={0.001}
        material={floorMaterial(room.floorMaterial, quality)}
        receiveShadow
        onClick={
          interactive
            ? (e) => {
                if (!isClick(e)) return;
                e.stopPropagation();
                handlers.onRoom?.(room);
              }
            : undefined
        }
        userData={{ roomId: room.id }}
      />
      {tint && <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={0.012} material={tintMaterial(tint.color, tint.opacity)} renderOrder={2} />}
      {selected && <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={0.014} material={selectionMaterial()} renderOrder={3} />}
    </group>
  );
}

function Walls({ project, floor, cutHeight, shadows }: { project: Project; floor: Floor; cutHeight: number; shadows: boolean }) {
  const boxes = useMemo(() => {
    const segs = buildWalls(project, floor);
    return segs.flatMap((s) => wallBoxes(s, cutHeight).map((b, i) => ({ ...b, key: `${s.key}:${i}`, color: s.color })));
  }, [project.rooms, project.openings, floor, cutHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  const cut = cutHeight < floor.height - 0.01;
  return (
    <group>
      {boxes.map((b) => {
        const side = wallMaterial(b.exterior ? "#F4F2EC" : b.color);
        const top = cut && b.y0 + b.height >= cutHeight - 0.001 ? wallMaterial("", true) : side;
        return (
          <mesh
            key={b.key}
            geometry={geometries.box}
            position={[b.cx, b.y0 + b.height / 2, b.cy]}
            rotation-y={-b.angle}
            scale={[b.length, b.height, b.thickness]}
            material={top === side ? side : [side, side, top, side, side, side]}
            castShadow={shadows}
            receiveShadow={shadows}
          />
        );
      })}
    </group>
  );
}

function OpeningMesh({ o, rooms, cutHeight, overlay, interactive, handlers, thickness }: {
  o: Opening;
  rooms: Room[];
  cutHeight: number;
  overlay: OverlayInfo;
  interactive: boolean;
  handlers: Handlers;
  thickness: number;
}) {
  const pl = placeOpening(o, rooms);
  if (!pl) return null;
  const angle = Math.atan2(pl.edge.dir.y, pl.edge.dir.x);
  const click = interactive
    ? (e: ThreeEvent<MouseEvent>) => {
        if (!isClick(e)) return;
        e.stopPropagation();
        handlers.onOpening?.(o);
      }
    : undefined;
  if (o.kind === "window") {
    const top = Math.min(o.sill + o.height, cutHeight);
    const visible = top - o.sill;
    const open = overlay.openOpenings.has(o.id);
    const shutter = overlay.shutters.get(o.id);
    const shutterH = shutter ? o.height * shutter : 0;
    const shutterTop = o.sill + o.height;
    const shutterBottom = shutterTop - shutterH;
    const shutterVisible = Math.min(shutterTop, cutHeight) - shutterBottom;
    return (
      <group position={[pl.center.x, 0, pl.center.y]} rotation-y={-angle}>
        {visible > 0.02 && (
          <mesh position-y={o.sill + visible / 2} scale={[o.width - 0.04, visible, 0.03]} geometry={geometries.box} material={glassMaterial()} onClick={click} />
        )}
        <mesh position-y={o.sill - 0.02} scale={[o.width + 0.04, 0.04, thickness + 0.06]} geometry={geometries.box} material={open ? openFrameMaterial() : frameMaterial()} onClick={click} />
        {visible > 0.05 &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[(s * (o.width - 0.03)) / 2, o.sill + visible / 2, 0]} scale={[0.04, visible, 0.08]} geometry={geometries.box} material={open ? openFrameMaterial() : frameMaterial()} onClick={click} />
          ))}
        {shutterVisible > 0.02 && shutterH > 0.02 && (
          <mesh position={[0, shutterBottom + shutterVisible / 2, -thickness / 2 - 0.03]} scale={[o.width, shutterVisible, 0.03]} geometry={geometries.box} material={shutterMaterial()} onClick={click} />
        )}
      </group>
    );
  }
  if (o.kind === "door") {
    const h = Math.min(o.height, cutHeight) - 0.02;
    if (h <= 0.05) return null;
    const hinge = o.hinge === "left" ? pl.a : pl.b;
    const toOther = o.hinge === "left" ? pl.edge.dir : scale(pl.edge.dir, -1);
    // Türblatt ~75° geöffnet, schwenkt in den Raum der Öffnung
    const sign = Math.sign(toOther.x * pl.edge.inward.y - toOther.y * pl.edge.inward.x) || 1;
    const dir = rotate(toOther, sign * ((75 * Math.PI) / 180));
    const center = add(hinge, scale(dir, o.width / 2));
    const a = Math.atan2(dir.y, dir.x);
    return (
      <mesh position={[center.x, h / 2, center.y]} rotation-y={-a} scale={[o.width - 0.04, h, 0.04]} geometry={geometries.box} material={doorMaterial()} castShadow onClick={click} />
    );
  }
  return null;
}

function partColor(p: Part, item: Item, entry: CatalogEntry): string {
  switch (p.color) {
    case "main":
      return item.color;
    case "accent":
      return entry.accent;
    case "dark":
      return "#3A3F3C";
    case "metal":
      return "#B9BDB8";
    case "glass":
      return "#CFE3EA";
    case "light":
      return "#F7F5F0";
    case "fabric2":
      return shade(item.color, -0.08);
    default:
      return p.color;
  }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.max(0, Math.min(255, Math.round(x + 255 * amt))));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function ItemMesh({ item, quality, light, selected, issue, interactive, handlers, ghost }: {
  item: Item;
  quality: Quality;
  light?: LightInfo;
  selected?: boolean;
  issue?: boolean;
  interactive?: boolean;
  handlers?: Handlers;
  ghost?: boolean;
}) {
  const entry = entryFor(item.catalogId);
  const shadows = quality !== "low" && !ghost;
  const mats = useMemo(
    () =>
      entry.parts.map((p) => {
        if (ghost) return null;
        if (p.color === "glass") return glassMaterial();
        if (p.glow && light?.on) return glowMaterial(light.color, 0.6 + 1.6 * light.level);
        const mat = p.color === "main" || p.color === "fabric2" ? item.material : p.color === "metal" ? "metall" : "lack";
        return partMaterial(partColor(p, item, entry), mat, quality);
      }),
    [entry, item.color, item.material, quality, light?.on, light?.color, light?.level, ghost], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <group position={[item.x, item.elevation, item.y]} rotation-y={-item.rotation}>
      <group
        onClick={
          interactive
            ? (e) => {
                if (!isClick(e)) return;
                e.stopPropagation();
                handlers?.onItem?.(item, e);
              }
            : undefined
        }
        onPointerDown={interactive && handlers?.onItemDown ? (e) => handlers.onItemDown!(item, e) : undefined}
      >
        {entry.parts.map((p, i) => (
          <mesh
            key={i}
            geometry={geometries[p.shape]}
            position={[p.x * item.width, p.y * item.height, p.z * item.depth]}
            scale={[p.w * item.width, p.h * item.height, p.d * item.depth]}
            material={ghost ? undefined : mats[i]!}
            castShadow={shadows && item.catalogId !== "rug"}
            receiveShadow={shadows}
          >
            {ghost && <meshStandardMaterial color="#4D7163" transparent opacity={0.4} depthWrite={false} />}
          </mesh>
        ))}
      </group>
      {(selected || issue) && (
        <mesh position-y={item.height / 2} scale={[item.width + 0.06, item.height + 0.06, item.depth + 0.06]} geometry={geometries.box} material={issue && !selected ? issueMaterial() : selectionMaterial()} renderOrder={4} />
      )}
    </group>
  );
}

export interface FloorLayerProps {
  project: Project;
  floor: Floor;
  cutHeight: number;
  quality: Quality;
  interactive: boolean;
  overlay: OverlayInfo;
  selection: { kind: string; id: string } | null;
  handlers: Handlers;
  hiddenItemId?: string | null;
}

export function FloorLayer({ project, floor, cutHeight, quality, interactive, overlay, selection, handlers, hiddenItemId }: FloorLayerProps) {
  const rooms = useMemo(() => project.rooms.filter((r) => r.floorId === floor.id), [project.rooms, floor.id]);
  const voids = useMemo(
    () =>
      project.voids
        .filter((v) => v.floorId === floor.id)
        .map((v) => [
          { x: v.x, y: v.y },
          { x: v.x + v.width, y: v.y },
          { x: v.x + v.width, y: v.y + v.depth },
          { x: v.x, y: v.y + v.depth },
        ]),
    [project.voids, floor.id],
  );
  const roomVoids = useRef(new Map<string, { x: number; y: number }[][]>());
  const items = project.items.filter((i) => i.floorId === floor.id);
  const roomIds = new Set(rooms.map((r) => r.id));
  const openings = project.openings.filter((o) => roomIds.has(o.roomId));
  const shadows = quality !== "low";
  return (
    <group position-y={floor.elevation}>
      {rooms.map((r) => {
        // Deckenöffnung nur in Räumen, die sie vollständig enthalten
        const vs = voids.filter((v) => v.every((p) => p.x >= Math.min(...r.vertices.map((q) => q.x)) - 1e-6 && p.x <= Math.max(...r.vertices.map((q) => q.x)) + 1e-6 && p.y >= Math.min(...r.vertices.map((q) => q.y)) - 1e-6 && p.y <= Math.max(...r.vertices.map((q) => q.y)) + 1e-6));
        const key = JSON.stringify(vs);
        const prev = roomVoids.current.get(r.id);
        const stable = prev && JSON.stringify(prev) === key ? prev : vs;
        roomVoids.current.set(r.id, stable);
        return (
          <RoomFloor
            key={r.id}
            room={r}
            voids={stable}
            quality={quality}
            selected={selection?.kind === "room" && selection.id === r.id}
            tint={overlay.roomTint.get(r.id)}
            interactive={interactive}
            handlers={handlers}
          />
        );
      })}
      <Walls project={project} floor={floor} cutHeight={cutHeight} shadows={shadows} />
      {openings.map((o) => (
        <OpeningMesh key={o.id} o={o} rooms={rooms} cutHeight={cutHeight} overlay={overlay} interactive={interactive} handlers={handlers} thickness={0.12} />
      ))}
      {items
        .filter((it) => it.id !== hiddenItemId)
        .map((it) => (
          <ItemMesh
            key={it.id}
            item={it}
            quality={quality}
            light={overlay.lights.get(it.id)}
            selected={selection?.kind === "item" && selection.id === it.id}
            issue={overlay.issues.has(it.id)}
            interactive={interactive}
            handlers={handlers}
          />
        ))}
    </group>
  );
}

/** Lichtquellen eingeschalteter Leuchten. Begrenzte Reichweite verhindert, dass Licht weit durch Wände scheint. */
export function LightRig({ project, floors, overlay, quality }: { project: Project; floors: Floor[]; overlay: OverlayInfo; quality: Quality }) {
  const max = quality === "low" ? 0 : quality === "medium" ? 8 : 16;
  const floorIds = new Set(floors.map((f) => f.id));
  const lit = project.items
    .filter((it) => floorIds.has(it.floorId) && overlay.lights.get(it.id)?.on && entryFor(it.catalogId).light)
    .sort((a, b) => (overlay.lights.get(b.id)?.level ?? 0) - (overlay.lights.get(a.id)?.level ?? 0))
    .slice(0, max);
  return (
    <group>
      {lit.map((it) => {
        const f = project.floors.find((x) => x.id === it.floorId)!;
        const e = entryFor(it.catalogId);
        const l = overlay.lights.get(it.id)!;
        const y = f.elevation + it.elevation + it.height * (e.light?.y ?? 0.5) - (e.mount === "ceiling" ? 0.15 : 0);
        return <pointLight key={it.id} position={[it.x, y, it.y]} color={l.color} intensity={1.2 + 4.5 * l.level} distance={4.2} decay={1.6} castShadow={false} />;
      })}
    </group>
  );
}

export function RoofLayer({ project, floor }: { project: Project; floor: Floor }) {
  const rooms = project.rooms.filter((r) => r.floorId === floor.id);
  return (
    <group position-y={floor.elevation + floor.height + 0.25}>
      {rooms.map((r) => (
        <RoofSlab key={r.id} room={r} />
      ))}
    </group>
  );
}

function RoofSlab({ room }: { room: Room }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shapeFrom(room.vertices), { depth: 0.25, bevelEnabled: false }), [room.vertices]);
  return <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={-0.25} material={[slabEdgeMaterial(), slabMaterial()]} castShadow receiveShadow />;
}
