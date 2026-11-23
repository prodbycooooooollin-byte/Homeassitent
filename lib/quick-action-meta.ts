import type { QuickActionType } from "./types";

export const QUICK_ACTION_LABELS: Record<QuickActionType, { label: string; icon: string }> = {
  waterheater: { label: "Heizstab Warmwasser", icon: "flame" },
  heating: { label: "Heizung", icon: "thermometer" },
  lights: { label: "Alle Lichter", icon: "lightbulb" },
  outlets: { label: "Steckdosen", icon: "plug-zap" },
  away: { label: "Abwesenheitsmodus", icon: "door-open" },
  night: { label: "Nachtmodus", icon: "moon" },
  "all-off": { label: "Alles ausschalten", icon: "power-off" },
};

export const QUICK_ACTION_TYPES: QuickActionType[] = [
  "waterheater",
  "heating",
  "lights",
  "outlets",
  "away",
  "night",
  "all-off",
];
