// Steuerelemente je Gerätefähigkeit. Es werden nur unterstützte Funktionen
// angezeigt; Aktionen erfolgen ausschließlich über ausdrücklich bediente
// Schalter, Regler und Schaltflächen.
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Minus, Plus, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import type { BoundDevice } from "@/devices/view";
import { HVAC_ACTION_LABELS, HVAC_LABELS, climateView, contactView, coverView, formatNumber, lightView, numericState, stateSummary } from "@/devices/state";
import { useLive, isConnected, type PendingCommand } from "@/store/live";
import { Segmented, Slider, Switch } from "@/ui/primitives";
import { formatPower } from "@/energy/units";

export function relTime(ts: number | null): string {
  if (!ts) return "unbekannt";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "gerade eben";
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function StatusLine({ device, pending }: { device: BoundDevice; pending?: PendingCommand }) {
  const dismiss = useLive((s) => s.dismissPending);
  if (pending) {
    if (pending.phase === "sending" || pending.phase === "waiting")
      return (
        <p className="flex items-center gap-1.5 text-xs text-ink-2" data-testid="pending">
          <Loader2 size={13} className="spin" />
          {pending.phase === "sending" ? `${pending.label} – wird gesendet …` : `${pending.label} – warte auf Bestätigung …`}
        </p>
      );
    return (
      <p className={clsx("flex items-start gap-1.5 text-xs", pending.phase === "failed" ? "text-danger" : "text-warn")} role="alert">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span className="flex-1">
          {pending.phase === "failed" ? `${pending.label} fehlgeschlagen: ${pending.error}` : `${pending.label}: keine Rückmeldung erhalten. Angezeigt wird der zuletzt bestätigte Zustand.`}
        </span>
        <button onClick={() => dismiss(device.binding.entityId)} aria-label="Hinweis ausblenden" className="rounded p-0.5 hover:bg-surface-2">
          <X size={13} />
        </button>
      </p>
    );
  }
  const f = device.freshness;
  if (f.availability !== "ok")
    return (
      <p className="flex items-center gap-1.5 text-xs text-warn" data-testid="availability">
        <AlertTriangle size={13} />
        {f.reason}
        {f.reportedAt && f.availability === "stale" ? ` (${relTime(f.reportedAt)})` : ""}
      </p>
    );
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-2" data-testid="confirmed">
      <CheckCircle2 size={13} className="text-sage" />
      Bestätigt · {relTime(Date.parse(device.state?.last_changed ?? "") || null)}
    </p>
  );
}

const COLOR_PRESETS: { label: string; rgb: [number, number, number] }[] = [
  { label: "Warmweiß", rgb: [255, 197, 143] },
  { label: "Koralle", rgb: [255, 128, 96] },
  { label: "Salbei", rgb: [150, 210, 170] },
  { label: "Himmel", rgb: [120, 170, 255] },
  { label: "Lavendel", rgb: [180, 140, 255] },
];

