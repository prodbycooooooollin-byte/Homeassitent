import type { DeviceType } from "./types";

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  outlet: "Steckdose",
  light: "Lampe",
  heating: "Heizung",
  appliance: "Haushaltsgerät",
  computer: "Computer & Unterhaltung",
  sensor: "Sensor",
  other: "Sonstiges",
};

export const DEVICE_TYPE_OPTIONS: { value: DeviceType | "all"; label: string }[] = [
  { value: "all", label: "Alle Typen" },
  { value: "outlet", label: DEVICE_TYPE_LABEL.outlet },
  { value: "light", label: DEVICE_TYPE_LABEL.light },
  { value: "heating", label: DEVICE_TYPE_LABEL.heating },
  { value: "appliance", label: DEVICE_TYPE_LABEL.appliance },
  { value: "computer", label: DEVICE_TYPE_LABEL.computer },
  { value: "sensor", label: DEVICE_TYPE_LABEL.sensor },
  { value: "other", label: DEVICE_TYPE_LABEL.other },
];

export const HIGH_CONSUMPTION_THRESHOLD_W = 1000;

export type DeviceStatusFilter = "all" | "active" | "standby" | "offline" | "high";
