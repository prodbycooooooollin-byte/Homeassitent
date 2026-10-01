// Demo-Projekt „Haus am Lindenweg“ – ein eingerichtetes, zweigeschossiges
// Beispielhaus mit Gerätezuordnungen und Messpunkten. Wird ausschließlich im
// gekennzeichneten Demo-Modus verwendet.
import type { DeviceBinding, EnergyMeter, FloorMaterial, Item, Opening, Project, Room } from "@/model/types";
import { entryFor } from "@/catalog/catalog";

const H = Math.PI / 2;

function rect(id: string, floorId: string, name: string, x: number, y: number, w: number, d: number, floorMaterial: FloorMaterial, wallColor = "#F2EFE8"): Room {
  return {
    id,
    floorId,
    name,
    floorMaterial,
    wallColor,
    openEdges: [],
    vertices: [
      { id: `${id}_v0`, x, y },
      { id: `${id}_v1`, x: x + w, y },
      { id: `${id}_v2`, x: x + w, y: y + d },
      { id: `${id}_v3`, x, y: y + d },
    ],
  };
}

/** Kanten: n = oben (v0→v1), e = rechts (v1→v2), s = unten (v2→v3), w = links (v3→v0) */
function op(id: string, roomId: string, edge: "n" | "e" | "s" | "w", offset: number, kind: Opening["kind"], width: number, height = kind === "window" ? 1.3 : 2.1, sill = kind === "window" ? 0.9 : 0): Opening {
  const idx = { n: 0, e: 1, s: 2, w: 3 }[edge];
  return { id, roomId, edgeStart: `${roomId}_v${idx}`, offset, width, height, sill, kind, hinge: "left" };
}

function item(id: string, floorId: string, catalogId: string, x: number, y: number, rotation = 0, patch: Partial<Item> = {}): Item {
  const e = entryFor(catalogId);
  return {
    id,
    floorId,
    catalogId,
    name: e.name,
    x,
    y,
    rotation,
    elevation: 0,
    width: e.size.w,
    depth: e.size.d,
    height: e.size.h,
    material: e.defaultMaterial,
    color: e.defaultColor,
    acceptedIssues: [],
    ...patch,
  };
}

const EG = "floor_eg";
const OG = "floor_og";

