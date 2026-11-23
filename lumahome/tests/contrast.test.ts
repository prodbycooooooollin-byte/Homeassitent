// Prüft die Lesbarkeit der Designfarben nach WCAG 2.x (Kontrastverhältnis).
import { describe, expect, it } from "vitest";

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("Farbkontraste (Text mindestens 4,5:1)", () => {
  const cases: [string, string, string][] = [
    ["Haupttext auf Hintergrund", "#242A28", "#F5F3EE"],
    ["Haupttext auf Fläche", "#242A28", "#FFFFFF"],
    ["Sekundärtext auf Fläche", "#6F7773", "#FFFFFF"],
    ["Sekundärtext (abgedunkelt) auf Sekundärfläche", "#59615D", "#ECEEE8"],
    ["Weiß auf Salbei (Primärschaltfläche)", "#FFFFFF", "#4D7163"],
    ["Salbei dunkel auf Auswahl", "#3C5A4E", "#E0EBE4"],
    ["Energie dunkel auf Energie hell", "#5E4E97", "#ECE8F6"],
    ["Energie auf Fläche", "#7866B2", "#FFFFFF"],
    ["Warnung auf Warnfläche", "#8A5A00", "#FBF0D9"],
    ["Fehler auf Fehlerfläche", "#A63A2F", "#F8E3DF"],
  ];
  for (const [name, fg, bg] of cases) {
    it(`${name}: ${fg} auf ${bg}`, () => {
      const r = contrast(fg, bg);
      expect(r).toBeGreaterThanOrEqual(4.5);
    });
  }
});

it("Vorgabe #6F7773 auf #ECEEE8 ist zu schwach – daher abgedunkelte Variante ink-2s", () => {
  expect(contrast("#6F7773", "#ECEEE8")).toBeLessThan(4.5);
});
