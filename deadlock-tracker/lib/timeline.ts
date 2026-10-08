/** Wert einer kumulierten Zeitreihe zum Zeitpunkt t (lineare Interpolation). */
export function valueAt(tl: { t: number[] } & Record<string, number[]>, key: string, t: number): number {
  const xs = tl.t, ys = tl[key];
  if (!xs?.length) return 0;
  if (t <= xs[0]) return ys[0] * (xs[0] ? t / xs[0] : 1);
  for (let i = 1; i < xs.length; i++) {
    if (t <= xs[i]) {
      const f = (t - xs[i - 1]) / Math.max(1, xs[i] - xs[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
    }
  }
  return ys[ys.length - 1];
}
