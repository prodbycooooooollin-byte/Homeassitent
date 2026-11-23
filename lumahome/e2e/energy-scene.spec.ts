// Energie-Visualisierung im Demo-Modus (simulierte Daten).
import { test, expect } from "@playwright/test";
import { tab } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lumahome.mode.v1", "demo"));
});

test("Wetter-Vorschau, Stromflüsse mit drei Akkus und Analyse", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("house-name")).toHaveText("Haus am Lindenweg");
  // Wetter/Tageszeit und Energie-Kurzinfo auf der Startseite
  await expect(page.getByTestId("weather-chip")).toBeVisible();
  await expect(page.getByTestId("energy-chip")).toContainText("%");
  await page.getByRole("button", { name: "Ansicht", exact: true }).click();
  await page.getByRole("radio", { name: "Regen" }).click();
  await page.getByRole("radio", { name: "Nacht" }).click();
  await expect(page.getByTestId("weather-chip")).toContainText("Regen");
  await expect(page.getByTestId("weather-chip")).toContainText("Vorschau");
  await page.getByRole("radio", { name: "Live" }).first().click();
  await page.getByRole("radio", { name: "Live" }).nth(1).click();
  await expect(page.getByTestId("weather-chip")).not.toContainText("Vorschau");
  await page.getByRole("button", { name: "Schließen" }).first().click();
  // Energie: Außenansicht mit Akkus und PV
  await tab(page, "Energie");
  await expect(page.getByTestId("battery-badge")).toContainText("Akku 1");
  await expect(page.getByTestId("battery-badge")).toContainText("Akku 3");
  await expect(page.getByTestId("pv-badge")).toContainText("PV");
  // Demo-Wetter Regen senkt die PV-Leistung (bei Tag) – Wetter wird im Chip übernommen
  await page.getByRole("radio", { name: "Analyse" }).click();
  await expect(page.getByTestId("autarky")).toContainText("%");
  // Vor Sonnenaufgang gibt es keinen PV-Ertrag – dann muss ein Grund statt einer Zahl erscheinen
  await expect(page.getByTestId("self-consumption")).toContainText(/%|Keine PV-Erzeugung/);
  await expect(page.getByTestId("savings")).toContainText(/€|–/);
  await expect(page.getByTestId("findings")).toBeVisible();
});

test("Außenbereich anlegen: ohne Wände, mit Whirlpool aus dem Katalog", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Gestalten");
  await page.locator('[data-room="Garten"]').click({ position: { x: 30, y: 30 } });
  await expect(page.getByTestId("room-outdoor")).toBeChecked();
  await page.getByRole("radio", { name: /Einrichten/ }).click();
  await page.getByRole("button", { name: "Auswahl aufheben" }).click().catch(() => undefined);
  if (!(await page.getByTestId("catalog").isVisible())) await page.getByTestId("tool-catalog").click();
  await page.getByRole("button", { name: "Außen & Garten" }).click();
  await expect(page.getByRole("button", { name: "Whirlpool platzieren" })).toBeEnabled();
});
