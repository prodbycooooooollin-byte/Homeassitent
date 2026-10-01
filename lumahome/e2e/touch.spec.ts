// 11. Kernabläufe per Touch (emuliertes Smartphone, Demo-Modus).
import { test, expect, type Page } from "@playwright/test";
import { screenOf, tab } from "./helpers";

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from) });
  for (let i = 1; i <= 8; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(p) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("11. Steuern, Gestalten und Energie mit Touch", async ({ page }) => {
  // Demo-Modus vorwählen (der Server hat bereits ein Live-Projekt aus den Desktop-Tests)
  await page.addInitScript(() => localStorage.setItem("lumahome.mode.v1", "demo"));
  await page.goto("/");
  await expect(page.getByTestId("house-name")).toHaveText("Haus am Lindenweg");
  // Leuchte im Modell antippen → Panel am unteren Rand
  await page.waitForTimeout(1200);
  const p = (await screenOf(page, "item", "i_kue_decke"))!;
  await page.touchscreen.tap(p.x, p.y + 3);
  const card = page.getByTestId("control-card");
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 5);
  const sw = card.getByRole("switch").first();
  const before = await sw.getAttribute("aria-checked");
  await sw.tap();
  await expect(card.getByTestId("confirmed")).toBeVisible();
  await expect(sw).not.toHaveAttribute("aria-checked", before ?? "");
  await card.getByTestId("close-card").tap();
  await expect(card).toHaveCount(0);
  // Gestalten: Rechteckraum per Touch aufziehen
  await tab(page, "Gestalten");
  const rooms = await page.locator("[data-room]").count();
  await page.getByTestId("tool-rect").tap();
  const svg = (await page.getByRole("application", { name: /Grundriss/ }).boundingBox())!;
  await touchDrag(page, { x: svg.x + svg.width * 0.45, y: svg.y + svg.height * 0.78 }, { x: svg.x + svg.width * 0.75, y: svg.y + svg.height * 0.92 });
  await expect(page.locator("[data-room]")).toHaveCount(rooms + 1);
  // Möbel ohne Ziehen platzieren
  await page.getByRole("radio", { name: /Einrichten/ }).tap();
  await page.getByRole("button", { name: "Auswahl aufheben" }).tap().catch(() => undefined);
  if (!(await page.getByTestId("catalog").isVisible())) await page.getByTestId("tool-catalog").tap();
  await page.getByRole("button", { name: "Zimmerpflanze platzieren" }).tap();
  await expect(page.getByTestId("properties")).toContainText("Zimmerpflanze");
  // Energie
  await tab(page, "Energie");
  await expect(page.getByTestId("energy-panel")).toBeVisible();
  await page.getByRole("radio", { name: "Verlauf" }).tap();
  await expect(page.getByTestId("history-chart")).toBeVisible();
});
