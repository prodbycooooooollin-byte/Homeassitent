export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function clockTime(ms: number, lang: string): string {
  return new Date(ms).toLocaleTimeString(lang === "en" ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(ms: number, lang: string): string {
  return new Date(ms).toLocaleString(lang === "en" ? "en-GB" : "de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function secondsUntil(ms: number, now: number): number {
  return Math.max(0, Math.ceil((ms - now) / 1000));
}

export function relative(ms: number, now: number, lang: string): string {
  const diff = Math.round((ms - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "de", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
