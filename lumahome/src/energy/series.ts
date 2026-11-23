// Zeitreihen: Zeiträume, Statistiken, Zählerstände und Leistungsintegration.
//
// Grundsätze:
// - Fehlende Daten bleiben null (Lücke) und werden nie mit 0 aufgefüllt.
// - Zählerstände: Sinkt ein Zählerstand deutlich, gilt das als Rücksetzung
//   bzw. Zählerwechsel; der neue Stand wird als Verbrauch seit dem Wechsel
//   gewertet. Kleine Rückgänge (Messrauschen) werden ignoriert.
// - Aus Leistung berechnete Energie ist als „berechnet“ gekennzeichnet. Für
//   Home-Assistant-Verläufe gilt ein Zustand bis zur nächsten Änderung
//   (Halteverfahren); „unavailable“/„unknown“ erzeugen eine Lücke.
import type { HaStatisticRow } from "@/devices/ha-types";

export type RangeKind = "day" | "week" | "month";

export interface Bucket {
  start: number;
  end: number;
}

export interface BucketValue extends Bucket {
  value: number | null;
  /** Anteil des Zeitraums mit Daten (0..1) */
  coverage: number;
  /** Enthält einen Nachholwert über eine Datenlücke hinweg */
  catchUp: boolean;
  /** Enthält eine Zählerrücksetzung */
  reset: boolean;
  /** Liegt (teilweise) in der Zukunft */
  future: boolean;
}

