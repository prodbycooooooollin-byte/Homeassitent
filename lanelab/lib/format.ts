/** clock formats seconds as m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** stopwatch formats seconds as m:ss.cc, for run times. */
export function stopwatch(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`
}

export function pct(part: number, whole: number): string {
  return whole <= 0 ? '0%' : `${Math.round((part / whole) * 100)}%`
}

export function thousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
