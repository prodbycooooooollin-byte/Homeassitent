// Bereich „Gestalten“: Grundriss, Einrichten und Verbinden teilen sich
// dasselbe Projekt und dieselbe Auswahl.
import { clsx } from "clsx";
import { AlertTriangle, BoxSelect, DoorOpen, Grid2x2Plus, Image, Layers, Library, Maximize, MousePointer2, PenTool, RectangleHorizontal, Redo2, Ruler, SquareDashed, Undo2, AppWindow, Link } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useProject } from "@/store/project";
import { useUi, type PlanTool } from "@/store/ui";
import { validateProject } from "@/geometry/validate";
import { deleteItem, deleteOpening, duplicateItem, fitOpening } from "@/geometry/ops";
import { pullInside } from "@/geometry/placement";
import { Segmented, Notice } from "@/ui/primitives";
import { FloorPlan } from "./FloorPlan";
import { Properties } from "./Properties";
import { CatalogPanel, DragFollower } from "./Catalog";
import { ConnectPanel } from "./ConnectPanel";
import { DeleteRoomDialog, FloorsDialog, RoomByDimensionsDialog, UnderlayDialog } from "./dialogs";
import { ViewControls } from "@/home/HomeView";

function ToolButton({ active, onClick, icon, label, testId }: { active?: boolean; onClick: () => void; icon: ReactNode; label: string; testId?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      data-testid={testId}
      className={clsx("flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium leading-tight", active ? "bg-sage-soft text-sage-dark" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Issues() {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const floorId = useUi((s) => s.floorId);
  const patch = useUi((s) => s.patch);
  const [open, setOpen] = useState(false);
  const issues = useMemo(() => (project ? validateProject(project) : []), [project]);
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <div className="pointer-events-auto">
      <button className={clsx("chip shadow-soft", errors ? "border-danger-line bg-danger-soft text-danger" : "border-warn-line bg-warn-soft text-warn")} onClick={() => setOpen(!open)} aria-expanded={open} data-testid="issues-chip">
        <AlertTriangle size={15} /> {issues.length} {issues.length === 1 ? "Hinweis" : "Hinweise"} im Plan
      </button>
      {open && (
        <ul className="fade-in mt-2 max-h-72 w-80 max-w-[calc(100vw-2rem)] space-y-1 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-float">
          {issues.map((i) => (
            <li key={i.key} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
              <AlertTriangle size={14} className={clsx("mt-0.5 shrink-0", i.severity === "error" ? "text-danger" : "text-warn")} />
              <button className="flex-1 text-left" onClick={() => patch({ selection: i.target, floorId: i.floorId || floorId })}>
                {i.message}
              </button>
              {i.fix === "fit-opening" && i.target?.kind === "opening" && (
                <button className="text-xs font-medium text-sage-dark underline" onClick={() => apply((p) => fitOpening(p, (i.target as { id: string }).id))}>
                  Einpassen
                </button>
              )}
              {i.fix === "pull-inside" && i.target?.kind === "item" && (
                <button
                  className="text-xs font-medium text-sage-dark underline"
                  onClick={() =>
                    apply((p) => {
                      const it = p.items.find((x) => x.id === (i.target as { id: string }).id);
                      const room = it && p.rooms.find((r) => r.floorId === it.floorId);
                      if (!it || !room) return p;
                      const pt = pullInside(it, room, Math.max(it.width, it.depth) / 2 + 0.1);
                      return { ...p, items: p.items.map((x) => (x.id === it.id ? { ...x, x: pt.x, y: pt.y } : x)) };
                    })
                  }
                >
                  Hineinholen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PLAN_TOOLS: { id: PlanTool; label: string; icon: ReactNode }[] = [
  { id: "select", label: "Auswahl", icon: <MousePointer2 size={18} /> },
  { id: "rect", label: "Rechteck", icon: <RectangleHorizontal size={18} /> },
  { id: "poly", label: "Freiform", icon: <PenTool size={18} /> },
  { id: "door", label: "Tür", icon: <DoorOpen size={18} /> },
  { id: "window", label: "Fenster", icon: <AppWindow size={18} /> },
  { id: "passage", label: "Durchgang", icon: <SquareDashed size={18} /> },
  { id: "void", label: "Decken­öffnung", icon: <BoxSelect size={18} /> },
];

export function DesignView() {
  const ui = useUi();
  const project = useProject((s) => s.project);
  const { undo, redo, past, future, canEdit, apply } = useProject();
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [dims, setDims] = useState(false);
  const [floors, setFloors] = useState(false);
  const [underlay, setUnderlay] = useState(false);
  const [delRoom, setDelRoom] = useState<string | null>(null);
  const show2d = ui.designView !== "3d";

  // Entfernen/Duplizieren per Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const s = useUi.getState().selection;
      if (!s || !canEdit) return;
      if (e.key === "Delete" || (e.key === "Backspace" && useUi.getState().planTool !== "poly")) {
        e.preventDefault();
        if (s.kind === "item") apply((p) => deleteItem(p, s.id));
        else if (s.kind === "opening") apply((p) => deleteOpening(p, s.id));
        else if (s.kind === "void") apply((p) => ({ ...p, voids: p.voids.filter((v) => v.id !== s.id) }));
        else if (s.kind === "room") return setDelRoom(s.id);
        else return;
        ui.select(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && s.kind === "item") {
        e.preventDefault();
        let id = "";
        apply((p) => {
          const r = duplicateItem(p, s.id, { x: 0.3, y: 0.3 });
          id = r.id;
          return r.project;
        });
        if (id) ui.select({ kind: "item", id });
      }
      if (e.key === "Escape") ui.select(null);
      if (s.kind === "item" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.01;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        apply((p) => ({ ...p, items: p.items.map((i) => (i.id === s.id ? { ...i, x: Math.round((i.x + d[0]) * 1000) / 1000, y: Math.round((i.y + d[1]) * 1000) / 1000 } : i)) }));
      }
      if (s.kind === "item" && (e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey) {
        apply((p) => ({ ...p, items: p.items.map((i) => (i.id === s.id ? { ...i, rotation: i.rotation + (e.shiftKey ? -1 : 1) * (Math.PI / 12) } : i)) }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, canEdit, ui]);

  if (!project) return null;
  const side = ui.designTool === "furnish" && catalogOpen && !ui.selection ? "catalog" : ui.designTool === "connect" ? "connect" : ui.selection ? "props" : ui.designTool === "furnish" && catalogOpen ? "catalog" : null;

  return (
    <>
      {show2d && (
        <div className={clsx("absolute inset-y-0 left-0 z-0", ui.designView === "split" ? "right-1/2 border-r border-line" : "right-0")}>
          <FloorPlan />
        </div>
      )}
      {/* Kopf: Werkzeug und Ansicht */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(4.4rem+env(safe-area-inset-top))] z-20 flex flex-wrap items-start gap-2 px-3 sm:px-4">
        <div className="pointer-events-auto rounded-2xl border border-line/70 bg-surface/95 p-1 shadow-soft">
          <Segmented
            label="Werkzeug"
            value={ui.designTool}
            onChange={(v) => ui.patch({ designTool: v, planTool: "select" })}
            options={[
              { value: "plan", label: <><Ruler size={15} /> Grundriss</> },
              { value: "furnish", label: <><Library size={15} /> Einrichten</> },
              { value: "connect", label: <><Link size={15} /> Verbinden</> },
            ]}
          />
        </div>
        <div className="pointer-events-auto rounded-2xl border border-line/70 bg-surface/95 p-1 shadow-soft">
          <Segmented
            label="Ansicht"
            value={ui.designView}
            onChange={(v) => ui.patch({ designView: v })}
            options={[
              { value: "2d", label: "2D" },
              { value: "3d", label: "3D" },
              { value: "split", label: "Geteilt", title: "2D und 3D nebeneinander" },
            ]}
          />
        </div>
        {ui.designView !== "2d" && <ViewControls showLayers={false} />}
        <Issues />
      </div>
      {/* Werkzeugpalette */}
      <div className="pointer-events-none absolute bottom-[calc(5.6rem+env(safe-area-inset-bottom))] left-3 top-[calc(8.4rem+env(safe-area-inset-top))] z-20 flex flex-col justify-center sm:left-4">
        <div className="pointer-events-auto flex max-h-full w-[68px] flex-col gap-0.5 overflow-y-auto rounded-2xl border border-line/70 bg-surface/95 p-1 shadow-float" role="toolbar" aria-label="Werkzeuge">
          {ui.designTool === "plan" &&
            canEdit &&
            PLAN_TOOLS.map((t) => (
              <ToolButton key={t.id} active={ui.planTool === t.id} onClick={() => ui.patch({ planTool: t.id, ...(ui.designView === "3d" && t.id !== "select" ? { designView: "2d" as const } : {}) })} icon={t.icon} label={t.label} testId={`tool-${t.id}`} />
            ))}
          {ui.designTool === "plan" && canEdit && (
            <>
              <div className="my-1 h-px bg-line" />
              <ToolButton onClick={() => setDims(true)} icon={<Grid2x2Plus size={18} />} label="Raum mit Maßen" testId="tool-dims" />
              <ToolButton onClick={() => setFloors(true)} icon={<Layers size={18} />} label="Etagen" />
              <ToolButton onClick={() => setUnderlay(true)} icon={<Image size={18} />} label="Plan­bild" />
            </>
          )}
          {ui.designTool === "furnish" && (
            <>
              <ToolButton
                active={catalogOpen && !ui.selection}
                onClick={() => {
                  if (ui.selection) {
                    ui.select(null);
                    setCatalogOpen(true);
                  } else setCatalogOpen(!catalogOpen);
                }}
                icon={<Library size={18} />}
                label="Katalog"
                testId="tool-catalog"
              />
            </>
          )}
          {show2d && <ToolButton onClick={() => window.dispatchEvent(new Event("lumahome:fit-plan"))} icon={<Maximize size={18} />} label="Einpassen" />}
          {canEdit && (
            <>
              <div className="my-1 h-px bg-line" />
              <ToolButton onClick={undo} icon={<Undo2 size={18} className={!past.length ? "opacity-40" : undefined} />} label="Zurück" testId="undo" />
              <ToolButton onClick={redo} icon={<Redo2 size={18} className={!future.length ? "opacity-40" : undefined} />} label="Vor" testId="redo" />
            </>
          )}
        </div>
      </div>
      {/* Seitenfläche */}
      {side && (
        <div className="pointer-events-none absolute bottom-[calc(5.6rem+env(safe-area-inset-bottom))] right-3 top-[calc(8.4rem+env(safe-area-inset-top))] z-20 flex w-[calc(100%-6.5rem)] justify-end sm:right-4 sm:w-auto">
          <div className="pointer-events-auto flex max-h-full w-full">
            {side === "catalog" && <CatalogPanel onClose={() => setCatalogOpen(false)} />}
            {side === "props" && <Properties />}
            {side === "connect" && <ConnectPanel onClose={() => ui.patch({ designTool: "plan" })} />}
          </div>
        </div>
      )}
      {!canEdit && (
        <div className="absolute inset-x-0 bottom-28 z-20 flex justify-center px-3">
          <Notice tone="info">Nur Ansicht: Zum Bearbeiten wird die Bearbeitungs-PIN benötigt (Geräte → Zugang).</Notice>
        </div>
      )}
      <DragFollower />
      <RoomByDimensionsDialog open={dims} onClose={() => setDims(false)} />
      <FloorsDialog open={floors} onClose={() => setFloors(false)} />
      <UnderlayDialog open={underlay} onClose={() => setUnderlay(false)} />
      {delRoom && <DeleteRoomDialog open roomId={delRoom} onClose={() => setDelRoom(null)} />}
    </>
  );
}
