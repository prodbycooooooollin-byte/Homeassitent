import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AlertTriangle, Lightbulb, Loader2, Plug, Thermometer, Blinds, DoorOpen } from "lucide-react";
import { clsx } from "clsx";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { useDrag, registerDropTarget } from "@/store/drag";
import type { Item, Project } from "@/model/types";
import { bounds, centroid } from "@/geometry/polygon";
import { roundMm } from "@/geometry/vec";
import { snapToWall, surfaceElevation } from "@/geometry/placement";
import { buildWalls } from "@/geometry/walls";
import { entryFor } from "@/catalog/catalog";
import { describeBinding } from "@/devices/view";
import { lightView } from "@/devices/state";
import { previewPlacement } from "@/design/place";
import { FloorLayer, ItemMesh, LightRig, RoofLayer, type Handlers } from "./HouseModel";
import { useOverlay } from "./useOverlay";
import { bridge, isOverCanvas, pickPlan } from "./bridge";
import { anchorOf } from "./anchors";

const prefersReducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function useHouseBounds(project: Project | null) {
  return useMemo(() => {
    const pts = project?.rooms.flatMap((r) => r.vertices) ?? [];
    if (!pts.length) return { cx: 0, cz: 0, size: 10, minX: -5, maxX: 5, minY: -5, maxY: 5 };
    const b = bounds(pts);
    return { cx: (b.minX + b.maxX) / 2, cz: (b.minY + b.maxY) / 2, size: Math.max(b.width, b.height, 4), minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY };
  }, [project?.rooms]); // eslint-disable-line react-hooks/exhaustive-deps
}

function CameraRig({ project, floorElevation }: { project: Project | null; floorElevation: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate, size } = useThree();
  const hb = useHouseBounds(project);
  // Im Hochformat (Smartphone) weiter entfernt, damit das ganze Haus sichtbar ist
  const aspectFactor = Math.max(1, 1.3 / Math.max(0.3, size.width / Math.max(1, size.height)));
  const focus = useUi((s) => s.focus);
  const anim = useRef<{ fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3; t: number } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!controls.current) return;
    bridge.controls = controls.current;
    if (initialized.current || !project?.rooms.length) return;
    initialized.current = true;
    const d = (hb.size * 1.25 + 4) * aspectFactor;
    camera.position.set(hb.cx + d * 0.55, floorElevation + d * 0.85, hb.cz + d * 0.95);
    controls.current.target.set(hb.cx, floorElevation, hb.cz);
    controls.current.update();
    invalidate();
  }, [project?.rooms.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!controls.current || focus.n === 0 || !project) return;
    const room = focus.roomId ? project.rooms.find((r) => r.id === focus.roomId) : null;
    let target: THREE.Vector3;
    let dist: number;
    if (room) {
      const c = centroid(room.vertices);
      const b = bounds(room.vertices);
      const f = project.floors.find((x) => x.id === room.floorId);
      target = new THREE.Vector3(c.x, f?.elevation ?? 0, c.y);
      dist = (Math.max(b.width, b.height) * 1.5 + 3) * aspectFactor;
    } else {
      target = new THREE.Vector3(hb.cx, floorElevation, hb.cz);
      dist = (hb.size * 1.25 + 4) * aspectFactor;
    }
    const dir = camera.position.clone().sub(controls.current.target).normalize();
    if (dir.y < 0.45) dir.y = 0.75;
    dir.normalize();
    const toP = target.clone().add(dir.multiplyScalar(dist));
    if (prefersReducedMotion()) {
      controls.current.target.copy(target);
      camera.position.copy(toP);
      controls.current.update();
      invalidate();
      return;
    }
    anim.current = { fromT: controls.current.target.clone(), toT: target, fromP: camera.position.clone(), toP, t: 0 };
    invalidate();
  }, [focus.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls.current) return;
    a.t = Math.min(1, a.t + dt / 0.6);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.current.target.lerpVectors(a.fromT, a.toT, k);
    camera.position.lerpVectors(a.fromP, a.toP, k);
    controls.current.update();
    if (a.t >= 1) anim.current = null;
    invalidate();
  });

  const clampTarget = () => {
    const c = controls.current;
    if (!c) return;
    const m = 4;
    const t = c.target;
    const nx = THREE.MathUtils.clamp(t.x, hb.minX - m, hb.maxX + m);
    const nz = THREE.MathUtils.clamp(t.z, hb.minY - m, hb.maxY + m);
    const ny = THREE.MathUtils.clamp(t.y, -1, 12);
    if (nx !== t.x || nz !== t.z || ny !== t.y) {
      const delta = new THREE.Vector3(nx - t.x, ny - t.y, nz - t.z);
      t.add(delta);
      camera.position.add(delta);
    }
  };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!prefersReducedMotion()}
      dampingFactor={0.12}
      minDistance={2.5}
      maxDistance={Math.max(30, hb.size * 4 * aspectFactor)}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.05}
      screenSpacePanning={false}
      onChange={() => {
        clampTarget();
        invalidate();
      }}
    />
  );
}

