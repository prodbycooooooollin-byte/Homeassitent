// Realistische Beispieldaten für den Demo-Modus der App.
// Wenn später eine echte Home-Assistant-Instanz angebunden wird, liefert
// lib/ha/real-client.ts Daten in genau dieser Form (siehe lib/types.ts).

import type {
  Automation,
  Device,
  EnergyByCategory,
  EnergyPoint,
  Hint,
  HouseStatus,
  QuickAction,
  Room,
  SecurityEntity,
  SecurityEvent,
  TemperaturePoint,
  WaterHeater,
  WeatherInfo,
} from "./types";

export const MOCK_ROOMS: Room[] = [
  {
    id: "wohnzimmer",
    name: "Wohnzimmer",
    icon: "sofa",
    temperature: 21.5,
    targetTemperature: 22,
    humidity: 46,
    heatingStatus: "heating",
    windowOpen: false,
    mode: "auto",
    currentPowerW: 640,
  },
  {
    id: "schlafzimmer",
    name: "Schlafzimmer",
    icon: "bed",
    temperature: 19.2,
    targetTemperature: 18,
    humidity: 52,
    heatingStatus: "idle",
    windowOpen: true,
    mode: "eco",
    currentPowerW: 40,
    warnings: ["Fenster geöffnet, Heizung pausiert"],
  },
  {
    id: "kueche",
    name: "Küche",
    icon: "cooking-pot",
    temperature: 22.4,
    targetTemperature: 21,
    humidity: 49,
    heatingStatus: "idle",
    windowOpen: false,
    mode: "auto",
    currentPowerW: 210,
  },
  {
    id: "badezimmer",
    name: "Badezimmer",
    icon: "bath",
    temperature: 23,
    targetTemperature: 23,
    humidity: 61,
    heatingStatus: "heating",
    windowOpen: false,
    mode: "heat",
    currentPowerW: 2180,
  },
  {
    id: "buero",
    name: "Büro",
    icon: "briefcase",
    temperature: 21.8,
    targetTemperature: 21,
    humidity: 44,
    heatingStatus: "idle",
    windowOpen: false,
    mode: "auto",
    currentPowerW: 460,
  },
  {
    id: "keller",
    name: "Keller",
    icon: "warehouse",
    temperature: 16.1,
    targetTemperature: 16,
    humidity: 58,
    heatingStatus: "off",
    windowOpen: false,
    mode: "off",
    currentPowerW: 95,
  },
];

MOCK_ROOMS.forEach((room) => {
  room.history = buildTemperatureHistory(room.temperature, room.targetTemperature);
});

export function buildTemperatureHistory(current: number, target: number): TemperaturePoint[] {
  const points: TemperaturePoint[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 60 * 60 * 1000);
    const drift = Math.sin(i / 3) * 0.6 + (Math.random() - 0.5) * 0.3;
    points.push({
      time: t.toISOString(),
      temperature: Math.round((current - i * 0.02 + drift) * 10) / 10,
      target,
    });
  }
  return points;
}

