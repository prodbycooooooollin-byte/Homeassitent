// Normalisierte Zustandsdarstellung. Unterscheidet ausdrücklich zwischen
// gemessenem Wert, unbekanntem/nicht verfügbarem Zustand und veralteten Daten.
// Fehlende Werte werden NIE als 0 dargestellt.
import type { Capability } from "./capabilities";
import type { HaState } from "./ha-types";

export type Availability = "ok" | "unavailable" | "unknown" | "missing" | "stale";

/** Sensoren, deren letzte Meldung älter ist, gelten als veraltet (nur wenn last_reported vorliegt). */
export const SENSOR_STALE_MS = 3 * 60 * 60 * 1000;

export interface Freshness {
  availability: Availability;
  /** Zeitpunkt der letzten Meldung */
  reportedAt: number | null;
  reason: string | null;
}

export function freshness(s: HaState | undefined, connected: boolean, now = Date.now()): Freshness {
  if (!s) return { availability: "missing", reportedAt: null, reason: "Entität nicht gefunden" };
  const reportedAt = Date.parse(s.last_reported ?? s.last_updated) || null;
  if (!connected) return { availability: "stale", reportedAt, reason: "Verbindung getrennt – letzter bekannter Stand" };
  if (s.state === "unavailable") return { availability: "unavailable", reportedAt, reason: "Gerät nicht erreichbar" };
  if (s.state === "unknown") return { availability: "unknown", reportedAt, reason: "Zustand unbekannt" };
  if (s.last_reported && s.entity_id.startsWith("sensor.") && reportedAt && now - reportedAt > SENSOR_STALE_MS) {
    return { availability: "stale", reportedAt, reason: "Seit über 3 Stunden keine Meldung" };
  }
  return { availability: "ok", reportedAt, reason: null };
}

export function numericState(s: HaState | undefined): number | null {
  if (!s) return null;
  if (s.state === "unavailable" || s.state === "unknown" || s.state === "") return null;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : null;
}

export interface LightView {
  on: boolean | null;
  brightnessPct: number | null;
  kelvin: number | null;
  rgb: [number, number, number] | null;
}

export function lightView(s: HaState | undefined): LightView {
  if (!s || s.state === "unavailable" || s.state === "unknown") return { on: null, brightnessPct: null, kelvin: null, rgb: null };
  const a = s.attributes;
  const on = s.state === "on";
  const b = typeof a.brightness === "number" ? Math.round((a.brightness / 255) * 100) : null;
  const k = typeof a.color_temp_kelvin === "number" ? a.color_temp_kelvin : null;
  const rgb = Array.isArray(a.rgb_color) && a.rgb_color.length === 3 ? (a.rgb_color as [number, number, number]) : null;
  return { on, brightnessPct: on ? b : null, kelvin: on ? k : null, rgb: on ? rgb : null };
}

export type ContactState = "open" | "closed" | "tilted" | null;

export function contactView(s: HaState | undefined): ContactState {
  if (!s || s.state === "unavailable" || s.state === "unknown") return null;
  const v = s.state.toLowerCase();
  if (v === "on" || v === "open" || v === "offen" || v === "opened") return "open";
  if (v === "off" || v === "closed" || v === "geschlossen") return "closed";
  if (v === "tilted" || v === "gekippt") return "tilted";
  return null;
}

export interface CoverView {
  state: "open" | "closed" | "opening" | "closing" | null;
  position: number | null;
}

export function coverView(s: HaState | undefined): CoverView {
  if (!s || s.state === "unavailable" || s.state === "unknown") return { state: null, position: null };
  const st = ["open", "closed", "opening", "closing"].includes(s.state) ? (s.state as CoverView["state"]) : null;
  const pos = typeof s.attributes.current_position === "number" ? s.attributes.current_position : null;
  return { state: st, position: pos };
}

export interface ClimateView {
  mode: string | null;
  action: string | null;
  current: number | null;
  target: number | null;
  humidity: number | null;
}

export function climateView(s: HaState | undefined): ClimateView {
  if (!s || s.state === "unavailable" || s.state === "unknown") return { mode: null, action: null, current: null, target: null, humidity: null };
  const a = s.attributes;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    mode: s.state,
    action: typeof a.hvac_action === "string" ? a.hvac_action : null,
    current: n(a.current_temperature),
    target: n(a.temperature),
    humidity: n(a.current_humidity),
  };
}

export const HVAC_LABELS: Record<string, string> = {
  off: "Aus",
  heat: "Heizen",
  cool: "Kühlen",
  heat_cool: "Heizen/Kühlen",
  auto: "Automatik",
  dry: "Entfeuchten",
  fan_only: "Lüften",
};

export const HVAC_ACTION_LABELS: Record<string, string> = {
  heating: "heizt",
  cooling: "kühlt",
  idle: "im Leerlauf",
  off: "aus",
  drying: "entfeuchtet",
  fan: "lüftet",
  preheating: "heizt vor",
};

/** Kurzer, menschenlesbarer Zustand für Listen und Markierungen. */
export function stateSummary(cap: Capability, s: HaState | undefined): string {
  if (!s) return "Nicht gefunden";
  if (s.state === "unavailable") return "Nicht erreichbar";
  if (s.state === "unknown") return "Unbekannt";
  switch (cap.kind) {
    case "light": {
      const l = lightView(s);
      if (!l.on) return "Aus";
      return l.brightnessPct !== null ? `An · ${l.brightnessPct} %` : "An";
    }
    case "switch":
      return s.state === "on" ? "An" : s.state === "off" ? "Aus" : s.state;
    case "cover": {
      const c = coverView(s);
      const pos = c.position !== null ? ` · ${c.position} % offen` : "";
      const label = { open: "Offen", closed: "Geschlossen", opening: "Öffnet", closing: "Schließt" }[c.state ?? "open"];
      return c.state ? label + pos : s.state;
    }
    case "contact": {
      const c = contactView(s);
      return c === "open" ? "Offen" : c === "closed" ? "Geschlossen" : c === "tilted" ? "Gekippt" : s.state;
    }
    case "climate": {
      const c = climateView(s);
      const parts = [HVAC_LABELS[c.mode ?? ""] ?? c.mode ?? "?"];
      if (c.current !== null) parts.push(`${c.current.toFixed(1)} °C`);
      return parts.join(" · ");
    }
    case "sensor": {
      const n = numericState(s);
      return n === null ? s.state : `${formatNumber(n)}${cap.unit ? ` ${cap.unit}` : ""}`;
    }
  }
  return s.state;
}

export function formatNumber(n: number, digits?: number): string {
  const d = digits ?? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

/** Farbe eines eingeschalteten Lichts für die 3D-Darstellung. */
export function lightColor(l: LightView): string {
  if (l.rgb) {
    const [r, g, b] = l.rgb;
    return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;
  }
  return kelvinToHex(l.kelvin ?? 2900);
}

/** Näherung der Lichtfarbe einer Farbtemperatur (Tanner Helland). */
export function kelvinToHex(k: number): string {
  const t = Math.max(1000, Math.min(12000, k)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
