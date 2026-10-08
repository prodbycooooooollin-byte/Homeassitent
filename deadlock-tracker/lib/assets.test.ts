import { describe, expect, it } from "vitest";
import { itemImages, plainDesc } from "./assets";

describe("itemImages", () => {
  it("bevorzugt kleines Shop-Bild (webp)", () => {
    const r = itemImages({ image: "https://assets.deadlock-api.com/a.png", shop_image_small_webp: "https://assets.deadlock-api.com/s.webp", shop_image: "https://assets.deadlock-api.com/l.png" });
    expect(decodeURIComponent(r.image!)).toContain("s.webp");
    expect(decodeURIComponent(r.imageLarge!)).toContain("l.png");
  });
  it("fällt auf image zurück bzw. undefined", () => {
    expect(decodeURIComponent(itemImages({ image: "https://assets.deadlock-api.com/a.png" }).image!)).toContain("a.png");
    expect(itemImages({}).image).toBeUndefined();
  });
});

describe("plainDesc", () => {
  it("entfernt HTML und Platzhalter", () => {
    expect(plainDesc({ desc: "<b>Heilt</b> um {s:Heal} Leben", passive: "Mehr Tempo" })).toBe("Heilt um Leben Mehr Tempo");
    expect(plainDesc(null)).toBeUndefined();
  });
});
