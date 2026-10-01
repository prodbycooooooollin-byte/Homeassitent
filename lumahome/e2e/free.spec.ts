// 12. Katalog und Funktionen ohne Kauf, Lizenzschlüssel oder Freischaltung.
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tab } from "./helpers";

const FORBIDDEN = /(kaufen|preis|premium|abonnement|\babo\b|lizenzschlüssel|freischalt|in-app|€|upgrade auf)/i;

test("12. Alle Katalogeinträge und Bereiche sind ohne Kauf erreichbar", async ({ page }) => {
  await page.goto("/");
  // Läuft ggf. vor der Ersteinrichtung – dann im gekennzeichneten Demo-Modus prüfen
  const demo = page.getByTestId("choose-demo");
  await page.locator('[data-testid="choose-demo"], nav[aria-label="Hauptbereiche"]').first().waitFor();
  if (await demo.isVisible().catch(() => false)) await demo.click();
  await tab(page, "Gestalten");
  await page.getByRole("radio", { name: /Einrichten/ }).click();
  const catalog = page.getByTestId("catalog");
  if (!(await catalog.isVisible().catch(() => false))) await page.getByTestId("tool-catalog").click();
  await expect(catalog).toBeVisible();
  const buttons = catalog.getByRole("button", { name: / platzieren$/ });
  const n = await buttons.count();
  expect(n).toBeGreaterThanOrEqual(40);
  for (let i = 0; i < n; i++) await expect(buttons.nth(i)).toBeEnabled();
  for (const t of ["Zuhause", "Gestalten", "Energie", "Geräte"] as const) {
    await tab(page, t);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(FORBIDDEN);
  }
  // Auch der ausgelieferte Code enthält keine Kauf- oder Lizenzlogik
  const dir = "dist/assets";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js") && x.startsWith("index"))) {
    expect(readFileSync(join(dir, f), "utf8")).not.toMatch(/Lizenzschlüssel|In-App-Kauf|Premium/);
  }
});
