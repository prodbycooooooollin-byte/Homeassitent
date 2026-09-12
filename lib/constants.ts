// Zentrale "Enum"-Definitionen. Da SQLite in Prisma keine nativen Enums
// unterstützt (siehe prisma/schema.prisma), sind alle diese Werte als
// String-Spalten in der DB abgelegt und werden hier als TypeScript-Union +
// Wertelisten + deutsche Anzeige-Labels gepflegt.

export const ROLES = ["ADMIN", "MEMBER", "GUEST"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MEMBER: "Mitglied",
  GUEST: "Besucher",
};

export const DIMENSIONS = ["OVERWORLD", "NETHER", "END"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  OVERWORLD: "Oberwelt",
  NETHER: "Nether",
  END: "End",
};

export const MARKER_CATEGORIES = [
  "BASE",
  "FARM",
  "PORTAL",
  "SHOP",
  "PROJECT",
  "OTHER",
] as const;
export type MarkerCategory = (typeof MARKER_CATEGORIES)[number];

export const MARKER_CATEGORY_LABELS: Record<MarkerCategory, string> = {
  BASE: "Basis",
  FARM: "Farm",
  PORTAL: "Portal",
  SHOP: "Shop",
  PROJECT: "Bauprojekt",
  OTHER: "Sonstiges",
};

export const MARKER_CATEGORY_COLORS: Record<MarkerCategory, string> = {
  BASE: "#4ade80",
  FARM: "#eab308",
  PORTAL: "#a855f7",
  SHOP: "#60a5fa",
  PROJECT: "#f97316",
  OTHER: "#9db3a5",
};

export const VISIBILITIES = ["PRIVATE", "SERVER"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  PRIVATE: "Privat (nur ich)",
  SERVER: "Serverweit sichtbar",
};

export const DRAWING_TYPES = ["FREEHAND", "LINE", "AREA", "TEXT"] as const;
export type DrawingType = (typeof DRAWING_TYPES)[number];

export const MODPACK_SOURCES = ["UPLOAD", "MODRINTH"] as const;
export type ModpackSource = (typeof MODPACK_SOURCES)[number];

export const PROJECT_STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "DONE",
  "ON_HOLD",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planung",
  IN_PROGRESS: "In Arbeit",
  DONE: "Fertig",
  ON_HOLD: "Pausiert",
};

export const GOAL_METRICS = [
  "BLOCKS_MINED",
  "MOB_KILLS",
  "DEATHS",
  "PLAYTIME_HOURS",
] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  BLOCKS_MINED: "Abgebaute Blöcke",
  MOB_KILLS: "Getötete Mobs",
  DEATHS: "Tode",
  PLAYTIME_HOURS: "Spielzeit (Stunden)",
};

export const SERVER_EVENT_TYPES = [
  "MILESTONE",
  "SERVER_START",
  "SERVER_STOP",
  "ADVANCEMENT",
  "GOAL_COMPLETED",
  "PROJECT_CREATED",
  "PLAYER_FIRST_JOIN",
  "OTHER",
] as const;
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];

export const SERVER_EVENT_TYPE_LABELS: Record<ServerEventType, string> = {
  MILESTONE: "Meilenstein",
  SERVER_START: "Serverstart",
  SERVER_STOP: "Serverstopp",
  ADVANCEMENT: "Fortschritt",
  GOAL_COMPLETED: "Ziel erreicht",
  PROJECT_CREATED: "Neues Projekt",
  PLAYER_FIRST_JOIN: "Erster Beitritt",
  OTHER: "Sonstiges",
};

export const STATUS_SOURCES = ["SLP", "AGENT"] as const;
export type StatusSource = (typeof STATUS_SOURCES)[number];

/// Konkret unterstützte Kombinationen aus Minecraft-Version + Modloader für
/// die vollständige Anbindung (RCON + Statistikdateien + Log-Tailing über
/// den Connector-Agent). Die Server-List-Ping-Statusabfrage funktioniert
/// unabhängig davon gegen praktisch jeden Java-Server. Eine pauschale
/// Unterstützung aller Versionen/Modloader wird bewusst NICHT behauptet.
export interface SupportedServerTarget {
  minecraftVersion: string;
  platform: string;
  platformLabel: string;
  label: string;
  notes: string;
}

export const SUPPORTED_SERVER_TARGETS: SupportedServerTarget[] = [
  {
    minecraftVersion: "1.20.1",
    platform: "fabric",
    platformLabel: "Fabric",
    label: "Minecraft 1.20.1 (Fabric)",
    notes:
      "Geprüfte Kombination für Connector-Agent v1: Fabric-Loader ≥ 0.15, vanilla Statistikdateien (world/stats), RCON gemäß server.properties, Log-Tailing für Chat/Beitritte/Tode/Fortschritte.",
  },
];

export function isSupportedServerTarget(
  minecraftVersion: string,
  platform: string,
): boolean {
  return SUPPORTED_SERVER_TARGETS.some(
    (t) => t.minecraftVersion === minecraftVersion && t.platform === platform,
  );
}

// Vanilla-Statistik-Keys, die für "Strecken zurückgelegt" ausgewertet werden,
// mit deutschem Label. Nicht gemeldete Keys werden nicht angezeigt (siehe
// Grundsatz: keine erfundenen Nullwerte).
export const DISTANCE_STAT_LABELS: Record<string, string> = {
  "minecraft:walk_one_cm": "Zu Fuß",
  "minecraft:sprint_one_cm": "Sprintend",
  "minecraft:swim_one_cm": "Schwimmend",
  "minecraft:aviate_one_cm": "Elytra-Flug",
  "minecraft:boat_one_cm": "Boot",
  "minecraft:minecart_one_cm": "Lore",
  "minecraft:horse_one_cm": "Pferd",
  "minecraft:climb_one_cm": "Kletternd",
  "minecraft:crouch_one_cm": "Schleichend",
  "minecraft:fall_one_cm": "Fallend",
};

export const SESSION_COOKIE_NAME = "craftboard_session";
export const SESSION_DURATION_DAYS = 30;
export const LINK_CODE_TTL_MINUTES = 15;
export const AGENT_KEY_HEADER = "x-craftboard-agent-key";