export interface SeriesResult {
  buckets: BucketValue[];
  total: number | null;
  /** Abdeckung über alle vergangenen Buckets */
  coverage: number;
  calculated: boolean;
  method: string;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function rangeBounds(kind: RangeKind, anchor: Date): Bucket {
  const s = startOfDay(anchor);
  if (kind === "day") {
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    return { start: s.getTime(), end: e.getTime() };
  }
  if (kind === "week") {
    const day = (s.getDay() + 6) % 7; // Montag = 0
    s.setDate(s.getDate() - day);
    const e = new Date(s);
    e.setDate(e.getDate() + 7);
    return { start: s.getTime(), end: e.getTime() };
  }
  s.setDate(1);
  const e = new Date(s);
  e.setMonth(e.getMonth() + 1);
  return { start: s.getTime(), end: e.getTime() };
}

/** Tagesansicht: Stunden; Woche und Monat: Tage (lokale Zeit, sommerzeitfest). */
export function makeBuckets(kind: RangeKind, anchor: Date): Bucket[] {
  const { start, end } = rangeBounds(kind, anchor);
  const out: Bucket[] = [];
  const cur = new Date(start);
  while (cur.getTime() < end) {
    const s = cur.getTime();
    if (kind === "day") cur.setHours(cur.getHours() + 1);
    else cur.setDate(cur.getDate() + 1);
    out.push({ start: s, end: Math.min(cur.getTime(), end) });
  }
  return out;
}

export const statPeriodFor = (kind: RangeKind): "hour" | "day" => (kind === "day" ? "hour" : "day");

function finish(buckets: BucketValue[], calculated: boolean, method: string, now: number): SeriesResult {
  const past = buckets.filter((b) => b.start < now);
  const vals = past.filter((b) => b.value !== null);
  let covered = 0;
  let span = 0;
  for (const b of past) {
    const dur = Math.min(b.end, now) - b.start;
    span += dur;
    covered += dur * b.coverage;
  }
  return {
    buckets,
    total: vals.length ? vals.reduce((s, b) => s + (b.value ?? 0), 0) : null,
    coverage: span ? covered / span : 0,
    calculated,
    method,
  };
}

const empty = (b: Bucket, now: number): BucketValue => ({ ...b, value: null, coverage: 0, catchUp: false, reset: false, future: b.end > now });

/**
 * Energie aus Home-Assistant-Langzeitstatistik („change“ je Periode, in der
 * Einheit der Statistik). HA berücksichtigt Zählerrücksetzungen bereits.
 */
export function fromStatisticsChange(rows: HaStatisticRow[], buckets: Bucket[], factor: number, now = Date.now()): SeriesResult {
  const out = buckets.map((b) => {
    const inB = rows.filter((r) => r.start >= b.start && r.start < b.end);
    const bv = empty(b, now);
    const valid = inB.filter((r) => typeof r.change === "number" && Number.isFinite(r.change));
    if (!valid.length) return bv;
    const dur = Math.min(b.end, now) - b.start;
    const covered = valid.reduce((s, r) => s + (r.end - r.start), 0);
    bv.value = valid.reduce((s, r) => s + (r.change as number), 0) * factor;
    bv.coverage = dur > 0 ? Math.min(1, covered / dur) : 0;
    return bv;
  });
  return finish(out, false, "Zählerstand (Langzeitstatistik)", now);
}

/** Energie aus mittlerer Leistung je Periode (Statistik „mean“, in W nach factor). Ergebnis in kWh. */
export function fromStatisticsMeanPower(
  rows: HaStatisticRow[],
  buckets: Bucket[],
  factor: number,
  sign: "all" | "positive" | "negative" = "all",
  now = Date.now(),
): SeriesResult {
  const out = buckets.map((b) => {
    const bv = empty(b, now);
    const inB = rows.filter((r) => r.start >= b.start && r.start < b.end && typeof r.mean === "number");
    if (!inB.length) return bv;
    let kwh = 0;
    let covered = 0;
    for (const r of inB) {
      let w = (r.mean as number) * factor;
      if (sign === "positive") w = Math.max(0, w);
      if (sign === "negative") w = Math.max(0, -w);
      const h = (r.end - r.start) / 3.6e6;
      kwh += (w * h) / 1000;
      covered += r.end - r.start;
    }
    const dur = Math.min(b.end, now) - b.start;
    bv.value = kwh;
    bv.coverage = dur > 0 ? Math.min(1, covered / dur) : 0;
    return bv;
  });
  return finish(out, true, "Berechnet aus Leistungsmittelwerten", now);
}

export interface Sample {
  t: number;
  v: number | null;
}

/** Relativer Rückgang, ab dem ein Zählerstand als zurückgesetzt gilt. */
export const RESET_DROP = 0.1;

/**
 * Energie je Bucket aus einem Zählerstandsverlauf (Rohzustände, Halteverfahren).
 * Ein Zählerstand gilt bis zur nächsten Änderung – ein unveränderter Stand
 * bedeutet „kein Verbrauch“, nicht „keine Daten“. Zeiten nach einem
 * nicht verfügbaren Zustand (null) sind Lücken. Der Verbrauch über eine Lücke
 * wird dem Bucket der nächsten gültigen Messung zugeordnet und als
 * Nachholwert markiert.
 */
export function fromCumulative(samples: Sample[], buckets: Bucket[], factor: number, now = Date.now()): SeriesResult {
  const pts = [...samples].sort((a, b) => a.t - b.t);
  const out = buckets.map((b) => empty(b, now));
  const idxOf = (t: number) => out.findIndex((b) => t >= b.start && t < b.end);
  let last: { t: number; v: number } | null = null;
  let gapSinceLast = false;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    // Abdeckung: von dieser Messung bis zur nächsten, sofern gültig
    const segEnd = Math.min(i + 1 < pts.length ? pts[i + 1].t : now, now);
    if (cur.v !== null && Number.isFinite(cur.v)) {
      for (const b of out) {
        const s = Math.max(cur.t, b.start);
        const e = Math.min(segEnd, b.end);
        if (e > s) {
          const dur = Math.min(b.end, now) - b.start;
          b.coverage = Math.min(1, b.coverage + (e - s) / dur);
          if (b.value === null) b.value = 0;
        }
      }
      if (last) {
        let delta = cur.v - last.v;
        let reset = false;
        if (delta < 0) {
          if (last.v > 0 && -delta / last.v > RESET_DROP) {
            delta = cur.v; // Rücksetzung/Zählerwechsel: neuer Stand seit dem Wechsel
            reset = true;
          } else delta = 0; // Messrauschen
        }
        const bi = idxOf(cur.t);
        if (bi >= 0) {
          const b = out[bi];
          b.value = (b.value ?? 0) + delta * factor;
          b.reset ||= reset;
          b.catchUp ||= gapSinceLast;
        }
      }
      last = { t: cur.t, v: cur.v };
      gapSinceLast = false;
    } else if (last) {
      gapSinceLast = true;
    }
  }
  return finish(out, false, "Zählerstand (Verlauf)", now);
}