export const MOCK_DEVICES: Device[] = [
  {
    id: "heizstab",
    entityId: "switch.heizstab_warmwasser",
    name: "Heizstab Warmwasser",
    roomId: "keller",
    type: "heating",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 2100,
    todayEnergyKwh: 6.4,
    lastChanged: minutesAgo(12),
    icon: "flame",
    automationIds: ["automation-solar-heizstab"],
  },
  {
    id: "waschmaschine",
    entityId: "switch.waschmaschine",
    name: "Waschmaschine",
    roomId: "keller",
    type: "appliance",
    status: "standby",
    controllable: true,
    isOn: false,
    currentPowerW: 0,
    todayEnergyKwh: 1.3,
    lastChanged: minutesAgo(38),
    icon: "washing-machine",
  },
  {
    id: "backofen",
    entityId: "switch.backofen",
    name: "Backofen",
    roomId: "kueche",
    type: "appliance",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 1800,
    todayEnergyKwh: 2.1,
    lastChanged: minutesAgo(5),
    icon: "microwave",
  },
  {
    id: "gaming-pc",
    entityId: "switch.gaming_pc",
    name: "Gaming-PC",
    roomId: "buero",
    type: "computer",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 420,
    todayEnergyKwh: 2.8,
    lastChanged: minutesAgo(90),
    icon: "monitor",
  },
  {
    id: "kuehlschrank",
    entityId: "sensor.kuehlschrank",
    name: "Kühlschrank",
    roomId: "kueche",
    type: "appliance",
    status: "active",
    controllable: false,
    isOn: true,
    currentPowerW: 85,
    todayEnergyKwh: 1.9,
    lastChanged: minutesAgo(240),
    icon: "refrigerator",
  },
  {
    id: "wohnzimmer-licht",
    entityId: "light.wohnzimmer",
    name: "Deckenlicht",
    roomId: "wohnzimmer",
    type: "light",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 18,
    todayEnergyKwh: 0.3,
    lastChanged: minutesAgo(20),
    icon: "lightbulb",
  },
  {
    id: "wohnzimmer-steckdose",
    entityId: "switch.wohnzimmer_tv",
    name: "Steckdose TV-Bereich",
    roomId: "wohnzimmer",
    type: "outlet",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 140,
    todayEnergyKwh: 1.1,
    lastChanged: minutesAgo(70),
    icon: "plug-zap",
  },
  {
    id: "schlafzimmer-licht",
    entityId: "light.schlafzimmer",
    name: "Nachttischlampe",
    roomId: "schlafzimmer",
    type: "light",
    status: "standby",
    controllable: true,
    isOn: false,
    currentPowerW: 0,
    todayEnergyKwh: 0.05,
    lastChanged: minutesAgo(400),
    icon: "lamp",
  },
  {
    id: "buero-steckdose",
    entityId: "switch.buero_dock",
    name: "Dockingstation",
    roomId: "buero",
    type: "outlet",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 65,
    todayEnergyKwh: 0.6,
    lastChanged: minutesAgo(150),
    icon: "plug-zap",
  },
  {
    id: "badezimmer-heizung",
    entityId: "climate.badezimmer",
    name: "Handtuchheizkörper",
    roomId: "badezimmer",
    type: "heating",
    status: "active",
    controllable: true,
    isOn: true,
    currentPowerW: 380,
    todayEnergyKwh: 1.4,
    lastChanged: minutesAgo(15),
    icon: "thermometer",
  },
  {
    id: "fensterkontakt-sensor",
    entityId: "sensor.aussen_sensor",
    name: "Außensensor",
    roomId: "keller",
    type: "sensor",
    status: "offline",
    controllable: false,
    isOn: false,
    currentPowerW: 0,
    todayEnergyKwh: 0,
    lastChanged: minutesAgo(720),
    icon: "wifi-off",
  },
  {
    id: "router",
    entityId: "switch.router",
    name: "Router",
    roomId: "buero",
    type: "other",
    status: "active",
    controllable: false,
    isOn: true,
    currentPowerW: 12,
    todayEnergyKwh: 0.29,
    lastChanged: minutesAgo(1000),
    icon: "router",
  },
];

MOCK_DEVICES.forEach((device) => {
  device.history = buildDeviceHistory(device.currentPowerW);
});

export function buildDeviceHistory(baseWatt: number): EnergyPoint[] {
  const points: EnergyPoint[] = [];
  const now = new Date();
  for (let h = 23; h >= 0; h--) {
    const t = new Date(now.getTime() - h * 60 * 60 * 1000);
    const jitter = baseWatt <= 0 ? Math.random() * 20 : baseWatt * (0.6 + Math.random() * 0.5);
    points.push({ time: t.toISOString(), value: Math.round(jitter) });
  }
  return points;
}

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60 * 1000).toISOString();
}

export const MOCK_QUICK_ACTIONS: QuickAction[] = [
  { id: "qa-waterheater", type: "waterheater", label: "Heizstab", icon: "flame", active: true, visible: true },
  { id: "qa-heating", type: "heating", label: "Heizung", icon: "thermometer", active: true, visible: true },
  { id: "qa-lights", type: "lights", label: "Alle Lichter", icon: "lightbulb", active: true, visible: true },
  { id: "qa-outlets", type: "outlets", label: "Steckdosen", icon: "plug-zap", active: true, visible: true },
  { id: "qa-away", type: "away", label: "Abwesend", icon: "door-open", active: false, visible: true },
  { id: "qa-night", type: "night", label: "Nachtmodus", icon: "moon", active: false, visible: true },
  {
    id: "qa-all-off",
    type: "all-off",
    label: "Alles aus",
    icon: "power-off",
    active: false,
    requiresConfirm: true,
    visible: true,
  },
];

export const MOCK_WATER_HEATER: WaterHeater = {
  id: "heizstab-boiler",
  isOn: true,
  currentPowerW: 2100,
  waterTemperature: 54,
  targetTemperature: 60,
  runtimeMinutesToday: 96,
  timerMinutesLeft: null,
  manualOverride: false,
};

export const MOCK_WEATHER: WeatherInfo = {
  temperature: 19,
  description: "Leicht bewölkt",
  icon: "cloud",
  humidity: 58,
  windKmh: 12,
};

