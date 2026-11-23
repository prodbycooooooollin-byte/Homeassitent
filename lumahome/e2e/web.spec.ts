// Webseiten-Betrieb: statisch ausgeliefert (wie GitHub Pages), Anmeldung mit
// Adresse und langlebigem Token, direkte Verbindung zum SIMULIERTEN Home Assistant.
import { test, expect } from "@playwright/test";
import { fake, screenOf, tab, waitSaved } from "./helpers";

const HA = "http://127.0.0.1:18124";
const TOKEN = "e2e-token-0123456789abcdefghijklmnop";

test.describe.configure({ mode: "serial" });

async function login(page: import("@playwright/test").Page, token = TOKEN, remember = true) {
  await page.goto("/");
  await page.getByLabel("Adresse deiner Home-Assistant-Instanz").fill(HA);
  await page.getByLabel("Langlebiger Zugriffstoken").fill(token);
  if (!remember) await page.getByLabel(/angemeldet bleiben/).uncheck();
  await page.getByTestId("login-submit").click();
}

test("Falscher Token wird verständlich abgelehnt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("login-form")).toBeVisible();
  await page.getByRole("button", { name: "Wie bekomme ich einen Token?" }).click();
  await expect(page.getByTestId("token-steps")).toContainText("Langlebige Zugriffstoken");
  await login(page, "falscher-token-0123456789abcdefghij");
  await expect(page.getByText("Der Zugriffstoken wurde abgelehnt")).toBeVisible();
});

test("Anmelden, Haus anlegen, Lampe zuordnen und schalten – gespeichert in Home Assistant", async ({ page, browser }) => {
  await login(page);
  // Noch kein Haus im HA-Konto → Anlage
  await page.getByTestId("start-with-room").click();
  await expect(page.getByTestId("connection-status")).toContainText("Live verbunden");
  // Leuchte platzieren und zuordnen
  await page.getByRole("radio", { name: /Einrichten/ }).click();
  if (!(await page.getByTestId("catalog").isVisible())) await page.getByTestId("tool-catalog").click();
  await page.getByLabel("Katalog durchsuchen").fill("Deckenleuchte");
  await page.getByRole("button", { name: "Deckenleuchte platzieren" }).click();
  await page.getByRole("radio", { name: /Verbinden/ }).click();
  await page.locator('[data-item="Deckenleuchte"]').click();
  const panel = page.getByTestId("connect-panel");
  await panel.getByLabel("Geräte durchsuchen").fill("Wohnzimmer Decke");
  await panel.getByTestId("candidates").locator("li", { hasText: "Wohnzimmer Decke" }).getByRole("button", { name: "Zuordnen" }).click();
  await waitSaved(page);
  const ud = (await fake("/control/userdata")) as Record<string, { revision: number; file: { project: { items: { id: string; name: string }[]; bindings: unknown[] } } }>;
  expect(ud.lumahome_project.file.project.bindings).toHaveLength(1);
  expect(JSON.stringify(ud)).not.toContain(TOKEN);
  const lamp = ud.lumahome_project.file.project.items.find((i) => i.name === "Deckenleuchte")!;
  // Steuern über die Steuerkarte im 3D-Modell
  await tab(page, "Zuhause");
  await page.waitForTimeout(800);
  const p = (await screenOf(page, "item", lamp.id))!;
  await page.mouse.click(p.x, p.y + 4);
  const card = page.getByTestId("control-card");
  await card.getByRole("switch").first().click();
  await expect(card.getByTestId("confirmed")).toBeVisible();
  await expect(card.getByTestId("state-summary")).toHaveText(/^An/);
  // Zweites Gerät (neuer Browser-Kontext) sieht nach Anmeldung dasselbe Haus
  const other = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page2 = await other.newPage();
  await login(page2);
  await expect(page2.getByTestId("house-name")).toHaveText("Mein Zuhause");
  await tab(page2, "Gestalten");
  await expect(page2.locator('[data-item="Deckenleuchte"]')).toHaveCount(1);
  await other.close();
});

test("Angemeldet bleiben, Abmelden entfernt den Token", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("house-name")).toHaveText("Mein Zuhause");
  await page.reload();
  await expect(page.getByTestId("house-name")).toHaveText("Mein Zuhause");
  expect(await page.evaluate(() => localStorage.getItem("lumahome.ha.v1"))).toContain("e2e-token");
  await tab(page, "Geräte");
  await expect(page.getByTestId("ha-account")).toContainText("Test-Benutzer");
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("login-form")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lumahome.ha.v1"))).toBeNull();
});

test("Ohne „angemeldet bleiben“ wird der Token nicht dauerhaft gespeichert", async ({ page }) => {
  await login(page, TOKEN, false);
  await expect(page.getByTestId("house-name")).toHaveText("Mein Zuhause");
  expect(await page.evaluate(() => localStorage.getItem("lumahome.ha.v1"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("lumahome.ha.v1"))).toContain("e2e-token");
});
