// Einheiten: Leistung (W) und Energie (kWh) werden strikt getrennt.

const POWER: Record<string, number> = { mW: 0.001, W: 1, kW: 1000, MW: 1e6, GW: 1e9 };
const ENERGY_KWH: Record<string, number> = {
  mWh: 1e-6, Wh: 0.001, kWh: 1, MWh: 1000, GWh: 1e6, J: 1 / 3.6e6, kJ: 1 / 3600, MJ: 1 / 3.6, GJ: 1000 / 3.6,
};

export const isPowerUnit = (u: string | null | undefined) => !!u && u in POWER;
export const isEnergyUnit = (u: string | null | undefined) => !!u && u in ENERGY_KWH;

/** Wert in Watt oder null, wenn die Einheit keine Leistungseinheit ist. */
export function toWatts(value: number | null, unit: string | null | undefined): number | null {
  if (value === null || !unit || !(unit in POWER)) return null;
  return value * POWER[unit];
}

/** Wert in kWh oder null, wenn die Einheit keine Energieeinheit ist. */
export function toKwh(value: number | null, unit: string | null | undefined): number | null {
  if (value === null || !unit || !(unit in ENERGY_KWH)) return null;
  return value * ENERGY_KWH[unit];
}

export function formatPower(w: number | null): string {
  if (w === null) return "–";
  const abs = Math.abs(w);
  if (abs >= 1000) return `${(w / 1000).toLocaleString("de-DE", { maximumFractionDigits: abs >= 10000 ? 1 : 2 })} kW`;
  return `${w.toLocaleString("de-DE", { maximumFractionDigits: abs < 10 ? 1 : 0 })} W`;
}

export function formatEnergy(kwh: number | null): string {
  if (kwh === null) return "–";
  const abs = Math.abs(kwh);
  if (abs < 1) return `${(kwh * 1000).toLocaleString("de-DE", { maximumFractionDigits: 0 })} Wh`;
  return `${kwh.toLocaleString("de-DE", { maximumFractionDigits: abs >= 100 ? 0 : abs >= 10 ? 1 : 2 })} kWh`;
}