export const MOCK_HOUSE_STATUS: HouseStatus = {
  currentPowerKw: 3.42,
  todayEnergyKwh: 18.6,
  gridPowerKw: 0.58,
  activeDevicesCount: 9,
  solarPowerKw: 2.84,
  batteryPercent: 72,
  batteryPowerKw: 0.4,
  solarTodayKwh: 14.2,
  selfConsumptionTodayKwh: 10.8,
  feedInTodayKwh: 3.4,
  gridImportTodayKwh: 7.8,
  autarkyPercent: 58,
};

export const MOCK_HINTS: Hint[] = [
  {
    id: "hint-heizstab",
    message: "Der Heizstab verbraucht momentan ungewöhnlich viel Strom.",
    severity: "warning",
    timestamp: minutesAgo(8),
  },
  {
    id: "hint-waschmaschine",
    message: "Die Waschmaschine ist fertig.",
    severity: "info",
    timestamp: minutesAgo(22),
  },
  {
    id: "hint-steckdose",
    message: "Im Wohnzimmer ist noch eine Steckdose aktiv.",
    severity: "info",
    timestamp: minutesAgo(45),
  },
  {
    id: "hint-verbrauch",
    message: "Der Verbrauch liegt 18 % über dem Durchschnitt.",
    severity: "warning",
    timestamp: minutesAgo(60),
  },
];

export const MOCK_AUTOMATIONS: Automation[] = [
  {
    id: "automation-solar-heizstab",
    name: "Heizstab bei hoher Solarproduktion",
    description: "Schaltet den Heizstab ein, sobald genug PV-Überschuss vorhanden ist.",
    enabled: true,
    lastRun: minutesAgo(180),
    trigger: "Solarleistung > 2,5 kW für 5 Minuten",
    condition: "Warmwassertemperatur < 58 °C",
    action: "Heizstab einschalten",
  },
  {
    id: "automation-fenster-heizung",
    name: "Heizung bei geöffnetem Fenster aus",
    description: "Pausiert die Heizung im Raum, sobald ein Fenster geöffnet wird.",
    enabled: true,
    lastRun: minutesAgo(50),
    trigger: "Fensterkontakt öffnet",
    action: "Heizung im Raum auf Aus",
  },
  {
    id: "automation-abwesend",
    name: "Abwesenheitsmodus",
    description: "Deaktiviert nicht benötigte Geräte, wenn niemand zu Hause ist.",
    enabled: true,
    lastRun: minutesAgo(1440),
    trigger: "Alle Bewohner verlassen das Haus",
    action: "Lichter, Steckdosen und Unterhaltungselektronik ausschalten",
  },
  {
    id: "automation-nachtmodus",
    name: "Nachtmodus automatisch aktivieren",
    description: "Dimmt Lichter und senkt die Zieltemperatur zur Nachtzeit.",
    enabled: false,
    lastRun: minutesAgo(2200),
    trigger: "Uhrzeit erreicht 22:30",
    action: "Nachtmodus aktivieren",
  },
  {
    id: "automation-hoher-verbrauch",
    name: "Warnung bei hohem Verbrauch",
    description: "Sendet eine Benachrichtigung bei ungewöhnlich hohem Stromverbrauch.",
    enabled: true,
    lastRun: minutesAgo(60),
    trigger: "Hausverbrauch > 5 kW für 10 Minuten",
    action: "Hinweis in der App anzeigen",
  },
  {
    id: "automation-steckdose-timer",
    name: "Steckdose nach Laufzeit ausschalten",
    description: "Schaltet ausgewählte Steckdosen nach einer festgelegten Zeit automatisch ab.",
    enabled: true,
    lastRun: minutesAgo(320),
    trigger: "Laufzeit von 120 Minuten erreicht",
    action: "Steckdose ausschalten",
  },
];

export const MOCK_SECURITY_ENTITIES: SecurityEntity[] = [
  { id: "sec-tuer-haupt", kind: "contact", name: "Haustür", roomId: "wohnzimmer", state: "clear", lastChanged: minutesAgo(120) },
  { id: "sec-fenster-schlaf", kind: "contact", name: "Fenster Schlafzimmer", roomId: "schlafzimmer", state: "open", lastChanged: minutesAgo(35) },
  { id: "sec-fenster-wz", kind: "contact", name: "Fenster Wohnzimmer", roomId: "wohnzimmer", state: "clear", lastChanged: minutesAgo(500) },
  { id: "sec-bewegung-flur", kind: "motion", name: "Bewegung Flur", roomId: "wohnzimmer", state: "clear", lastChanged: minutesAgo(10) },
  { id: "sec-rauch-kueche", kind: "smoke", name: "Rauchmelder Küche", roomId: "kueche", state: "clear", lastChanged: minutesAgo(600) },
  { id: "sec-wasser-keller", kind: "water", name: "Wassersensor Keller", roomId: "keller", state: "clear", lastChanged: minutesAgo(600) },
  { id: "sec-kamera-eingang", kind: "camera", name: "Kamera Eingang", roomId: "wohnzimmer", state: "online", lastChanged: minutesAgo(1) },
];

