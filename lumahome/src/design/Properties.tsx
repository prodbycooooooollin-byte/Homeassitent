// Kompakte Eigenschaftenkarte für das gewählte Element.
import { clsx } from "clsx";
import { AlertTriangle, Copy, MoveDiagonal, RotateCcw, RotateCw, Trash2, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FloorMaterial, Item, Project } from "@/model/types";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { COLOR_SWATCHES, MATERIALS, entryFor } from "@/catalog/catalog";
import { edgeByStart, isAxisAlignedRect, bounds, polygonArea, polygonProblems, roomEdges } from "@/geometry/polygon";
import {
  deleteItem,
  deleteOpening,
  duplicateItem,
  duplicateRoom,
  fitOpening,
  insertVertex,
  moveVertices,
  removeVertex,
  resizeRectRoom,
  setEdgeLength,
  updateRoom,
} from "@/geometry/ops";
import { placementIssues, pullInside, roomAt, snapToWall, surfaceElevation } from "@/geometry/placement";
import { buildWalls } from "@/geometry/walls";
import { openingProblems } from "@/geometry/validate";
import { roundMm } from "@/geometry/vec";
import { NumberField, Segmented, TextField } from "@/ui/primitives";
import { DeleteRoomDialog } from "./dialogs";

const FLOOR_MATERIALS: { value: FloorMaterial; label: string }[] = [
  { value: "oak", label: "Eiche hell" },
  { value: "walnut", label: "Nussbaum" },
  { value: "tiles", label: "Fliesen" },
  { value: "stone", label: "Naturstein" },
  { value: "carpet", label: "Teppich" },
  { value: "concrete", label: "Beton" },
];

const WALL_COLORS = ["#F2EFE8", "#F7F5F0", "#EDF2EE", "#EEF1EF", "#F1ECE4", "#E9E4DA", "#E3E9EE", "#EFE7E1"];