export function DeviceControl({ device, power, compact }: { device: BoundDevice; power?: { watts: number | null; reason: string | null } | null; compact?: boolean }) {
  const call = useLive((s) => s.call);
  const pending = useLive((s) => s.pending[device.binding.entityId]);
  const connected = useLive((s) => isConnected(s.status));
  const cap = device.capability;
  const s = device.state;
  const ok = device.freshness.availability === "ok" && connected;
  const busy = pending?.phase === "sending" || pending?.phase === "waiting";
  const id = device.binding.entityId;
  const domain = id.split(".")[0];
  const run = (service: string, label: string, data?: Record<string, unknown>) => void call({ domain, service, entityId: id, data }, label);

  let body: ReactNode = null;
  let headerControl: ReactNode = null;
  switch (cap.kind) {
    case "light": {
      const l = lightView(s);
      headerControl = <Switch checked={l.on} label={`${device.name} schalten`} disabled={!ok} busy={busy} onChange={(v) => run(v ? "turn_on" : "turn_off", v ? "Einschalten" : "Ausschalten")} />;
      if (!compact)
        body = (
          <div className="space-y-3">
            {cap.brightness && (
              <Slider
                label="Helligkeit"
                value={l.brightnessPct ?? 0}
                min={1}
                max={100}
                accent="lamp"
                disabled={!ok}
                format={(v) => `${v} %`}
                onCommit={(v) => run("turn_on", `Helligkeit ${v} %`, { brightness_pct: v })}
              />
            )}
            {cap.colorTemp && (
              <Slider
                label="Farbtemperatur"
                value={l.kelvin ?? Math.round((cap.colorTemp.min + cap.colorTemp.max) / 2)}
                min={cap.colorTemp.min}
                max={cap.colorTemp.max}
                step={100}
                disabled={!ok}
                format={(v) => `${v} K`}
                onCommit={(v) => run("turn_on", `Farbtemperatur ${v} K`, { color_temp_kelvin: v })}
              />
            )}
            {cap.color && (
              <div>
                <p className="label">Farbe</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.label}
                      disabled={!ok}
                      onClick={() => run("turn_on", `Farbe ${c.label}`, { rgb_color: c.rgb })}
                      className="h-9 w-9 rounded-full border border-line shadow-soft disabled:opacity-40"
                      style={{ background: `rgb(${c.rgb.join(",")})` }}
                      aria-label={`Farbe ${c.label}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            )}
            {!cap.brightness && <p className="text-xs text-ink-2">Diese Leuchte unterstützt nur Ein/Aus.</p>}
          </div>
        );
      break;
    }
    case "switch": {
      headerControl = (
        <Switch checked={s?.state === "on" ? true : s?.state === "off" ? false : null} label={`${device.name} schalten`} disabled={!ok} busy={busy} onChange={(v) => run(v ? "turn_on" : "turn_off", v ? "Einschalten" : "Ausschalten")} />
      );
      if (!compact)
        body =
          power === undefined ? null : power === null ? (
            <p className="text-xs text-ink-2">Keine Leistungsmessung zugeordnet – „An“ bedeutet keinen gemessenen Verbrauch.</p>
          ) : (
            <p className="text-sm">
              <span className="text-ink-2">Gemessene Leistung: </span>
              <span className="font-semibold tabular-nums text-energy-dark">{power.watts === null ? power.reason ?? "kein Wert" : formatPower(power.watts)}</span>
            </p>
          );
      break;
    }
    case "cover": {
      const c = coverView(s);
      body = (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {cap.open && (
              <button className="btn-secondary flex-1" disabled={!ok} onClick={() => run("open_cover", "Öffnen")}>
                <ChevronUp size={16} /> Öffnen
              </button>
            )}
            {cap.stop && (
              <button className="btn-secondary" disabled={!ok} onClick={() => run("stop_cover", "Stopp")} aria-label="Stopp">
                <Square size={14} /> Stopp
              </button>
            )}
            {cap.close && (
              <button className="btn-secondary flex-1" disabled={!ok} onClick={() => run("close_cover", "Schließen")}>
                <ChevronDown size={16} /> Schließen
              </button>
            )}
          </div>
          {cap.position && !compact && (
            <Slider label="Position (offen)" value={c.position ?? 0} min={0} max={100} step={5} disabled={!ok} format={(v) => `${v} %`} onCommit={(v) => run("set_cover_position", `Position ${v} %`, { position: v })} />
          )}
          {!cap.position && <p className="text-xs text-ink-2">Keine Positionsangabe verfügbar – nur Öffnen/Schließen.</p>}
        </div>
      );
      break;
    }
    case "contact": {
      const c = contactView(s);
      body = (
        <p className="text-xs text-ink-2">
          Reiner Kontaktsensor – zeigt nur den Zustand ({c === "open" ? "offen" : c === "tilted" ? "gekippt" : c === "closed" ? "geschlossen" : "unbekannt"}), keine Fernbedienung.
        </p>
      );
      break;
    }
    case "climate": {
      const v = climateView(s);
      const t = cap.target;
      body = (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xs text-ink-2">Ist</p>
              <p className="text-2xl font-semibold tabular-nums">{v.current !== null ? `${formatNumber(v.current, 1)} °C` : "–"}</p>
              {v.action && <p className="text-xs text-ink-2">{HVAC_ACTION_LABELS[v.action] ?? v.action}</p>}
            </div>
            {t && v.mode !== "off" && (
              <div className="flex items-center gap-1">
                <button className="icon-btn border border-line" aria-label="Sollwert senken" disabled={!ok || v.target === null} onClick={() => run("set_temperature", `Sollwert ${v.target! - t.step} °C`, { temperature: Math.max(t.min, (v.target ?? t.min) - t.step) })}>
                  <Minus size={16} />
                </button>
                <div className="w-20 text-center">
                  <p className="text-xs text-ink-2">Soll</p>
                  <p className="text-lg font-semibold tabular-nums">{v.target !== null ? `${formatNumber(v.target, 1)} °C` : "–"}</p>
                </div>
                <button className="icon-btn border border-line" aria-label="Sollwert erhöhen" disabled={!ok || v.target === null} onClick={() => run("set_temperature", `Sollwert ${v.target! + t.step} °C`, { temperature: Math.min(t.max, (v.target ?? t.min) + t.step) })}>
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>
          {cap.hvacModes.length > 1 && (
            <Segmented
              label="Betriebsart"
              size="sm"
              value={v.mode ?? ""}
              options={cap.hvacModes.map((m) => ({ value: m, label: HVAC_LABELS[m] ?? m }))}
              onChange={(m) => ok && run("set_hvac_mode", `Betriebsart ${HVAC_LABELS[m] ?? m}`, { hvac_mode: m })}
            />
          )}
          {!t && <p className="text-xs text-ink-2">Kein einstellbarer Sollwert.</p>}
        </div>
      );
      break;
    }
    case "sensor": {
      const n = numericState(s);
      body = <p className="text-lg font-semibold tabular-nums">{n !== null ? `${formatNumber(n)}${cap.unit ? ` ${cap.unit}` : ""}` : "Kein Messwert"}</p>;
      break;
    }
    default:
      body = <p className="text-xs text-ink-2">Dieser Gerätetyp wird noch nicht unterstützt.</p>;
  }

  return (
    <div className="space-y-2" data-testid={`device-${id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{device.name}</p>
          <p className="truncate text-xs text-ink-2" data-testid="state-summary">
            {stateSummary(cap, s)}
          </p>
        </div>
        {headerControl}
      </div>
      {body}
      <StatusLine device={device} pending={pending} />
    </div>
  );
}
