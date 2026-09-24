import { expect, test, type Page } from "@playwright/test";

// Simuliert Windows-Skalierung 100/125/150/200 % über deviceScaleFactor und
// verkleinert das Fenster auf die Mindestgröße der App (720×520).
const SCALES = [1, 1.25, 1.5, 2];
const ROUTES = ["overview", "queue", "widgets", "history", "settings"];

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.querySelector(".content") ?? document.body;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, "horizontaler Überlauf").toBeLessThanOrEqual(1);
}

async function inViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} sichtbar`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
}

for (const scale of SCALES) {
  test.describe(`Skalierung ${scale * 100} %`, () => {
    test.use({ viewport: { width: 720, height: 520 }, deviceScaleFactor: scale });
    for (const route of ROUTES) {
      test(`${route}: kein Überlauf, Hauptaktionen erreichbar`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`/#/${route}`);
        await expect(page.locator(".topbar")).toBeVisible();
        await noHorizontalOverflow(page);
        await inViewport(page, ".req-switch");
        await inViewport(page, ".nav-item[aria-current='page']");
        expect(errors).toEqual([]);
      });
    }
  });
}

test("Übersicht: Transport-Steuerung bei kleinem Fenster sichtbar", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 520 });
  await page.goto("/#/overview");
  await inViewport(page, "button[aria-label='Überspringen']");
});

test("lange Titel und Namen werden gekürzt statt umzubrechen", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/#/queue");
  const row = page.locator(".item", { hasText: "Ein sehr langer Songtitel" }).first();
  const title = row.locator(".t").first();
  const clipped = await title.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(true);
  // Aktionen der Zeile bleiben sichtbar.
  await expect(row.getByRole("button", { name: "Entfernen" })).toBeVisible();
});

test("Kompaktmodus auf zweitem Monitor", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 380 });
  await page.goto("/#/compact");
  await inViewport(page, ".req-switch");
  await inViewport(page, "text=Überspringen");
  await noHorizontalOverflow(page);
});

test("Tastaturbedienung: Request-Schalter per Tab und Enter", async ({ page }) => {
  await page.goto("/#/overview");
  const sw = page.locator(".req-switch");
  await expect(sw).toHaveAttribute("aria-pressed", "true");
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    if (await sw.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(sw).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sw).toHaveAttribute("aria-pressed", "false");
});

test("Browser-Vorschau ist klar gekennzeichnet (keine vorgetäuschte Verbindung)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("keine echte Spotify- oder Twitch-Verbindung");
});

test("Fehlerzustände nennen eine nächste Handlung", async ({ page }) => {
  await page.goto("/?state=offline#/overview");
  await expect(page.getByText("Spotify: Nicht erreichbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verbindung prüfen" }).first()).toBeVisible();
  await page.goto("/?state=reauth#/overview");
  await expect(page.getByRole("button", { name: "Neu anmelden" }).first()).toBeVisible();
  await page.goto("/?state=nodevice#/overview");
  await expect(page.getByRole("button", { name: "Spotify öffnen" })).toBeVisible();
});

test("Hell- und Dunkelmodus", async ({ page }) => {
  await page.goto("/#/settings");
  await page.getByRole("tab", { name: "App" }).click();
  await page.getByRole("button", { name: "Hell" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dunkel" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
