import type { EnergyPoint } from "./types";

export interface EnergyStats {
  total: number;
  peak: number;
  average: number;
  comparisonPercent: number | null;
}

export function computeEnergyStats(points: EnergyPoint[]): EnergyStats {
  if (points.length === 0) return { total: 0, peak: 0, average: 0, comparisonPercent: null };

  const total = points.reduce((sum, p) => sum + p.value, 0);
  const peak = Math.max(...points.map((p) => p.value));
  const average = total / points.length;

  const hasPrevious = points.every((p) => p.previous !== undefined);
  let comparisonPercent: number | null = null;
  if (hasPrevious) {
    const previousTotal = points.reduce((sum, p) => sum + (p.previous ?? 0), 0);
    if (previousTotal > 0) {
      comparisonPercent = ((total - previousTotal) / previousTotal) * 100;
    }
  }

  return { total, peak, average, comparisonPercent };
}