/**
 * Energie (kWh) aus einem Leistungsverlauf in W (Halteverfahren).
 * Ein Zustand gilt bis zur nächsten Änderung, höchstens bis `now`.
 * null-Werte (nicht verfügbar/unbekannt) beenden den gültigen Abschnitt.
 */
export function fromPowerSamples(
  samples: Sample[],
  buckets: Bucket[],
  sign: "all" | "positive" | "negative" = "all",
  now = Date.now(),
): SeriesResult {
  const pts = [...samples].sort((a, b) => a.t - b.t);
  const out = buckets.map((b) => empty(b, now));
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    if (cur.v === null) continue;
    let w = cur.v;
    if (sign === "positive") w = Math.max(0, w);
    if (sign === "negative") w = Math.max(0, -w);
    const segStart = cur.t;
    const segEnd = Math.min(i + 1 < pts.length ? pts[i + 1].t : now, now);
    if (segEnd <= segStart) continue;
    for (const b of out) {
      const s = Math.max(segStart, b.start);
      const e = Math.min(segEnd, b.end);
      if (e <= s) continue;
      b.value = (b.value ?? 0) + (w * (e - s)) / 3.6e6 / 1000;
      const dur = Math.min(b.end, now) - b.start;
      b.coverage = Math.min(1, b.coverage + (e - s) / dur);
    }
  }
  return finish(out, true, "Berechnet aus Leistungsverlauf", now);
}

/** Mittlere Leistung (W) je Bucket aus Statistik-Mittelwerten – für die Leistungskurve. */
export function meanPowerSeries(rows: HaStatisticRow[], buckets: Bucket[], factor: number, now = Date.now()): BucketValue[] {
  return buckets.map((b) => {
    const bv = empty(b, now);
    const inB = rows.filter((r) => r.start >= b.start && r.start < b.end && typeof r.mean === "number");
    if (!inB.length) return bv;
    let wsum = 0;
    let tsum = 0;
    for (const r of inB) {
      wsum += (r.mean as number) * factor * (r.end - r.start);
      tsum += r.end - r.start;
    }
    bv.value = wsum / tsum;
    bv.coverage = Math.min(1, tsum / (Math.min(b.end, now) - b.start));
    return bv;
  });
}

/** Mittlere Leistung je Bucket aus Rohverlauf (Halteverfahren). */
export function meanPowerFromSamples(samples: Sample[], buckets: Bucket[], now = Date.now()): BucketValue[] {
  const res = fromPowerSamples(samples, buckets, "all", now);
  return res.buckets.map((b) => {
    if (b.value === null || b.coverage <= 0) return { ...b, value: null };
    const hours = ((Math.min(b.end, now) - b.start) * b.coverage) / 3.6e6;
    return { ...b, value: hours > 0 ? (b.value * 1000) / hours : null };
  });
}

/** Summiert mehrere Reihen bucketweise. Fehlt in einer Reihe ein Wert, ist die Summe dort unvollständig (null). */
export function sumSeries(series: BucketValue[][]): BucketValue[] {
  if (!series.length) return [];
  return series[0].map((b, i) => {
    const vals = series.map((s) => s[i]);
    const missing = vals.some((x) => x.value === null);
    return {
      ...b,
      value: missing ? null : vals.reduce((s, x) => s + (x.value ?? 0), 0),
      coverage: Math.min(...vals.map((x) => x.coverage)),
      catchUp: vals.some((x) => x.catchUp),
      reset: vals.some((x) => x.reset),
    };
  });
}
