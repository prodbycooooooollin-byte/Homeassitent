// Kleine, wiederverwendbare Formatierungshelfer.

export function formatKw(value: number, digits = 2): string {
  return `${value.toFixed(digits)} kW`;
}

export function formatKwh(value: number, digits = 1): string {
  return `${value.toFixed(digits)} kWh`;
}

export function formatWatt(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} kW`;
  return `${Math.round(value)} W`;
}

export function formatCurrency(value: number, currency: "EUR" | "USD" | "CHF" = "EUR"): string {
  const symbols: Record<string, string> = { EUR: "€", USD: "$", CHF: "CHF" };
  return `${value.toFixed(2)} ${symbols[currency]}`;
}

export function formatTemperature(value: number): string {
  return `${value.toFixed(1)}°`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  return `vor ${diffD} Tag${diffD > 1 ? "en" : ""}`;
}

export function formatDateLong(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Min.`;
  return `${h} Std. ${m} Min.`;
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return "Guten Abend";
  if (hour < 11) return "Guten Morgen";
  if (hour < 17) return "Guten Tag";
  if (hour < 22) return "Guten Abend";
  return "Gute Nacht";
}
