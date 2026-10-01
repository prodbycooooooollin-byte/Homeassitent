// Eingebauter Möbelkatalog. Alle Modelle sind prozedural aus einfachen
// Grundkörpern aufgebaut – keine externen Downloads, keine Lizenzfragen,
// keine Preise und keine gesperrten Einträge.
//
// Teile werden relativ zur Objektgröße angegeben: x/z im Bereich -0.5..0.5
// (Breite/Tiefe), y von 0 (Boden) bis 1 (Oberkante). So bleiben Modelle beim
// Skalieren stimmig.
import type { BindingRole } from "@/model/types";

export type Mount = "floor" | "wall" | "ceiling" | "surface";
export type CategoryId = "wohnen" | "kueche" | "schlafen" | "bad" | "arbeiten" | "licht" | "technik";

export type PartColor = "main" | "accent" | "dark" | "metal" | "glass" | "light" | "fabric2" | `#${string}`;

export interface Part {
  shape: "box" | "cyl" | "sphere" | "cone";
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: PartColor;
  /** Leuchtender Teil (Schirm/Leuchtmittel) */
  glow?: boolean;
}

export interface CatalogEntry {
  id: string;
  name: string;
  category: CategoryId;
  keywords: string[];
  size: { w: number; d: number; h: number };
  mount: Mount;
  /** Oberkante kann Objekte tragen (Bruchteil der Höhe) */
  surfaceAt?: number;
  defaultColor: string;
  accent: string;
  materials: string[];
  defaultMaterial: string;
  parts: Part[];
  light?: { y: number; kind: "point" | "spot" };
  /** Gerätearten, die zu diesem Objekt passen */
  deviceRoles: BindingRole[];
  /** Darf durch die Decke reichen (Treppe in einer Deckenöffnung) */
  throughCeiling?: boolean;
}

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "wohnen", label: "Wohnen" },
  { id: "kueche", label: "Küche & Essen" },
  { id: "schlafen", label: "Schlafen" },
  { id: "bad", label: "Bad" },
  { id: "arbeiten", label: "Arbeiten" },
  { id: "licht", label: "Beleuchtung" },
  { id: "technik", label: "Technik & Klima" },
];

export interface MaterialDef {
  id: string;
  label: string;
  roughness: number;
  metalness: number;
  pattern: "wood" | "fabric" | "none";
}

export const MATERIALS: Record<string, MaterialDef> = {
  holz: { id: "holz", label: "Holz", roughness: 0.75, metalness: 0, pattern: "wood" },
  lack: { id: "lack", label: "Lack matt", roughness: 0.55, metalness: 0, pattern: "none" },
  stoff: { id: "stoff", label: "Stoff", roughness: 0.95, metalness: 0, pattern: "fabric" },
  leder: { id: "leder", label: "Leder", roughness: 0.6, metalness: 0, pattern: "none" },
  metall: { id: "metall", label: "Metall", roughness: 0.35, metalness: 0.7, pattern: "none" },
  keramik: { id: "keramik", label: "Keramik", roughness: 0.25, metalness: 0, pattern: "none" },
  stein: { id: "stein", label: "Stein", roughness: 0.8, metalness: 0, pattern: "none" },
};

export const COLOR_SWATCHES = [
  "#F4F1EA", "#E6DFD3", "#CBB79A", "#A9825A", "#7A5A3C", "#5B4636",
  "#A9C2B6", "#6E8F80", "#4D7163", "#8FA3B8", "#56677A", "#C9A9A6",
  "#B86F52", "#D9B45A", "#9A9C97", "#5E625F", "#363B39", "#1F2321",
];

const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: PartColor = "main", glow = false): Part => ({
  shape: "box", x, y, z, w, h, d, color, glow,
});
const cyl = (x: number, y: number, z: number, w: number, h: number, d: number, color: PartColor = "main", glow = false): Part => ({
  shape: "cyl", x, y, z, w, h, d, color, glow,
});
const sphere = (x: number, y: number, z: number, w: number, h: number, d: number, color: PartColor = "main", glow = false): Part => ({
  shape: "sphere", x, y, z, w, h, d, color, glow,
});
const cone = (x: number, y: number, z: number, w: number, h: number, d: number, color: PartColor = "main", glow = false): Part => ({
  shape: "cone", x, y, z, w, h, d, color, glow,
});