function BridgeSetup() {
  const { camera, gl, invalidate, scene } = useThree();
  useEffect(() => {
    bridge.camera = camera;
    bridge.canvas = gl.domElement;
    bridge.invalidate = invalidate;
    // Diagnose-Schnittstelle für automatisierte Tests und die Leistungsmessung
    (window as unknown as { __lh?: unknown }).__lh = {
      /** Ausdehnung aller Raumböden im 3D-Modell (Weltkoordinaten x/z) je Raum */
      floorExtents: () => {
        const out: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> = {};
        scene.updateMatrixWorld(true);
        scene.traverse((o) => {
          const id = (o.userData as { roomId?: string }).roomId;
          if (!id) return;
          const b = new THREE.Box3().setFromObject(o);
          out[id] = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
        });
        return out;
      },
      /** Bildschirmposition eines Ankers (für Klicks auf Objekte im Modell) */
      screenOf: (kind: "item" | "opening" | "room", id: string) => {
        const p = useProject.getState().project;
        const a = p && anchorOf(p, { kind, id });
        if (!a) return null;
        const v = new THREE.Vector3(a[0], a[1] - (kind === "item" ? 0.05 : 0), a[2]).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      meshCount: () => {
        let n = 0;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) n++;
        });
        return n;
      },
      renderInfo: () => ({ ...gl.info.render }),
      invalidate,
    };
  }, [camera, gl, invalidate, scene]);
  return null;
}

/** Hält die am Objekt verankerte Steuerkarte an ihrer Bildschirmposition. */
function AnchorTracker({ project }: { project: Project | null }) {
  const card = useUi((s) => s.card);
  const { camera, size, gl } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const el = document.getElementById("lh-anchor");
    if (!el) return;
    if (!card || !project) {
      el.dataset.visible = "0";
      return;
    }
    const a = anchorOf(project, card);
    if (!a) return;
    v.set(a[0], a[1], a[2]).project(camera);
    const r = gl.domElement.getBoundingClientRect();
    let x = r.left + ((v.x + 1) / 2) * size.width;
    let y = r.top + ((1 - v.y) / 2) * size.height;
    // Karte vollständig im sichtbaren Bereich halten (sie erscheint oberhalb des Ankers)
    const h = (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? 300;
    x = Math.min(Math.max(x, 176), window.innerWidth - 176);
    y = Math.min(Math.max(y, h + 80), window.innerHeight - 96);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.dataset.visible = v.z < 1 ? "1" : "0";
  });
  return null;
}

let groundTex: THREE.Texture | null = null;
function groundTexture() {
  if (groundTex) return groundTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(226,231,220,1)");
  g.addColorStop(0.45, "rgba(229,233,224,0.9)");
  g.addColorStop(1, "rgba(236,238,232,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  groundTex = new THREE.CanvasTexture(c);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  return groundTex;
}

function Ground({ project, onEmpty }: { project: Project | null; onEmpty: () => void }) {
  const hb = useHouseBounds(project);
  const r = hb.size * 1.6 + 10;
  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[hb.cx, -0.24, hb.cz]}
        onClick={(e) => {
          if (e.delta > 6) return;
          onEmpty();
        }}
      >
        <planeGeometry args={[r * 2, r * 2]} />
        <meshBasicMaterial map={groundTexture()} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[hb.cx, -0.235, hb.cz]} receiveShadow>
        <planeGeometry args={[r * 2, r * 2]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
    </group>
  );
}

