// Momentanwerte der Messpunkte aus aktuellen Zuständen.
import type { EnergyMeter } from "@/model/types";
import type { HaState } from "@/devices/ha-types";
import { freshness, numericState } from "@/devices/state";
import type { Values } from "./aggregate";
import { isEnergyUnit, isPowerUnit, toWatts } from "./units";

export interface SourceCheck {
  ok: boolean;
  problems: string[];
  unit: string | null;
}

/** Prüft Einheit, Geräteklasse und Zustandsklasse einer Messquelle. */
export function checkSource(s: HaState | undefined, quantity: "power" | "energy"): SourceCheck {
  if (!s) return { ok: false, problems: ["Entität nicht gefunden."], unit: null };
  const a = s.attributes ?? {};
  const unit = typeof a.unit_of_measurement === "string" ? a.unit_of_measurement : null;
  const problems: string[] = [];
  if (quantity === "power") {
    if (!isPowerUnit(unit)) problems.push(`Einheit „${unit ?? "keine"}“ ist keine Leistungseinheit (W, kW).`);
    if (a.device_class && a.device_class !== "power") problems.push(`Geräteklasse „${String(a.device_class)}“ ist keine Leistung.`);
  } else {
    if (!isEnergyUnit(unit)) problems.push(`Einheit „${unit ?? "keine"}“ ist keine Energieeinheit (Wh, kWh).`);
    if (a.device_class && a.device_class !== "energy") problems.push(`Geräteklasse „${String(a.device_class)}“ ist keine Energie.`);
    if (a.state_class && a.state_class !== "total" && a.state_class !== "total_increasing") {
      problems.push("Zustandsklasse ist kein Zählerstand (erwartet: total oder total_increasing).");
    }
  }
  return { ok: problems.length === 0, problems, unit };
}

export interface LiveMeterValue {
  watts: number | null;
  reason: string | null;
}

export function livePower(meter: EnergyMeter, states: Record<string, HaState>, connected: boolean, now = Date.now()): LiveMeterValue | undefined {
  if (!meter.powerEntityId) return undefined;
  const s = states[meter.powerEntityId];
  const f = freshness(s, connected, now);
  if (f.availability !== "ok") return { watts: null, reason: f.reason };
  const unit = typeof s!.attributes.unit_of_measurement === "string" ? (s!.attributes.unit_of_measurement as string) : null;
  const w = toWatts(numericState(s), unit);
  if (w === null) return { watts: null, reason: isPowerUnit(unit) ? "Kein Zahlenwert" : `Einheit „${unit ?? "keine"}“ ist keine Leistung` };
  return { watts: meter.invertPower ? -w : w, reason: null };
}

export function livePowerValues(meters: EnergyMeter[], states: Record<string, HaState>, connected: boolean): Values {
  const out: Values = new Map();
  for (const m of meters) {
    const v = livePower(m, states, connected);
    if (v !== undefined) out.set(m.id, v.watts);
  }
  return out;
}
