// Lädt Verbrauchsverläufe je Messpunkt aus der Datenquelle und wählt dabei
// die verlässlichste verfügbare Grundlage:
//   1. Energiezähler mit Langzeitstatistik (Summe, Rücksetzungen behandelt HA)
//   2. Energiezähler ohne Statistik → Zustandsverlauf mit eigener Rücksetzungserkennung
//   3. Nur Leistung mit Statistik → Integration der Mittelwerte (berechnet)
//   4. Nur Leistung ohne Statistik → Integration des Zustandsverlaufs (berechnet)
import type { EnergyMeter } from "@/model/types";
import type { HaHistory, HaStatisticMeta, HaStatistics } from "@/devices/ha-types";
import type { DeviceSource } from "@/sources/types";
import {
  fromCumulative,
  fromPowerSamples,
  fromStatisticsChange,
  fromStatisticsMeanPower,
  makeBuckets,
  meanPowerFromSamples,
  meanPowerSeries,
  rangeBounds,
  statPeriodFor,
  type BucketValue,
  type RangeKind,
  type Sample,
  type SeriesResult,
} from "./series";
import { toKwh, toWatts } from "./units";

export interface MeterHistory {
  meterId: string;
  energy: SeriesResult | null;
  /** Für Netto-Flüsse (Netz, Speicher): getrennt integrierte positive und negative Anteile in kWh */
  split: { positive: SeriesResult; negative: SeriesResult } | null;
  /** Mittlere Leistung je Bucket in W (für die Leistungskurve) */
  power: BucketValue[] | null;
  note: string | null;
}

export interface HistoryResult {
  range: RangeKind;
  anchor: number;
  buckets: { start: number; end: number }[];
  meters: Map<string, MeterHistory>;
  loadedAt: number;
}

function samplesOf(h: HaHistory, id: string, unitFactor: (v: number) => number | null): Sample[] {
  return (h[id] ?? []).map((p) => {
    const n = Number(p.s);
    return { t: p.lu * 1000, v: Number.isFinite(n) && p.s !== "" ? unitFactor(n) : null };
  });
}

const isNet = (m: EnergyMeter) => m.flow === "grid_net" || m.flow === "battery_net";

export async function loadHistory(
  source: DeviceSource,
  meters: EnergyMeter[],
  range: RangeKind,
  anchor: Date,
  statMeta: HaStatisticMeta[],
  units: Record<string, string | null>,
  now = Date.now(),
): Promise<HistoryResult> {
  const buckets = makeBuckets(range, anchor);
  const { start, end } = rangeBounds(range, anchor);
  const queryEnd = Math.min(end, now + 60_000);
  const meta = new Map(statMeta.map((m) => [m.statistic_id, m]));
  const period = statPeriodFor(range);

  const sumIds = new Set<string>();
  const meanIds = new Set<string>();
  const histIds = new Set<string>();
  for (const m of meters) {
    if (m.energyEntityId) {
      if (meta.get(m.energyEntityId)?.has_sum) sumIds.add(m.energyEntityId);
      else histIds.add(m.energyEntityId);
    }
    if (m.powerEntityId) {
      if (meta.get(m.powerEntityId)?.has_mean || meta.get(m.powerEntityId)?.mean_type) meanIds.add(m.powerEntityId);
      else histIds.add(m.powerEntityId);
    }
  }
  const [sumStats, meanStats, hist] = await Promise.all([
    sumIds.size ? source.statistics([...sumIds], start, queryEnd, period, ["change"]) : Promise.resolve({} as HaStatistics),
    meanIds.size ? source.statistics([...meanIds], start, queryEnd, period, ["mean"]) : Promise.resolve({} as HaStatistics),
    histIds.size ? source.history([...histIds], start, queryEnd) : Promise.resolve({} as HaHistory),
  ]);

  const out = new Map<string, MeterHistory>();
  for (const m of meters) {
    let energy: SeriesResult | null = null;
    let power: BucketValue[] | null = null;
    let note: string | null = null;
    let split: MeterHistory["split"] = null;
    if (m.powerEntityId) {
      const unit = meta.get(m.powerEntityId)?.statistics_unit_of_measurement ?? units[m.powerEntityId] ?? null;
      const f = toWatts(1, unit);
      if (f === null) note = `Leistungseinheit „${unit ?? "keine"}“ nicht auswertbar.`;
      else {
        const inv = m.invertPower ? -f : f;
        if (meanIds.has(m.powerEntityId)) power = meanPowerSeries(meanStats[m.powerEntityId] ?? [], buckets, inv, now);
        else power = meanPowerFromSamples(samplesOf(hist, m.powerEntityId, (v) => v * inv), buckets, now);
      }
    }
    if (m.energyEntityId) {
      const unit = meta.get(m.energyEntityId)?.statistics_unit_of_measurement ?? units[m.energyEntityId] ?? null;
      const f = toKwh(1, unit);
      if (f === null) note = `Energieeinheit „${unit ?? "keine"}“ nicht auswertbar.`;
      else if (sumIds.has(m.energyEntityId)) energy = fromStatisticsChange(sumStats[m.energyEntityId] ?? [], buckets, f, now);
      else energy = fromCumulative(samplesOf(hist, m.energyEntityId, (v) => v), buckets, f, now);
    } else if (m.powerEntityId) {
      const unit = meta.get(m.powerEntityId)?.statistics_unit_of_measurement ?? units[m.powerEntityId] ?? null;
      const f = toWatts(1, unit);
      if (f !== null) {
        const inv = m.invertPower ? -f : f;
        const integrate = (sign: "all" | "positive" | "negative") =>
          meanIds.has(m.powerEntityId!)
            ? fromStatisticsMeanPower(meanStats[m.powerEntityId!] ?? [], buckets, inv, sign, now)
            : fromPowerSamples(samplesOf(hist, m.powerEntityId!, (v) => v * inv), buckets, sign, now);
        if (isNet(m)) {
          // Netto-Leistung darf nicht saldiert werden: Bezug und Einspeisung getrennt integrieren
          split = { positive: integrate("positive"), negative: integrate("negative") };
          note = "Bezug und Einspeisung bzw. Laden und Entladen aus Netto-Leistung getrennt berechnet.";
        } else energy = integrate("all");
      }
    }
    out.set(m.id, { meterId: m.id, energy, split, power, note });
  }
  return { range, anchor: anchor.getTime(), buckets, meters: out, loadedAt: now };
}

/** Wertetabelle (kWh im Zeitraum) für die Aggregation. */
export function periodValues(h: HistoryResult): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const [id, mh] of h.meters) if (mh.energy) out.set(id, mh.energy.total);
  return out;
}

/** Getrennte Anteile von Netto-Flüssen im Zeitraum. */
export function periodSplits(h: HistoryResult): Map<string, { positive: number | null; negative: number | null }> {
  const out = new Map<string, { positive: number | null; negative: number | null }>();
  for (const [id, mh] of h.meters) if (mh.split) out.set(id, { positive: mh.split.positive.total, negative: mh.split.negative.total });
  return out;
}

/** Wertetabelle für einen einzelnen Bucket. */
export function bucketValues(h: HistoryResult, index: number): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const [id, mh] of h.meters) if (mh.energy) out.set(id, mh.energy.buckets[index]?.value ?? null);
  return out;
}