/** Tisch mit vier Beinen; y-Werte sind Mittelpunkte. */
function table(top = 0.06, leg = 0.06, legColor: PartColor = "main"): Part[] {
  const lh = 1 - top;
  const o = 0.5 - leg / 2 - 0.02;
  return [
    box(0, 1 - top / 2, 0, 1, top, 1),
    box(-o, lh / 2, -o, leg, lh, leg, legColor),
    box(o, lh / 2, -o, leg, lh, leg, legColor),
    box(-o, lh / 2, o, leg, lh, leg, legColor),
    box(o, lh / 2, o, leg, lh, leg, legColor),
  ];
}

function cabinet(doors = 2, plinth = 0.06): Part[] {
  const parts: Part[] = [box(0, plinth / 2, 0, 0.96, plinth, 0.9, "dark"), box(0, plinth + (1 - plinth) / 2, 0, 1, 1 - plinth, 1)];
  for (let i = 0; i < doors; i++) {
    const w = 1 / doors;
    const x = -0.5 + w * (i + 0.5);
    parts.push(box(x, 0.55, 0.505, w - 0.02, 0.8, 0.01, "accent"));
    parts.push(box(x + (i % 2 ? -w / 2 + 0.05 : w / 2 - 0.05), 0.6, 0.52, 0.015, 0.18, 0.02, "metal"));
  }
  return parts;
}

function sofa(seats = 3): Part[] {
  const parts: Part[] = [
    box(0, 0.08, 0, 0.98, 0.16, 0.95, "dark"),
    box(0, 0.3, 0.08, 0.84, 0.28, 0.8),
    box(0, 0.62, -0.38, 0.98, 0.76, 0.22),
    box(-0.45, 0.45, 0.02, 0.1, 0.5, 0.95),
    box(0.45, 0.45, 0.02, 0.1, 0.5, 0.95),
  ];
  for (let i = 0; i < seats; i++) {
    const w = 0.8 / seats;
    parts.push(box(-0.4 + w * (i + 0.5), 0.48, 0.1, w - 0.015, 0.1, 0.74, "fabric2"));
  }
  return parts;
}

function chair(): Part[] {
  return [
    box(0, 0.47, 0, 1, 0.06, 1),
    box(0, 0.75, -0.46, 1, 0.5, 0.08),
    box(-0.42, 0.22, -0.42, 0.08, 0.44, 0.08, "dark"),
    box(0.42, 0.22, -0.42, 0.08, 0.44, 0.08, "dark"),
    box(-0.42, 0.22, 0.42, 0.08, 0.44, 0.08, "dark"),
    box(0.42, 0.22, 0.42, 0.08, 0.44, 0.08, "dark"),
  ];
}

function bed(): Part[] {
  return [
    box(0, 0.12, 0.02, 1, 0.24, 0.96),
    box(0, 0.36, 0.04, 0.96, 0.22, 0.9, "light"),
    box(0, 0.55, -0.47, 1, 1.1, 0.06),
    box(-0.24, 0.5, -0.36, 0.4, 0.1, 0.14, "light"),
    box(0.24, 0.5, -0.36, 0.4, 0.1, 0.14, "light"),
    box(0, 0.48, 0.18, 0.98, 0.04, 0.62, "fabric2"),
  ];
}