function Sun({ project, shadows, quality }: { project: Project | null; shadows: boolean; quality: string }) {
  const hb = useHouseBounds(project);
  const ref = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    target.position.set(hb.cx, 0, hb.cz);
    target.updateMatrixWorld();
    if (ref.current) {
      ref.current.target = target;
      const cam = ref.current.shadow.camera;
      const s = hb.size * 0.85 + 2;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 80;
      cam.updateProjectionMatrix();
    }
  }, [hb, target]);
  const mapSize = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={["#FFFFFF", "#D8D2C4", 1.15]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        ref={ref}
        position={[hb.cx + 9, 18, hb.cz + 12]}
        intensity={1.9}
        color="#FFF6E8"
        castShadow={shadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
    </>
  );
}

type BadgeKind = "light" | "switch" | "cover" | "contact" | "climate" | "sensor";

function Badges({ project, floorId }: { project: Project; floorId: string }) {
  const states = useLive((s) => s.states);
  const status = useLive((s) => s.status);
  const pending = useLive((s) => s.pending);
  const layers = useUi((s) => s.layers);
  const tab = useUi((s) => s.tab);
  const patch = useUi((s) => s.patch);
  const connected = isConnected(status);
  if (tab === "design") return null;
  const groups = new Map<string, { target: { kind: "item" | "opening" | "room"; id: string }; kinds: Set<BadgeKind>; on: boolean; warn: boolean; busy: boolean; label: string }>();
  for (const b of project.bindings) {
    if (b.target.kind === "room") continue;
    const floorOf =
      b.target.kind === "item"
        ? project.items.find((i) => i.id === b.target.id)?.floorId
        : project.rooms.find((r) => r.id === project.openings.find((o) => o.id === b.target.id)?.roomId)?.floorId;
    if (floorOf !== floorId) continue;
    const d = describeBinding(b, states, connected);
    const key = `${b.target.kind}:${b.target.id}`;
    const g = groups.get(key) ?? { target: b.target as { kind: "item" | "opening"; id: string }, kinds: new Set<BadgeKind>(), on: false, warn: false, busy: false, label: d.name };
    g.kinds.add(b.role);
    const on = b.role === "light" ? lightView(d.state).on === true : b.role === "switch" ? d.state?.state === "on" : false;
    g.on ||= on;
    g.warn ||= d.freshness.availability !== "ok";
    g.busy ||= !!pending[b.entityId];
    groups.set(key, g);
  }
  return (
    <>
      {[...groups.values()].map((g) => {
        const visible = g.warn || g.busy || layers.devices || (g.on && g.kinds.has("light"));
        if (!visible) return null;
        const a = anchorOf(project, g.target);
        if (!a) return null;
        const Icon = g.kinds.has("light") ? Lightbulb : g.kinds.has("cover") ? Blinds : g.kinds.has("contact") ? DoorOpen : g.kinds.has("climate") ? Thermometer : Plug;
        return (
          <Html key={`${g.target.kind}:${g.target.id}`} position={[a[0], a[1] + 0.25, a[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "auto" }}>
            <button
              type="button"
              onClick={() => patch({ card: g.target })}
              aria-label={`${g.label}${g.warn ? " – Hinweis" : g.on ? " – eingeschaltet" : ""}`}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full border shadow-soft",
                g.warn ? "border-warn-line bg-warn-soft text-warn" : g.on ? "border-lamp bg-lamp text-ink" : "border-line bg-surface text-ink-2",
              )}
            >
              {g.busy ? <Loader2 size={15} className="spin" /> : g.warn ? <AlertTriangle size={15} /> : <Icon size={15} fill={g.on ? "currentColor" : "none"} />}
            </button>
          </Html>
        );
      })}
    </>
  );
}

