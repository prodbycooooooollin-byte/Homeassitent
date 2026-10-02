// Datenmodell von LumaHome.
//
// Grundsätze:
// - Planobjekte (Etagen, Räume, Öffnungen, Möbel), Gerätezuordnungen und
//   Messquellen werden im Projekt gespeichert. Aktuelle Gerätezustände gehören
//   NICHT ins Projekt – sie leben ausschließlich im Live-Store (src/store/live.ts).
// - Alle Längen in Metern, Winkel in Radiant. Planebene: x nach rechts, y nach
//   unten (im 3D-Modell wird y zur z-Achse).
// - Alle Objekte besitzen stabile IDs, die beim Bearbeiten erhalten bleiben.

export type Id = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vertex extends Vec2 {
  id: Id;
}

export type FloorMaterial = "oak" | "walnut" | "tiles" | "stone" | "carpet" | "concrete" | "grass" | "decking" | "paving";

export interface Floor {
  id: Id;
  name: string;
  /** Höhe der Fußbodenoberkante über Geländeniveau in m */
  elevation: number;
  /** Lichte Raumhöhe in m */
  height: number;
}

export interface Room {
  id: Id;
  floorId: Id;
  name: string;
  /** Polygon der Wandachsen, Reihenfolge beliebig (wird normalisiert) */
  vertices: Vertex[];
  floorMaterial: FloorMaterial;
  wallColor: string;
  /** Kanten (identifiziert über ihre Startecke), an denen keine Wand steht */
  openEdges: Id[];
  /** Außenbereich (Terrasse, Garten): keine Wände, wetterexponiert */
  outdoor: boolean;
}

export type OpeningKind = "door" | "window" | "passage";

export interface Opening {
  id: Id;
  roomId: Id;
  /** ID der Startecke der Wandkante im Raum */
  edgeStart: Id;
  /** Abstand der Öffnungsmitte vom Kantenanfang in m */
  offset: number;
  width: number;
  height: number;
  /** Brüstungshöhe in m (Türen und Durchgänge: 0) */
  sill: number;
  kind: OpeningKind;
  /** Öffnungsrichtung der Tür (nur Darstellung) */
  hinge: "left" | "right";
}

/** Treppen- oder Deckenöffnung im Fußboden einer Etage */
export interface FloorVoid {
  id: Id;
  floorId: Id;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface Item {
  id: Id;
  floorId: Id;
  catalogId: string;
  name: string;
  /** Mittelpunkt der Grundfläche in der Planebene */
  x: number;
  y: number;
  /** Unterkante über Fußboden in m */
  elevation: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  material: string;
  color: string;
  /** Platzierungshinweise, die der Benutzer bewusst akzeptiert hat */
  acceptedIssues: string[];
}

export type BindingTargetKind = "item" | "opening" | "room";

export interface BindingTarget {
  kind: BindingTargetKind;
  id: Id;
}

export type BindingRole = "light" | "switch" | "cover" | "contact" | "climate" | "sensor";

export interface DeviceBinding {
  id: Id;
  entityId: string;
  target: BindingTarget;
  role: BindingRole;
  /** Zeitpunkt der ausdrücklichen Bestätigung durch den Benutzer */
  confirmedAt: string;
  via: "manual" | "suggestion";
}

export type MeterFlow =
  | "consumption"
  | "grid_import"
  | "grid_export"
  | "grid_net"
  | "pv_production"
  | "battery_charge"
  | "battery_discharge"
  | "battery_net";

/**
 * Ein Messpunkt: ein Verbraucher, ein Stromkreis, der Hauszähler oder ein
 * Energiefluss (PV, Netz, Speicher). Er kann eine Leistungsquelle (W) und/oder
 * eine Energiequelle (kWh) besitzen.
 */
export interface EnergyMeter {
  id: Id;
  label: string;
  flow: MeterFlow;
  powerEntityId: string | null;
  energyEntityId: string | null;
  /** Messrichtung umkehren (z. B. Netzleistung mit Vorzeichen andersherum) */
  invertPower: boolean;
  /** Hauptzähler für den Gesamtverbrauch des Hauses */
  isHouseMain: boolean;
  roomId: Id | null;
  itemId: Id | null;
  /** Übergeordneter Messpunkt, der diesen Verbrauch bereits enthält */
  parentId: Id | null;
  /** Misst dieser Zähler den gesamten Raum (z. B. Raumstromkreis)? */
  coversWholeRoom: boolean;
  /** Ladestand in % (nur Speicher) */
  socEntityId: string | null;
}

export interface Underlay {
  floorId: Id;
  assetId: Id;
  /** Linke obere Ecke in der Planebene */
  x: number;
  y: number;
  /** Breite des Bildes in Metern (Maßstab) */
  width: number;
  opacity: number;
  visible: boolean;
}

export interface Asset {
  id: Id;
  name: string;
  mime: string;
  /** Data-URL, damit Exporte vollständig sind */
  data: string;
}

export interface ProjectSettings {
  gridSize: number;
  /**
   * Der Benutzer bestätigt: keine eigene Erzeugung (PV) und kein Speicher.
   * Nur dann darf der Netzbezug als Hausverbrauch gelten.
   */
  noLocalGeneration: boolean;
  /** Wetter-Entität (weather.*); null = automatisch die erste gefundene */
  weatherEntityId: string | null;
  /** Abweichung der Planoberseite von Norden in Grad (im Uhrzeigersinn) */
  northAngle: number;
  /** Standort für die Sonnenstands-Schätzung, falls sun.sun fehlt */
  latitude: number;
  longitude: number;
  /** Tarif für Ersparnis-Schätzungen */
  pricePerKwh: number;
  feedInPerKwh: number;
  co2PerKwh: number;
}

export interface Project {
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  floors: Floor[];
  rooms: Room[];
  openings: Opening[];
  voids: FloorVoid[];
  items: Item[];
  bindings: DeviceBinding[];
  meters: EnergyMeter[];
  underlays: Underlay[];
  assets: Asset[];
  settings: ProjectSettings;
}

export const PROJECT_FORMAT = "lumahome-project" as const;
export const PROJECT_FORMAT_VERSION = 1;

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  project: Project;
}

export type Selection =
  | { kind: "room"; id: Id }
  | { kind: "item"; id: Id }
  | { kind: "opening"; id: Id }
  | { kind: "void"; id: Id }
  | { kind: "vertex"; roomId: Id; id: Id }
  | { kind: "edge"; roomId: Id; id: Id }
  | null;

export const DEFAULT_SETTINGS: ProjectSettings = {
  gridSize: 0.1,
  noLocalGeneration: false,
  weatherEntityId: null,
  northAngle: 0,
  latitude: 51.2,
  longitude: 10.4,
  pricePerKwh: 0.32,
  feedInPerKwh: 0.08,
  co2PerKwh: 0.38,
};
