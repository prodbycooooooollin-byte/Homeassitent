// Kennzahlen für die Analyse: Autarkie, Eigenverbrauch, Ersparnis, CO₂.
// Alle Werte werden nur aus vorhandenen Messungen berechnet; fehlt eine
// Grundlage, ist der Wert null und der Grund wird mitgeliefert.
import type { Consumption, FlowValues } from "./aggregate";
import type { BucketValue } from "./series";

export interface Tariff {
  pricePerKwh: number;
  feedInPerKwh: number;
  co2PerKwh: number;
}

export interface Insights {
  consumption: number | null;
  autarky: number | null;
  autarkyReason: string | null;
  selfConsumption: number | null;
  selfConsumptionReason: string | null;
  /** Selbst genutzter PV-Strom (inkl. Umweg über den Speicher) in kWh */
  selfUsedPv: number | null;
  savings: number | null;
  feedInRevenue: number | null;
  gridCost: number | null;
  co2Avoided: number | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computeInsights(f: FlowValues, house: Consumption, t: Tariff): Insights {
  const consumption = house.basis === "tracked_devices" || house.basis === "none" ? null : house.value;
  let autarky: number | null = null;
  let autarkyReason: string | null = null;
  if (!f.hasGrid) autarkyReason = "Kein Netzzähler zugeordnet.";
  else if (consumption === null) autarkyReason = "Gesamtverbrauch des Hauses ist nicht bekannt (Hauszähler oder Netz/PV/Speicher fehlen).";
  else if (f.gridImport === null) autarkyReason = "Netzbezug liegt für den Zeitraum nicht vor.";
  else if (consumption <= 0) autarkyReason = "Kein Verbrauch im Zeitraum.";
  else autarky = clamp01(1 - f.gridImport / consumption);

  let selfConsumption: number | null = null;
  let selfConsumptionReason: string | null = null;
  let selfUsedPv: number | null = null;
  if (!f.hasPv) selfConsumptionReason = "Keine PV-Erzeugung zugeordnet.";
  else if (f.pv === null) selfConsumptionReason = "PV-Werte liegen für den Zeitraum nicht vor.";
  else if (!f.hasGrid || f.gridExport === null) selfConsumptionReason = "Einspeisung ist nicht bekannt.";
  else if (f.pv <= 0) selfConsumptionReason = "Keine PV-Erzeugung im Zeitraum.";
  else {
    selfUsedPv = Math.max(0, f.pv - f.gridExport);
    selfConsumption = clamp01(selfUsedPv / f.pv);
  }
  return {
    consumption,
    autarky,
    autarkyReason,
    selfConsumption,
    selfConsumptionReason,
    selfUsedPv,
    savings: selfUsedPv === null ? null : selfUsedPv * t.pricePerKwh,
    feedInRevenue: f.gridExport === null || !f.hasPv ? null : f.gridExport * t.feedInPerKwh,
    gridCost: f.gridImport === null ? null : f.gridImport * t.pricePerKwh,
    co2Avoided: selfUsedPv === null ? null : selfUsedPv * t.co2PerKwh,
  };
}

/**
 * Grundlast: 10-%-Quantil der stündlichen mittleren Leistung über vollständig
 * erfasste, abgeschlossene Stunden (mindestens 12). Ergebnis in W.
 */
export function baseLoad(hourly: BucketValue[], now = Date.now()): number | null {
  const vals = hourly
    .filter((b) => b.end <= now && b.value !== null && b.coverage >= 0.95 && b.end - b.start <= 3.7e6)
    .map((b) => (b.value! * 1000 * 3.6e6) / (b.end - b.start))
    .sort((a, b) => a - b);
  if (vals.length < 12) return null;
  return vals[Math.floor(vals.length * 0.1)];
}

/** Summe der ersten n Buckets (für faire Vergleiche laufender Zeiträume). */
export function partialSum(buckets: BucketValue[], n: number): number | null {
  const part = buckets.slice(0, n);
  if (!part.length || part.some((b) => b.value === null)) return null;
  return part.reduce((s, b) => s + (b.value ?? 0), 0);
}
