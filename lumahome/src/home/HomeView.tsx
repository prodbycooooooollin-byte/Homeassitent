import { clsx } from "clsx";
import { AlertTriangle, ChevronRight, Droplets, Eye, Focus, Info, Layers3, LightbulbOff, Maximize2, Thermometer, Wind, X, Zap, DoorOpen } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useProject } from "@/store/project";
import { useUi, type Layers } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { boundDevices, describeBinding } from "@/devices/view";
import { capabilityOf } from "@/devices/capabilities";
import { formatNumber, freshness, lightView, numericState } from "@/devices/state";
import { roomAggregates } from "@/energy/aggregate";
import { livePowerValues } from "@/energy/live";
import { formatPower } from "@/energy/units";

import { polygonArea } from "@/geometry/polygon";
import { Segmented, Dialog } from "@/ui/primitives";
import { DeviceControl } from "./DeviceControls";
import { insights, roomOfBinding } from "./insights";

function Popover({ label, icon, children, active }: { label: string; icon: ReactNode; children: ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className={clsx("chip shadow-soft", (open || active) && "chip-active")} aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}
        <span>{label}</span>
      </button>
      {open && (
        <div className="fade-in absolute left-0 top-12 z-30 w-72 rounded-2xl border border-line bg-surface p-3 shadow-float">
          <div className="mb-2 flex items-center justify-between">
            <p className="section-title">{label}</p>
            <button className="icon-btn -my-2 -mr-2" aria-label="Schließen" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

const LAYER_LABELS: { key: keyof Layers; label: string; hint: string }[] = [
  { key: "devices", label: "Alle Gerätesymbole", hint: "Sonst nur eingeschaltete Lichter und Geräte mit Hinweis" },
  { key: "labels", label: "Raumnamen", hint: "Beschriftung der Räume" },
  { key: "climate", label: "Raumklima", hint: "Räume nach Temperatur einfärben" },
  { key: "windows", label: "Fenster & Türen", hint: "Offene und gekippte Fenster hervorheben" },
  { key: "energy", label: "Energie", hint: "Räume nach gemessener Leistung einfärben" },
  { key: "warnings", label: "Hinweise", hint: "Liste mit Warnungen anzeigen" },
  { key: "legend", label: "Legende", hint: "Erklärung der Symbole und Farben" },
];

export function ViewControls({ showLayers = true }: { showLayers?: boolean }) {
  const ui = useUi();
  const project = useProject((s) => s.project);
  const multi = (project?.floors.length ?? 0) > 1;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2">
      <button className="chip shadow-soft" onClick={() => ui.focusRoom(null)} title="Ganzes Haus zeigen">
        <Maximize2 size={15} />
        <span>Gesamtansicht</span>
      </button>
      <Popover label="Ansicht" icon={<Eye size={15} />}>
        <div className="space-y-3">
          <div>
            <p className="label">Wände</p>
            <Segmented
              label="Wände"
              size="sm"
              value={ui.wallMode}
              onChange={(v) => ui.patch({ wallMode: v })}
              options={[
                { value: "full", label: "Voll" },
                { value: "cut", label: "Geschnitten" },
                { value: "low", label: "Grundriss" },
              ]}
            />
          </div>
          {multi && (
            <div>
              <p className="label">Etagen</p>
              <Segmented
                label="Etagen"
                size="sm"
                value={ui.floorsMode}
                onChange={(v) => ui.patch({ floorsMode: v })}
                options={[
                  { value: "current", label: "Bis gewählte Etage" },
                  { value: "stack", label: "Ganzes Haus" },
                ]}
              />
            </div>
          )}
          <label className="flex min-h-[40px] items-center justify-between gap-2 text-sm">
            Dach zeigen (bei „Ganzes Haus“)
            <input type="checkbox" className="h-5 w-5 accent-sage" checked={ui.showRoof} onChange={(e) => ui.patch({ showRoof: e.target.checked })} />
          </label>
        </div>
      </Popover>
      {showLayers && (
        <Popover label="Ebenen" icon={<Layers3 size={15} />} active={ui.layers.climate || ui.layers.energy || ui.layers.windows}>
          <div className="space-y-1">
            {LAYER_LABELS.map((l) => (
              <label key={l.key} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl px-1 hover:bg-surface-2">
                <span>
                  <span className="block text-sm">{l.label}</span>
                  <span className="block text-xs text-ink-2">{l.hint}</span>
                </span>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-sage" checked={ui.layers[l.key]} onChange={(e) => ui.setLayer(l.key, e.target.checked)} />
              </label>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

function Legend() {
  const layers = useUi((s) => s.layers);
  const setLayer = useUi((s) => s.setLayer);
  if (!layers.legend) return null;
  return (
    <div className="pointer-events-auto w-64 rounded-2xl border border-line bg-surface/95 p-3 text-xs shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <p className="section-title">Legende</p>
        <button className="icon-btn -my-2 -mr-2 h-9 w-9" aria-label="Legende ausblenden" onClick={() => setLayer("legend", false)}>
          <X size={14} />
        </button>
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border border-lamp bg-lamp" /> Licht eingeschaltet (bestätigt)</li>
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border border-warn-line bg-warn-soft" /> Nicht erreichbar, unbekannt oder veraltet</li>
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border border-line bg-surface" /> Gerät (bei „Alle Gerätesymbole“)</li>
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-[#E8B04A]/40" /> Warmer Bodenschimmer: Licht im Raum an</li>
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-energy/40" /> Energie: gemessene Leistung im Raum</li>
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-[#8DB59E]" /> Klima: 19–23 °C · <span className="h-4 w-4 rounded bg-[#9DBBD6]" /> kühler · <span className="h-4 w-4 rounded bg-[#E0B55F]" /> wärmer</li>
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-[#C98A1B]" /> Fensterrahmen: offen oder gekippt</li>
      </ul>
    </div>
  );
}

function Hints() {
  const project = useProject((s) => s.project);
  const states = useLive((s) => s.states);
  const pending = useLive((s) => s.pending);
  const connected = useLive((s) => isConnected(s.status));
  const layers = useUi((s) => s.layers);
  const patch = useUi((s) => s.patch);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => (project ? insights(project, states, connected, pending) : []), [project, states, connected, pending]);
  if (!layers.warnings || !list.length) return null;
  const warn = list.filter((l) => l.tone === "warn").length;
  return (
    <div className="pointer-events-auto">
      <button className={clsx("chip shadow-soft", warn ? "border-warn-line bg-warn-soft text-warn" : "")} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="hints-chip">
        {warn ? <AlertTriangle size={15} /> : <Info size={15} />}
        {list.length} {list.length === 1 ? "Hinweis" : "Hinweise"}
      </button>
      {open && (
        <ul className="fade-in mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-1 rounded-2xl border border-line bg-surface p-2 shadow-float">
          {list.map((h) => (
            <li key={h.key}>
              <button
                className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  if (h.target) patch({ card: h.target });
                  else if (h.roomId) patch({ selection: { kind: "room", id: h.roomId } });
                }}
              >
                {h.tone === "warn" ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" /> : <Info size={15} className="mt-0.5 shrink-0 text-ink-2" />}
                <span>{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function useRoomMetrics(roomId: string | null) {
  const project = useProject((s) => s.project);
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  return useMemo(() => {
    if (!project || !roomId) return null;
    const room = project.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    const metrics: { key: string; icon: ReactNode; text: string; stale: boolean }[] = [];
    for (const b of project.bindings) {
      if (b.target.kind !== "room" || b.target.id !== roomId) continue;
      const s = states[b.entityId];
      const f = freshness(s, connected);
      const cap = s ? capabilityOf(s) : null;
      if (!cap || cap.kind !== "sensor") continue;
      const n = numericState(s);
      if (n === null) {
        metrics.push({ key: b.entityId, icon: <AlertTriangle size={14} />, text: `${cap.quantity === "temperature" ? "Temperatur" : "Sensor"}: ${f.reason ?? "kein Wert"}`, stale: true });
        continue;
      }
      const icon = cap.quantity === "temperature" ? <Thermometer size={14} /> : cap.quantity === "humidity" ? <Droplets size={14} /> : cap.quantity === "co2" ? <Wind size={14} /> : <Info size={14} />;
      const digits = cap.quantity === "temperature" ? 1 : 0;
      metrics.push({ key: b.entityId, icon, text: `${formatNumber(n, digits)} ${cap.unit ?? ""}`.trim(), stale: f.availability !== "ok" });
    }
    const roomDevices = project.bindings.filter((b) => roomOfBinding(project, b.target) === roomId && b.target.kind !== "room");
    let lightsOn = 0;
    let lightsTotal = 0;
    let openWindows = 0;
    for (const b of roomDevices) {
      const d = describeBinding(b, states, connected);
      if (b.role === "light") {
        lightsTotal++;
        if (lightView(d.state).on) lightsOn++;
      }
      if (b.role === "contact" && d.state && ["on", "open", "tilted"].includes(d.state.state)) openWindows++;
    }
    const agg = roomAggregates(project, livePowerValues(project.meters, states, connected)).find((r) => r.roomId === roomId) ?? null;
    return { room, metrics, lightsOn, lightsTotal, openWindows, agg, deviceCount: roomDevices.length, area: polygonArea(room.vertices) };
  }, [project, roomId, states, connected]);
}

function RoomSummary({ onDevices }: { onDevices: () => void }) {
  const selection = useUi((s) => s.selection);
  const patch = useUi((s) => s.patch);
  const focusRoom = useUi((s) => s.focusRoom);
  const roomId = selection?.kind === "room" ? selection.id : null;
  const m = useRoomMetrics(roomId);
  const allOff = useAllLightsOff(roomId);
  if (!m) return null;
  return (
    <section aria-label={`Raum ${m.room.name}`} className="fade-in pointer-events-auto w-full max-w-3xl rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-float backdrop-blur" data-testid="room-summary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{m.room.name}</h2>
        {m.metrics.map((x) => (
          <span key={x.key} className={clsx("inline-flex items-center gap-1 text-xs", x.stale ? "text-warn" : "text-ink-2")}>
            {x.icon}
            {x.text}
          </span>
        ))}
        {m.lightsTotal > 0 && <span className="text-xs text-ink-2">Licht {m.lightsOn}/{m.lightsTotal} an</span>}
        {m.openWindows > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-warn">
            <DoorOpen size={14} /> {m.openWindows} offen
          </span>
        )}
        {m.agg && m.agg.value !== null && (
          <span className="inline-flex items-center gap-1 text-xs text-energy-dark" title={m.agg.complete ? "Raumzähler misst den gesamten Raum" : "Summe der gemessenen Geräte – nicht der gesamte Raum"}>
            <Zap size={14} /> {formatPower(m.agg.value)} {m.agg.complete ? "(Raumzähler)" : `(erfasste Geräte: ${m.agg.meterIds.length})`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {m.lightsOn > 0 && (
            <button className="btn-ghost min-h-[40px] px-2 text-xs" onClick={allOff}>
              <LightbulbOff size={15} /> Alle Lichter aus
            </button>
          )}
          <button className="btn-ghost min-h-[40px] px-2 text-xs" onClick={() => focusRoom(m.room.id)}>
            <Focus size={15} /> Fokus
          </button>
          <button className="btn-secondary min-h-[40px] px-3 text-xs" onClick={onDevices} data-testid="room-devices-button">
            Geräte ({m.deviceCount}) <ChevronRight size={14} />
          </button>
          <button className="icon-btn h-10 w-10" aria-label="Raumauswahl aufheben" onClick={() => patch({ selection: null })}>
            <X size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function useAllLightsOff(roomId: string | null) {
  const project = useProject((s) => s.project);
  const states = useLive((s) => s.states);
  const call = useLive((s) => s.call);
  const toast = useUi((s) => s.toast);
  return () => {
    if (!project || !roomId) return;
    const ids = project.bindings.filter((b) => b.role === "light" && roomOfBinding(project, b.target) === roomId && states[b.entityId]?.state === "on").map((b) => b.entityId);
    ids.forEach((id) => void call({ domain: "light", service: "turn_off", entityId: id }, "Ausschalten"));
    toast(`${ids.length} ${ids.length === 1 ? "Licht wird" : "Lichter werden"} ausgeschaltet.`);
  };
}

function RoomDevicesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selection = useUi((s) => s.selection);
  const patch = useUi((s) => s.patch);
  const project = useProject((s) => s.project);
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  const roomId = selection?.kind === "room" ? selection.id : null;
  const allOff = useAllLightsOff(roomId);
  if (!project || !roomId) return null;
  const room = project.rooms.find((r) => r.id === roomId)!;
  const targets = new Map<string, { kind: "item" | "opening" | "room"; id: string }>();
  for (const b of project.bindings) if (roomOfBinding(project, b.target) === roomId) targets.set(`${b.target.kind}:${b.target.id}`, b.target);
  const groups: Record<string, ReturnType<typeof boundDevices>> = { Licht: [], "Schalter & Steckdosen": [], "Fenster, Türen & Rollläden": [], Klima: [], Sensoren: [] };
  for (const t of targets.values()) {
    for (const d of boundDevices(project, t, states, connected)) {
      const g = d.binding.role === "light" ? "Licht" : d.binding.role === "switch" ? "Schalter & Steckdosen" : d.binding.role === "cover" || d.binding.role === "contact" ? "Fenster, Türen & Rollläden" : d.binding.role === "climate" ? "Klima" : "Sensoren";
      groups[g].push(d);
    }
  }
  const lightsOn = groups.Licht.some((d) => lightView(d.state).on);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Geräte in ${room.name}`}
      footer={
        <>
          {lightsOn && (
            <button className="btn-secondary" onClick={allOff}>
              <LightbulbOff size={16} /> Alle Lichter aus
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      {targets.size === 0 && <p className="text-sm text-ink-2">In diesem Raum sind noch keine Geräte zugeordnet.</p>}
      <div className="space-y-5">
        {Object.entries(groups)
          .filter(([, list]) => list.length)
          .map(([name, list]) => (
            <section key={name}>
              <h3 className="section-title mb-2">{name}</h3>
              <ul className="space-y-3">
                {list.map((d) => (
                  <li key={d.binding.id} className="rounded-2xl border border-line p-3">
                    <DeviceControl device={d} compact />
                    {(d.capability.kind === "light" || d.capability.kind === "climate" || d.capability.kind === "cover") && (
                      <button
                        className="mt-1 text-xs font-medium text-sage-dark underline-offset-2 hover:underline"
                        onClick={() => {
                          onClose();
                          patch({ card: d.binding.target });
                        }}
                      >
                        Alle Einstellungen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </Dialog>
  );
}

export function HomeView() {
  const project = useProject((s) => s.project);
  const patch = useUi((s) => s.patch);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const empty = !project || project.rooms.length === 0;
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-[calc(4.6rem+env(safe-area-inset-top))] z-20 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 sm:left-4">
        <ViewControls />
        <Hints />
        <Legend />
      </div>
      {empty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-float">
            <p className="text-base font-semibold">Noch keine Räume</p>
            <p className="mt-1 text-sm text-ink-2">Zeichne zuerst deinen Grundriss. Danach erscheint hier dein Haus als 3D-Modell.</p>
            <button className="btn-primary mt-4" onClick={() => patch({ tab: "design", designTool: "plan", planTool: "rect" })}>
              Grundriss zeichnen
            </button>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
        <RoomSummary onDevices={() => setDevicesOpen(true)} />
      </div>
      <RoomDevicesDialog open={devicesOpen} onClose={() => setDevicesOpen(false)} />
    </>
  );
}

