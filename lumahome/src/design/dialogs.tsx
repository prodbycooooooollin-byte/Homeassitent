import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { Dialog, NumberField, TextField, Notice } from "@/ui/primitives";
import { addFloor, addRoom, deleteFloor, deleteRoom, makeRoom, rectVertices, roomDeletionSummary, setFloorHeight } from "@/geometry/ops";
import { newId } from "@/model/ids";

export function DeleteRoomDialog({ open, roomId, onClose }: { open: boolean; roomId: string; onClose: () => void }) {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const select = useUi((s) => s.select);
  if (!open || !project) return null;
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const s = roomDeletionSummary(project, roomId);
  const run = (withContents: boolean) => {
    apply((p) => deleteRoom(p, roomId, withContents));
    select(null);
    onClose();
  };
  return (
    <Dialog
      open
      title={`„${room.name}“ löschen?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          {s.items.length > 0 && (
            <button className="btn-secondary" onClick={() => run(false)}>
              Raum löschen, Objekte behalten
            </button>
          )}
          <button className="btn-danger" onClick={() => run(true)}>
            <Trash2 size={16} /> {s.items.length ? "Raum und Objekte löschen" : "Raum löschen"}
          </button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>{s.openings.length} Tür(en)/Fenster des Raums werden entfernt.</li>
        <li>
          {s.items.length} Objekt(e) im Raum{s.items.length ? `: ${s.items.slice(0, 5).map((i) => i.name).join(", ")}${s.items.length > 5 ? " …" : ""}` : ""}.
        </li>
        <li>{s.bindings} Gerätezuordnung(en) betroffen – die Geräte selbst bleiben in Home Assistant unverändert.</li>
        {s.meters > 0 && <li>{s.meters} Messpunkt(e) verlieren den Raumbezug, bleiben aber erhalten.</li>}
      </ul>
      <p className="mt-3 text-sm text-ink-2">Behaltene Objekte bleiben an ihrer Position auf der Etage und werden als „außerhalb eines Raums“ markiert. Rückgängig ist jederzeit möglich.</p>
    </Dialog>
  );
}

export function RoomByDimensionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const floorId = useUi((s) => s.floorId);
  const select = useUi((s) => s.select);
  const [name, setName] = useState("Neuer Raum");
  const [w, setW] = useState(4);
  const [d, setD] = useState(3.5);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  if (!open || !project || !floorId) return null;
  const maxX = Math.max(0, ...project.rooms.filter((r) => r.floorId === floorId).flatMap((r) => r.vertices.map((v) => v.x)));
  return (
    <Dialog
      open
      title="Raum mit Maßen anlegen"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              const room = makeRoom(floorId, name, rectVertices(x, y, w, d));
              apply((p) => addRoom(p, room));
              select({ kind: "room", id: room.id });
              onClose();
            }}
          >
            <Plus size={16} /> Anlegen
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <TextField label="Name" value={name} onCommit={setName} />
        </div>
        <NumberField label="Breite" unit="cm" value={w} scale={100} min={50} max={8000} onCommit={setW} />
        <NumberField label="Tiefe" unit="cm" value={d} scale={100} min={50} max={8000} onCommit={setD} />
        <NumberField label="Position X" unit="cm" value={x} scale={100} onCommit={setX} />
        <NumberField label="Position Y" unit="cm" value={y} scale={100} onCommit={setY} />
      </div>
      {maxX > 0 && (
        <button className="mt-3 text-xs font-medium text-sage-dark underline" onClick={() => setX(maxX)}>
          Rechts an bestehende Räume anschließen (X = {Math.round(maxX * 100)} cm)
        </button>
      )}
    </Dialog>
  );
}

export function FloorsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const patch = useUi((s) => s.patch);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!open || !project) return null;
  const floors = [...project.floors].sort((a, b) => b.elevation - a.elevation);
  return (
    <Dialog
      open
      title="Etagen"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={() => {
              let id = "";
              apply((p) => {
                const r = addFloor(p, p.floors.length === 1 ? "Obergeschoss" : `Etage ${p.floors.length + 1}`);
                id = r.id;
                return r.project;
              });
              if (id) patch({ floorId: id });
            }}
          >
            <Plus size={16} /> Etage hinzufügen
          </button>
          <button className="btn-primary" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      <ul className="space-y-3">
        {floors.map((f) => (
          <li key={f.id} className="rounded-2xl border border-line p-3">
            <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <TextField label="Name" value={f.name} onCommit={(name) => apply((p) => ({ ...p, floors: p.floors.map((x) => (x.id === f.id ? { ...x, name } : x)) }))} />
              <NumberField label="Raumhöhe" unit="cm" value={f.height} scale={100} min={180} max={800} onCommit={(h) => apply((p) => setFloorHeight(p, f.id, h))} />
              <button className="icon-btn text-danger" aria-label={`${f.name} löschen`} disabled={project.floors.length <= 1} onClick={() => setConfirm(f.id)}>
                <Trash2 size={17} />
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-2">
              Fußboden auf {Math.round(f.elevation * 100)} cm · {project.rooms.filter((r) => r.floorId === f.id).length} Räume
            </p>
            {confirm === f.id && (
              <div className="mt-2">
                <Notice tone="warn">
                  Alle Räume, Objekte und Zuordnungen dieser Etage werden gelöscht.{" "}
                  <button
                    className="font-semibold underline"
                    onClick={() => {
                      apply((p) => deleteFloor(p, f.id));
                      patch({ floorId: project.floors.find((x) => x.id !== f.id)?.id ?? null, selection: null });
                      setConfirm(null);
                    }}
                  >
                    Endgültig löschen
                  </button>
                </Notice>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function UnderlayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const floorId = useUi((s) => s.floorId);
  const toast = useUi((s) => s.toast);
  if (!open || !project || !floorId) return null;
  const u = project.underlays.find((x) => x.floorId === floorId);
  const set = (patch: Partial<NonNullable<typeof u>>) => apply((p) => ({ ...p, underlays: p.underlays.map((x) => (x.floorId === floorId ? { ...x, ...patch } : x)) }));
  const onFile = (file: File) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast("Bitte ein PNG-, JPEG-, WebP- oder SVG-Bild wählen.", "warn");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("Das Bild ist größer als 8 MB.", "warn");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const asset = { id: newId("asset"), name: file.name.slice(0, 100), mime: file.type as "image/png", data: String(r.result) };
      apply((p) => ({
        ...p,
        assets: [...p.assets.filter((a) => !p.underlays.some((x) => x.floorId === floorId && x.assetId === a.id)), asset],
        underlays: [...p.underlays.filter((x) => x.floorId !== floorId), { floorId, assetId: asset.id, x: 0, y: 0, width: 12, opacity: 0.5, visible: true }],
      }));
    };
    r.readAsDataURL(file);
  };
  return (
    <Dialog open title="Grundrissbild als Zeichenhilfe" onClose={onClose} footer={<button className="btn-primary" onClick={onClose}>Fertig</button>}>
      <p className="mb-3 text-sm text-ink-2">Lege ein Foto oder einen Scan deines Grundrisses unter den Plan und zeichne die Räume darauf nach. Über die Breite in Metern stellst du den Maßstab ein.</p>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="block w-full text-sm" aria-label="Bild auswählen" />
      {u && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Breite" unit="m" value={u.width} decimals={2} min={0.5} max={1000} onCommit={(width) => set({ width })} />
            <NumberField label="X" unit="m" value={u.x} decimals={2} onCommit={(x) => set({ x })} />
            <NumberField label="Y" unit="m" value={u.y} decimals={2} onCommit={(y) => set({ y })} />
          </div>
          <label className="block text-sm">
            Deckkraft {Math.round(u.opacity * 100)} %
            <input type="range" min={0.1} max={1} step={0.05} value={u.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} className="w-full accent-sage" />
          </label>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => set({ visible: !u.visible })}>
              {u.visible ? "Ausblenden" : "Einblenden"}
            </button>
            <button className="btn-danger" onClick={() => apply((p) => ({ ...p, underlays: p.underlays.filter((x) => x.floorId !== floorId), assets: p.assets.filter((a) => a.id !== u.assetId) }))}>
              Entfernen
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
