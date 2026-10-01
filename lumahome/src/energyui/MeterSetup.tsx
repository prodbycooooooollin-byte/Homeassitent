// Zuordnung von Leistungs- und Energiezählern mit Prüfung von Einheit,
// Messrichtung und Bedeutung sowie einer eindeutigen Zählerhierarchie.
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { EnergyMeter, MeterFlow } from "@/model/types";
import { useProject } from "@/store/project";
import { useUi } from "@/store/ui";
import { isConnected, useLive } from "@/store/live";
import { checkSource, livePower } from "@/energy/live";
import { formatPower } from "@/energy/units";
import { ancestors, wouldCreateCycle } from "@/energy/aggregate";
import { friendlyName } from "@/devices/capabilities";
import { newId } from "@/model/ids";
import { Dialog, Notice, TextField } from "@/ui/primitives";
import { FLOW_LABEL } from "./derive";
import { isEnergyUnit, isPowerUnit } from "@/energy/units";
import type { HaEnergyPrefs } from "@/devices/ha-types";

const FLOW_HELP: Record<MeterFlow, string> = {
  consumption: "Verbraucher, Stromkreis oder Hauszähler (Verbrauch im Haus).",
  grid_import: "Zähler für Strom aus dem Netz.",
  grid_export: "Zähler für ins Netz eingespeisten Strom.",
  grid_net: "Ein Sensor mit Vorzeichen: positiv = Bezug, negativ = Einspeisung.",
  pv_production: "Erzeugung der Photovoltaikanlage.",
  battery_charge: "Ladeleistung/-energie des Speichers.",
  battery_discharge: "Entladeleistung/-energie des Speichers.",
  battery_net: "Ein Sensor mit Vorzeichen: positiv = Entladen ins Haus, negativ = Laden.",
};

