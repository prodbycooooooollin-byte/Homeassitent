import { describe, expect, it } from "vitest";
import { pickModel } from "./hero3d-server";

describe("3D-Modell-Auswahl", () => {
  const paths = [
    "models/heroes_wip/inferno/inferno.vmdl_c",
    "models/heroes_wip/inferno/inferno_lod1.vmdl_c",
    "models/heroes_wip/inferno/weapons/inferno_weapon.vmdl_c",
    "models/heroes_wip/inferno/gibs/inferno_gib_head.vmdl_c",
    "models/heroes_wip/gigawatt/gigawatt.vmdl_c",
  ];
  it("nimmt den Hauptkörper und keine Waffen, Gibs oder LODs", () => {
    expect(pickModel(paths, "inferno")).toBe("models/heroes_wip/inferno/inferno.vmdl_c");
  });
  it("liefert null ohne Treffer", () => { expect(pickModel(paths, "unbekannt")).toBeNull(); });
});
