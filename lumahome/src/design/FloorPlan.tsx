// 2D-Grundriss-Editor. Bearbeitet direkt die Projektgeometrie, aus der auch
// das 3D-Modell entsteht – es gibt nur eine Hausversion.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Item, Project, Vec2 } from "@/model/types";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { useDrag, registerDropTarget } from "@/store/drag";
import { centroid, polygonArea, roomEdges, edgeByStart } from "@/geometry/polygon";
import { buildWalls, placeOpening, wallRect } from "@/geometry/walls";
import { itemCorners, snapAngle, snapToWall, surfaceElevation, worldToItemLocal, doorSwingArea } from "@/geometry/placement";
import { snapPoint, snapToGrid, type Guide } from "@/geometry/snapping";
import { add, dist, dot, normalize, perp, roundMm, scale as vscale, sub } from "@/geometry/vec";
import { addRoom, insertVertex, makeRoom, moveEdge, moveVertices, translateRoom } from "@/geometry/ops";
import { newId } from "@/model/ids";
import { entryFor } from "@/catalog/catalog";
import { openingProblems } from "@/geometry/validate";
import { fitOpening } from "@/geometry/ops";
import { previewPlacement } from "./place";
import { FLOOR_FILL, fitView, fmtM, nearestEdge, toPlan, toScreen, type View } from "./planMath";
import { useOverlay } from "@/scene/useOverlay";

type Gesture =
  | { kind: "pan"; sx: number; sy: number; view: View; moved: boolean; clearOnTap: boolean }
  | { kind: "pinch"; d0: number; c0: Vec2; view: View }
  | { kind: "rect"; start: Vec2; cur: Vec2 }
  | { kind: "void"; start: Vec2; cur: Vec2 }
  | { kind: "vertex"; roomId: string; vertexId: string; moved: boolean }
  | { kind: "edge"; roomId: string; edgeStart: string; start: Vec2; applied: Vec2; moved: boolean }
  | { kind: "room"; roomId: string; start: Vec2; applied: Vec2; moved: boolean }
  | { kind: "item"; itemId: string; offset: Vec2; sx: number; sy: number; moved: boolean }
  | { kind: "rotate"; itemId: string }
  | { kind: "resize"; itemId: string }
  | { kind: "opening"; openingId: string; moved: boolean };

const views = new Map<string, View>();

function pathOf(pts: Vec2[], v: View) {
  return pts.map((p, i) => `${i ? "L" : "M"}${(p.x * v.scale + v.ox).toFixed(1)},${(p.y * v.scale + v.oy).toFixed(1)}`).join("") + "Z";
}

