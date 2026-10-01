// Bereich „Energie“: im Haus (eingefärbte Räume im Modell) und im Verlauf.
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Info, Settings2, Zap, PanelBottomClose, PanelBottomOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { houseConsumption, flowValues, roomAggregates, leafConsumers, buildTree, type MeterNode } from "@/energy/aggregate";
import { livePower, livePowerValues } from "@/energy/live";
import { formatEnergy, formatPower } from "@/energy/units";
import { rangeBounds, type RangeKind } from "@/energy/series";
import { Segmented, Notice } from "@/ui/primitives";
import { HistoryChart } from "./Chart";
import { FlowDiagram } from "./FlowDiagram";
import { useHistory } from "./useHistory";
import { FLOW_LABEL, roomPeriod, summarize, topConsumers } from "./derive";
import { MeterSetup } from "./MeterSetup";
import { useTouchLayout } from "@/home/useMedia";

function Stat({ label, value, note, tone = "energy", testId }: { label: string; value: string; note?: string | null; tone?: "energy" | "plain"; testId?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3" data-testid={testId}>
      <p className="text-xs text-ink-2">{label}</p>
      <p className={clsx("text-xl font-semibold tabular-nums", tone === "energy" ? "text-energy-dark" : "text-ink")}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{note}</p>}
    </div>
  );
}