function RoomLabels({ project, floorId }: { project: Project; floorId: string }) {
  const layers = useUi((s) => s.layers);
  const selection = useUi((s) => s.selection);
  const tab = useUi((s) => s.tab);
  if (!layers.labels && tab !== "design") return null;
  return (
    <>
      {project.rooms
        .filter((r) => r.floorId === floorId)
        .map((r) => {
          const c = centroid(r.vertices);
          const f = project.floors.find((x) => x.id === floorId)!;
          const sel = selection?.kind === "room" && selection.id === r.id;
          return (
            <Html key={r.id} position={[c.x, f.elevation + 0.05, c.y]} center zIndexRange={[19, 0]} style={{ pointerEvents: "none" }}>
              <span className={clsx("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium shadow-soft", sel ? "bg-sage text-white" : "bg-surface/90 text-ink")}>{r.name}</span>
            </Html>
          );
        })}
    </>
  );
}

function DragGhost({ project, floorId, elevation }: { project: Project; floorId: string; elevation: number }) {
  const drag = useDrag();
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    if (!drag.catalogId || !isOverCanvas(drag.x, drag.y)) {
      if (pt) setPt(null);
      return;
    }
    setPt(pickPlan(drag.x, drag.y, elevation));
    invalidate();
  }, [drag.x, drag.y, drag.catalogId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!drag.catalogId || !pt) return null;
  const pv = previewPlacement(project, floorId, drag.catalogId, pt, drag.rotation);
  return (
    <group position-y={elevation}>
      <ItemMesh item={pv.item} quality="low" ghost />
    </group>
  );
}