export const MOCK_ALARM_MODE: import("./types").AlarmMode = "home";

export const MOCK_SECURITY_EVENTS: SecurityEvent[] = [
  { id: "ev-1", timestamp: minutesAgo(35), message: "Fenster Schlafzimmer geöffnet", severity: "info" },
  { id: "ev-2", timestamp: minutesAgo(120), message: "Haustür geschlossen", severity: "info" },
  { id: "ev-3", timestamp: minutesAgo(600), message: "System auf 'Zuhause' gesetzt", severity: "info" },
  { id: "ev-4", timestamp: minutesAgo(1440), message: "Kurzer Stromausfall erkannt", severity: "warning" },
];

export function generateEnergySeries(range: "live" | "today" | "week" | "month" | "year"): EnergyPoint[] {
  const now = new Date();
  const points: EnergyPoint[] = [];

  if (range === "live") {
    for (let i = 59; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 60 * 1000);
      const base = 3.2 + Math.sin(i / 6) * 0.6 + Math.random() * 0.4;
      points.push({ time: t.toISOString(), value: Math.round(base * 100) / 100 });
    }
  } else if (range === "today") {
    for (let h = 0; h <= 23; h++) {
      const t = new Date(now);
      t.setHours(h, 0, 0, 0);
      const isNow = h === now.getHours();
      if (t > now && !isNow) continue;
      const base = 0.8 + Math.sin(h / 3.5) * 0.9 + (h >= 17 && h <= 21 ? 1.6 : 0) + Math.random() * 0.4;
      const prev = 0.7 + Math.sin(h / 3.5) * 0.8 + (h >= 17 && h <= 21 ? 1.3 : 0) + Math.random() * 0.3;
      points.push({
        time: t.toISOString(),
        value: Math.max(0.2, Math.round(base * 100) / 100),
        previous: Math.max(0.2, Math.round(prev * 100) / 100),
      });
    }
  } else if (range === "week") {
    const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    days.forEach((d, i) => {
      const base = 14 + Math.sin(i) * 4 + Math.random() * 3;
      const prev = 13 + Math.sin(i) * 3 + Math.random() * 3;
      points.push({ time: d, value: Math.round(base * 10) / 10, previous: Math.round(prev * 10) / 10 });
    });
  } else if (range === "month") {
    for (let d = 1; d <= 30; d++) {
      const base = 16 + Math.sin(d / 4) * 5 + Math.random() * 3;
      const prev = 15 + Math.sin(d / 4) * 4 + Math.random() * 3;
      points.push({ time: `${d}.`, value: Math.round(base * 10) / 10, previous: Math.round(prev * 10) / 10 });
    }
  } else {
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    months.forEach((m, i) => {
      const seasonal = 550 + Math.cos((i / 11) * Math.PI * 2) * 220;
      points.push({
        time: m,
        value: Math.round(seasonal + Math.random() * 40),
        previous: Math.round(seasonal * 0.93 + Math.random() * 40),
      });
    });
  }
  return points;
}

export const MOCK_ENERGY_BY_DEVICE: EnergyByCategory[] = [
  { label: "Heizstab", valueKwh: 6.4, color: "#f5a524" },
  { label: "Backofen", valueKwh: 2.1, color: "#3d8bfd" },
  { label: "Gaming-PC", valueKwh: 2.8, color: "#5aa0ff" },
  { label: "Kühlschrank", valueKwh: 1.9, color: "#2fd681" },
  { label: "Waschmaschine", valueKwh: 1.3, color: "#f2495c" },
  { label: "Sonstige", valueKwh: 3.1, color: "#5f6c85" },
];

export const MOCK_ENERGY_BY_ROOM: EnergyByCategory[] = [
  { label: "Keller", valueKwh: 7.7, color: "#f5a524" },
  { label: "Küche", valueKwh: 4.0, color: "#3d8bfd" },
  { label: "Büro", valueKwh: 3.4, color: "#5aa0ff" },
  { label: "Wohnzimmer", valueKwh: 1.4, color: "#2fd681" },
  { label: "Badezimmer", valueKwh: 1.4, color: "#f2495c" },
  { label: "Schlafzimmer", valueKwh: 0.7, color: "#5f6c85" },
];
