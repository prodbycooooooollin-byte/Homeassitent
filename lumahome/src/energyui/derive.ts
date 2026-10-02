// Ableitungen für die Energieansicht (Haus-, Raum- und Gerätewerte je Zeitraum).
import type { EnergyMeter, Project } from "@/model/types";
import { houseConsumption, leafConsumers, roomAggregates, flowValues, type Consumption } from "@/energy/aggregate";
import { bucketSplits, bucketValues, periodSplits, periodValues, type HistoryResult } from "@/energy/history";
import type { BucketValue } from "@/energy/series";

export interface PeriodSummary {
  house: Consumption;
  series: BucketValue[];
  calculated: boolean;
  flows: ReturnType<typeof flowValues>;
}

export function summarize(project: Project, h: HistoryResult): PeriodSummary {
  const meters = project.meters;
  const values = periodValues(h);
  const splits = periodSplits(h);
  const house = houseConsumption(meters, values, project.settings.noLocalGeneration, splits);
  const base = firstEnergySeries(h);
  const series: BucketValue[] = (base ?? []).map((b, i) => {
    const c = houseConsumption(meters, bucketValues(h, i), project.settings.noLocalGeneration, bucketSplits(h, i));
    const involved = involvedMeters(meters, house.basis);
    const cov = involved.map((m) => h.meters.get(m.id)?.energy?.buckets[i] ?? h.meters.get(m.id)?.split?.positive.buckets[i]).filter(Boolean) as BucketValue[];
    return {
      ...b,
      value: c.value,
      coverage: cov.length ? Math.min(...cov.map((x) => x.coverage)) : 0,
      catchUp: cov.some((x) => x.catchUp),
      reset: cov.some((x) => x.reset),
    };
  });
  const calculated = involvedMeters(meters, house.basis).some((m) => h.meters.get(m.id)?.energy?.calculated || h.meters.get(m.id)?.split);
  return { house, series, calculated: calculated || house.basis === "calculated_flows", flows: flowValues(meters, values, splits) };
}

function firstEnergySeries(h: HistoryResult): BucketValue[] | null {
  for (const mh of h.meters.values()) {
    if (mh.energy) return mh.energy.buckets;
    if (mh.split) return mh.split.positive.buckets;
  }
  return null;
}

function involvedMeters(meters: EnergyMeter[], basis: Consumption["basis"]): EnergyMeter[] {
  if (basis === "house_meter") return meters.filter((m) => m.isHouseMain);
  if (basis === "calculated_flows" || basis === "grid_only") return meters.filter((m) => m.flow !== "consumption");
  return meters.filter((m) => m.flow === "consumption" && !m.isHouseMain);
}

export function topConsumers(project: Project, h: HistoryResult) {
  return leafConsumers(project.meters)
    .map((m) => ({ meter: m, energy: h.meters.get(m.id)?.energy ?? null }))
    .filter((x) => x.energy)
    .sort((a, b) => (b.energy!.total ?? -1) - (a.energy!.total ?? -1));
}

export function roomPeriod(project: Project, h: HistoryResult) {
  return roomAggregates(project, periodValues(h));
}

export const FLOW_LABEL: Record<EnergyMeter["flow"], string> = {
  consumption: "Verbrauch",
  grid_import: "Netzbezug",
  grid_export: "Einspeisung",
  grid_net: "Netz (Saldo: + Bezug / − Einspeisung)",
  pv_production: "PV-Erzeugung",
  battery_charge: "Speicher laden",
  battery_discharge: "Speicher entladen",
  battery_net: "Speicher (Saldo: + Entladen / − Laden)",
};
