// Möbelkatalog als schwebende Fläche. Alle Einträge sind frei nutzbar.
// Platzieren per Ziehen (Maus/Touch) oder ohne Ziehen über „Platzieren“.
import { clsx } from "clsx";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, searchCatalog, type CategoryId } from "@/catalog/catalog";
import { useDrag, dispatchDrop } from "@/store/drag";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { IsoPreview } from "./IsoPreview";
import { defaultDropPoint, previewPlacement } from "./place";

export function CatalogPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "alle">("alle");
  const list = useMemo(() => searchCatalog(q, cat), [q, cat]);
  const drag = useDrag();
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const ui = useUi();

  const placeDefault = (catalogId: string) => {
    if (!project || !ui.floorId) return;
    const roomId = ui.selection?.kind === "room" ? ui.selection.id : null;
    const pt = defaultDropPoint(project, ui.floorId, roomId);
    const pv = previewPlacement(project, ui.floorId, catalogId, pt, 0);
    apply((p) => ({ ...p, items: [...p.items, pv.item] }));
    ui.patch({ selection: { kind: "item", id: pv.item.id } });
    ui.toast(`${pv.item.name} in ${pv.roomName ?? "der Etage"} platziert – jetzt verschieben, drehen oder Maße anpassen.`, "success");
  };

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (!canEdit || (e.pointerType === "mouse" && e.button !== 0)) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    const pid = e.pointerId;
    // Touch: erst nach kurzer Bewegung ziehen, damit Scrollen der Liste möglich bleibt
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      if (!active) {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (Math.hypot(dx, dy) < 8) return;
        if (e.pointerType === "touch" && Math.abs(dy) > Math.abs(dx) * 1.2) {
          cleanup();
          return;
        }
        active = true;
        drag.start(id, ev.clientX, ev.clientY);
      }
      ev.preventDefault();
      useDrag.getState().move(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      cleanup();
      if (!active) return;
      const st = useDrag.getState();
      const ok = dispatchDrop(id, ev.clientX, ev.clientY, st.rotation);
      st.end();
      if (!ok) ui.toast("Zum Platzieren auf den Grundriss oder in die 3D-Ansicht ziehen.", "info");
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "r" || ev.key === "R") useDrag.getState().rotate(Math.PI / 2);
      if (ev.key === "Escape") {
        cleanup();
        useDrag.getState().end();
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
  };

  return (
    <section className="panel flex max-h-full w-full flex-col overflow-hidden sm:w-[360px]" aria-label="Möbelkatalog" data-testid="catalog">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-base font-semibold">Katalog</h2>
        <button className="icon-btn -mr-2" aria-label="Katalog schließen" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="px-4">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input className="input pl-9" placeholder="Suchen, z. B. Sofa oder Lampe" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Katalog durchsuchen" />
        </label>
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto pb-2">
          {[{ id: "alle" as const, label: "Alle" }, ...CATEGORIES].map((c) => (
            <button key={c.id} className={clsx("chip shrink-0", cat === c.id && "chip-active")} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="px-4 pb-2 text-xs text-ink-2">Auf Plan oder Modell ziehen (Taste R dreht) – oder „Platzieren“ für den gewählten Raum.</p>
      <ul className="grid grid-cols-2 gap-2 overflow-y-auto px-4 pb-4">
        {list.map((e) => (
          <li key={e.id}>
            <div
              className={clsx("group flex h-full flex-col rounded-2xl border border-line bg-surface-2/50 p-2 transition-colors hover:border-sage", drag.catalogId === e.id && "border-sage bg-sage-soft")}
              onPointerDown={(ev) => startDrag(ev, e.id)}
              style={{ touchAction: "pan-y" }}
              data-catalog={e.id}
            >
              <div className="flex h-20 cursor-grab items-center justify-center active:cursor-grabbing">
                <IsoPreview entry={e} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">{e.name}</p>
              <p className="text-[11px] text-ink-2">
                {Math.round(e.size.w * 100)} × {Math.round(e.size.d * 100)} × {Math.round(e.size.h * 100)} cm
              </p>
              <button className="btn-secondary mt-2 min-h-[36px] px-2 text-xs" onClick={() => placeDefault(e.id)} disabled={!canEdit} aria-label={`${e.name} platzieren`}>
                <Plus size={14} /> Platzieren
              </button>
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-2 py-6 text-center text-sm text-ink-2">Nichts gefunden.</li>}
      </ul>
    </section>
  );
}

/** Folgt dem Zeiger während des Ziehens (nur außerhalb von Plan/Modell sichtbar). */
export function DragFollower() {
  const drag = useDrag();
  if (!drag.catalogId) return null;
  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[70] rounded-full bg-ink px-3 py-1.5 text-xs text-white shadow-float" style={{ transform: `translate(${drag.x + 14}px, ${drag.y + 14}px)` }}>
      Loslassen zum Platzieren · R dreht
    </div>
  );
}
