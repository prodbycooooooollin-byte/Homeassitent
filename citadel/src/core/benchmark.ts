// Auswertung echter Frametime-Aufzeichnungen (PresentMon-CSV v1/v2, OCAT, CapFrameX-Export mit
// MsBetweenPresents). Es werden niemals Messwerte erzeugt oder simuliert.
//
// Definitionen (dokumentiert in docs/BENCHMARK.md):
//  - Durchschnitts-FPS = Anzahl Frames / Summe der Frametimes (s)   (nicht: Mittel der Einzel-FPS)
//  - 1%-Low (Perzentil) = 1000 / P99 der Frametimes (ms)            ← Hauptkennzahl in CITADEL
//  - 1%-Low (Mittel)    = 1000 / Mittelwert der langsamsten 1 % Frames (ms)  – nur ergänzend angezeigt
//  - P99-Frametime per linearer Interpolation (Typ 7, wie numpy/Excel PERCENTILE.INC)

export interface FrameSeries {
  source: string;
  column: string;
  application?: string;
  /** Frametimes in ms, in Aufnahmereihenfolge. */
  frametimesMs: number[];
  /** Verworfene Frames der Aufwärmphase. */
  warmupDropped: number;
  invalidRows: number;
  /** GPU-Busy-Zeit je Frame (PresentMon 2: MsGPUBusy/GPUBusy), falls vorhanden. */
  gpuBusyMs?: number[];
}

export class CaptureParseError extends Error {}

const FRAMETIME_COLUMNS = ['MsBetweenPresents', 'FrameTime', 'msBetweenPresents', 'MsBetweenDisplayChange'];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface ParseOptions {
  /** Nur Zeilen dieses Prozesses (z. B. "deadlock.exe"). */
  processName?: string;
  warmupSeconds?: number;
}

export function parseFrameCsv(csv: string, sourceName: string, opts: ParseOptions = {}): FrameSeries {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith('//'));
  if (lines.length < 2) throw new CaptureParseError('Die Datei enthält keine Messzeilen.');
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const col = FRAMETIME_COLUMNS.find((c) => header.includes(c));
  if (!col) throw new CaptureParseError(`Keine Frametime-Spalte gefunden. Erwartet eine von: ${FRAMETIME_COLUMNS.join(', ')}. Gefunden: ${header.slice(0, 12).join(', ')}…`);
  const ci = header.indexOf(col);
  const ai = header.findIndex((h) => h === 'Application' || h === 'ProcessName');
  const gi = header.findIndex((h) => h === 'MsGPUBusy' || h === 'GPUBusy');
  const values: number[] = [];
  const gpu: number[] = [];
  let invalid = 0;
  let app: string | undefined;
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    if (ai >= 0) {
      const a = cells[ai]?.trim();
      if (opts.processName && a && a.toLowerCase() !== opts.processName.toLowerCase()) continue;
      app = app || a;
    }
    const v = Number(cells[ci]);
    if (!Number.isFinite(v) || v <= 0 || v > 5000) {
      invalid++;
      continue;
    }
    values.push(v);
    if (gi >= 0) gpu.push(Number(cells[gi]));
  }
  if (values.length < 30) throw new CaptureParseError(`Zu wenige gültige Frames (${values.length}). Mindestens 30 nötig.`);
  let dropped = 0;
  if (opts.warmupSeconds && opts.warmupSeconds > 0) {
    let t = 0;
    while (dropped < values.length && t < opts.warmupSeconds * 1000) t += values[dropped++];
    if (values.length - dropped < 30) throw new CaptureParseError('Nach Abzug der Aufwärmphase bleiben zu wenige Frames.');
  }
  const gpuOk = gi >= 0 && gpu.every((g) => Number.isFinite(g) && g >= 0);
  return { source: sourceName, column: col, application: app, frametimesMs: values.slice(dropped), warmupDropped: dropped, invalidRows: invalid, gpuBusyMs: gpuOk ? gpu.slice(dropped) : undefined };
}

export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return NaN;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export interface RunStats {
  frames: number;
  durationS: number;
  avgFps: number;
  low1PercentileFps: number;
  low1AverageFps: number;
  p99FrametimeMs: number;
  medianFrametimeMs: number;
  maxFrametimeMs: number;
  /** Anteil Frames > 2× Median-Frametime – einfaches Stotter-Maß. */
  stutterShare: number;
}

