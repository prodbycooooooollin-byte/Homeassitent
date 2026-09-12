const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

export function formatRelativeTime(date: Date | string | number): string {
  const d = new Date(date);
  const diffSeconds = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 30) return "gerade eben";

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (abs >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(Math.round(diffSeconds / 60), "minute");
}

export function formatDateTime(date: Date | string | number): string {
  return new Date(date).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(date: Date | string | number): string {
  return new Date(date).toLocaleDateString("de-DE", { dateStyle: "long" });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("de-DE");
}

/** Minecraft-Ticks (20/Sek.) in eine lesbare Dauer wie "12 Std. 34 Min." */
export function formatTicksDuration(ticks: number): string {
  return formatSecondsDuration(Math.round(ticks / 20));
}

export function formatSecondsDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} Sek.`;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} T.`);
  if (hours > 0 || days > 0) parts.push(`${hours} Std.`);
  if (days === 0) parts.push(`${minutes} Min.`);
  return parts.join(" ");
}

/** Minecraft speichert Distanzen in Zentimetern. */
export function formatCentimeters(cm: number): string {
  const km = cm / 100_000;
  if (km >= 1) return `${km.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
  const m = cm / 100;
  return `${m.toLocaleString("de-DE", { maximumFractionDigits: 0 })} m`;
}

export function formatCoords(x: number, y: number | null | undefined, z: number): string {
  const rx = Math.round(x);
  const rz = Math.round(z);
  if (y === null || y === undefined) return `${rx}, ${rz}`;
  return `${rx}, ${Math.round(y)}, ${rz}`;
}
