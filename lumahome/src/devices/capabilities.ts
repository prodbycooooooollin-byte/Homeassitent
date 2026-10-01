// Ableitung der tatsächlichen Fähigkeiten einer Entität aus ihren Attributen.
// Die Oberfläche zeigt ausschließlich Steuerungen, die das Gerät unterstützt.
import type { BindingRole } from "@/model/types";
import type { HaState } from "./ha-types";

export const domainOf = (entityId: string) => entityId.split(".")[0];

export type SensorQuantity = "temperature" | "humidity" | "co2" | "illuminance" | "power" | "energy" | "pm25" | "voc" | "pressure" | "other";

export type Capability =
  | { kind: "light"; brightness: boolean; colorTemp: { min: number; max: number } | null; color: boolean }
  | { kind: "switch"; isOutlet: boolean }
  | { kind: "cover"; open: boolean; close: boolean; stop: boolean; position: boolean }
  | { kind: "contact"; canTilt: boolean; deviceClass: string }
  | {
      kind: "climate";
      hvacModes: string[];
      target: { min: number; max: number; step: number } | null;
      canTurnOff: boolean;
    }
  | { kind: "sensor"; quantity: SensorQuantity; unit: string | null }
  | { kind: "unsupported" };

const COLOR_MODES = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);
const CONTACT_CLASSES = new Set(["door", "window", "opening", "garage_door"]);

export const CoverFeature = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 } as const;
export const ClimateFeature = { TARGET_TEMPERATURE: 1, TARGET_TEMPERATURE_RANGE: 2, TURN_OFF: 128, TURN_ON: 256 } as const;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function sensorQuantity(deviceClass: string | undefined, unit: string | null): SensorQuantity {
  switch (deviceClass) {
    case "temperature":
      return "temperature";
    case "humidity":
      return "humidity";
    case "carbon_dioxide":
      return "co2";
    case "illuminance":
      return "illuminance";
    case "power":
      return "power";
    case "energy":
      return "energy";
    case "pm25":
      return "pm25";
    case "volatile_organic_compounds":
    case "volatile_organic_compounds_parts":
      return "voc";
    case "pressure":
    case "atmospheric_pressure":
      return "pressure";
  }
  if (unit === "°C" || unit === "°F") return "temperature";
  if (unit && ["W", "kW", "MW"].includes(unit)) return "power";
  if (unit && ["Wh", "kWh", "MWh"].includes(unit)) return "energy";
  return "other";
}

export function capabilityOf(s: HaState): Capability {
  const domain = domainOf(s.entity_id);
  const a = s.attributes ?? {};
  const features = num(a.supported_features) ?? 0;
  switch (domain) {
    case "light": {
      const modes = Array.isArray(a.supported_color_modes) ? (a.supported_color_modes as string[]) : [];
      const brightness = modes.some((m) => m !== "onoff");
      const hasCt = modes.includes("color_temp");
      const min = num(a.min_color_temp_kelvin);
      const max = num(a.max_color_temp_kelvin);
      return {
        kind: "light",
        brightness,
        colorTemp: hasCt ? { min: min ?? 2200, max: max ?? 6500 } : null,
        color: modes.some((m) => COLOR_MODES.has(m)),
      };
    }
    case "switch":
      return { kind: "switch", isOutlet: a.device_class === "outlet" };
    case "cover":
      return {
        kind: "cover",
        open: (features & CoverFeature.OPEN) !== 0,
        close: (features & CoverFeature.CLOSE) !== 0,
        stop: (features & CoverFeature.STOP) !== 0,
        position: (features & CoverFeature.SET_POSITION) !== 0,
      };
    case "binary_sensor": {
      const dc = typeof a.device_class === "string" ? a.device_class : "";
      if (CONTACT_CLASSES.has(dc)) return { kind: "contact", canTilt: false, deviceClass: dc };
      return { kind: "sensor", quantity: "other", unit: null };
    }
    case "climate": {
      const hvacModes = Array.isArray(a.hvac_modes) ? (a.hvac_modes as string[]) : [];
      const target =
        (features & ClimateFeature.TARGET_TEMPERATURE) !== 0
          ? { min: num(a.min_temp) ?? 7, max: num(a.max_temp) ?? 30, step: num(a.target_temp_step) ?? 0.5 }
          : null;
      return { kind: "climate", hvacModes, target, canTurnOff: hvacModes.includes("off") };
    }
    case "sensor": {
      const unit = typeof a.unit_of_measurement === "string" ? a.unit_of_measurement : null;
      const dc = typeof a.device_class === "string" ? a.device_class : undefined;
      // Fensterkontakte mit Kippstellung (z. B. Griffsensoren) liefern Textzustände
      const options = Array.isArray(a.options) ? (a.options as string[]).map((o) => o.toLowerCase()) : [];
      if (dc === "enum" && options.some((o) => o === "tilted" || o === "gekippt")) return { kind: "contact", canTilt: true, deviceClass: "window" };
      return { kind: "sensor", quantity: sensorQuantity(dc, unit), unit };
    }
  }
  return { kind: "unsupported" };
}

export function roleForCapability(c: Capability): BindingRole | null {
  switch (c.kind) {
    case "light":
      return "light";
    case "switch":
      return "switch";
    case "cover":
      return "cover";
    case "contact":
      return "contact";
    case "climate":
      return "climate";
    case "sensor":
      return "sensor";
  }
  return null;
}

export function friendlyName(s: HaState | undefined, fallback: string): string {
  const n = s?.attributes?.friendly_name;
  return typeof n === "string" && n.trim() ? n : fallback;
}