export const CATALOG: CatalogEntry[] = [
  // Wohnen
  {
    id: "sofa-3", name: "Sofa, 3-Sitzer", category: "wohnen", keywords: ["couch", "sitzen"],
    size: { w: 2.2, d: 0.95, h: 0.82 }, mount: "floor", defaultColor: "#A9C2B6", accent: "#8AA597",
    materials: ["stoff", "leder"], defaultMaterial: "stoff", parts: sofa(3), deviceRoles: [],
  },
  {
    id: "sofa-2", name: "Sofa, 2-Sitzer", category: "wohnen", keywords: ["couch", "sitzen"],
    size: { w: 1.6, d: 0.9, h: 0.82 }, mount: "floor", defaultColor: "#CBB79A", accent: "#B39F80",
    materials: ["stoff", "leder"], defaultMaterial: "stoff", parts: sofa(2), deviceRoles: [],
  },
  {
    id: "armchair", name: "Sessel", category: "wohnen", keywords: ["sitzen", "lesesessel"],
    size: { w: 0.85, d: 0.85, h: 0.85 }, mount: "floor", defaultColor: "#6E8F80", accent: "#5D7B6E",
    materials: ["stoff", "leder"], defaultMaterial: "stoff", parts: sofa(1), deviceRoles: [],
  },
  {
    id: "coffee-table", name: "Couchtisch", category: "wohnen", keywords: ["tisch", "beistelltisch"],
    size: { w: 1.1, d: 0.6, h: 0.42 }, mount: "floor", surfaceAt: 1, defaultColor: "#A9825A", accent: "#7A5A3C",
    materials: ["holz", "lack", "stein"], defaultMaterial: "holz", parts: table(0.12, 0.08), deviceRoles: [],
  },
  {
    id: "tv-board", name: "TV-Lowboard", category: "wohnen", keywords: ["sideboard", "fernsehen"],
    size: { w: 1.8, d: 0.42, h: 0.5 }, mount: "floor", surfaceAt: 1, defaultColor: "#F4F1EA", accent: "#E6DFD3",
    materials: ["lack", "holz"], defaultMaterial: "lack", parts: cabinet(3), deviceRoles: [],
  },
  {
    id: "tv", name: "Fernseher", category: "wohnen", keywords: ["tv", "bildschirm", "medien"],
    size: { w: 1.24, d: 0.08, h: 0.75 }, mount: "surface", defaultColor: "#1F2321", accent: "#363B39",
    materials: ["metall"], defaultMaterial: "metall",
    parts: [box(0, 0.55, 0, 1, 0.9, 0.4), box(0, 0.05, 0, 0.3, 0.1, 1, "dark")], deviceRoles: ["switch"],
  },
  {
    id: "bookshelf", name: "Bücherregal", category: "wohnen", keywords: ["regal", "bücher"],
    size: { w: 0.9, d: 0.32, h: 1.9 }, mount: "floor", defaultColor: "#E6DFD3", accent: "#C9A9A6",
    materials: ["holz", "lack"], defaultMaterial: "holz",
    parts: [
      box(-0.48, 0.5, 0, 0.04, 1, 1), box(0.48, 0.5, 0, 0.04, 1, 1), box(0, 0.5, -0.48, 1, 1, 0.04),
      ...[0.02, 0.22, 0.42, 0.62, 0.82, 0.99].map((y) => box(0, y, 0, 0.96, 0.02, 1)),
      box(-0.25, 0.3, 0.05, 0.3, 0.13, 0.7, "accent"), box(0.2, 0.7, 0.05, 0.4, 0.13, 0.7, "#8FA3B8"),
    ],
    deviceRoles: [],
  },
  {
    id: "sideboard", name: "Sideboard", category: "wohnen", keywords: ["kommode", "schrank"],
    size: { w: 1.6, d: 0.45, h: 0.78 }, mount: "floor", surfaceAt: 1, defaultColor: "#A9825A", accent: "#CBB79A",
    materials: ["holz", "lack"], defaultMaterial: "holz", parts: cabinet(4, 0.1), deviceRoles: [],
  },
  {
    id: "rug", name: "Teppich", category: "wohnen", keywords: ["boden"],
    size: { w: 2.0, d: 1.4, h: 0.015 }, mount: "floor", defaultColor: "#E6DFD3", accent: "#CBB79A",
    materials: ["stoff"], defaultMaterial: "stoff", parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.6, 0, 0.86, 1, 0.8, "accent")], deviceRoles: [],
  },
  {
    id: "plant", name: "Zimmerpflanze", category: "wohnen", keywords: ["pflanze", "grün"],
    size: { w: 0.5, d: 0.5, h: 1.2 }, mount: "floor", defaultColor: "#6E8F80", accent: "#E6DFD3",
    materials: ["keramik"], defaultMaterial: "keramik",
    parts: [cyl(0, 0.13, 0, 0.6, 0.26, 0.6, "accent"), sphere(0, 0.55, 0, 0.9, 0.55, 0.9), sphere(0.15, 0.82, -0.1, 0.6, 0.35, 0.6)],
    deviceRoles: [],
  },
  {
    id: "stairs", name: "Treppe, gerade", category: "wohnen", keywords: ["treppe", "stufen", "etage"],
    size: { w: 2.8, d: 0.95, h: 2.9 }, mount: "floor", defaultColor: "#CBB79A", accent: "#9A9C97",
    materials: ["holz", "stein"], defaultMaterial: "holz", throughCeiling: true,
    parts: [
      ...Array.from({ length: 14 }, (_, i) => box(-0.5 + (i + 0.5) / 14, (i + 1) / 14 - 0.02, 0, 1 / 14 + 0.004, 0.04, 1)),
      ...Array.from({ length: 14 }, (_, i) => box(-0.5 + (i + 0.5) / 14, (i + 1) / 14 - 0.05, 0, 1 / 14 - 0.01, 0.06, 0.94, "light")),
    ],
    deviceRoles: [],
  },
  // Küche & Essen
  {
    id: "kitchen-base", name: "Küchenunterschrank", category: "kueche", keywords: ["küche", "arbeitsplatte", "zeile"],
    size: { w: 1.2, d: 0.62, h: 0.92 }, mount: "floor", surfaceAt: 1, defaultColor: "#F4F1EA", accent: "#E6DFD3",
    materials: ["lack", "holz"], defaultMaterial: "lack",
    parts: [...cabinet(2, 0.1).map((p) => ({ ...p, h: p.h * 0.95, y: p.y * 0.95 })), box(0, 0.975, 0, 1.02, 0.05, 1.04, "#CBB79A")],
    deviceRoles: [],
  },
  {
    id: "kitchen-sink", name: "Spülenschrank", category: "kueche", keywords: ["spüle", "küche", "wasser"],
    size: { w: 0.8, d: 0.62, h: 0.92 }, mount: "floor", defaultColor: "#F4F1EA", accent: "#E6DFD3",
    materials: ["lack", "holz"], defaultMaterial: "lack",
    parts: [
      ...cabinet(2, 0.1).map((p) => ({ ...p, h: p.h * 0.95, y: p.y * 0.95 })),
      box(0, 0.975, 0, 1.02, 0.05, 1.04, "#CBB79A"), box(0, 0.98, 0.05, 0.6, 0.06, 0.6, "metal"), cyl(0, 1.08, -0.35, 0.05, 0.2, 0.05, "metal"),
    ],
    deviceRoles: [],
  },
  {
    id: "stove", name: "Herd mit Kochfeld", category: "kueche", keywords: ["kochen", "backofen", "ofen"],
    size: { w: 0.6, d: 0.62, h: 0.92 }, mount: "floor", defaultColor: "#F4F1EA", accent: "#1F2321",
    materials: ["lack", "metall"], defaultMaterial: "lack",
    parts: [box(0, 0.47, 0, 1, 0.94, 1), box(0, 0.45, 0.505, 0.85, 0.5, 0.01, "accent"), box(0, 0.97, 0, 1, 0.04, 1, "dark")],
    deviceRoles: ["switch"],
  },
  {
    id: "fridge", name: "Kühlschrank", category: "kueche", keywords: ["kühlen", "gefrierschrank"],
    size: { w: 0.6, d: 0.66, h: 1.85 }, mount: "floor", defaultColor: "#E9EAE6", accent: "#9A9C97",
    materials: ["lack", "metall"], defaultMaterial: "lack",
    parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.38, 0.505, 0.98, 0.005, 0.01, "accent"), box(0.4, 0.55, 0.52, 0.03, 0.25, 0.03, "metal")],
    deviceRoles: ["switch"],
  },
  {
    id: "kitchen-island", name: "Kochinsel", category: "kueche", keywords: ["insel", "theke"],
    size: { w: 1.8, d: 0.9, h: 0.92 }, mount: "floor", surfaceAt: 1, defaultColor: "#6E8F80", accent: "#5D7B6E",
    materials: ["lack", "holz"], defaultMaterial: "lack",
    parts: [box(0, 0.45, 0, 0.96, 0.9, 0.92), box(0, 0.97, 0, 1, 0.06, 1, "#E6DFD3")], deviceRoles: [],
  },
  {
    id: "dining-table", name: "Esstisch", category: "kueche", keywords: ["tisch", "essen"],
    size: { w: 1.8, d: 0.9, h: 0.75 }, mount: "floor", surfaceAt: 1, defaultColor: "#A9825A", accent: "#7A5A3C",
    materials: ["holz", "lack", "stein"], defaultMaterial: "holz", parts: table(0.05, 0.07), deviceRoles: [],
  },
  {
    id: "dining-chair", name: "Stuhl", category: "kueche", keywords: ["sitzen", "essen"],
    size: { w: 0.45, d: 0.5, h: 0.85 }, mount: "floor", defaultColor: "#CBB79A", accent: "#7A5A3C",
    materials: ["holz", "stoff", "lack"], defaultMaterial: "holz", parts: chair(), deviceRoles: [],
  },
  {
    id: "bar-stool", name: "Barhocker", category: "kueche", keywords: ["hocker", "theke"],
    size: { w: 0.4, d: 0.4, h: 0.75 }, mount: "floor", defaultColor: "#363B39", accent: "#9A9C97",
    materials: ["metall", "holz"], defaultMaterial: "metall",
    parts: [cyl(0, 0.96, 0, 1, 0.08, 1), cyl(0, 0.5, 0, 0.12, 0.9, 0.12, "metal"), cyl(0, 0.02, 0, 0.8, 0.04, 0.8, "metal")], deviceRoles: [],
  },
  // Schlafen
  {
    id: "bed-double", name: "Doppelbett", category: "schlafen", keywords: ["bett", "schlafen"],
    size: { w: 1.8, d: 2.1, h: 0.95 }, mount: "floor", defaultColor: "#CBB79A", accent: "#A9825A",
    materials: ["holz", "stoff", "lack"], defaultMaterial: "stoff", parts: bed(), deviceRoles: [],
  },
  {
    id: "bed-single", name: "Einzelbett", category: "schlafen", keywords: ["bett", "kinderbett"],
    size: { w: 1.0, d: 2.05, h: 0.9 }, mount: "floor", defaultColor: "#E6DFD3", accent: "#A9825A",
    materials: ["holz", "stoff", "lack"], defaultMaterial: "holz", parts: bed(), deviceRoles: [],
  },
  {
    id: "nightstand", name: "Nachttisch", category: "schlafen", keywords: ["ablage"],
    size: { w: 0.45, d: 0.4, h: 0.5 }, mount: "floor", surfaceAt: 1, defaultColor: "#A9825A", accent: "#7A5A3C",
    materials: ["holz", "lack"], defaultMaterial: "holz", parts: cabinet(1, 0.12), deviceRoles: [],
  },
  {
    id: "wardrobe", name: "Kleiderschrank", category: "schlafen", keywords: ["schrank", "kleidung"],
    size: { w: 2.0, d: 0.6, h: 2.2 }, mount: "floor", defaultColor: "#F4F1EA", accent: "#E6DFD3",
    materials: ["lack", "holz"], defaultMaterial: "lack", parts: cabinet(4, 0.04), deviceRoles: [],
  },
  {
    id: "dresser", name: "Kommode", category: "schlafen", keywords: ["schubladen"],
    size: { w: 1.0, d: 0.48, h: 0.85 }, mount: "floor", surfaceAt: 1, defaultColor: "#E6DFD3", accent: "#CBB79A",
    materials: ["holz", "lack"], defaultMaterial: "lack",
    parts: [box(0, 0.52, 0, 1, 0.96, 1), ...[0.25, 0.55, 0.82].map((y) => box(0, y, 0.505, 0.94, 0.26, 0.01, "accent"))], deviceRoles: [],
  },
  // Bad
  {
    id: "bathtub", name: "Badewanne", category: "bad", keywords: ["wanne", "baden"],
    size: { w: 1.7, d: 0.75, h: 0.58 }, mount: "floor", defaultColor: "#FFFFFF", accent: "#DCE8EE",
    materials: ["keramik"], defaultMaterial: "keramik", parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.95, 0, 0.88, 0.12, 0.8, "accent")], deviceRoles: [],
  },
  {
    id: "shower", name: "Dusche", category: "bad", keywords: ["duschen"],
    size: { w: 0.9, d: 0.9, h: 2.0 }, mount: "floor", defaultColor: "#FFFFFF", accent: "#DCE8EE",
    materials: ["keramik"], defaultMaterial: "keramik",
    parts: [box(0, 0.02, 0, 1, 0.04, 1), box(0.49, 0.5, 0, 0.02, 0.96, 1, "glass"), box(0, 0.5, 0.49, 1, 0.96, 0.02, "glass"), cyl(-0.3, 0.92, -0.3, 0.18, 0.02, 0.18, "metal")],
    deviceRoles: [],
  },
  {
    id: "toilet", name: "WC", category: "bad", keywords: ["toilette"],
    size: { w: 0.38, d: 0.55, h: 0.8 }, mount: "floor", defaultColor: "#FFFFFF", accent: "#E9EAE6",
    materials: ["keramik"], defaultMaterial: "keramik",
    parts: [box(0, 0.75, -0.38, 1, 0.5, 0.24), cyl(0, 0.25, 0.08, 0.9, 0.5, 0.75), cyl(0, 0.52, 0.08, 0.95, 0.04, 0.8, "accent")], deviceRoles: [],
  },
  {
    id: "vanity", name: "Waschtisch", category: "bad", keywords: ["waschbecken"],
    size: { w: 0.8, d: 0.48, h: 0.85 }, mount: "floor", defaultColor: "#A9825A", accent: "#FFFFFF",
    materials: ["holz", "lack"], defaultMaterial: "holz",
    parts: [box(0, 0.55, 0, 1, 0.8, 1), box(0, 0.97, 0.02, 0.7, 0.06, 0.8, "accent"), cyl(0, 1.06, -0.36, 0.05, 0.14, 0.08, "metal")], deviceRoles: [],
  },
  {
    id: "mirror", name: "Spiegel", category: "bad", keywords: ["wand"],
    size: { w: 0.7, d: 0.03, h: 0.9 }, mount: "wall", defaultColor: "#DCE8EE", accent: "#9A9C97",
    materials: ["metall"], defaultMaterial: "metall", parts: [box(0, 0.5, 0, 1, 1, 1, "glass")], deviceRoles: [],
  },
  {
    id: "washer", name: "Waschmaschine", category: "bad", keywords: ["wäsche", "trockner"],
    size: { w: 0.6, d: 0.6, h: 0.85 }, mount: "floor", surfaceAt: 1, defaultColor: "#F4F1EA", accent: "#56677A",
    materials: ["lack"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), cyl(0, 0.5, 0.505, 0.6, 0.02, 0.5, "glass")],
    deviceRoles: ["switch"],
  },
  // Arbeiten
  {
    id: "desk", name: "Schreibtisch", category: "arbeiten", keywords: ["tisch", "büro"],
    size: { w: 1.4, d: 0.7, h: 0.74 }, mount: "floor", surfaceAt: 1, defaultColor: "#E6DFD3", accent: "#363B39",
    materials: ["holz", "lack"], defaultMaterial: "holz", parts: table(0.04, 0.05, "accent"), deviceRoles: [],
  },
  {
    id: "office-chair", name: "Bürostuhl", category: "arbeiten", keywords: ["stuhl", "sitzen"],
    size: { w: 0.6, d: 0.6, h: 1.1 }, mount: "floor", defaultColor: "#363B39", accent: "#9A9C97",
    materials: ["stoff", "leder"], defaultMaterial: "stoff",
    parts: [box(0, 0.44, 0, 0.8, 0.08, 0.8), box(0, 0.76, -0.38, 0.75, 0.5, 0.08), cyl(0, 0.2, 0, 0.08, 0.36, 0.08, "metal"), cyl(0, 0.03, 0, 0.9, 0.04, 0.9, "metal")],
    deviceRoles: [],
  },
  {
    id: "monitor", name: "Monitor", category: "arbeiten", keywords: ["bildschirm", "computer"],
    size: { w: 0.62, d: 0.2, h: 0.48 }, mount: "surface", defaultColor: "#1F2321", accent: "#9A9C97",
    materials: ["metall"], defaultMaterial: "metall",
    parts: [box(0, 0.62, 0, 1, 0.75, 0.15), box(0, 0.15, 0, 0.08, 0.3, 0.15, "accent"), box(0, 0.02, 0, 0.4, 0.04, 1, "accent")], deviceRoles: ["switch"],
  },
  {
    id: "shelf-low", name: "Regal, niedrig", category: "arbeiten", keywords: ["regal", "ablage", "akten"],
    size: { w: 0.8, d: 0.38, h: 0.8 }, mount: "floor", surfaceAt: 1, defaultColor: "#F4F1EA", accent: "#CBB79A",
    materials: ["holz", "lack"], defaultMaterial: "lack",
    parts: [box(-0.48, 0.5, 0, 0.04, 1, 1), box(0.48, 0.5, 0, 0.04, 1, 1), ...[0.02, 0.5, 0.98].map((y) => box(0, y, 0, 1, 0.04, 1))], deviceRoles: [],
  },
  // Beleuchtung
  {
    id: "ceiling-light", name: "Deckenleuchte", category: "licht", keywords: ["lampe", "decke", "licht"],
    size: { w: 0.45, d: 0.45, h: 0.1 }, mount: "ceiling", defaultColor: "#F4F1EA", accent: "#FFF6DD",
    materials: ["lack", "metall"], defaultMaterial: "lack",
    parts: [cyl(0, 0.75, 0, 1, 0.5, 1), cyl(0, 0.25, 0, 0.92, 0.5, 0.92, "accent", true)], light: { y: 0, kind: "point" }, deviceRoles: ["light", "switch"],
  },
  {
    id: "pendant", name: "Pendelleuchte", category: "licht", keywords: ["lampe", "hängeleuchte", "esstisch"],
    size: { w: 0.4, d: 0.4, h: 0.9 }, mount: "ceiling", defaultColor: "#4D7163", accent: "#FFF6DD",
    materials: ["metall", "lack"], defaultMaterial: "metall",
    parts: [cyl(0, 0.62, 0, 0.02, 0.76, 0.02, "dark"), cone(0, 0.12, 0, 1, 0.24, 1), sphere(0, 0.04, 0, 0.3, 0.1, 0.3, "accent", true)],
    light: { y: 0.02, kind: "point" }, deviceRoles: ["light", "switch"],
  },
  {
    id: "floor-lamp", name: "Stehleuchte", category: "licht", keywords: ["lampe", "stehlampe", "licht"],
    size: { w: 0.4, d: 0.4, h: 1.6 }, mount: "floor", defaultColor: "#E6DFD3", accent: "#FFF6DD",
    materials: ["stoff", "metall"], defaultMaterial: "stoff",
    parts: [cyl(0, 0.01, 0, 0.7, 0.02, 0.7, "dark"), cyl(0, 0.42, 0, 0.06, 0.8, 0.06, "dark"), cyl(0, 0.9, 0, 1, 0.2, 1, "main", true)],
    light: { y: 0.86, kind: "point" }, deviceRoles: ["light", "switch"],
  },
  {
    id: "table-lamp", name: "Tischleuchte", category: "licht", keywords: ["lampe", "nachttischlampe", "licht"],
    size: { w: 0.28, d: 0.28, h: 0.45 }, mount: "surface", defaultColor: "#F4F1EA", accent: "#CBB79A",
    materials: ["stoff", "keramik"], defaultMaterial: "stoff",
    parts: [cyl(0, 0.2, 0, 0.55, 0.4, 0.55, "accent"), cyl(0, 0.75, 0, 1, 0.45, 1, "main", true)],
    light: { y: 0.7, kind: "point" }, deviceRoles: ["light", "switch"],
  },
  {
    id: "wall-light", name: "Wandleuchte", category: "licht", keywords: ["lampe", "wand", "licht"],
    size: { w: 0.25, d: 0.15, h: 0.25 }, mount: "wall", defaultColor: "#F4F1EA", accent: "#FFF6DD",
    materials: ["lack", "metall"], defaultMaterial: "metall",
    parts: [box(0, 0.5, -0.4, 0.5, 0.8, 0.2), cyl(0, 0.5, 0.1, 0.9, 0.9, 0.8, "accent", true)], light: { y: 0.5, kind: "point" }, deviceRoles: ["light", "switch"],
  },
  {
    id: "spot", name: "Deckenspot", category: "licht", keywords: ["einbauleuchte", "strahler", "licht"],
    size: { w: 0.12, d: 0.12, h: 0.06 }, mount: "ceiling", defaultColor: "#F4F1EA", accent: "#FFF6DD",
    materials: ["metall"], defaultMaterial: "metall", parts: [cyl(0, 0.6, 0, 1, 0.8, 1), cyl(0, 0.1, 0, 0.7, 0.2, 0.7, "accent", true)],
    light: { y: 0, kind: "spot" }, deviceRoles: ["light", "switch"],
  },
  {
    id: "led-strip", name: "LED-Leiste", category: "licht", keywords: ["streifen", "indirekt", "licht"],
    size: { w: 1.5, d: 0.03, h: 0.02 }, mount: "wall", defaultColor: "#F4F1EA", accent: "#FFF6DD",
    materials: ["metall"], defaultMaterial: "metall", parts: [box(0, 0.5, 0, 1, 1, 1, "accent", true)], light: { y: 0.5, kind: "point" },
    deviceRoles: ["light", "switch"],
  },
  // Technik & Klima
  {
    id: "socket", name: "Steckdose / Zwischenstecker", category: "technik", keywords: ["steckdose", "stecker", "plug", "strom"],
    size: { w: 0.08, d: 0.04, h: 0.08 }, mount: "wall", defaultColor: "#F4F1EA", accent: "#9A9C97",
    materials: ["lack"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), cyl(0, 0.5, 0.5, 0.5, 0.5, 0.2, "accent")], deviceRoles: ["switch"],
  },
  {
    id: "radiator", name: "Heizkörper", category: "technik", keywords: ["heizung", "wärme"],
    size: { w: 1.0, d: 0.1, h: 0.6 }, mount: "wall", defaultColor: "#F4F1EA", accent: "#E6DFD3",
    materials: ["metall", "lack"], defaultMaterial: "lack",
    parts: [...Array.from({ length: 9 }, (_, i) => box(-0.44 + i * 0.11, 0.5, 0, 0.07, 1, 1)), cyl(0.5, 0.85, 0.2, 0.06, 0.12, 0.6, "dark")],
    deviceRoles: ["climate", "switch"],
  },
  {
    id: "thermostat", name: "Thermostat / Klimasensor", category: "technik", keywords: ["temperatur", "sensor", "luftfeuchtigkeit"],
    size: { w: 0.09, d: 0.03, h: 0.09 }, mount: "wall", defaultColor: "#FFFFFF", accent: "#4D7163",
    materials: ["lack"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), cyl(0, 0.5, 0.5, 0.6, 0.6, 0.2, "accent")],
    deviceRoles: ["climate", "sensor"],
  },
  {
    id: "heat-pump", name: "Wärmepumpe / Heizgerät", category: "technik", keywords: ["heizung", "wärmepumpe", "klima"],
    size: { w: 0.6, d: 0.6, h: 1.8 }, mount: "floor", defaultColor: "#F4F1EA", accent: "#56677A",
    materials: ["lack", "metall"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.8, 0.505, 0.5, 0.12, 0.01, "accent")],
    deviceRoles: ["climate", "switch"],
  },
  {
    id: "wallbox", name: "Wallbox", category: "technik", keywords: ["laden", "auto", "elektroauto"],
    size: { w: 0.3, d: 0.15, h: 0.45 }, mount: "wall", defaultColor: "#E9EAE6", accent: "#4D7163",
    materials: ["lack"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.75, 0.505, 0.5, 0.04, 0.01, "accent", true)],
    deviceRoles: ["switch"],
  },
  {
    id: "battery", name: "Batteriespeicher", category: "technik", keywords: ["speicher", "akku", "pv"],
    size: { w: 0.6, d: 0.25, h: 1.0 }, mount: "floor", defaultColor: "#F4F1EA", accent: "#7866B2",
    materials: ["lack"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.85, 0.505, 0.3, 0.03, 0.01, "accent", true)], deviceRoles: [],
  },
  {
    id: "fuse-box", name: "Zählerschrank", category: "technik", keywords: ["zähler", "sicherungskasten", "strom"],
    size: { w: 0.6, d: 0.2, h: 0.9 }, mount: "wall", defaultColor: "#E9EAE6", accent: "#9A9C97",
    materials: ["lack", "metall"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1), box(0, 0.5, 0.505, 0.9, 0.9, 0.01, "accent")],
    deviceRoles: [],
  },
];

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

/** Unbekannte Katalog-IDs (z. B. aus neueren Exporten) werden als neutraler Quader dargestellt. */
export const FALLBACK_ENTRY: CatalogEntry = {
  id: "unknown", name: "Objekt", category: "wohnen", keywords: [], size: { w: 0.5, d: 0.5, h: 0.5 }, mount: "floor",
  defaultColor: "#C4C8BF", accent: "#9A9C97", materials: ["lack"], defaultMaterial: "lack", parts: [box(0, 0.5, 0, 1, 1, 1)], deviceRoles: [],
};

export function entryFor(catalogId: string): CatalogEntry {
  return byId.get(catalogId) ?? FALLBACK_ENTRY;
}

export function searchCatalog(query: string, category: CategoryId | "alle"): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return CATALOG.filter((c) => (category === "alle" || c.category === category) && (!q || c.name.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q))));
}

export const isLightEntry = (c: CatalogEntry) => !!c.light;