function rangeTitle(range: RangeKind, anchor: number) {
  const { start, end } = rangeBounds(range, new Date(anchor));
  const s = new Date(start);
  if (range === "day") return s.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
  if (range === "week") return `${s.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${new Date(end - 1).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  return s.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function shift(range: RangeKind, anchor: number, dir: number) {
  const d = new Date(anchor);
  if (range === "day") d.setDate(d.getDate() + dir);
  else if (range === "week") d.setDate(d.getDate() + 7 * dir);
  else d.setMonth(d.getMonth() + dir);
  return d.getTime();
}

function Overview() {
  const project = useProject((s) => s.project)!;
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  const mode = useProject((s) => s.mode);
  const today = useHistory("day", Date.now());
  const values = useMemo(() => livePowerValues(project.meters, states, connected), [project.meters, states, connected]);
  const house = houseConsumption(project.meters, values, project.settings.noLocalGeneration);
  const flows = flowValues(project.meters, values);
  const rooms = roomAggregates(project, values).filter((r) => r.value !== null || r.missing).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const todaySum = today.result ? summarize(project, today.result) : null;
  const devices = leafConsumers(project.meters)
    .filter((m) => m.powerEntityId)
    .map((m) => ({ m, v: livePower(m, states, connected) }))
    .sort((a, b) => (b.v?.watts ?? -1) - (a.v?.watts ?? -1));
  if (!project.meters.length)
    return (
      <Notice tone="info" title="Noch keine Messquelle zugeordnet">
        Ordne unter „Messquellen“ einen Hauszähler, Leistungs- oder Energiesensoren zu. Ein eingeschaltetes Gerät oder eine Helligkeit wird nicht als Verbrauch gewertet.
      </Notice>
    );
  return (
    <div className="space-y-4">
      {mode === "demo" && <Notice tone="demo">Demo: Alle Werte sind simulierte Beispieldaten.</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Stat label={`${house.label} · jetzt`} value={formatPower(house.value)} note={house.basis === "house_meter" ? null : house.note} testId="stat-house-power" />
        <Stat
          label={`${todaySum?.house.label ?? house.label} · heute`}
          value={todaySum ? formatEnergy(todaySum.house.value) : today.loading ? "lädt …" : "–"}
          note={todaySum?.calculated ? "Teilweise aus Leistung berechnet" : todaySum ? "Bisheriger Tagesverlauf" : null}
          testId="stat-house-energy"
        />
        {flows.hasPv && <Stat label="PV-Erzeugung · jetzt" value={formatPower(flows.pv)} tone="plain" note={todaySum?.flows.pv !== null && todaySum ? `heute ${formatEnergy(todaySum.flows.pv)}` : null} />}
        {flows.hasGrid && (
          <Stat
            label={flows.gridExport && flows.gridExport > 0 ? "Einspeisung · jetzt" : "Netzbezug · jetzt"}
            value={formatPower(flows.gridExport && flows.gridExport > 0 ? flows.gridExport : flows.gridImport)}
            tone="plain"
            note={todaySum ? `heute Bezug ${formatEnergy(todaySum.flows.gridImport)} · Einspeisung ${formatEnergy(todaySum.flows.gridExport)}` : null}
          />
        )}
      </div>
      {(flows.hasGrid || flows.hasPv || flows.hasBattery) && (
        <section className="rounded-2xl border border-line bg-surface p-3">
          <h3 className="section-title mb-1">Energiefluss jetzt</h3>
          <FlowDiagram f={flows} house={house.value} houseLabel={house.basis === "calculated_flows" ? "berechnet" : house.basis === "tracked_devices" ? "nur erfasste Geräte" : ""} />
          <p className="text-[11px] text-ink-2">Netzleistung und Hausverbrauch sind bei PV und Speicher verschiedene Größen.</p>
        </section>
      )}
      <section>
        <h3 className="section-title mb-2">Räume · Leistung jetzt</h3>
        {rooms.length === 0 && <p className="text-sm text-ink-2">Noch keine Messpunkte mit Raumbezug.</p>}
        <ul className="space-y-1.5" data-testid="room-power">
          {rooms.map((r) => {
            const room = project.rooms.find((x) => x.id === r.roomId)!;
            return (
              <li key={r.roomId} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{room.name}</p>
                  <p className="text-[11px] text-ink-2">
                    {r.complete ? "Raumzähler (gesamter Raum)" : `Erfasste Geräte: ${r.meterIds.length}`}
                    {!r.complete && r.unmeteredDevices > 0 ? ` · ${r.unmeteredDevices} Gerät(e) ohne Messung` : ""}
                    {r.missing ? ` · ${r.missing} ohne aktuellen Wert` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-energy-dark">{formatPower(r.value)}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="section-title mb-2">Geräte · Leistung jetzt</h3>
        <ul className="space-y-1">
          {devices.map(({ m, v }) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-1 py-1 text-sm">
              <span className="truncate">{m.label}</span>
              <span className={clsx("shrink-0 tabular-nums", v?.watts === null ? "text-warn" : "text-ink")}>{v?.watts === null ? v.reason : formatPower(v?.watts ?? null)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TreeRows({ nodes, depth, unit }: { nodes: MeterNode[]; depth: number; unit: "kWh" }) {
  return (
    <>
      {nodes.map((n) => (
        <li key={n.meter.id}>
          <div className="flex items-center justify-between gap-2 py-1 text-sm" style={{ paddingLeft: depth * 16 }}>
            <span className="truncate">{n.meter.isHouseMain ? `${n.meter.label} (Hauszähler)` : n.meter.label}</span>
            <span className="tabular-nums">{formatEnergy(n.value)}</span>
          </div>
          {n.children.length > 0 && (
            <ul>
              <TreeRows nodes={n.children} depth={depth + 1} unit={unit} />
              <li className="flex items-center justify-between gap-2 py-1 text-xs text-ink-2" style={{ paddingLeft: (depth + 1) * 16 }}>
                <span>Nicht einzeln erfasst</span>
                <span className="tabular-nums">{n.remainder === null ? "nicht bestimmbar" : formatEnergy(Math.max(0, n.remainder))}</span>
              </li>
            </ul>
          )}
        </li>
      ))}
    </>
  );
}

function History() {
  const project = useProject((s) => s.project)!;
  const ui = useUi();
  const h = useHistory(ui.energyRange, ui.energyAnchor);
  const [meterId, setMeterId] = useState<string>("house");
  const sum = h.result ? summarize(project, h.result) : null;
  const meter = project.meters.find((m) => m.id === meterId);
  const mh = meter && h.result?.meters.get(meter.id);
  const energyBuckets = meter ? mh?.energy?.buckets ?? null : sum?.series ?? null;
  const powerBuckets = meter ? mh?.power ?? null : (() => {
    const main = project.meters.find((m) => m.isHouseMain);
    return main ? h.result?.meters.get(main.id)?.power ?? null : null;
  })();
  const isFuture = rangeBounds(ui.energyRange, new Date(ui.energyAnchor)).start > Date.now();
  const top = h.result ? topConsumers(project, h.result) : [];
  const rooms = h.result ? roomPeriod(project, h.result).filter((r) => r.value !== null) : [];
  const tree = h.result ? buildTree(project.meters, new Map([...h.result.meters].filter(([, v]) => v.energy).map(([k, v]) => [k, v.energy!.total]))) : [];
  const mode = ui.energyMode === "power" && powerBuckets ? "power" : "energy";
  const total = meter ? mh?.energy?.total ?? null : sum?.house.value ?? null;
  const coverage = meter ? mh?.energy?.coverage ?? null : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Zeitraum"
          value={ui.energyRange}
          onChange={(v) => ui.patch({ energyRange: v })}
          options={[
            { value: "day", label: "Tag" },
            { value: "week", label: "Woche" },
            { value: "month", label: "Monat" },
          ]}
        />
        <div className="flex items-center gap-1">
          <button className="icon-btn border border-line" aria-label="Vorheriger Zeitraum" onClick={() => ui.patch({ energyAnchor: shift(ui.energyRange, ui.energyAnchor, -1) })}>
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn border border-line" aria-label="Nächster Zeitraum" disabled={isFuture || rangeBounds(ui.energyRange, new Date(ui.energyAnchor)).end > Date.now()} onClick={() => ui.patch({ energyAnchor: shift(ui.energyRange, ui.energyAnchor, 1) })}>
            <ChevronRight size={18} />
          </button>
          <button className="chip" onClick={() => ui.patch({ energyAnchor: Date.now() })}>
            Heute
          </button>
        </div>
      </div>
      <p className="text-sm font-medium" data-testid="range-title">{rangeTitle(ui.energyRange, ui.energyAnchor)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-full flex-1" value={meterId} onChange={(e) => setMeterId(e.target.value)} aria-label="Messpunkt wählen">
          <option value="house">{sum?.house.label ?? "Haus"}</option>
          {project.meters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({FLOW_LABEL[m.flow]})
            </option>
          ))}
        </select>
        <Segmented
          label="Größe"
          size="sm"
          value={ui.energyMode}
          onChange={(v) => ui.patch({ energyMode: v })}
          options={[
            { value: "energy", label: "Energie (kWh)" },
            { value: "power", label: "Leistung (W)" },
          ]}
        />
      </div>
      {h.error && <Notice tone="error">Verlauf konnte nicht geladen werden: {h.error}</Notice>}
      {h.loading && !h.result && <p className="text-sm text-ink-2">Verlauf wird geladen …</p>}
      {h.result && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={`${meter ? meter.label : sum?.house.label} · Summe`} value={formatEnergy(total)} note={meter ? mh?.energy?.method ?? mh?.note ?? "Keine Energiequelle" : sum?.house.note} testId="period-total" />
            <Stat label="Datenabdeckung" value={coverage !== null ? `${Math.round(coverage * 100)} %` : sum ? `${Math.round(Math.min(1, ...(sum.series.filter((b) => b.start < Date.now() && b.end <= Date.now()).map((b) => b.coverage).concat([1]))) * 100)} %` : "–"} tone="plain" note="Anteil des Zeitraums mit Messdaten (niedrigster Bucket)" />
          </div>
          {ui.energyMode === "power" && !powerBuckets && <Notice tone="info">Für diesen Messpunkt ist keine Leistungsquelle (W) zugeordnet.</Notice>}
          {mode === "energy" && !energyBuckets && <Notice tone="info">Für diesen Messpunkt liegen keine Energiewerte vor.</Notice>}
          {(mode === "power" ? powerBuckets : energyBuckets) && (
            <HistoryChart buckets={(mode === "power" ? powerBuckets : energyBuckets)!} range={ui.energyRange} mode={mode} calculated={meter ? !!mh?.energy?.calculated : !!sum?.calculated} testId="history-chart" />
          )}
          {!meter && (
            <>
              <section>
                <h3 className="section-title mb-2">Höchster gemessener Verbrauch</h3>
                <ol className="space-y-1" data-testid="top-consumers">
                  {top.slice(0, 8).map(({ meter: m, energy }) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {m.label}
                        {energy!.calculated && <span className="badge ml-1 bg-energy-soft text-energy-dark">berechnet</span>}
                        {energy!.coverage < 0.95 && <span className="badge ml-1 bg-warn-soft text-warn">{Math.round(energy!.coverage * 100)} % Daten</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatEnergy(energy!.total)}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h3 className="section-title mb-2">Verbrauch nach Raum</h3>
                <ul className="space-y-1">
                  {rooms.map((r) => (
                    <li key={r.roomId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {project.rooms.find((x) => x.id === r.roomId)?.name}{" "}
                        <span className="text-xs text-ink-2">{r.complete ? "· Raumzähler" : `· erfasste Geräte (${r.meterIds.length})`}</span>
                      </span>
                      <span className="tabular-nums">{formatEnergy(r.value)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="section-title mb-2">Zählerhierarchie</h3>
                <ul data-testid="meter-tree">
                  <TreeRows nodes={tree} depth={0} unit="kWh" />
                </ul>
                <p className="mt-1 text-[11px] text-ink-2">Unterzähler sind in ihrem übergeordneten Zähler enthalten und werden nicht doppelt gezählt.</p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function EnergyView() {
  const project = useProject((s) => s.project);
  const [section, setSection] = useState<"overview" | "history" | "sources">("overview");
  const [collapsed, setCollapsed] = useState(false);
  const touch = useTouchLayout();
  if (!project) return null;
  return (
    <div
      className={clsx(
        "pointer-events-none absolute z-20 flex",
        touch ? "inset-x-0 bottom-[calc(5.2rem+env(safe-area-inset-bottom))] px-2" : "bottom-[calc(5.6rem+env(safe-area-inset-bottom))] left-4 top-[calc(4.6rem+env(safe-area-inset-top))]",
      )}
    >
      <section className={clsx("panel pointer-events-auto flex flex-col overflow-hidden", touch ? (collapsed ? "w-full" : "max-h-[62vh] w-full") : "w-[420px]")} aria-label="Energie" data-testid="energy-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Zap size={18} className="text-energy" />
          <Segmented
            label="Energieansicht"
            size="sm"
            value={section}
            onChange={(v) => {
              setSection(v);
              setCollapsed(false);
            }}
            options={[
              { value: "overview", label: "Jetzt" },
              { value: "history", label: "Verlauf" },
              { value: "sources", label: <><Settings2 size={13} /> Messquellen</> },
            ]}
          />
          {touch && (
            <button className="icon-btn ml-auto" aria-label={collapsed ? "Panel ausklappen" : "Haus zeigen"} onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <PanelBottomOpen size={18} /> : <PanelBottomClose size={18} />}
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="overflow-y-auto px-3 py-3">
            {section === "overview" && <Overview />}
            {section === "history" && <History />}
            {section === "sources" && <MeterSetup />}
          </div>
        )}
      </section>
      {!touch && (
        <p className="pointer-events-auto ml-3 mt-auto flex max-w-xs items-start gap-1.5 self-end rounded-xl bg-surface/90 px-3 py-2 text-[11px] text-ink-2 shadow-soft">
          <Info size={13} className="mt-0.5 shrink-0" /> Im Modell sind Räume mit gemessener Leistung violett eingefärbt – je kräftiger, desto mehr.
        </p>
      )}
    </div>
  );
}