export function FloorPlan({ readOnly = false }: { readOnly?: boolean }) {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const beginGesture = useProject((s) => s.beginGesture);
  const endGesture = useProject((s) => s.endGesture);
  const canEdit = useProject((s) => s.canEdit) && !readOnly;
  const ui = useUi();
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  const overlay = useOverlay(project, states, connected, ui.layers, ui.tab, ui.tab === "design");
  const drag = useDrag();

  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const floor = project?.floors.find((f) => f.id === ui.floorId) ?? project?.floors[0];
  const floorId = floor?.id ?? "";
  const [view, setViewState] = useState<View>(() => views.get(floorId) ?? { scale: 50, ox: 100, oy: 100 });
  const setView = useCallback(
    (v: View) => {
      views.set(floorId, v);
      setViewState(v);
    },
    [floorId],
  );
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const [, force] = useState(0);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [poly, setPoly] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<Vec2 | null>(null);
  const tool = readOnly ? "select" : ui.tab === "design" && ui.designTool === "plan" ? ui.planTool : "select";
  const furnish = ui.tab === "design" && ui.designTool === "furnish";

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!project) return;
    const pts = project.rooms.filter((r) => r.floorId === floorId).flatMap((r) => r.vertices);
    const all = pts.length ? pts : project.rooms.flatMap((r) => r.vertices);
    setView(fitView(all, size.w, size.h, readOnly ? { t: 120, r: 30, b: 110, l: 30 } : ui.designView === "split" ? { t: 150, r: 20, b: 110, l: 96 } : { t: 140, r: 380, b: 110, l: 96 }));
  }, [project, floorId, size.w, size.h, setView, readOnly, ui.designView]);

  useEffect(() => {
    const stored = views.get(floorId);
    if (stored) setViewState(stored);
    else if (size.w > 50) fit();
  }, [floorId, size.w > 50]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener("lumahome:fit-plan", onFit);
    return () => window.removeEventListener("lumahome:fit-plan", onFit);
  }, [fit]);

  useEffect(() => setPoly([]), [tool, floorId]);

  // Ablage aus dem Katalog im 2D-Plan
  useEffect(() => {
    if (readOnly) return;
    return registerDropTarget((catalogId, x, y, rotation) => {
      const el = svg.current;
      const p = useProject.getState().project;
      if (!el || !p || el.getBoundingClientRect().width === 0) return false;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      const under = document.elementFromPoint(x, y);
      if (!under || !el.contains(under)) return false;
      const pt = toPlan(views.get(floorId) ?? view, { x: x - r.left, y: y - r.top });
      const pv = previewPlacement(p, floorId, catalogId, pt, rotation);
      useProject.getState().apply((pr) => ({ ...pr, items: [...pr.items, pv.item] }));
      useUi.getState().patch({ selection: { kind: "item", id: pv.item.id } });
      useUi.getState().toast(`${pv.item.name} platziert${pv.roomName ? ` (${pv.roomName})` : ""}.`, "success");
      return true;
    });
  }, [floorId, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const keyHandler = useRef<((e: KeyboardEvent) => void) | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      keyHandler.current?.(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rooms = useMemo(() => project?.rooms.filter((r) => r.floorId === floorId) ?? [], [project?.rooms, floorId]);
  const walls = useMemo(() => (project && floor ? buildWalls(project, floor) : []), [project, floor]);
  const lowerFloor = useMemo(() => {
    if (!project || !floor) return null;
    return [...project.floors].filter((f) => f.elevation < floor.elevation).sort((a, b) => b.elevation - a.elevation)[0] ?? null;
  }, [project, floor]);

  if (!project || !floor) return null;
  const sel = ui.selection;
  const selRoom = sel && (sel.kind === "room" || sel.kind === "vertex" || sel.kind === "edge") ? project.rooms.find((r) => r.id === (sel.kind === "room" ? sel.id : sel.roomId)) : null;
  const selItem = sel?.kind === "item" ? project.items.find((i) => i.id === sel.id && i.floorId === floorId) : null;
  const tolM = 12 / view.scale;

  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const planPt = (e: { clientX: number; clientY: number }) => toPlan(view, local(e));

  const snapCtx = (excludeVertex?: string) => ({
    grid: project.settings.gridSize,
    vertices: rooms.flatMap((r) => r.vertices.filter((v) => v.id !== excludeVertex)),
    segments: rooms.flatMap((r) => roomEdges(r).map((e) => [e.a, e.b] as [Vec2, Vec2])),
    tolerance: tolM,
    enabled: true,
  });
  const snap = (p: Vec2, exclude?: string, e?: { altKey: boolean }) => {
    const r = snapPoint(p, { ...snapCtx(exclude), enabled: !e?.altKey });
    setGuides(r.guides);
    return r.point;
  };

  const select = (s: typeof sel) => ui.patch({ selection: s, card: null });

  function createOpening(p: Vec2, kind: "door" | "window" | "passage") {
    const hit = nearestEdge(project!, floorId, p, Math.max(0.4, tolM));
    if (!hit) {
      ui.toast("Bitte direkt auf eine Wand tippen.", "warn");
      return;
    }
    const width = kind === "door" ? 0.9 : kind === "window" ? 1.2 : 1.0;
    if (hit.edge.length < width + 0.1) {
      ui.toast("Die Wand ist zu kurz für diese Öffnung.", "warn");
      return;
    }
    const offset = Math.min(Math.max(snapToGrid(hit.s, 0.05), width / 2 + 0.05), hit.edge.length - width / 2 - 0.05);
    const o = {
      id: newId("open"),
      roomId: hit.room.id,
      edgeStart: hit.edge.startId,
      offset: roundMm(offset),
      width,
      height: kind === "window" ? 1.3 : 2.1,
      sill: kind === "window" ? 0.9 : 0,
      kind,
      hinge: "left" as const,
    };
    let next: Project = { ...project!, openings: [...project!.openings, o] };
    if (openingProblems(next, o.id).length) next = fitOpening(next, o.id);
    const probs = openingProblems(next, o.id);
    if (probs.length) {
      ui.toast(`Öffnung nicht möglich: ${probs[0]}`, "warn");
      return;
    }
    apply(() => next);
    select({ kind: "opening", id: o.id });
  }

  function finishPoly(points: Vec2[]) {
    if (points.length < 3) return;
    const room = makeRoom(floorId, `Raum ${project!.rooms.length + 1}`, points.map((p) => ({ id: newId("v"), x: roundMm(p.x), y: roundMm(p.y) })));
    apply((p) => addRoom(p, room));
    setPoly([]);
    select({ kind: "room", id: room.id });
  }

  // ---- Zeiger ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    svg.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", d0: dist(a, b), c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      setPoly((p) => p);
      return;
    }
    const p = planPt(e);
    if (tool === "rect" && canEdit) {
      const s = snap(p, undefined, e);
      gesture.current = { kind: "rect", start: s, cur: s };
    } else if (tool === "void" && canEdit) {
      const s = snap(p, undefined, e);
      gesture.current = { kind: "void", start: s, cur: s };
    } else if (tool === "poly" && canEdit) {
      const s = snap(p, undefined, e);
      if (poly.length >= 3 && dist(s, poly[0]) < tolM * 1.2) finishPoly(poly);
      else setPoly([...poly, s]);
      gesture.current = null;
    } else if ((tool === "door" || tool === "window" || tool === "passage") && canEdit) {
      createOpening(p, tool);
      gesture.current = null;
    } else {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view, moved: false, clearOnTap: true };
    }
    force((n) => n + 1);
  };

  const startOn = (e: React.PointerEvent, g: Gesture) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current = g;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const p = planPt(e);
    if (tool === "poly") setHover(snap(p, undefined, e));
    if (!g) return;
    switch (g.kind) {
      case "pinch": {
        if (pointers.current.size < 2) return;
        const [a, b] = [...pointers.current.values()];
        const d = dist(a, b);
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = Math.max(8, Math.min(300, g.view.scale * (d / g.d0))) / g.view.scale;
        setView({ scale: g.view.scale * k, ox: c.x - (g.c0.x - g.view.ox) * k, oy: c.y - (g.c0.y - g.view.oy) * k });
        return;
      }
      case "pan": {
        const dx = e.clientX - g.sx;
        const dy = e.clientY - g.sy;
        if (!g.moved && Math.hypot(dx, dy) < 4) return;
        g.moved = true;
        setView({ ...g.view, ox: g.view.ox + dx, oy: g.view.oy + dy });
        return;
      }
      case "rect":
      case "void":
        g.cur = snap(p, undefined, e);
        force((n) => n + 1);
        return;
      case "vertex": {
        if (!g.moved) beginGesture();
        g.moved = true;
        const s = snap(p, g.vertexId, e);
        apply((pr) => moveVertices(pr, g.roomId, [{ id: g.vertexId, to: s }]));
        return;
      }
      case "edge": {
        const room = project.rooms.find((r) => r.id === g.roomId);
        const ed = room && edgeByStart(room, g.edgeStart);
        if (!ed) return;
        const n = ed.inward;
        const along = dot(sub(p, g.start), n);
        const step = e.altKey ? 0.001 : project.settings.gridSize / 2;
        const target = vscale(n, Math.round(along / step) * step);
        const delta = sub(target, g.applied);
        if (Math.hypot(delta.x, delta.y) < 1e-6) return;
        if (!g.moved) beginGesture();
        g.moved = true;
        g.applied = target;
        apply((pr) => moveEdge(pr, g.roomId, g.edgeStart, delta));
        return;
      }
      case "room": {
        const step = project.settings.gridSize;
        const d = sub(p, g.start);
        const target = { x: Math.round(d.x / step) * step, y: Math.round(d.y / step) * step };
        const delta = sub(target, g.applied);
        if (Math.hypot(delta.x, delta.y) < 1e-6) return;
        if (!g.moved) beginGesture();
        g.moved = true;
        g.applied = target;
        apply((pr) => translateRoom(pr, g.roomId, delta, true));
        return;
      }
      case "item": {
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
        if (!g.moved) beginGesture();
        g.moved = true;
        apply((pr) => {
          const it = pr.items.find((i) => i.id === g.itemId);
          if (!it) return pr;
          const entry = entryFor(it.catalogId);
          let next: Item = { ...it, x: roundMm(snapToGrid(p.x + g.offset.x, 0.05)), y: roundMm(snapToGrid(p.y + g.offset.y, 0.05)) };
          if (!e.altKey && (entry.mount === "wall" || entry.mount === "floor")) {
            const fl = pr.floors.find((f) => f.id === it.floorId)!;
            const s = snapToWall(next, buildWalls(pr, fl), null, pr.rooms, entry.mount === "wall" ? 0.5 : 0.15);
            if (s) next = { ...next, x: roundMm(s.x), y: roundMm(s.y), rotation: s.rotation };
          }
          if (entry.mount === "surface") next.elevation = roundMm(surfaceElevation(next, pr.items));
          return { ...pr, items: pr.items.map((i) => (i.id === it.id ? next : i)) };
        });
        return;
      }
      case "rotate": {
        const it = project.items.find((i) => i.id === g.itemId);
        if (!it) return;
        if (!useProject.getState().gestureBase) beginGesture();
        const d = sub(p, { x: it.x, y: it.y });
        let a = Math.atan2(-d.x, d.y);
        if (!e.shiftKey) a = snapAngle(a);
        apply((pr) => ({ ...pr, items: pr.items.map((i) => (i.id === it.id ? { ...i, rotation: a } : i)) }));
        return;
      }
      case "resize": {
        const it = project.items.find((i) => i.id === g.itemId);
        if (!it) return;
        if (!useProject.getState().gestureBase) beginGesture();
        const l = worldToItemLocal(it, p);
        const w = Math.max(0.05, Math.round(Math.abs(l.x) * 2 * 100) / 100);
        const d = Math.max(0.02, Math.round(Math.abs(l.y) * 2 * 100) / 100);
        apply((pr) => ({ ...pr, items: pr.items.map((i) => (i.id === it.id ? { ...i, width: w, depth: d } : i)) }));
        return;
      }
      case "opening": {
        const o = project.openings.find((x) => x.id === g.openingId);
        const room = o && project.rooms.find((r) => r.id === o.roomId);
        const ed = room && o && edgeByStart(room, o.edgeStart);
        if (!o || !ed) return;
        if (!g.moved) beginGesture();
        g.moved = true;
        const s = snapToGrid(dot(sub(p, ed.a), ed.dir), 0.05);
        const off = Math.min(Math.max(s, o.width / 2 + 0.05), ed.length - o.width / 2 - 0.05);
        apply((pr) => ({ ...pr, openings: pr.openings.map((x) => (x.id === o.id ? { ...x, offset: roundMm(off) } : x)) }));
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    setGuides([]);
    if (!g) return;
    switch (g.kind) {
      case "pan":
        if (!g.moved && g.clearOnTap) select(null);
        break;
      case "rect": {
        const w = Math.abs(g.cur.x - g.start.x);
        const d = Math.abs(g.cur.y - g.start.y);
        if (w < 0.5 || d < 0.5) {
          if (w + d > 0.05) ui.toast("Ein Raum muss mindestens 50 × 50 cm groß sein.", "info");
          break;
        }
        const x = Math.min(g.cur.x, g.start.x);
        const y = Math.min(g.cur.y, g.start.y);
        const room = makeRoom(floorId, `Raum ${project.rooms.length + 1}`, [
          { id: newId("v"), x: roundMm(x), y: roundMm(y) },
          { id: newId("v"), x: roundMm(x + w), y: roundMm(y) },
          { id: newId("v"), x: roundMm(x + w), y: roundMm(y + d) },
          { id: newId("v"), x: roundMm(x), y: roundMm(y + d) },
        ]);
        apply((p) => addRoom(p, room));
        select({ kind: "room", id: room.id });
        break;
      }
      case "void": {
        const w = Math.abs(g.cur.x - g.start.x);
        const d = Math.abs(g.cur.y - g.start.y);
        if (w < 0.3 || d < 0.3) break;
        const v = { id: newId("void"), floorId, name: "Deckenöffnung", x: roundMm(Math.min(g.cur.x, g.start.x)), y: roundMm(Math.min(g.cur.y, g.start.y)), width: roundMm(w), depth: roundMm(d) };
        apply((p) => ({ ...p, voids: [...p.voids, v] }));
        select({ kind: "void", id: v.id });
        break;
      }
      case "vertex":
      case "edge":
      case "room":
      case "opening":
        if (g.moved) endGesture();
        break;
      case "item":
        if (g.moved) endGesture();
        else if (readOnly) {
          const bound = project.bindings.some((b) => b.target.kind === "item" && b.target.id === g.itemId);
          ui.patch({ selection: { kind: "item", id: g.itemId }, card: bound ? { kind: "item", id: g.itemId } : null });
        }
        break;
      case "rotate":
      case "resize":
        endGesture();
        break;
    }
    force((n) => n + 1);
  };

  const onWheel = (e: React.WheelEvent) => {
    const c = local(e);
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.max(8, Math.min(300, view.scale * k));
    const kk = s / view.scale;
    setView({ scale: s, ox: c.x - (c.x - view.ox) * kk, oy: c.y - (c.y - view.oy) * kk });
  };

  // Tastatur: Freiform abschließen/abbrechen
  keyHandler.current = (e: KeyboardEvent) => {
    if (tool !== "poly") return;
    if (e.key === "Enter") finishPoly(poly);
    if (e.key === "Escape") setPoly([]);
    if (e.key === "Backspace") setPoly((p) => p.slice(0, -1));
  };

  // ---- Darstellung ----
  const grid = project.settings.gridSize;
  const minor = grid * view.scale;
  const major = view.scale;
  const g = gesture.current;
  const ghost = drag.catalogId && svg.current && !readOnly ? (() => {
    const r = svg.current!.getBoundingClientRect();
    if (drag.x < r.left || drag.x > r.right || drag.y < r.top || drag.y > r.bottom) return null;
    const pt = toPlan(view, { x: drag.x - r.left, y: drag.y - r.top });
    return previewPlacement(project, floorId, drag.catalogId!, pt, drag.rotation);
  })() : null;
  const underlay = project.underlays.find((u) => u.floorId === floorId && u.visible);
  const asset = underlay && project.assets.find((a) => a.id === underlay.assetId);

  const label = (p: Vec2, text: string, opts: { angle?: number; cls?: string; key?: string } = {}) => {
    const s = toScreen(view, p);
    let a = opts.angle ?? 0;
    if (a > 90) a -= 180;
    if (a < -90) a += 180;
    return (
      <g key={opts.key} transform={`translate(${s.x},${s.y}) rotate(${a})`} className="pointer-events-none">
        <rect x={-text.length * 3.6 - 6} y={-10} width={text.length * 7.2 + 12} height={20} rx={10} className={clsx("fill-surface/95", opts.cls)} stroke="#DCDED6" />
        <text textAnchor="middle" dominantBaseline="central" className="fill-ink text-[11px] font-medium tabular-nums">
          {text}
        </text>
      </g>
    );
  };

  // Raumeinfärbung im Plan nur für die Informationsebenen Klima/Energie
  const planTint = (roomId: string) => ((ui.layers.climate || ui.layers.energy) && !(ui.tab === "design") ? overlay.roomTint.get(roomId)?.color : undefined);

  const cursor = tool === "select" ? (g?.kind === "pan" && g.moved ? "grabbing" : "default") : "crosshair";

  return (
    <div ref={box} className="absolute inset-0 select-none overflow-hidden bg-[#FAF9F6]" data-testid="floorplan">
      <svg
        ref={svg}
        width={size.w}
        height={size.h}
        className="touch-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => tool === "poly" && finishPoly(poly)}
        role="application"
        aria-label={`Grundriss ${floor.name}`}
      >
        <defs>
          <pattern id="grid-minor" width={minor} height={minor} patternUnits="userSpaceOnUse" x={view.ox} y={view.oy}>
            <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="#E9E8E2" strokeWidth={1} />
          </pattern>
          <pattern id="grid-major" width={major} height={major} patternUnits="userSpaceOnUse" x={view.ox} y={view.oy}>
            <rect width={major} height={major} fill={minor > 6 ? "url(#grid-minor)" : "none"} />
            <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#DCDBD3" strokeWidth={1} />
          </pattern>
          <pattern id="hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={8} stroke="#8C938F" strokeWidth={2} />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="url(#grid-major)" />
        {asset && underlay && (
          <image href={asset.data} x={underlay.x * view.scale + view.ox} y={underlay.y * view.scale + view.oy} width={underlay.width * view.scale} opacity={underlay.opacity} preserveAspectRatio="xMinYMin meet" className="pointer-events-none" />
        )}
        {lowerFloor &&
          project.rooms
            .filter((r) => r.floorId === lowerFloor.id)
            .map((r) => <path key={`low-${r.id}`} d={pathOf(r.vertices, view)} fill="none" stroke="#C4C8BF" strokeDasharray="4 4" className="pointer-events-none" />)}
        {/* Räume */}
        {rooms.map((r) => (
          <path
            key={r.id}
            d={pathOf(r.vertices, view)}
            fill={planTint(r.id) ?? FLOOR_FILL[r.floorMaterial]}
            fillOpacity={planTint(r.id) ? 0.35 + (overlay.roomTint.get(r.id)?.opacity ?? 0) : 1}
            stroke={selRoom?.id === r.id ? "#4D7163" : "none"}
            strokeWidth={2}
            onPointerDown={(e) => {
              if (tool !== "select") return;
              if (selRoom?.id === r.id && canEdit && !furnish) startOn(e, { kind: "room", roomId: r.id, start: planPt(e), applied: { x: 0, y: 0 }, moved: false });
              else {
                e.stopPropagation();
                select({ kind: "room", id: r.id });
                gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view, moved: false, clearOnTap: false };
                svg.current?.setPointerCapture(e.pointerId);
              }
            }}
            data-room={r.name}
          />
        ))}
        {project.voids
          .filter((v) => v.floorId === floorId)
          .map((v) => {
            const s = toScreen(view, v);
            const isSel = sel?.kind === "void" && sel.id === v.id;
            return (
              <rect
                key={v.id}
                x={s.x}
                y={s.y}
                width={v.width * view.scale}
                height={v.depth * view.scale}
                fill="url(#hatch)"
                stroke={isSel ? "#4D7163" : "#8C938F"}
                strokeWidth={isSel ? 2.5 : 1}
                onPointerDown={(e) => {
                  if (tool !== "select") return;
                  e.stopPropagation();
                  select({ kind: "void", id: v.id });
                }}
              />
            );
          })}
        {/* Wände */}
        {walls.map((w) => (
          <path key={w.key} d={pathOf(wallRect(w), view)} fill={w.exterior ? "#3B423F" : "#6F7773"} className="pointer-events-none" />
        ))}
        {/* Öffnungen */}
        {project.openings
          .filter((o) => rooms.some((r) => r.id === o.roomId))
          .map((o) => {
            const pl = placeOpening(o, rooms);
            if (!pl) return null;
            const n = perp(pl.edge.dir);
            const t = 0.16;
            const rect = [add(pl.a, vscale(n, t)), add(pl.b, vscale(n, t)), add(pl.b, vscale(n, -t)), add(pl.a, vscale(n, -t))];
            const isSel = sel?.kind === "opening" && sel.id === o.id;
            const open = overlay.openOpenings.has(o.id);
            const hinge = o.hinge === "left" ? pl.a : pl.b;
            const other = o.hinge === "left" ? pl.b : pl.a;
            const leafEnd = add(hinge, vscale(pl.edge.inward, o.width));
            const hs = toScreen(view, hinge);
            const os = toScreen(view, other);
            const ls = toScreen(view, leafEnd);
            const sweep = (other.x - hinge.x) * pl.edge.inward.y - (other.y - hinge.y) * pl.edge.inward.x > 0 ? 0 : 1;
            return (
              <g
                key={o.id}
                onPointerDown={(e) => {
                  if (tool !== "select") return;
                  e.stopPropagation();
                  select({ kind: "opening", id: o.id });
                  if (canEdit && !furnish) startOn(e, { kind: "opening", openingId: o.id, moved: false });
                }}
                className={tool === "select" ? "cursor-pointer" : undefined}
                data-opening={o.kind}
              >
                <path d={pathOf(rect, view)} fill="#FAF9F6" stroke={isSel ? "#4D7163" : open ? "#C98A1B" : "#8C938F"} strokeWidth={isSel ? 2.5 : 1} />
                {o.kind === "window" && (
                  <line x1={toScreen(view, pl.a).x} y1={toScreen(view, pl.a).y} x2={toScreen(view, pl.b).x} y2={toScreen(view, pl.b).y} stroke={open ? "#C98A1B" : "#5E9BB0"} strokeWidth={3} />
                )}
                {o.kind === "door" && (
                  <>
                    <line x1={hs.x} y1={hs.y} x2={ls.x} y2={ls.y} stroke="#6F7773" strokeWidth={2} />
                    <path d={`M ${ls.x} ${ls.y} A ${o.width * view.scale} ${o.width * view.scale} 0 0 ${sweep} ${os.x} ${os.y}`} fill="none" stroke="#A9AFAB" strokeDasharray="3 3" />
                  </>
                )}
              </g>
            );
          })}
        {/* Objekte */}
        {project.items
          .filter((it) => it.floorId === floorId)
          .sort((a, b) => a.elevation - b.elevation)
          .map((it) => {
            const corners = itemCorners(it);
            const isSel = selItem?.id === it.id;
            const issue = overlay.issues.has(it.id);
            const light = overlay.lights.get(it.id);
            const e = entryFor(it.catalogId);
            const c = toScreen(view, it);
            const front = add({ x: it.x, y: it.y }, vscale({ x: -Math.sin(it.rotation), y: Math.cos(it.rotation) }, it.depth / 2));
            const fs = toScreen(view, front);
            const bound = project.bindings.some((b) => b.target.kind === "item" && b.target.id === it.id);
            return (
              <g
                key={it.id}
                onPointerDown={(ev) => {
                  if (tool !== "select" && !readOnly) return;
                  ev.stopPropagation();
                  if (!readOnly) select({ kind: "item", id: it.id });
                  const p = planPt(ev);
                  if (canEdit && (furnish || ui.designTool === "plan")) startOn(ev, { kind: "item", itemId: it.id, offset: { x: it.x - p.x, y: it.y - p.y }, sx: ev.clientX, sy: ev.clientY, moved: false });
                  else startOn(ev, { kind: "item", itemId: it.id, offset: { x: 0, y: 0 }, sx: ev.clientX, sy: ev.clientY, moved: true });
                }}
                className="cursor-pointer"
                data-item={it.name}
              >
                <path
                  d={pathOf(corners, view)}
                  fill={light?.on ? "#FCF1D9" : e.mount === "ceiling" ? "rgba(255,255,255,0.5)" : "#FFFFFF"}
                  fillOpacity={it.catalogId === "rug" ? 0.5 : 0.95}
                  stroke={isSel ? "#4D7163" : issue ? "#C98A1B" : "#9AA19D"}
                  strokeWidth={isSel || issue ? 2 : 1}
                  strokeDasharray={e.mount === "ceiling" ? "4 3" : undefined}
                />
                <line x1={c.x} y1={c.y} x2={fs.x} y2={fs.y} stroke="#C4C8BF" strokeWidth={1} />
                {e.light && <circle cx={c.x} cy={c.y} r={Math.max(4, Math.min(9, view.scale * 0.1))} fill={light?.on ? "#E8B04A" : "#FFFFFF"} stroke={light?.on ? "#B9862A" : "#9AA19D"} />}
                {bound && !e.light && <circle cx={c.x} cy={c.y} r={3.5} fill="#4D7163" />}
                {view.scale > 45 && it.width * view.scale > 50 && (
                  <text x={c.x} y={c.y + (e.light ? 16 : 0)} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-ink-2 text-[10px]">
                    {it.name.length > 18 ? it.name.slice(0, 16) + "…" : it.name}
                  </text>
                )}
              </g>
            );
          })}
        {/* Raumnamen */}
        {rooms.map((r) => {
          const c = toScreen(view, centroid(r.vertices));
          if (view.scale < 18) return null;
          return (
            <g key={`lbl-${r.id}`} className="pointer-events-none">
              <text x={c.x} y={c.y - 8} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
                {r.name}
              </text>
              <text x={c.x} y={c.y + 8} textAnchor="middle" className="fill-ink-2 text-[11px] tabular-nums">
                {polygonArea(r.vertices).toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²
              </text>
            </g>
          );
        })}
        {/* Bearbeitungsgriffe für den gewählten Raum */}
        {selRoom && selRoom.floorId === floorId && !furnish && (
          <g>
            {roomEdges(selRoom).map((ed) => {
              const mid = vscale(add(ed.a, ed.b), 0.5);
              const out = add(mid, vscale(ed.inward, -22 / view.scale));
              const ang = (Math.atan2(ed.dir.y, ed.dir.x) * 180) / Math.PI;
              return label(out, fmtM(ed.length), { angle: ang, key: `dim-${ed.startId}` });
            })}
            {canEdit &&
              roomEdges(selRoom).map((ed) => {
                const mid = toScreen(view, vscale(add(ed.a, ed.b), 0.5));
                const ang = (Math.atan2(ed.dir.y, ed.dir.x) * 180) / Math.PI;
                const isSelEdge = sel?.kind === "edge" && sel.id === ed.startId;
                return (
                  <rect
                    key={`eh-${ed.startId}`}
                    x={-14}
                    y={-6}
                    width={28}
                    height={12}
                    rx={6}
                    transform={`translate(${mid.x},${mid.y}) rotate(${ang})`}
                    className={clsx("cursor-move", isSelEdge ? "fill-sage" : "fill-white")}
                    stroke="#4D7163"
                    strokeWidth={2}
                    onPointerDown={(e) => {
                      select({ kind: "edge", roomId: selRoom.id, id: ed.startId });
                      startOn(e, { kind: "edge", roomId: selRoom.id, edgeStart: ed.startId, start: planPt(e), applied: { x: 0, y: 0 }, moved: false });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const r = insertVertex(useProject.getState().project!, selRoom.id, ed.startId, vscale(add(ed.a, ed.b), 0.5));
                      apply(() => r.project);
                      select({ kind: "vertex", roomId: selRoom.id, id: r.vertexId });
                    }}
                    aria-label={`Wand ${fmtM(ed.length)} verschieben`}
                  />
                );
              })}
            {canEdit &&
              selRoom.vertices.map((vx) => {
                const s = toScreen(view, vx);
                const isSelV = sel?.kind === "vertex" && sel.id === vx.id;
                return (
                  <circle
                    key={`vh-${vx.id}`}
                    cx={s.x}
                    cy={s.y}
                    r={8}
                    className={clsx("cursor-move", isSelV ? "fill-sage" : "fill-white")}
                    stroke="#4D7163"
                    strokeWidth={2.5}
                    onPointerDown={(e) => {
                      select({ kind: "vertex", roomId: selRoom.id, id: vx.id });
                      startOn(e, { kind: "vertex", roomId: selRoom.id, vertexId: vx.id, moved: false });
                    }}
                  />
                );
              })}
          </g>
        )}
        {/* Griffe für gewähltes Objekt */}
        {selItem && canEdit && (() => {
          const corners = itemCorners(selItem);
          const rotP = add({ x: selItem.x, y: selItem.y }, vscale({ x: -Math.sin(selItem.rotation), y: Math.cos(selItem.rotation) }, selItem.depth / 2 + 28 / view.scale));
          const rs = toScreen(view, rotP);
          const cs = toScreen(view, selItem);
          return (
            <g>
              <line x1={cs.x} y1={cs.y} x2={rs.x} y2={rs.y} stroke="#4D7163" strokeDasharray="3 3" className="pointer-events-none" />
              <circle cx={rs.x} cy={rs.y} r={10} className="cursor-grab fill-white" stroke="#4D7163" strokeWidth={2.5} onPointerDown={(e) => startOn(e, { kind: "rotate", itemId: selItem.id })} aria-label="Drehen" />
              <path d={`M ${rs.x - 4} ${rs.y + 1} a 4 4 0 1 1 4 4`} fill="none" stroke="#4D7163" strokeWidth={1.5} className="pointer-events-none" />
              {corners.map((c, i) => {
                const s = toScreen(view, c);
                return <rect key={i} x={s.x - 7} y={s.y - 7} width={14} height={14} rx={3} className="cursor-nwse-resize fill-white" stroke="#4D7163" strokeWidth={2} onPointerDown={(e) => startOn(e, { kind: "resize", itemId: selItem.id })} aria-label="Größe ändern" />;
              })}
              {label(add(corners[2], vscale(sub(corners[2], corners[3]), 0)), `${Math.round(selItem.width * 100)} × ${Math.round(selItem.depth * 100)} cm`, { key: "item-dim" })}
            </g>
          );
        })()}
        {/* Tür-Schwenkbereich der gewählten Tür */}
        {sel?.kind === "opening" &&
          (() => {
            const o = project.openings.find((x) => x.id === sel.id);
            const pl = o && placeOpening(o, rooms);
            if (!o || !pl || o.kind !== "door") return null;
            return <path d={pathOf(doorSwingArea(pl.a, pl.b, pl.edge.inward), view)} fill="#4D7163" fillOpacity={0.08} className="pointer-events-none" />;
          })()}
        {/* Zeichnen */}
        {g && (g.kind === "rect" || g.kind === "void") && (
          <g className="pointer-events-none">
            <path
              d={pathOf(
                [g.start, { x: g.cur.x, y: g.start.y }, g.cur, { x: g.start.x, y: g.cur.y }],
                view,
              )}
              fill={g.kind === "rect" ? "#E0EBE4" : "url(#hatch)"}
              fillOpacity={0.7}
              stroke="#4D7163"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            {label({ x: (g.start.x + g.cur.x) / 2, y: Math.min(g.start.y, g.cur.y) - 18 / view.scale }, fmtM(Math.abs(g.cur.x - g.start.x)), { key: "dw" })}
            {label({ x: Math.max(g.start.x, g.cur.x) + 30 / view.scale, y: (g.start.y + g.cur.y) / 2 }, fmtM(Math.abs(g.cur.y - g.start.y)), { key: "dh", angle: 90 })}
          </g>
        )}
        {tool === "poly" && poly.length > 0 && (
          <g className="pointer-events-none">
            <polyline points={[...poly, ...(hover ? [hover] : [])].map((p) => `${toScreen(view, p).x},${toScreen(view, p).y}`).join(" ")} fill="none" stroke="#4D7163" strokeWidth={2} strokeDasharray="6 4" />
            {poly.map((p, i) => (
              <circle key={i} cx={toScreen(view, p).x} cy={toScreen(view, p).y} r={i === 0 && poly.length >= 3 ? 9 : 5} fill={i === 0 && poly.length >= 3 ? "#E0EBE4" : "#4D7163"} stroke="#4D7163" strokeWidth={2} />
            ))}
            {hover && label(vscale(add(poly[poly.length - 1], hover), 0.5), fmtM(dist(poly[poly.length - 1], hover)), { key: "seg" })}
          </g>
        )}
        {guides.map((gd, i) => {
          const a = toScreen(view, gd.a);
          const b = toScreen(view, gd.b);
          const d = normalize(sub(b, a));
          return <line key={i} x1={a.x - d.x * 2000} y1={a.y - d.y * 2000} x2={b.x + d.x * 2000} y2={b.y + d.y * 2000} stroke="#7866B2" strokeWidth={1} strokeDasharray="4 4" className="pointer-events-none" />;
        })}
        {ghost && (
          <g className="pointer-events-none">
            <path d={pathOf(itemCorners(ghost.item), view)} fill="#4D7163" fillOpacity={0.25} stroke="#4D7163" strokeWidth={2} strokeDasharray="5 3" />
            {label({ x: ghost.item.x, y: ghost.item.y }, `${Math.round(ghost.item.width * 100)} × ${Math.round(ghost.item.depth * 100)} cm${ghost.snapped === "wall" ? " · an Wand" : ""}`, { key: "ghost" })}
          </g>
        )}
      </svg>
      {tool === "poly" && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-2 text-xs text-white">
          {poly.length < 3 ? "Ecken antippen – mindestens drei" : "Ersten Punkt antippen, Doppelklick oder Enter zum Abschließen"}
        </div>
      )}
      {(tool === "door" || tool === "window" || tool === "passage") && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-2 text-xs text-white">Auf eine Wand tippen, um die Öffnung zu setzen</div>
      )}
      {(tool === "rect" || tool === "void") && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-2 text-xs text-white">Aufziehen – Maße werden angezeigt; Alt deaktiviert das Einrasten</div>
      )}
    </div>
  );
}