function Card({ title, children, onClose, actions }: { title: string; children: React.ReactNode; onClose: () => void; actions?: React.ReactNode }) {
  return (
    <section className="panel flex max-h-full w-full flex-col overflow-hidden sm:w-[340px]" aria-label={`Eigenschaften: ${title}`} data-testid="properties">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        <div className="flex items-center">
          {actions}
          <button className="icon-btn -mr-2" aria-label="Auswahl aufheben" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="space-y-4 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  );
}

export function Properties() {
  const project = useProject((s) => s.project);
  const sel = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  if (!project || !sel) return null;
  const close = () => select(null);
  switch (sel.kind) {
    case "room":
      return <RoomProps project={project} roomId={sel.id} onClose={close} />;
    case "vertex":
      return <VertexProps project={project} roomId={sel.roomId} vertexId={sel.id} onClose={close} />;
    case "edge":
      return <EdgeProps project={project} roomId={sel.roomId} edgeStart={sel.id} onClose={close} />;
    case "opening":
      return <OpeningProps project={project} id={sel.id} onClose={close} />;
    case "item":
      return <ItemProps project={project} id={sel.id} onClose={close} />;
    case "void":
      return <VoidProps project={project} id={sel.id} onClose={close} />;
  }
}

function Problems({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-1 rounded-2xl border border-danger-line bg-danger-soft p-2 text-xs text-danger" role="alert">
      {list.map((p) => (
        <li key={p} className="flex gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {p}
        </li>
      ))}
    </ul>
  );
}

function RoomProps({ project, roomId, onClose }: { project: Project; roomId: string; onClose: () => void }) {
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const select = useUi((s) => s.select);
  const [del, setDel] = useState(false);
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const rect = isAxisAlignedRect(room.vertices);
  const bb = bounds(room.vertices);
  const problems = polygonProblems(room.vertices);
  return (
    <Card
      title={room.name}
      onClose={onClose}
      actions={
        canEdit && (
          <>
            <button
              className="icon-btn"
              aria-label="Raum duplizieren"
              title="Duplizieren"
              onClick={() => {
                let id = "";
                apply((p) => {
                  const r = duplicateRoom(p, room.id, { x: bb.width + 0.5, y: 0 });
                  id = r.id;
                  return r.project;
                });
                if (id) select({ kind: "room", id });
              }}
            >
              <Copy size={17} />
            </button>
            <button className="icon-btn text-danger" aria-label="Raum löschen" title="Löschen" onClick={() => setDel(true)}>
              <Trash2 size={17} />
            </button>
          </>
        )
      }
    >
      <Problems list={problems} />
      <TextField label="Name" value={room.name} onCommit={(v) => apply((p) => updateRoom(p, room.id, { name: v }))} />
      <p className="text-xs text-ink-2">
        Fläche {polygonArea(room.vertices).toLocaleString("de-DE", { maximumFractionDigits: 2 })} m² · {room.vertices.length} Ecken
      </p>
      {rect ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Breite" unit="cm" value={bb.width} scale={100} min={50} max={8000} onCommit={(v) => apply((p) => resizeRectRoom(p, room.id, v, bb.height))} disabled={!canEdit} />
          <NumberField label="Tiefe" unit="cm" value={bb.height} scale={100} min={50} max={8000} onCommit={(v) => apply((p) => resizeRectRoom(p, room.id, bb.width, v))} disabled={!canEdit} />
        </div>
      ) : (
        <p className="text-xs text-ink-2">Freiform: Wandlängen unten oder Ecken im Plan bearbeiten.</p>
      )}
      <details className="rounded-2xl border border-line px-3 py-2" open={!rect}>
        <summary className="cursor-pointer text-sm font-medium">Wände ({room.vertices.length})</summary>
        <ul className="mt-2 space-y-2">
          {roomEdges(room).map((e, i) => (
            <li key={e.startId} className="flex items-end gap-2">
              <div className="flex-1">
                <NumberField label={`Wand ${i + 1}`} unit="cm" value={e.length} scale={100} min={20} max={8000} onCommit={(v) => apply((p) => setEdgeLength(p, room.id, e.startId, v))} disabled={!canEdit} />
              </div>
              <label className="flex min-h-[44px] items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-sage"
                  checked={!room.openEdges.includes(e.startId)}
                  disabled={!canEdit}
                  onChange={(ev) =>
                    apply((p) => updateRoom(p, room.id, { openEdges: ev.target.checked ? room.openEdges.filter((x) => x !== e.startId) : [...room.openEdges, e.startId] }))
                  }
                />
                Wand
              </label>
            </li>
          ))}
        </ul>
      </details>
      <div>
        <p className="label">Bodenbelag</p>
        <div className="flex flex-wrap gap-1.5">
          {FLOOR_MATERIALS.map((m) => (
            <button key={m.value} disabled={!canEdit} className={clsx("chip", room.floorMaterial === m.value && "chip-active")} onClick={() => apply((p) => updateRoom(p, room.id, { floorMaterial: m.value }))}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Wandfarbe innen</p>
        <div className="flex flex-wrap gap-2">
          {WALL_COLORS.map((c) => (
            <button
              key={c}
              disabled={!canEdit}
              aria-label={`Wandfarbe ${c}`}
              className={clsx("h-9 w-9 rounded-full border", room.wallColor === c ? "border-sage ring-2 ring-sage" : "border-line")}
              style={{ background: c }}
              onClick={() => apply((p) => updateRoom(p, room.id, { wallColor: c }))}
            />
          ))}
        </div>
      </div>
      <DeleteRoomDialog open={del} roomId={room.id} onClose={() => setDel(false)} />
    </Card>
  );
}

function VertexProps({ project, roomId, vertexId, onClose }: { project: Project; roomId: string; vertexId: string; onClose: () => void }) {
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const select = useUi((s) => s.select);
  const room = project.rooms.find((r) => r.id === roomId);
  const v = room?.vertices.find((x) => x.id === vertexId);
  if (!room || !v) return null;
  return (
    <Card title={`Ecke in ${room.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" unit="cm" value={v.x} scale={100} onCommit={(x) => apply((p) => moveVertices(p, roomId, [{ id: v.id, to: { x, y: v.y } }]))} disabled={!canEdit} />
        <NumberField label="Y" unit="cm" value={v.y} scale={100} onCommit={(y) => apply((p) => moveVertices(p, roomId, [{ id: v.id, to: { x: v.x, y } }]))} disabled={!canEdit} />
      </div>
      <p className="text-xs text-ink-2">Deckungsgleiche Ecken angrenzender Räume werden mitbewegt.</p>
      <button
        className="btn-danger w-full"
        disabled={!canEdit || room.vertices.length <= 3}
        onClick={() => {
          apply((p) => removeVertex(p, roomId, v.id));
          select({ kind: "room", id: roomId });
        }}
      >
        <Trash2 size={16} /> Ecke entfernen
      </button>
    </Card>
  );
}

function EdgeProps({ project, roomId, edgeStart, onClose }: { project: Project; roomId: string; edgeStart: string; onClose: () => void }) {
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const select = useUi((s) => s.select);
  const room = project.rooms.find((r) => r.id === roomId);
  const e = room && edgeByStart(room, edgeStart);
  if (!room || !e) return null;
  const open = room.openEdges.includes(edgeStart);
  return (
    <Card title={`Wand in ${room.name}`} onClose={onClose}>
      <NumberField label="Länge" unit="cm" value={e.length} scale={100} min={20} max={8000} onCommit={(v) => apply((p) => setEdgeLength(p, roomId, edgeStart, v))} disabled={!canEdit} />
      <label className="flex min-h-[44px] items-center justify-between text-sm">
        Wand vorhanden (sonst offener Übergang)
        <input type="checkbox" className="h-5 w-5 accent-sage" checked={!open} disabled={!canEdit} onChange={(ev) => apply((p) => updateRoom(p, roomId, { openEdges: ev.target.checked ? room.openEdges.filter((x) => x !== edgeStart) : [...room.openEdges, edgeStart] }))} />
      </label>
      <p className="text-xs text-ink-2">Ziehen am Griff verschiebt die Wand senkrecht zu ihrer Richtung. Doppelklick auf den Griff fügt eine Ecke ein.</p>
      <button
        className="btn-secondary w-full"
        disabled={!canEdit}
        onClick={() => {
          let vid = "";
          apply((p) => {
            const r = insertVertex(p, roomId, edgeStart, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
            vid = r.vertexId;
            return r.project;
          });
          if (vid) select({ kind: "vertex", roomId, id: vid });
        }}
      >
        Ecke in der Mitte einfügen
      </button>
    </Card>
  );
}

function OpeningProps({ project, id, onClose }: { project: Project; id: string; onClose: () => void }) {
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const select = useUi((s) => s.select);
  const o = project.openings.find((x) => x.id === id);
  const room = o && project.rooms.find((r) => r.id === o.roomId);
  if (!o || !room) return null;
  const edge = edgeByStart(room, o.edgeStart);
  const floor = project.floors.find((f) => f.id === room.floorId);
  const set = (patch: Partial<typeof o>) => apply((p) => ({ ...p, openings: p.openings.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const problems = openingProblems(project, id);
  const label = o.kind === "door" ? "Tür" : o.kind === "window" ? "Fenster" : "Durchgang";
  return (
    <Card
      title={`${label} · ${room.name}`}
      onClose={onClose}
      actions={
        canEdit && (
          <button
            className="icon-btn text-danger"
            aria-label="Öffnung löschen"
            onClick={() => {
              apply((p) => deleteOpening(p, id));
              select(null);
            }}
          >
            <Trash2 size={17} />
          </button>
        )
      }
    >
      <Problems list={problems} />
      {problems.some((p) => p.startsWith("Liegt außerhalb")) && (
        <button className="btn-secondary w-full" onClick={() => apply((p) => fitOpening(p, id))}>
          <Wand2 size={16} /> Auf Wand einpassen
        </button>
      )}
      <Segmented
        label="Art"
        value={o.kind}
        onChange={(k) => set({ kind: k, sill: k === "window" ? (o.sill || 0.9) : 0, height: k === "window" ? Math.min(o.height, 1.4) : Math.max(o.height, 2.0) })}
        options={[
          { value: "door", label: "Tür" },
          { value: "window", label: "Fenster" },
          { value: "passage", label: "Durchgang" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Breite" unit="cm" value={o.width} scale={100} min={30} max={2000} onCommit={(v) => set({ width: v })} disabled={!canEdit} />
        <NumberField label="Höhe" unit="cm" value={o.height} scale={100} min={30} max={(floor?.height ?? 3) * 100} onCommit={(v) => set({ height: v })} disabled={!canEdit} />
        {o.kind === "window" && <NumberField label="Brüstung" unit="cm" value={o.sill} scale={100} min={0} max={300} onCommit={(v) => set({ sill: v })} disabled={!canEdit} />}
        <NumberField label="Abstand Mitte" unit="cm" value={o.offset} scale={100} min={0} max={(edge?.length ?? 10) * 100} onCommit={(v) => set({ offset: v })} disabled={!canEdit} />
      </div>
      {o.kind === "door" && (
        <Segmented label="Anschlag" size="sm" value={o.hinge} onChange={(h) => set({ hinge: h })} options={[{ value: "left", label: "Anschlag links" }, { value: "right", label: "Anschlag rechts" }]} />
      )}
      <p className="text-xs text-ink-2">Wandlänge {edge ? `${Math.round(edge.length * 100)} cm` : "–"}. Im Plan entlang der Wand ziehen, um die Öffnung zu verschieben.</p>
    </Card>
  );
}

function VoidProps({ project, id, onClose }: { project: Project; id: string; onClose: () => void }) {
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const select = useUi((s) => s.select);
  const v = project.voids.find((x) => x.id === id);
  if (!v) return null;
  const set = (patch: Partial<typeof v>) => apply((p) => ({ ...p, voids: p.voids.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  return (
    <Card
      title={v.name}
      onClose={onClose}
      actions={
        canEdit && (
          <button
            className="icon-btn text-danger"
            aria-label="Deckenöffnung löschen"
            onClick={() => {
              apply((p) => ({ ...p, voids: p.voids.filter((x) => x.id !== id) }));
              select(null);
            }}
          >
            <Trash2 size={17} />
          </button>
        )
      }
    >
      <TextField label="Name" value={v.name} onCommit={(name) => set({ name })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" unit="cm" value={v.x} scale={100} onCommit={(x) => set({ x })} disabled={!canEdit} />
        <NumberField label="Y" unit="cm" value={v.y} scale={100} onCommit={(y) => set({ y })} disabled={!canEdit} />
        <NumberField label="Breite" unit="cm" value={v.width} scale={100} min={30} max={3000} onCommit={(width) => set({ width })} disabled={!canEdit} />
        <NumberField label="Tiefe" unit="cm" value={v.depth} scale={100} min={30} max={3000} onCommit={(depth) => set({ depth })} disabled={!canEdit} />
      </div>
      <p className="text-xs text-ink-2">Treppen- oder Deckenöffnung im Fußboden dieser Etage.</p>
    </Card>
  );
}

const ISSUE_TEXT: Record<string, string> = { outside: "außerhalb", wall: "Wand", overlap: "Überschneidung", door: "Türbereich", ceiling: "Raumhöhe" };

function ItemProps({ project, id, onClose }: { project: Project; id: string; onClose: () => void }) {
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const ui = useUi();
  const it = project.items.find((x) => x.id === id);
  const issues = useMemo(() => (it ? placementIssues(it, project) : []), [it, project]);
  if (!it) return null;
  const e = entryFor(it.catalogId);
  const set = (patch: Partial<Item>) => apply((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const deg = Math.round(((((it.rotation * 180) / Math.PI) % 360) + 360) % 360);
  const room = roomAt(it, project.rooms.filter((r) => r.floorId === it.floorId));
  const floor = project.floors.find((f) => f.id === it.floorId)!;
  const bindings = project.bindings.filter((b) => b.target.kind === "item" && b.target.id === id);
  return (
    <Card
      title={it.name}
      onClose={onClose}
      actions={
        canEdit && (
          <>
            <button
              className="icon-btn"
              aria-label="Objekt duplizieren"
              onClick={() => {
                let nid = "";
                apply((p) => {
                  const r = duplicateItem(p, id, { x: 0.3, y: 0.3 });
                  nid = r.id;
                  return r.project;
                });
                if (nid) ui.select({ kind: "item", id: nid });
              }}
            >
              <Copy size={17} />
            </button>
            <button
              className="icon-btn text-danger"
              aria-label="Objekt löschen"
              onClick={() => {
                apply((p) => deleteItem(p, id));
                ui.select(null);
                if (bindings.length) ui.toast(`Gerätezuordnung (${bindings.map((b) => b.entityId).join(", ")}) wurde mit entfernt. Das Gerät selbst bleibt in Home Assistant erhalten.`, "info");
              }}
            >
              <Trash2 size={17} />
            </button>
          </>
        )
      }
    >
      {issues.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-warn-line bg-warn-soft p-2 text-xs text-warn" role="status">
          {issues.map((i) => (
            <p key={i.code} className="flex gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {i.message}
            </p>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {issues.some((i) => i.code === "outside") && project.rooms.some((r) => r.floorId === it.floorId) && (
              <button
                className="chip"
                onClick={() => {
                  const target = project.rooms.filter((r) => r.floorId === it.floorId).sort((a, b) => Math.hypot(bounds(a.vertices).minX - it.x, bounds(a.vertices).minY - it.y) - Math.hypot(bounds(b.vertices).minX - it.x, bounds(b.vertices).minY - it.y))[0];
                  const pt = pullInside(it, target, Math.max(it.width, it.depth) / 2 + 0.1);
                  set({ x: roundMm(pt.x), y: roundMm(pt.y) });
                }}
              >
                <MoveDiagonal size={13} /> In den Raum holen
              </button>
            )}
            <button className="chip" onClick={() => set({ acceptedIssues: [...it.acceptedIssues, ...issues.map((i) => i.code)] })}>
              Bewusst so lassen ({issues.map((i) => ISSUE_TEXT[i.code]).join(", ")})
            </button>
          </div>
        </div>
      )}
      <TextField label="Name" value={it.name} onCommit={(name) => set({ name })} />
      <p className="text-xs text-ink-2">
        {e.name} · {room ? room.name : "kein Raum"} · {bindings.length ? `${bindings.length} Gerät(e) zugeordnet` : "kein Gerät zugeordnet"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Breite" unit="cm" value={it.width} scale={100} min={2} max={3000} onCommit={(width) => set({ width })} disabled={!canEdit} />
        <NumberField label="Tiefe" unit="cm" value={it.depth} scale={100} min={2} max={3000} onCommit={(depth) => set({ depth })} disabled={!canEdit} />
        <NumberField label="Höhe" unit="cm" value={it.height} scale={100} min={1} max={1000} onCommit={(height) => set({ height })} disabled={!canEdit} />
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <NumberField label="Drehung" unit="°" value={deg} min={0} max={360} onCommit={(d) => set({ rotation: (d * Math.PI) / 180 })} disabled={!canEdit} />
        <div className="flex gap-1">
          <button className="icon-btn border border-line" aria-label="15° gegen den Uhrzeigersinn" onClick={() => set({ rotation: it.rotation - Math.PI / 12 })} disabled={!canEdit}>
            <RotateCcw size={16} />
          </button>
          <button className="icon-btn border border-line" aria-label="15° im Uhrzeigersinn" onClick={() => set({ rotation: it.rotation + Math.PI / 12 })} disabled={!canEdit}>
            <RotateCw size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="X" unit="cm" value={it.x} scale={100} onCommit={(x) => set({ x })} disabled={!canEdit} />
        <NumberField label="Y" unit="cm" value={it.y} scale={100} onCommit={(y) => set({ y })} disabled={!canEdit} />
        <NumberField label="Höhe über Boden" unit="cm" value={it.elevation} scale={100} min={0} max={floor.height * 100} onCommit={(elevation) => set({ elevation })} disabled={!canEdit} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(e.mount === "wall" || e.mount === "floor") && (
          <button
            className="chip"
            disabled={!canEdit}
            onClick={() => {
              const s = snapToWall(it, buildWalls(project, floor), room?.id ?? null, project.rooms, 1.0);
              if (s) set({ x: roundMm(s.x), y: roundMm(s.y), rotation: s.rotation });
              else ui.toast("Keine Wand in der Nähe (bis 1 m).", "info");
            }}
          >
            An Wand ausrichten
          </button>
        )}
        {e.mount === "surface" && (
          <button className="chip" disabled={!canEdit} onClick={() => set({ elevation: roundMm(surfaceElevation(it, project.items)) })}>
            Auf Möbel darunter stellen
          </button>
        )}
        {e.mount === "ceiling" && (
          <button className="chip" disabled={!canEdit} onClick={() => set({ elevation: roundMm(Math.max(0, floor.height - it.height)) })}>
            An die Decke
          </button>
        )}
        <button className="chip" disabled={!canEdit} onClick={() => set({ width: e.size.w, depth: e.size.d, height: e.size.h })}>
          Originalmaße
        </button>
      </div>
      {e.materials.length > 1 && (
        <div>
          <p className="label">Material</p>
          <div className="flex flex-wrap gap-1.5">
            {e.materials.map((m) => (
              <button key={m} className={clsx("chip", it.material === m && "chip-active")} disabled={!canEdit} onClick={() => set({ material: m })}>
                {MATERIALS[m]?.label ?? m}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="label">Farbe</p>
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              disabled={!canEdit}
              aria-label={`Farbe ${c}`}
              className={clsx("h-8 w-8 rounded-full border", it.color.toLowerCase() === c.toLowerCase() ? "border-sage ring-2 ring-sage" : "border-line")}
              style={{ background: c }}
              onClick={() => set({ color: c })}
            />
          ))}
          <label className="flex items-center gap-1 text-xs text-ink-2">
            Eigene
            <input type="color" value={it.color} disabled={!canEdit} onChange={(ev) => set({ color: ev.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer rounded border border-line" aria-label="Eigene Farbe wählen" />
          </label>
        </div>
      </div>
      {it.acceptedIssues.length > 0 && (
        <button className="text-xs text-sage-dark underline" onClick={() => set({ acceptedIssues: [] })}>
          Akzeptierte Hinweise wieder anzeigen
        </button>
      )}
    </Card>
  );
}
