// Reine Kampfmathematik ohne Champion- oder Itemwissen.

export interface PenetrationSet {
  flatReduction: number;
  pctReduction: number;
  /** Prozentuale Durchdringung (bereits multiplikativ kombiniert). */
  pctPen: number;
  flatPen: number;
}

export const NO_PEN: PenetrationSet = { flatReduction: 0, pctReduction: 0, pctPen: 0, flatPen: 0 };

/**
 * Effektive Resistenz nach LoL-Reihenfolge:
 * flache Reduktion → prozentuale Reduktion → prozentuale Durchdringung → flache Durchdringung.
 * Durchdringung kann eine Resistenz nicht unter 0 senken, Reduktion schon.
 */
export function effectiveResist(resist: number, p: PenetrationSet): number {
  let r = resist - p.flatReduction;
  if (r > 0) r *= 1 - p.pctReduction;
  if (r > 0) r *= 1 - p.pctPen;
  if (r > 0) r = Math.max(0, r - p.flatPen);
  return r;
}

/** Schadensmultiplikator für eine Resistenz. */
export function resistMultiplier(r: number): number {
  return r >= 0 ? 100 / (100 + r) : 2 - 100 / (100 - r);
}

/** Mehrere prozentuale Durchdringungen wirken multiplikativ. */
export function combinePct(a: number, b: number): number {
  return 1 - (1 - a) * (1 - b);
}

export function removePct(total: number, part: number): number {
  if (part >= 1) return total;
  return 1 - (1 - total) / (1 - part);
}

export function critMultiplier(critChance: number, critDamage: number): number {
  const c = Math.max(0, Math.min(1, critChance));
  return 1 + c * (critDamage - 1);
}

/** Durchschnittliche Stapelzahl über `hits` Treffer bei 1 Stapel/Treffer bis `max`. */
export function averageStacksBeforeHit(hits: number, max: number): number {
  const n = Math.max(1, Math.round(hits));
  let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.min(k, max);
  return sum / n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
