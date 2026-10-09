export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
export function fmtAgo(unixS: number, nowMs = Date.now()): string {
  const d = Math.max(0, Math.floor(nowMs / 1000 - unixS));
  if (d < 60) return "gerade eben";
  if (d < 3600) return `vor ${Math.floor(d / 60)} Min`;
  if (d < 86400) return `vor ${Math.floor(d / 3600)} Std`;
  return `vor ${Math.floor(d / 86400)} Tg`;
}