function SceneContent() {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const beginGesture = useProject((s) => s.beginGesture);
  const endGesture = useProject((s) => s.endGesture);
  const canEdit = useProject((s) => s.canEdit);
  const ui = useUi();
  const states = useLive((s) => s.states);
  const status = useLive((s) => s.status);
  const connected = isConnected(status);
  const showIssues = ui.tab === "design";
  const overlay = useOverlay(project, states, connected, ui.layers, ui.tab, showIssues);
  const { invalidate } = useThree();

  const floors = useMemo(() => [...(project?.floors ?? [])].sort((a, b) => a.elevation - b.elevation), [project?.floors]);
  const current = floors.find((f) => f.id === ui.floorId) ?? floors[0];
  const visible = floors.filter((f) => ui.floorsMode === "stack" || f.elevation <= (current?.elevation ?? 0));
  const cutFor = (f: (typeof floors)[number]) => {
    if (f.id !== current?.id || ui.floorsMode === "stack") return f.height;
    return ui.wallMode === "full" ? f.height : ui.wallMode === "cut" ? Math.min(1.35, f.height) : 0.12;
  };

  useEffect(() => {
    invalidate();
  }, [overlay, project, ui.selection, ui.wallMode, ui.floorsMode, ui.floorId, ui.tab, invalidate]);

  // Ablage aus dem Katalog in der 3D-Ansicht
  useEffect(() => {
    if (!project || !current) return;
    return registerDropTarget((catalogId, x, y, rotation) => {
      if (!isOverCanvas(x, y)) return false;
      const p = pickPlan(x, y, current.elevation);
      if (!p) return false;
      const pv = previewPlacement(useProject.getState().project!, current.id, catalogId, p, rotation);
      useProject.getState().apply((pr) => ({ ...pr, items: [...pr.items, pv.item] }));
      useUi.getState().patch({ selection: { kind: "item", id: pv.item.id } });
      useUi.getState().toast(`${pv.item.name} platziert${pv.roomName ? ` (${pv.roomName})` : ""}.`, "success");
      return true;
    });
  }, [project?.id, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project || !current) return null;

  const openCardFor = (target: { kind: "item" | "opening" | "room"; id: string }) => {
    const bound = project.bindings.some((b) => b.target.kind === target.kind && b.target.id === target.id);
    ui.patch({ card: bound ? target : null, selection: target.kind === "item" ? { kind: "item", id: target.id } : target.kind === "opening" ? { kind: "opening", id: target.id } : { kind: "room", id: target.id } });
    if (!bound && ui.tab !== "design") ui.toast("Diesem Objekt ist noch kein Gerät zugeordnet. Zuordnen unter Gestalten → Verbinden.", "info");
  };

  const handlers: Handlers = {
    onItem: (item) => {
      if (ui.tab === "design") ui.patch({ selection: { kind: "item", id: item.id }, card: null });
      else openCardFor({ kind: "item", id: item.id });
    },
    onOpening: (o) => {
      if (ui.tab === "design") ui.patch({ selection: { kind: "opening", id: o.id } });
      else openCardFor({ kind: "opening", id: o.id });
    },
    onRoom: (r) => ui.patch({ selection: { kind: "room", id: r.id }, card: null }),
    onItemDown:
      ui.tab === "design" && ui.designTool === "furnish" && canEdit
        ? (item, e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            startItemDrag(item, e.nativeEvent, current.elevation);
          }
        : undefined,
  };

  function startItemDrag(item: Item, ev: PointerEvent, elevation: number) {
    const start = pickPlan(ev.clientX, ev.clientY, elevation);
    if (!start) return;
    const off = { x: item.x - start.x, y: item.y - start.y };
    let moved = false;
    const sx = ev.clientX;
    const sy = ev.clientY;
    if (bridge.controls) bridge.controls.enabled = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
      if (!moved) {
        moved = true;
        beginGesture();
        useUi.getState().patch({ selection: { kind: "item", id: item.id } });
      }
      const p = pickPlan(e.clientX, e.clientY, elevation);
      if (!p) return;
      apply((pr) => {
        const it = pr.items.find((i) => i.id === item.id);
        if (!it) return pr;
        const entry = entryFor(it.catalogId);
        let next = { ...it, x: roundMm(Math.round((p.x + off.x) / 0.05) * 0.05), y: roundMm(Math.round((p.y + off.y) / 0.05) * 0.05) };
        if (!e.altKey && entry.mount === "wall") {
          const floor = pr.floors.find((f) => f.id === it.floorId)!;
          const s = snapToWall(next, buildWalls(pr, floor), null, pr.rooms, 0.5);
          if (s) next = { ...next, x: roundMm(s.x), y: roundMm(s.y), rotation: s.rotation };
        }
        if (entry.mount === "surface") next.elevation = roundMm(surfaceElevation(next, pr.items));
        return { ...pr, items: pr.items.map((i) => (i.id === it.id ? next : i)) };
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (bridge.controls) bridge.controls.enabled = true;
      if (moved) endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const shadows = ui.quality !== "low";
  const top = floors[floors.length - 1];
  return (
    <>
      <Sun project={project} shadows={shadows} quality={ui.quality} />
      <Ground project={project} onEmpty={() => ui.patch({ selection: null, card: null })} />
      {visible.map((f) => (
        <FloorLayer
          key={f.id}
          project={project}
          floor={f}
          cutHeight={cutFor(f)}
          quality={ui.quality}
          interactive={f.id === current.id}
          overlay={overlay}
          selection={f.id === current.id && ui.selection && "id" in ui.selection ? (ui.selection as { kind: string; id: string }) : null}
          handlers={handlers}
        />
      ))}
      {ui.showRoof && ui.floorsMode === "stack" && top && <RoofLayer project={project} floor={top} />}
      <LightRig project={project} floors={visible} overlay={overlay} quality={ui.quality} />
      <Badges project={project} floorId={current.id} />
      <RoomLabels project={project} floorId={current.id} />
      <DragGhost project={project} floorId={current.id} elevation={current.elevation} />
      <CameraRig project={project} floorElevation={current.elevation} />
      <AnchorTracker project={project} />
    </>
  );
}

export default function SceneCanvas() {
  const quality = useUi((s) => s.quality);
  const dpr: [number, number] = quality === "low" ? [1, 1] : quality === "medium" ? [1, 1.5] : [1, 2];
  return (
    <Canvas
      key={quality === "low" ? "low" : "std"}
      frameloop="demand"
      shadows={quality !== "low" ? { type: THREE.PCFSoftShadowMap } : false}
      dpr={dpr}
      gl={{ antialias: quality !== "low", alpha: true, powerPreference: quality === "low" ? "low-power" : "default", preserveDrawingBuffer: false }}
      camera={{ fov: 40, near: 0.1, far: 400, position: [14, 16, 20] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
      data-testid="scene-canvas"
      aria-label="3D-Ansicht des Hauses"
    >
      <BridgeSetup />
      <SceneContent />
    </Canvas>
  );
}