function EntityPicker({ label, value, onChange, quantity }: { label: string; value: string | null; onChange: (v: string | null) => void; quantity: "power" | "energy" }) {
  const states = useLive((s) => s.states);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const qq = q.toLowerCase();
    return Object.values(states)
      .filter((s) => s.entity_id.startsWith("sensor."))
      .filter((s) => {
        const u = s.attributes.unit_of_measurement as string | undefined;
        return quantity === "power" ? isPowerUnit(u) : isEnergyUnit(u);
      })
      .filter((s) => !qq || s.entity_id.includes(qq) || friendlyName(s, "").toLowerCase().includes(qq))
      .slice(0, 40);
  }, [states, q, quantity]);
  const check = value ? checkSource(states[value], quantity) : null;
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2">
        <button className="input flex items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className={clsx("truncate", !value && "text-ink-3")}>{value ? `${friendlyName(states[value], value)} (${value})` : "Keine – auswählen"}</span>
        </button>
        {value && (
          <button className="icon-btn" aria-label={`${label} entfernen`} onClick={() => onChange(null)}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {check && (
        <p className={clsx("mt-1 flex items-start gap-1 text-xs", check.ok ? "text-sage-dark" : "text-warn")}>
          {check.ok ? <CheckCircle2 size={13} className="mt-0.5" /> : <AlertTriangle size={13} className="mt-0.5" />}
          {check.ok ? `Einheit ${check.unit} passt.` : check.problems.join(" ")}
        </p>
      )}
      {open && (
        <div className="mt-2 rounded-2xl border border-line p-2">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Sensoren mit ${quantity === "power" ? "W/kW" : "Wh/kWh"} suchen`} aria-label="Sensor suchen" autoFocus />
          </label>
          <ul className="mt-2 max-h-48 overflow-y-auto">
            {list.map((s) => (
              <li key={s.entity_id}>
                <button
                  className="w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    onChange(s.entity_id);
                    setOpen(false);
                  }}
                >
                  <span className="block truncate">{friendlyName(s, s.entity_id)}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {s.entity_id} · {s.state} {String(s.attributes.unit_of_measurement ?? "")}
                    {s.attributes.state_class ? ` · ${String(s.attributes.state_class)}` : ""}
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-2 py-3 text-sm text-ink-2">Keine passenden Sensoren.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function MeterDialog({ meter, onClose }: { meter: EnergyMeter; onClose: () => void }) {
  const project = useProject((s) => s.project)!;
  const apply = useProject((s) => s.apply);
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  const [m, setM] = useState<EnergyMeter>(meter);
  const isNew = !project.meters.some((x) => x.id === meter.id);
  const consumers = project.meters.filter((x) => x.flow === "consumption" && x.id !== m.id && !wouldCreateCycle([...project.meters.filter((y) => y.id !== m.id), m], m.id, x.id));
  const preview = m.powerEntityId ? livePower(m, states, connected) : undefined;
  const otherMain = project.meters.find((x) => x.isHouseMain && x.id !== m.id);
  const valid = m.label.trim() && (m.powerEntityId || m.energyEntityId);
  const save = () => {
    apply((p) => {
      let meters = isNew ? [...p.meters, m] : p.meters.map((x) => (x.id === m.id ? m : x));
      if (m.isHouseMain) meters = meters.map((x) => (x.id !== m.id && x.isHouseMain ? { ...x, isHouseMain: false } : x));
      return { ...p, meters };
    });
    onClose();
  };
  return (
    <Dialog
      open
      wide
      title={isNew ? "Messpunkt hinzufügen" : `Messpunkt „${meter.label}“`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-primary" disabled={!valid} onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Bezeichnung" value={m.label} onCommit={(label) => setM({ ...m, label })} maxLength={80} />
        <div>
          <label className="label" htmlFor="flow">
            Bedeutung
          </label>
          <select id="flow" className="input" value={m.flow} onChange={(e) => setM({ ...m, flow: e.target.value as MeterFlow, isHouseMain: e.target.value === "consumption" ? m.isHouseMain : false, parentId: e.target.value === "consumption" ? m.parentId : null })}>
            {(Object.keys(FLOW_LABEL) as MeterFlow[]).map((f) => (
              <option key={f} value={f}>
                {FLOW_LABEL[f]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-2">{FLOW_HELP[m.flow]}</p>
        </div>
        <EntityPicker label="Leistung (W) – momentan" value={m.powerEntityId} onChange={(powerEntityId) => setM({ ...m, powerEntityId })} quantity="power" />
        <EntityPicker label="Energie (kWh) – Zählerstand" value={m.energyEntityId} onChange={(energyEntityId) => setM({ ...m, energyEntityId })} quantity="energy" />
      </div>
      {m.powerEntityId && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-sage" checked={m.invertPower} onChange={(e) => setM({ ...m, invertPower: e.target.checked })} />
            Messrichtung umkehren
          </label>
          <span className="text-ink-2">
            Aktuell nach Umrechnung: <strong className="tabular-nums text-ink">{preview?.watts === null ? preview.reason : formatPower(preview?.watts ?? null)}</strong>
            {(m.flow === "grid_net" || m.flow === "battery_net") && preview?.watts !== null && preview?.watts !== undefined && (
              <> → {m.flow === "grid_net" ? (preview.watts >= 0 ? "Bezug" : "Einspeisung") : preview.watts >= 0 ? "Entladen" : "Laden"}</>
            )}
          </span>
        </div>
      )}
      {!m.energyEntityId && m.powerEntityId && <p className="mt-2 text-xs text-ink-2">Ohne Energiezähler wird der Verbrauch im Verlauf aus der Leistung berechnet und als „berechnet“ gekennzeichnet.</p>}
      {m.flow === "consumption" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-sage" checked={m.isHouseMain} onChange={(e) => setM({ ...m, isHouseMain: e.target.checked, parentId: e.target.checked ? null : m.parentId })} />
            Hauszähler (gesamter Hausverbrauch)
          </label>
          {otherMain && m.isHouseMain && <Notice tone="warn">„{otherMain.label}“ ist bisher Hauszähler und wird ersetzt.</Notice>}
          {!m.isHouseMain && (
            <div>
              <label className="label" htmlFor="parent">
                Enthalten in (übergeordneter Zähler)
              </label>
              <select id="parent" className="input" value={m.parentId ?? ""} onChange={(e) => setM({ ...m, parentId: e.target.value || null })}>
                <option value="">– keinem (eigenständig) –</option>
                {consumers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.isHouseMain ? " (Hauszähler)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-2">Verhindert Doppelzählung: Dieser Verbrauch steckt bereits im gewählten Zähler.</p>
            </div>
          )}
          <div>
            <label className="label" htmlFor="room">
              Raum
            </label>
            <select id="room" className="input" value={m.roomId ?? ""} onChange={(e) => setM({ ...m, roomId: e.target.value || null, coversWholeRoom: e.target.value ? m.coversWholeRoom : false })}>
              <option value="">– aus Objekt ableiten / keiner –</option>
              {project.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({project.floors.find((f) => f.id === r.floorId)?.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="item">
              Objekt im Haus
            </label>
            <select id="item" className="input" value={m.itemId ?? ""} onChange={(e) => setM({ ...m, itemId: e.target.value || null })}>
              <option value="">– keines –</option>
              {project.items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>
          {m.roomId && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-5 w-5 accent-sage" checked={m.coversWholeRoom} onChange={(e) => setM({ ...m, coversWholeRoom: e.target.checked })} />
              Misst den gesamten Raum (z. B. eigener Stromkreis) – sonst gilt der Wert nur als „erfasste Geräte“
            </label>
          )}
        </div>
      )}
    </Dialog>
  );
}

function blankMeter(): EnergyMeter {
  return { id: newId("meter"), label: "", flow: "consumption", powerEntityId: null, energyEntityId: null, invertPower: false, isHouseMain: false, roomId: null, itemId: null, parentId: null, coversWholeRoom: false };
}

/** Vorschläge aus der Energie-Konfiguration von Home Assistant. */
function proposalsFromPrefs(prefs: HaEnergyPrefs, existing: EnergyMeter[], name: (id: string) => string): EnergyMeter[] {
  const known = new Set(existing.flatMap((m) => [m.energyEntityId, m.powerEntityId]).filter(Boolean));
  const out: EnergyMeter[] = [];
  const add = (flow: MeterFlow, energyEntityId: string, label: string, extra: Partial<EnergyMeter> = {}) => {
    if (!energyEntityId || known.has(energyEntityId) || !/^sensor\./.test(energyEntityId)) return;
    known.add(energyEntityId);
    out.push({ ...blankMeter(), flow, energyEntityId, label, ...extra });
  };
  for (const src of prefs.energy_sources ?? []) {
    if (src.type === "grid") {
      src.flow_from?.forEach((f) => add("grid_import", f.stat_energy_from, `Netzbezug (${name(f.stat_energy_from)})`));
      src.flow_to?.forEach((f) => add("grid_export", f.stat_energy_to, `Einspeisung (${name(f.stat_energy_to)})`));
    }
    if (src.type === "solar" && src.stat_energy_from) add("pv_production", src.stat_energy_from, "Photovoltaik");
    if (src.type === "battery") {
      if (src.stat_energy_from) add("battery_discharge", src.stat_energy_from, "Speicher entladen");
      if (src.stat_energy_to) add("battery_charge", src.stat_energy_to, "Speicher laden");
    }
  }
  for (const d of prefs.device_consumption ?? []) add("consumption", d.stat_consumption, d.name || name(d.stat_consumption));
  // Hierarchie aus „included_in_stat“
  const all = [...existing, ...out];
  for (const d of prefs.device_consumption ?? []) {
    if (!d.included_in_stat) continue;
    const child = out.find((m) => m.energyEntityId === d.stat_consumption);
    const parent = all.find((m) => m.energyEntityId === d.included_in_stat);
    if (child && parent) child.parentId = parent.id;
  }
  return out;
}

export function MeterSetup() {
  const project = useProject((s) => s.project)!;
  const apply = useProject((s) => s.apply);
  const canEdit = useProject((s) => s.canEdit);
  const states = useLive((s) => s.states);
  const source = useLive((s) => s.source);
  const connected = useLive((s) => isConnected(s.status));
  const toast = useUi((s) => s.toast);
  const [edit, setEdit] = useState<EnergyMeter | null>(null);
  const [proposals, setProposals] = useState<EnergyMeter[] | null>(null);
  const meters = project.meters;
  const flows = meters.filter((m) => m.flow !== "consumption" || m.isHouseMain);
  const consumers = meters.filter((m) => m.flow === "consumption" && !m.isHouseMain).sort((a, b) => ancestors(meters, a).length - ancestors(meters, b).length || a.label.localeCompare(b.label, "de"));
  const hasPvOrBattery = meters.some((m) => m.flow.startsWith("pv") || m.flow.startsWith("battery"));

  const loadPrefs = async () => {
    try {
      const prefs = await source?.energyPrefs();
      if (!prefs) return toast("Home Assistant hat keine Energie-Konfiguration geliefert.", "info");
      const p = proposalsFromPrefs(prefs, meters, (id) => friendlyName(states[id], id));
      if (!p.length) toast("Alle Quellen aus der Energie-Konfiguration sind bereits zugeordnet.", "info");
      else setProposals(p);
    } catch (e) {
      toast(`Energie-Konfiguration nicht lesbar: ${(e as Error).message}`, "error");
    }
  };

  const row = (m: EnergyMeter) => {
    const live = livePower(m, states, connected);
    const problems = [m.powerEntityId && checkSource(states[m.powerEntityId], "power"), m.energyEntityId && checkSource(states[m.energyEntityId], "energy")].filter((c) => c && !c.ok) as ReturnType<typeof checkSource>[];
    const depth = ancestors(meters, m).filter((a) => !a.isHouseMain).length;
    return (
      <li key={m.id} className="rounded-2xl border border-line bg-surface px-3 py-2" style={{ marginLeft: depth * 14 }}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {m.label} {m.isHouseMain && <span className="badge bg-sage-soft text-sage-dark">Hauszähler</span>}
            </p>
            <p className="truncate text-xs text-ink-2">
              {FLOW_LABEL[m.flow]}
              {m.parentId ? ` · in ${meters.find((x) => x.id === m.parentId)?.label}` : ""}
              {m.roomId ? ` · ${project.rooms.find((r) => r.id === m.roomId)?.name}` : ""}
            </p>
            <p className="truncate text-xs text-ink-2">
              {m.powerEntityId ? `W: ${m.powerEntityId}` : "keine Leistung"} · {m.energyEntityId ? `kWh: ${m.energyEntityId}` : "kein Zähler (berechnet)"}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-energy-dark">{live ? (live.watts === null ? "–" : formatPower(live.watts)) : ""}</span>
          {canEdit && (
            <>
              <button className="icon-btn h-9 w-9" aria-label={`${m.label} bearbeiten`} onClick={() => setEdit(m)}>
                <Pencil size={15} />
              </button>
              <button
                className="icon-btn h-9 w-9 text-danger"
                aria-label={`${m.label} entfernen`}
                onClick={() => apply((p) => ({ ...p, meters: p.meters.filter((x) => x.id !== m.id).map((x) => (x.parentId === m.id ? { ...x, parentId: m.parentId } : x)) }))}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
        {problems.length > 0 && (
          <p className="mt-1 flex items-start gap-1 text-xs text-warn">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {problems.flatMap((p) => p.problems).join(" ")}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setEdit(blankMeter())} data-testid="add-meter">
            <Plus size={16} /> Messpunkt
          </button>
          <button className="btn-secondary" onClick={loadPrefs} disabled={!connected}>
            <Download size={16} /> Aus HA-Energiekonfiguration
          </button>
        </div>
      )}
      <section>
        <h3 className="section-title mb-2">Haus & Energieflüsse</h3>
        {flows.length === 0 && <p className="text-sm text-ink-2">Noch keine Messquelle zugeordnet.</p>}
        <ul className="space-y-1.5">{flows.map(row)}</ul>
        {meters.some((m) => m.flow.startsWith("grid")) && !hasPvOrBattery && !meters.some((m) => m.isHouseMain) && (
          <label className="mt-2 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-sage" disabled={!canEdit} checked={project.settings.noLocalGeneration} onChange={(e) => apply((p) => ({ ...p, settings: { ...p.settings, noLocalGeneration: e.target.checked } }))} />
            <span>
              Es gibt keine PV-Anlage und keinen Speicher.
              <span className="block text-xs text-ink-2">Nur dann darf der Netzbezug als Hausverbrauch angezeigt werden.</span>
            </span>
          </label>
        )}
      </section>
      <section>
        <h3 className="section-title mb-2">Verbraucher & Stromkreise</h3>
        {consumers.length === 0 && <p className="text-sm text-ink-2">Noch keine Geräte mit Messung.</p>}
        <ul className="space-y-1.5" data-testid="meter-list">{consumers.map(row)}</ul>
      </section>
      {edit && <MeterDialog meter={edit} onClose={() => setEdit(null)} />}
      {proposals && (
        <Dialog
          open
          title="Aus Home Assistant übernehmen"
          onClose={() => setProposals(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setProposals(null)}>
                Abbrechen
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  apply((p) => ({ ...p, meters: [...p.meters, ...proposals] }));
                  toast(`${proposals.length} Messpunkt(e) übernommen. Bitte Räume und Objekte ergänzen.`, "success");
                  setProposals(null);
                }}
              >
                {proposals.length} übernehmen
              </button>
            </>
          }
        >
          <ul className="space-y-1 text-sm">
            {proposals.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.label}</span>
                <span className="text-xs text-ink-2">{FLOW_LABEL[p.flow]}</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}
