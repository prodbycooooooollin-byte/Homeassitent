// Werkzeug „Verbinden“: echte Geräte einem Planobjekt zuordnen.
// Vorschläge sind begründet, die Zuordnung erfolgt nur nach Bestätigung.
import { clsx } from "clsx";
import { Link2, Link2Off, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { BindingTarget } from "@/model/types";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { rankCandidates, targetLabel } from "@/devices/suggestions";
import { stateSummary } from "@/devices/state";
import { describeBinding } from "@/devices/view";
import { newId } from "@/model/ids";
import { itemRoom } from "@/geometry/placement";
import { Notice } from "@/ui/primitives";

const ROLE_LABEL: Record<string, string> = { light: "Licht", switch: "Schalter/Steckdose", cover: "Rollladen", contact: "Kontakt", climate: "Heizung/Klima", sensor: "Sensor" };

export function targetFromSelection(sel: ReturnType<typeof useUi.getState>["selection"]): BindingTarget | null {
  if (!sel) return null;
  if (sel.kind === "item" || sel.kind === "opening" || sel.kind === "room") return { kind: sel.kind, id: sel.id };
  if (sel.kind === "vertex" || sel.kind === "edge") return { kind: "room", id: sel.roomId };
  return null;
}

export function ConnectPanel({ onClose }: { onClose: () => void }) {
  const project = useProject((s) => s.project);
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const sel = useUi((s) => s.selection);
  const toast = useUi((s) => s.toast);
  const states = useLive((s) => s.states);
  const registry = useLive((s) => s.registry);
  const status = useLive((s) => s.status);
  const connected = isConnected(status);
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [allTypes, setAllTypes] = useState(false);
  const [confirmMove, setConfirmMove] = useState<string | null>(null);
  const target = targetFromSelection(sel);

  const roomName = useMemo(() => {
    if (!project || !target) return null;
    if (target.kind === "room") return project.rooms.find((r) => r.id === target.id)?.name ?? null;
    if (target.kind === "opening") return project.rooms.find((r) => r.id === project.openings.find((o) => o.id === target.id)?.roomId)?.name ?? null;
    const it = project.items.find((i) => i.id === target.id);
    return it ? itemRoom(it, project)?.name ?? null : null;
  }, [project, target]);

  const candidates = useMemo(
    () => (project && target ? rankCandidates({ project, target, roomName, states, registry, query: q, onlyUnbound: onlyFree, showAllRoles: allTypes }) : []),
    [project, target, roomName, states, registry, q, onlyFree, allTypes],
  );

  if (!project) return null;
  const current = target ? project.bindings.filter((b) => b.target.kind === target.kind && b.target.id === target.id) : [];
  const label = target ? targetLabel(project, target) : null;

  const bind = (entityId: string, role: (typeof candidates)[number]["role"], via: "manual" | "suggestion") => {
    if (!target) return;
    apply((p) => ({
      ...p,
      bindings: [...p.bindings.filter((b) => b.entityId !== entityId), { id: newId("bind"), entityId, target, role, confirmedAt: new Date().toISOString(), via }],
    }));
    setConfirmMove(null);
    toast(`${entityId} zugeordnet.`, "success");
  };

  return (
    <section className="panel flex max-h-full w-full flex-col overflow-hidden sm:w-[380px]" aria-label="Geräte verbinden" data-testid="connect-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs text-ink-2">Verbinden</p>
          <h2 className="truncate text-sm font-semibold">{label ? `${label.name}${roomName && target?.kind !== "room" ? ` · ${roomName}` : ""}` : "Objekt wählen"}</h2>
        </div>
        <button className="icon-btn -mr-2" aria-label="Schließen" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="space-y-3 overflow-y-auto px-4 py-3">
        {!target && <p className="text-sm text-ink-2">Wähle im Plan oder Modell eine Leuchte, ein Gerät, ein Fenster bzw. eine Tür oder einen Raum (für Raumklima-Sensoren).</p>}
        {!connected && status.kind !== "connecting" && (
          <Notice tone="warn">Keine aktuelle Verbindung zu Home Assistant – vorhandene Zuordnungen bleiben erhalten, neue Geräte können erst nach dem Verbinden gewählt werden.</Notice>
        )}
        {target && (
          <>
            <div>
              <p className="section-title mb-1">Zugeordnet</p>
              {current.length === 0 && <p className="text-sm text-ink-2">Noch kein Gerät.</p>}
              <ul className="space-y-1.5">
                {current.map((b) => {
                  const d = describeBinding(b, states, connected);
                  return (
                    <li key={b.id} className="flex items-center gap-2 rounded-2xl border border-sage/30 bg-sage-soft/60 px-3 py-2">
                      <Link2 size={15} className="shrink-0 text-sage-dark" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="truncate text-xs text-ink-2">
                          {ROLE_LABEL[b.role]} · {b.entityId} · {stateSummary(d.capability, d.state)}
                        </p>
                      </div>
                      {canEdit && (
                        <button className="icon-btn h-9 w-9" aria-label={`Zuordnung ${b.entityId} lösen`} onClick={() => apply((p) => ({ ...p, bindings: p.bindings.filter((x) => x.id !== b.id) }))}>
                          <Link2Off size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="section-title mb-1">Verfügbare Geräte</p>
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
                <input className="input pl-9" placeholder="Name oder Entitäts-ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Geräte durchsuchen" />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className={clsx("chip", onlyFree && "chip-active")} onClick={() => setOnlyFree(!onlyFree)} aria-pressed={onlyFree}>
                  Nur nicht zugeordnete
                </button>
                <button className={clsx("chip", allTypes && "chip-active")} onClick={() => setAllTypes(!allTypes)} aria-pressed={allTypes}>
                  Alle Gerätetypen
                </button>
              </div>
            </div>
            <ul className="space-y-1.5" data-testid="candidates">
              {candidates.slice(0, 60).map((c, i) => {
                const suggested = i < 3 && c.score >= 30 && !c.boundTo;
                return (
                  <li key={c.entityId} className={clsx("rounded-2xl border px-3 py-2", suggested ? "border-sage/40 bg-sage-soft/40" : "border-line")}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-ink-2">
                          {ROLE_LABEL[c.role]} · {c.entityId}
                          {c.areaName ? ` · Bereich ${c.areaName}` : ""} · {stateSummary(c.capability, states[c.entityId])}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          className={clsx(suggested ? "btn-primary" : "btn-secondary", "min-h-[40px] px-3 text-xs")}
                          onClick={() => (c.boundTo ? setConfirmMove(c.entityId) : bind(c.entityId, c.role, suggested ? "suggestion" : "manual"))}
                          disabled={!connected}
                        >
                          {c.boundTo ? "Umhängen" : "Zuordnen"}
                        </button>
                      )}
                    </div>
                    {suggested && c.reasons.length > 0 && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-sage-dark">
                        <Sparkles size={12} className="mt-0.5 shrink-0" /> Vorschlag: {c.reasons.join(" · ")}
                      </p>
                    )}
                    {confirmMove === c.entityId && c.boundTo && (
                      <div className="mt-2 rounded-xl bg-warn-soft p-2 text-xs text-warn">
                        Bereits zugeordnet zu „{targetLabel(project, c.boundTo.target).name}“. Dort lösen und hier zuordnen?
                        <div className="mt-1 flex gap-2">
                          <button className="font-semibold underline" onClick={() => bind(c.entityId, c.role, "manual")}>
                            Ja, umhängen
                          </button>
                          <button className="underline" onClick={() => setConfirmMove(null)}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {connected && candidates.length === 0 && <li className="py-4 text-center text-sm text-ink-2">Keine passenden Geräte gefunden. Filter anpassen oder „Alle Gerätetypen“ wählen.</li>}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
