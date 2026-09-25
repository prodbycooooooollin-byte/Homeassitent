import { expect, test, type Page } from "@playwright/test";

// Simuliert Windows-Skalierung 100/125/150/200 % über deviceScaleFactor und
// verkleinert das Fenster auf die Mindestgröße der App (720×520).
const SCALES = [1, 1.25, 1.5, 2];
// „history“ ist seit dem Redesign ein Tab der Warteschlange; die alte Route bleibt als Alias erhalten.
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
  await expect(page.getByRole("button", { name: "Spotify öffnen" }).first()).toBeVisible();
});

test("Hell- und Dunkelmodus", async ({ page }) => {
  await page.goto("/#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Erscheinungsbild" }).click();
  await page.getByRole("button", { name: "Hell" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dunkel" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

// ---- Redesign 0.2: Zielauflösungen, Request-Wege, Streamplanung, Updates ----

for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
  test(`Übersicht ${w}×${h}: Player, nächste Requests und Request-Steuerung im Blick`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/?state=full#/overview");
    await noHorizontalOverflow(page);
    await inViewport(page, ".hero");
    await inViewport(page, "#next-h");
    await inViewport(page, "#rc-h");
    // Bei 1080p steht die Streamplanung neben der Request-Steuerung, bei 720p direkt darunter.
    if (h >= 1080) await inViewport(page, "#plan-h");
    else await expect(page.locator("#plan-h")).toBeAttached();
    // Keine abgeschnittenen Kopfzeilen-Aktionen in der Seitenleiste.
    const head = page.locator(".ov-side .card-head").first();
    const clipped = await head.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
  });
}

test("globale Pause überlagert beide Wege, ohne deren Einstellungen zu ändern", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?state=cp#/overview");
  const rc = page.locator("section[aria-labelledby='rc-h']");
  const chat = rc.getByRole("switch", { name: "Chatrequests" });
  const cp = rc.getByRole("switch", { name: "Kanalpunkte" });
  await expect(chat).toBeChecked();
  await expect(cp).toBeChecked();
  await rc.getByRole("switch", { name: "Requests annehmen" }).dispatchEvent("click");
  await expect(page.locator(".topbar")).toContainText("Requests pausiert");
  await expect(chat).toBeChecked();
  await expect(cp).toBeChecked();
  await expect(rc.locator(".why-line.ok")).toHaveCount(0);
});

test("Wege einzeln: nur Kanalpunkte aktiv", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?state=cp#/overview");
  const rc = page.locator("section[aria-labelledby='rc-h']");
  await rc.getByRole("switch", { name: "Chatrequests" }).dispatchEvent("click");
  await expect(page.locator(".topbar")).toContainText("Kanalpunkte");
  await expect(page.locator(".topbar")).not.toContainText("!sr");
});

test("Streamplanung: Schnellwahl startet Budget, +15 hebt manuelle Pause nicht auf", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/overview");
  const plan = page.locator("section[aria-labelledby='plan-h']");
  await plan.getByRole("button", { name: "30 Min" }).click();
  await expect(plan.locator(".budget")).toBeVisible();
  const rc = page.locator("section[aria-labelledby='rc-h']");
  await rc.getByRole("switch", { name: "Requests annehmen" }).dispatchEvent("click");
  await plan.getByRole("button", { name: "+15 Minuten" }).click();
  await expect(rc.getByRole("switch", { name: "Requests annehmen" })).not.toBeChecked();
  await expect(page.locator(".topbar")).toContainText("Requests pausiert");
  await plan.getByRole("button", { name: "Planung beenden" }).click();
  await expect(plan.locator(".budget")).toHaveCount(0);
});

test("abgelaufenes Streamende bleibt geschlossen und wird benannt", async ({ page }) => {
  await page.goto("/?state=ended#/overview");
  await expect(page.locator(".topbar")).toContainText("Automatisch pausiert");
  await expect(page.locator(".topbar")).toContainText("Streamende erreicht");
});

test("Überplanung bietet Entscheidungen an", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?state=overplanned#/overview");
  const plan = page.locator("section[aria-labelledby='plan-h']");
  await expect(plan.getByRole("button", { name: /verlängern/ })).toBeVisible();
});

test("Updates: nicht eingerichtet wird nie als „aktuell“ angezeigt", async ({ page }) => {
  await page.goto("/#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Updates" }).click();
  await expect(page.locator(".content")).not.toContainText("Du nutzt die aktuelle Version");
  await expect(page.getByRole("button", { name: "Nach Updates suchen" })).toBeDisabled();
});

test("Updates: Download führt zu „bereit“, Installation nur nach Bestätigung", async ({ page }) => {
  await page.goto("/?state=update#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Updates" }).click();
  await page.getByRole("button", { name: "Update herunterladen" }).click();
  await expect(page.getByRole("progressbar").first()).toBeVisible();
  const install = page.getByRole("button", { name: "Jetzt installieren und neu starten" });
  await expect(install).toBeVisible({ timeout: 10_000 });
  await install.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Später" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Tastatur: Einstellungsbereiche per Tab erreichbar", async ({ page }) => {
  await page.goto("/#/settings");
  const target = page.locator(".settings-nav").getByRole("button", { name: "Streamplanung" });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".content h1, .content h2").first()).toContainText("Streamplanung");
});

test("Werbung und veraltete Daten zeigen keine widersprüchlichen Zeiten", async ({ page }) => {
  await page.goto("/?state=ad#/overview");
  await expect(page.locator(".hero")).toContainText("Werbung");
  await expect(page.locator(".hero .progress")).toHaveCount(0);
  await page.goto("/?state=offline#/overview");
  await expect(page.locator(".hero")).toContainText("aktuelle Position unbekannt");
  await expect(page.locator(".hero .progress")).toHaveCount(0);
});

test("Verbindungs-Popover liegt über dem Player (Stapelreihenfolge)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?state=full#/overview");
  await page.locator(".conn-sum").click();
  const pop = page.locator(".popover");
  await expect(pop).toBeVisible();
  const box = (await pop.boundingBox())!;
  // Der oberste Punkt an mehreren Stellen des Popovers muss zum Popover gehören – nicht zum Player.
  for (const [fx, fy] of [[0.2, 0.3], [0.5, 0.5], [0.8, 0.8]]) {
    const inside = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".popover"), [box.x + box.width * fx, box.y + box.height * fy]);
    expect(inside).toBe(true);
  }
});

test("Zusammenfassung sagt nie „Alles verbunden“, wenn Spotify fehlt", async ({ page }) => {
  await page.goto("/?state=reauth#/overview");
  await expect(page.locator(".conn-sum")).not.toContainText("Alles verbunden");
});