export function computeStats(ft: number[]): RunStats {
  const total = ft.reduce((a, b) => a + b, 0);
  const sorted = [...ft].sort((a, b) => a - b);
  const p99 = percentile(sorted, 99);
  const median = percentile(sorted, 50);
  const n1 = Math.max(1, Math.floor(sorted.length * 0.01));
  const worst = sorted.slice(sorted.length - n1);
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  return {
    frames: ft.length,
    durationS: total / 1000,
    avgFps: (ft.length / total) * 1000,
    low1PercentileFps: 1000 / p99,
    low1AverageFps: 1000 / worstAvg,
    p99FrametimeMs: p99,
    medianFrametimeMs: median,
    maxFrametimeMs: sorted[sorted.length - 1],
    stutterShare: ft.filter((x) => x > 2 * median).length / ft.length,
  };
}

/** Frametime-Verlauf, auf n Punkte verdichtet (Maximum je Fenster, damit Spitzen sichtbar bleiben). */
export function downsample(ft: number[], n = 400): { t: number; ms: number }[] {
  if (ft.length <= n) {
    let t = 0;
    return ft.map((ms) => ({ t: (t += ms) / 1000, ms }));
  }
  const out: { t: number; ms: number }[] = [];
  const step = ft.length / n;
  let t = 0;
  let idx = 0;
  for (let k = 0; k < n; k++) {
    const end = Math.floor((k + 1) * step);
    let mx = 0;
    for (; idx < end; idx++) {
      t += ft[idx];
      mx = Math.max(mx, ft[idx]);
    }
    out.push({ t: t / 1000, ms: mx });
  }
  return out;
}

export interface BenchmarkRun {
  id: string;
  label: 'baseline' | 'variante';
  profileName: string;
  change: string;
  capturedAt: string;
  method: 'presentmon' | 'import';
  source: string;
  conditions: string;
  stats: RunStats;
  column: string;
  warmupDropped: number;
  preview: { t: number; ms: number }[];
}

export type Verdict = 'besser' | 'schlechter' | 'uneindeutig' | 'zu-wenig-daten';

export interface Comparison {
  metric: 'avgFps' | 'low1PercentileFps';
  baselineMean: number;
  variantMean: number;
  deltaPct: number;
  /** Beobachtete Schwankung innerhalb der Gruppen (größte relative Spannweite). */
  noisePct: number;
  verdict: Verdict;
  explanation: string;
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Vergleich zweier Gruppen von Wiederholungen. Ein Unterschied gilt nur als klar, wenn
 *  - je Gruppe mindestens 2 Läufe vorliegen,
 *  - sich die Wertebereiche (min–max) der Gruppen nicht überlappen und
 *  - der Unterschied größer als die beobachtete Schwankung und mindestens 3 % ist.
 * Sonst: „uneindeutig“ („Kein klarer Vorteil“).
 */
export function compareRuns(baseline: RunStats[], variant: RunStats[], metric: Comparison['metric']): Comparison {
  const a = baseline.map((s) => s[metric]);
  const b = variant.map((s) => s[metric]);
  if (a.length < 2 || b.length < 2) {
    const bm = a.length ? mean(a) : NaN;
    const vm = b.length ? mean(b) : NaN;
    return {
      metric,
      baselineMean: bm,
      variantMean: vm,
      deltaPct: ((vm - bm) / bm) * 100,
      noisePct: NaN,
      verdict: 'zu-wenig-daten',
      explanation: 'Für eine Aussage sind mindestens zwei Messungen je Variante nötig. Einzelmessungen schwanken zu stark.',
    };
  }
  const am = mean(a);
  const bm = mean(b);
  const range = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / mean(xs);
  const noise = Math.max(range(a), range(b)) * 100;
  const delta = ((bm - am) / am) * 100;
  const overlap = Math.min(...b) <= Math.max(...a) && Math.min(...a) <= Math.max(...b);
  const clear = !overlap && Math.abs(delta) > noise && Math.abs(delta) >= 3;
  const verdict: Verdict = clear ? (delta > 0 ? 'besser' : 'schlechter') : 'uneindeutig';
  const explanation = clear
    ? `Unterschied ${delta.toFixed(1)} % liegt außerhalb der beobachteten Schwankung (${noise.toFixed(1)} %). Gilt nur für diese Szene und diese Bedingungen.`
    : `Kein klarer Vorteil: Unterschied ${delta.toFixed(1)} % bei beobachteter Schwankung von ${noise.toFixed(1)} %${overlap ? ' – die Messbereiche überlappen' : ''}.`;
  return { metric, baselineMean: am, variantMean: bm, deltaPct: delta, noisePct: noise, verdict, explanation };
}
