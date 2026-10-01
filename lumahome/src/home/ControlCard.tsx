// Am Objekt verankerte Steuerkarte (Desktop) bzw. Panel am unteren Rand (Touch).
// Schließen stellt die bisherige Ansicht wieder her – Kamera und Auswahl bleiben.
import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { boundDevices } from "@/devices/view";
import { targetLabel } from "@/devices/suggestions";
import { livePower } from "@/energy/live";
import { itemRoom } from "@/geometry/placement";
import { DeviceControl } from "./DeviceControls";
import { useTouchLayout } from "./useMedia";

export function ControlCard() {
  const card = useUi((s) => s.card);
  const patch = useUi((s) => s.patch);
  const tab = useUi((s) => s.tab);
  const project = useProject((s) => s.project);
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  const touch = useTouchLayout();
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && patch({ card: null });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, patch]);

  // Karte nach dem Öffnen einmal neu positionieren (die Szene rendert nur bei Bedarf)
  useLayoutEffect(() => {
    import("@/scene/bridge").then(({ bridge }) => bridge.invalidate());
  }, [card]);

  if (!card || !project || tab === "design" || tab === "devices") return <div id="lh-anchor" ref={anchorRef} className="hidden" />;
  const devices = boundDevices(project, card, states, connected);
  const label = targetLabel(project, card);
  const item = card.kind === "item" ? project.items.find((i) => i.id === card.id) : undefined;
  const room = item ? itemRoom(item, project) : card.kind === "opening" ? project.rooms.find((r) => r.id === project.openings.find((o) => o.id === card.id)?.roomId) : null;
  const meter = item ? project.meters.find((m) => m.itemId === item.id && m.powerEntityId) : undefined;
  const power = meter ? livePower(meter, states, connected) ?? null : null;

  const content = (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-ink-2">{room?.name ?? label.roomName ?? ""}</p>
          <h2 className="truncate text-base font-semibold">{label.name}</h2>
        </div>
        <button className="icon-btn -mr-2 -mt-2" aria-label="Steuerkarte schließen" onClick={() => patch({ card: null })} data-testid="close-card">
          <X size={18} />
        </button>
      </div>
      {devices.length === 0 && <p className="text-sm text-ink-2">Kein Gerät zugeordnet.</p>}
      {devices.map((d, i) => (
        <div key={d.binding.id} className={clsx(i > 0 && "border-t border-line pt-3")}>
          <DeviceControl device={d} power={d.binding.role === "switch" ? power : undefined} />
        </div>
      ))}
    </div>
  );

  if (touch) {
    return (
      <>
        <div id="lh-anchor" ref={anchorRef} className="hidden" />
        <section
          role="dialog"
          aria-label={`Steuerung ${label.name}`}
          className="sheet-in fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-3xl border border-line bg-surface px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 shadow-float"
          data-testid="control-card"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
          {content}
        </section>
      </>
    );
  }
  return (
    <div id="lh-anchor" ref={anchorRef} className="pointer-events-none fixed left-0 top-0 z-40 data-[visible='0']:opacity-60" style={{ transform: "translate(50vw, 40vh)" }}>
      <section
        role="dialog"
        aria-label={`Steuerung ${label.name}`}
        className="fade-in pointer-events-auto absolute bottom-3 left-0 w-[320px] -translate-x-1/2 rounded-3xl border border-line bg-surface p-4 shadow-float"
        data-testid="control-card"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {content}
        <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-line bg-surface" aria-hidden />
      </section>
    </div>
  );
}