export function demoProject(): Project {
  const rooms: Room[] = [
    rect("r_wohnen", EG, "Wohnen & Essen", 0, 0, 5.5, 5, "oak"),
    rect("r_kueche", EG, "Küche", 5.5, 0, 4.5, 3, "stone"),
    rect("r_flur", EG, "Flur", 5.5, 3, 4.5, 2, "stone"),
    rect("r_buero", EG, "Arbeitszimmer", 0, 5, 4, 3.5, "oak"),
    rect("r_bad", EG, "Bad", 4, 5, 2.8, 3.5, "tiles", "#EEF1EF"),
    rect("r_hwr", EG, "Hauswirtschaft", 6.8, 5, 3.2, 3.5, "concrete"),
    rect("r_schlafen", OG, "Schlafzimmer", 0, 0, 5.5, 5, "walnut", "#F1ECE4"),
    rect("r_kind", OG, "Kinderzimmer", 5.5, 0, 4.5, 3, "oak", "#EDF2EE"),
    rect("r_galerie", OG, "Galerie", 5.5, 3, 4.5, 2, "oak"),
    rect("r_bad_og", OG, "Bad oben", 0, 5, 4, 3.5, "tiles", "#EEF1EF"),
    rect("r_gast", OG, "Gästezimmer", 4, 5, 6, 3.5, "carpet"),
  ];

  const openings: Opening[] = [
    op("o_wz_fenster1", "r_wohnen", "n", 1.4, "window", 1.5, 1.4, 0.8),
    op("o_wz_fenster2", "r_wohnen", "n", 4.1, "window", 1.5, 1.4, 0.8),
    op("o_wz_terrasse", "r_wohnen", "w", 2.5, "window", 2.0, 2.2, 0.02),
    op("o_wz_kueche", "r_wohnen", "e", 1.6, "passage", 1.4, 2.2),
    op("o_wz_flur", "r_wohnen", "e", 4.5, "door", 0.9),
    op("o_kue_fenster", "r_kueche", "n", 2.25, "window", 1.2, 1.2, 1.0),
    op("o_haustuer", "r_flur", "e", 1.0, "door", 1.0, 2.2),
    op("o_buero_tuer", "r_buero", "n", 3.3, "door", 0.85),
    op("o_buero_fenster", "r_buero", "w", 1.75, "window", 1.4),
    op("o_buero_fenster2", "r_buero", "s", 2.0, "window", 1.2),
    op("o_bad_tuer", "r_bad", "n", 2.15, "door", 0.8),
    op("o_bad_fenster", "r_bad", "s", 1.4, "window", 0.8, 0.8, 1.4),
    op("o_hwr_tuer", "r_hwr", "n", 1.6, "door", 0.9),
    op("o_hwr_fenster", "r_hwr", "e", 2.5, "window", 1.0),
    op("o_sz_fenster", "r_schlafen", "n", 2.75, "window", 1.6, 1.4, 0.8),
    op("o_sz_tuer", "r_schlafen", "e", 4.5, "door", 0.9),
    op("o_kind_fenster", "r_kind", "n", 2.25, "window", 1.4, 1.3, 0.9),
    op("o_kind_tuer", "r_kind", "s", 0.8, "door", 0.8),
    op("o_badog_tuer", "r_bad_og", "n", 3.3, "door", 0.8),
    op("o_badog_fenster", "r_bad_og", "w", 1.75, "window", 0.8, 0.9, 1.3),
    op("o_gast_tuer", "r_gast", "n", 4.5, "door", 0.9),
    op("o_gast_fenster", "r_gast", "s", 3.0, "window", 1.4),
  ];

  const items: Item[] = [
    // Wohnen & Essen
    item("i_tvboard", EG, "tv-board", 1.6, 4.665, Math.PI),
    item("i_tv", EG, "tv", 1.6, 4.68, Math.PI, { elevation: 0.5, name: "Fernseher" }),
    item("i_sofa", EG, "sofa-3", 1.6, 2.35),
    item("i_rug", EG, "rug", 1.6, 3.35),
    item("i_couchtisch", EG, "coffee-table", 1.6, 3.4),
    item("i_stehlampe", EG, "floor-lamp", 3.05, 2.2, 0, { name: "Stehleuchte Sofa" }),
    item("i_wz_decke", EG, "ceiling-light", 1.6, 2.9, 0, { elevation: 2.5, name: "Deckenleuchte Wohnen" }),
    item("i_esstisch", EG, "dining-table", 4.0, 1.4, 0, { width: 1.6 }),
    item("i_stuhl1", EG, "dining-chair", 3.6, 0.7),
    item("i_stuhl2", EG, "dining-chair", 4.4, 0.7),
    item("i_stuhl3", EG, "dining-chair", 3.6, 2.1, Math.PI),
    item("i_stuhl4", EG, "dining-chair", 4.4, 2.1, Math.PI),
    item("i_pendel", EG, "pendant", 4.0, 1.4, 0, { elevation: 1.7, name: "Pendelleuchte Esstisch" }),
    item("i_pflanze", EG, "plant", 0.45, 0.45),
    item("i_heizung_wz", EG, "radiator", 1.4, 0.175, 0, { elevation: 0.15, name: "Heizkörper Wohnen" }),
    // Küche
    item("i_kue_unter1", EG, "kitchen-base", 6.2, 0.43),
    item("i_kue_spuele", EG, "kitchen-sink", 7.2, 0.43),
    item("i_herd", EG, "stove", 7.9, 0.43),
    item("i_kue_unter2", EG, "kitchen-base", 8.8, 0.43),
    item("i_kuehlschrank", EG, "fridge", 9.55, 1.75, H),
    item("i_kue_led", EG, "led-strip", 7.5, 0.135, 0, { elevation: 1.45, name: "LED-Leiste Küche" }),
    item("i_kue_decke", EG, "ceiling-light", 7.75, 1.6, 0, { elevation: 2.5, name: "Deckenleuchte Küche" }),
    item("i_barhocker1", EG, "bar-stool", 6.6, 2.5),
    // Flur
    item("i_treppe", EG, "stairs", 7.1, 3.525, 0),
    item("i_flur_spot", EG, "spot", 9.2, 4.5, 0, { elevation: 2.54, name: "Spots Flur" }),
    // Arbeitszimmer
    item("i_schreibtisch", EG, "desk", 0.47, 6.75, -H),
    item("i_buerostuhl", EG, "office-chair", 1.25, 6.75, H),
    item("i_monitor", EG, "monitor", 0.35, 6.75, -H, { elevation: 0.74 }),
    item("i_buero_regal", EG, "shelf-low", 3.75, 7.6, H),
    item("i_buero_decke", EG, "ceiling-light", 2.0, 6.75, 0, { elevation: 2.5, name: "Deckenleuchte Büro" }),
    item("i_buero_steckdose", EG, "socket", 0.16, 7.7, -H, { elevation: 0.3, name: "Steckdosenleiste Büro" }),
    // Bad
    item("i_wanne", EG, "bathtub", 5.4, 8.005, Math.PI),
    item("i_wc", EG, "toilet", 6.465, 6.4, H),
    item("i_waschtisch", EG, "vanity", 4.3, 6.4, -H),
    item("i_spiegel", EG, "mirror", 4.075, 6.4, -H, { elevation: 1.15 }),
    item("i_bad_decke", EG, "ceiling-light", 5.4, 6.75, 0, { elevation: 2.5, name: "Deckenleuchte Bad" }),
    item("i_bad_heizung", EG, "radiator", 4.6, 5.11, 0, { elevation: 0.3, name: "Badheizkörper", width: 0.8 }),
    // Hauswirtschaft
    item("i_waschmaschine", EG, "washer", 7.4, 8.08, Math.PI),
    item("i_trockner", EG, "washer", 8.05, 8.08, Math.PI, { name: "Wäschetrockner" }),
    item("i_waermepumpe", EG, "heat-pump", 9.58, 6.2, H),
    item("i_batterie", EG, "battery", 9.755, 7.0, H, { name: "Batteriespeicher" }),
    item("i_zaehler", EG, "fuse-box", 7.25, 5.16, 0, { elevation: 1.2, name: "Zählerschrank" }),
    item("i_hwr_decke", EG, "ceiling-light", 8.4, 6.75, 0, { elevation: 2.5, name: "Deckenleuchte HWR" }),
    // Schlafzimmer
    item("i_bett", OG, "bed-double", 1.17, 2.5, -H),
    item("i_nacht1", OG, "nightstand", 0.32, 1.25, -H),
    item("i_nacht2", OG, "nightstand", 0.32, 3.75, -H),
    item("i_lampe_links", OG, "table-lamp", 0.32, 1.25, 0, { elevation: 0.5, name: "Nachttischlampe links" }),
    item("i_lampe_rechts", OG, "table-lamp", 0.32, 3.75, 0, { elevation: 0.5, name: "Nachttischlampe rechts" }),
    item("i_schrank", OG, "wardrobe", 5.14, 1.4, H),
    item("i_sz_decke", OG, "ceiling-light", 2.75, 2.5, 0, { elevation: 2.4, name: "Deckenleuchte Schlafzimmer" }),
    item("i_sz_heizung", OG, "radiator", 2.75, 0.175, 0, { elevation: 0.15, name: "Heizkörper Schlafzimmer" }),
    // Kinderzimmer
    item("i_kinderbett", OG, "bed-single", 9.35, 1.145),
    item("i_kind_tisch", OG, "desk", 6.3, 0.47, 0, { width: 1.2 }),
    item("i_kind_decke", OG, "ceiling-light", 7.75, 1.5, 0, { elevation: 2.4, name: "Deckenleuchte Kinderzimmer" }),
    // Galerie, Bad oben, Gästezimmer
    item("i_galerie_licht", OG, "ceiling-light", 9.2, 4.4, 0, { elevation: 2.4, name: "Deckenleuchte Galerie" }),
    item("i_dusche", OG, "shower", 3.49, 7.93),
    item("i_wc_og", OG, "toilet", 0.395, 6.2, -H),
    item("i_waschtisch_og", OG, "vanity", 2.0, 8.14, Math.PI),
    item("i_badog_decke", OG, "ceiling-light", 2.0, 6.75, 0, { elevation: 2.4, name: "Deckenleuchte Bad oben" }),
    item("i_gast_sofa", OG, "sofa-2", 6.5, 7.9, Math.PI),
    item("i_gast_regal", OG, "bookshelf", 4.6, 6.6, -H),
    item("i_gast_decke", OG, "ceiling-light", 7.0, 6.75, 0, { elevation: 2.4, name: "Deckenleuchte Gästezimmer" }),
  ];

  const now = "2026-10-01T08:00:00.000Z";
  const b = (id: string, entityId: string, kind: "item" | "opening" | "room", target: string, role: DeviceBinding["role"]): DeviceBinding => ({
    id,
    entityId,
    target: { kind, id: target },
    role,
    confirmedAt: now,
    via: "manual",
  });
  const bindings: DeviceBinding[] = [
    b("b1", "light.wohnen_decke", "item", "i_wz_decke", "light"),
    b("b2", "light.stehleuchte_sofa", "item", "i_stehlampe", "light"),
    b("b3", "light.esstisch_pendel", "item", "i_pendel", "light"),
    b("b4", "light.kueche_decke", "item", "i_kue_decke", "light"),
    b("b5", "light.kueche_led", "item", "i_kue_led", "light"),
    b("b6", "light.flur_spots", "item", "i_flur_spot", "light"),
    b("b7", "light.buero_decke", "item", "i_buero_decke", "light"),
    b("b8", "light.bad_decke", "item", "i_bad_decke", "light"),
    b("b9", "light.hwr_decke", "item", "i_hwr_decke", "light"),
    b("b10", "light.schlafzimmer_decke", "item", "i_sz_decke", "light"),
    b("b11", "light.nachttisch_links", "item", "i_lampe_links", "light"),
    b("b12", "light.nachttisch_rechts", "item", "i_lampe_rechts", "light"),
    b("b13", "light.kinderzimmer_decke", "item", "i_kind_decke", "light"),
    b("b14", "light.galerie", "item", "i_galerie_licht", "light"),
    b("b15", "switch.tv_steckdose", "item", "i_tv", "switch"),
    b("b16", "switch.buero_steckdosenleiste", "item", "i_buero_steckdose", "switch"),
    b("b17", "switch.waschmaschine", "item", "i_waschmaschine", "switch"),
    b("b18", "cover.wohnen_rollladen", "opening", "o_wz_fenster1", "cover"),
    b("b19", "binary_sensor.wohnen_fenster", "opening", "o_wz_fenster1", "contact"),
    b("b20", "binary_sensor.terrassentuer", "opening", "o_wz_terrasse", "contact"),
    b("b21", "binary_sensor.kueche_fenster", "opening", "o_kue_fenster", "contact"),
    b("b22", "sensor.bad_oben_fenstergriff", "opening", "o_badog_fenster", "contact"),
    b("b23", "cover.schlafzimmer_rollladen", "opening", "o_sz_fenster", "cover"),
    b("b24", "climate.wohnen_heizung", "item", "i_heizung_wz", "climate"),
    b("b25", "climate.bad_heizkoerper", "item", "i_bad_heizung", "climate"),
    b("b26", "climate.schlafzimmer_heizung", "item", "i_sz_heizung", "climate"),
    b("b27", "sensor.wohnen_temperatur", "room", "r_wohnen", "sensor"),
    b("b28", "sensor.wohnen_luftfeuchte", "room", "r_wohnen", "sensor"),
    b("b29", "sensor.buero_temperatur", "room", "r_buero", "sensor"),
    b("b30", "sensor.buero_co2", "room", "r_buero", "sensor"),
    b("b31", "sensor.bad_luftfeuchte", "room", "r_bad", "sensor"),
    b("b32", "sensor.bad_temperatur", "room", "r_bad", "sensor"),
    b("b33", "sensor.schlafzimmer_temperatur", "room", "r_schlafen", "sensor"),
    b("b34", "sensor.kinderzimmer_temperatur", "room", "r_kind", "sensor"),
    b("b35", "sensor.kueche_temperatur", "room", "r_kueche", "sensor"),
    b("b36", "climate.waermepumpe", "item", "i_waermepumpe", "climate"),
  ];

  const m = (id: string, label: string, p: Partial<EnergyMeter>): EnergyMeter => ({
    id,
    label,
    flow: "consumption",
    powerEntityId: null,
    energyEntityId: null,
    invertPower: false,
    isHouseMain: false,
    roomId: null,
    itemId: null,
    parentId: null,
    coversWholeRoom: false,
    ...p,
  });
  const meters: EnergyMeter[] = [
    m("m_haus", "Hausverbrauch", { isHouseMain: true, powerEntityId: "sensor.hausverbrauch_leistung", energyEntityId: "sensor.hausverbrauch_energie" }),
    m("m_netz", "Netz (Saldo)", { flow: "grid_net", powerEntityId: "sensor.netz_leistung" }),
    m("m_netz_bezug", "Netzbezug", { flow: "grid_import", energyEntityId: "sensor.netzbezug_energie" }),
    m("m_netz_einsp", "Einspeisung", { flow: "grid_export", energyEntityId: "sensor.einspeisung_energie" }),
    m("m_pv", "Photovoltaik", { flow: "pv_production", powerEntityId: "sensor.pv_leistung", energyEntityId: "sensor.pv_energie" }),
    m("m_batterie", "Batteriespeicher", { flow: "battery_net", powerEntityId: "sensor.batterie_leistung", itemId: "i_batterie" }),
    m("m_kueche", "Stromkreis Küche", { parentId: "m_haus", roomId: "r_kueche", coversWholeRoom: true, powerEntityId: "sensor.kueche_stromkreis_leistung", energyEntityId: "sensor.kueche_stromkreis_energie" }),
    m("m_kuehlschrank", "Kühlschrank", { parentId: "m_kueche", itemId: "i_kuehlschrank", powerEntityId: "sensor.kuehlschrank_leistung", energyEntityId: "sensor.kuehlschrank_energie" }),
    m("m_herd", "Herd", { parentId: "m_kueche", itemId: "i_herd", powerEntityId: "sensor.herd_leistung" }),
    m("m_tv", "Fernseher", { parentId: "m_haus", itemId: "i_tv", powerEntityId: "sensor.tv_steckdose_leistung", energyEntityId: "sensor.tv_steckdose_energie" }),
    m("m_waschmaschine", "Waschmaschine", { parentId: "m_haus", itemId: "i_waschmaschine", powerEntityId: "sensor.waschmaschine_leistung", energyEntityId: "sensor.waschmaschine_energie" }),
    m("m_buero", "Steckdosenleiste Büro", { parentId: "m_haus", itemId: "i_buero_steckdose", powerEntityId: "sensor.buero_steckdosenleiste_leistung", energyEntityId: "sensor.buero_steckdosenleiste_energie" }),
    m("m_waermepumpe", "Wärmepumpe", { parentId: "m_haus", itemId: "i_waermepumpe", powerEntityId: "sensor.waermepumpe_leistung", energyEntityId: "sensor.waermepumpe_energie" }),
  ];

  return {
    id: "demo_lindenweg",
    name: "Haus am Lindenweg",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: now,
    floors: [
      { id: EG, name: "Erdgeschoss", elevation: 0, height: 2.6 },
      { id: OG, name: "Obergeschoss", elevation: 2.9, height: 2.5 },
    ],
    rooms,
    openings,
    voids: [{ id: "void_treppe", floorId: OG, name: "Treppenöffnung", x: 5.7, y: 3.05, width: 2.8, depth: 0.95 }],
    items,
    bindings,
    meters,
    underlays: [],
    assets: [],
    settings: { gridSize: 0.1, noLocalGeneration: false },
  };
}
