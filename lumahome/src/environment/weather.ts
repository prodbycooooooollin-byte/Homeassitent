// Wetter- und Tageszeitzustand für die Szene. Quellen in dieser Reihenfolge:
// Vorschau (vom Benutzer gewählt) › Home Assistant (weather.*, sun.sun) ›
// Schätzung aus Uhrzeit und Standort. Die Quelle wird immer angezeigt.
import type { HaState } from "@/devices/ha-types";
import { solarPosition } from "./sun";

export type Sky = "clear" | "partly" | "cloudy" | "rain" | "pouring" | "snow" | "fog" | "storm" | "unknown";

export interface EnvState {
  sky: Sky;
  elevation: number;
  azimuth: number;
  isNight: boolean;
  temperature: number | null;
  /** Woher Wetter und Sonnenstand stammen */
  weatherSource: "ha" | "none" | "preview";
  sunSource: "ha" | "estimated" | "preview";
  conditionText: string;
}

/** Abbildung der Home-Assistant-Wetterzustände (developers.home-assistant.io → weather). */
export function skyFromCondition(c: string | undefined): Sky {
  switch (c) {
    case "sunny":
    case "clear-night":
      return "clear";
    case "partlycloudy":
      return "partly";
    case "cloudy":
    case "windy":
    case "windy-variant":
      return "cloudy";
    case "rainy":
      return "rain";
    case "pouring":
      return "pouring";
    case "snowy":
    case "snowy-rainy":
    case "hail":
      return "snow";
    case "fog":
      return "fog";
    case "lightning":
    case "lightning-rainy":
    case "exceptional":
      return "storm";
  }
  return "unknown";
}

export const SKY_LABEL: Record<Sky, string> = {
  clear: "Klar",
  partly: "Teilweise bewölkt",
  cloudy: "Bewölkt",
  rain: "Regen",
  pouring: "Starkregen",
  snow: "Schnee",
  fog: "Nebel",
  storm: "Gewitter",
  unknown: "Wetter unbekannt",
};

export interface EnvPreview {
  sky?: Sky;
  /** Stunde 0–24 zur Vorschau der Tageszeit */
  hour?: number;
}

export function resolveEnvironment(opts: {
  states: Record<string, HaState>;
  weatherEntityId: string | null;
  latitude: number;
  longitude: number;
  preview: EnvPreview | null;
  now?: Date;
}): EnvState {
  const now = opts.now ?? new Date();
  const weatherId = opts.weatherEntityId ?? Object.keys(opts.states).find((id) => id.startsWith("weather.")) ?? null;
  const w = weatherId ? opts.states[weatherId] : undefined;
  const wOk = w && w.state !== "unavailable" && w.state !== "unknown";
  let sky = wOk ? skyFromCondition(w!.state) : "unknown";
  let weatherSource: EnvState["weatherSource"] = wOk ? "ha" : "none";
  const t = w?.attributes?.temperature;
  const temperature = wOk && typeof t === "number" ? t : null;

  let elevation: number;
  let azimuth: number;
  let sunSource: EnvState["sunSource"];
  const sun = opts.states["sun.sun"];
  const se = sun?.attributes?.elevation;
  const sa = sun?.attributes?.azimuth;
  if (opts.preview?.hour !== undefined) {
    const d = new Date(now);
    d.setHours(Math.floor(opts.preview.hour), Math.round((opts.preview.hour % 1) * 60), 0, 0);
    ({ elevation, azimuth } = solarPosition(d, opts.latitude, opts.longitude));
    sunSource = "preview";
  } else if (typeof se === "number" && typeof sa === "number") {
    elevation = se;
    azimuth = sa;
    sunSource = "ha";
  } else {
    ({ elevation, azimuth } = solarPosition(now, opts.latitude, opts.longitude));
    sunSource = "estimated";
  }
  if (opts.preview?.sky) {
    sky = opts.preview.sky;
    weatherSource = "preview";
  }
  return {
    sky,
    elevation,
    azimuth,
    isNight: elevation < -4,
    temperature,
    weatherSource,
    sunSource,
    conditionText: SKY_LABEL[sky],
  };
}

/** Himmelsfarben (oben, unten) für den Hintergrund. */
export function skyGradient(env: EnvState): [string, string] {
  const overcast = env.sky === "cloudy" || env.sky === "rain" || env.sky === "pouring" || env.sky === "storm" || env.sky === "fog" || env.sky === "snow";
  if (env.isNight) return overcast ? ["#1E2428", "#2C3337"] : ["#141C2B", "#2A3446"];
  if (env.elevation < 6) return overcast ? ["#7E8487", "#A9A49B"] : ["#E9C9A6", "#F4E2CC"];
  if (env.sky === "storm") return ["#5E666B", "#8A9092"];
  if (overcast) return ["#C9CDCD", "#E2E3DF"];
  if (env.sky === "partly") return ["#DCE7EC", "#F2F1EC"];
  return ["#D3E6F0", "#F5F3EE"];
}

/** Anteil direkter Sonne (0..1) abhängig von Bewölkung. */
export function sunStrength(env: EnvState): number {
  if (env.elevation <= 0) return 0;
  const cloud = { clear: 1, partly: 0.75, cloudy: 0.25, rain: 0.15, pouring: 0.08, snow: 0.2, fog: 0.15, storm: 0.1, unknown: 0.85 }[env.sky];
  return Math.min(1, Math.sin((Math.max(0, env.elevation) * Math.PI) / 180) * 1.6) * cloud;
}
