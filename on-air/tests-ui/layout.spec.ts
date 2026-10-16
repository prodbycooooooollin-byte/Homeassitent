import { expect, test, type Page } from "@playwright/test";

// Simuliert Windows-Skalierung 100/125/150/200 % über deviceScaleFactor und
// verkleinert das Fenster auf die Mindestgröße der App (720×520).
const SCALES = [1, 1.25, 1.5, 2];
// Seit dem Nachtblau-Design: Navigation oben (Live, Warteschlange, Overlays, Verlauf), Statusleiste unten.
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
        await expect(page.locator(".topnav")).toBeVisible();
        await expect(page.locator(".statusbar")).toBeVisible();
        await noHorizontalOverflow(page);
        await inViewport(page, ".sb-req");
        await inViewport(page, ".topnav [aria-current='page']");
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
  const sw = page.locator(".sb-req");
  await expect(sw).toHaveAttribute("aria-pressed", "true");
  for (let i = 0; i < 80; i++) {
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
    // Requests pausieren/öffnen steht immer in der Statusleiste; Details (Steuerung, Planung) darunter.
    await inViewport(page, ".sb-req");
    await expect(page.locator("#rc-h")).toBeAttached();
    await expect(page.locator("#plan-h")).toBeAttached();
    // Keine abgeschnittenen Aktionen in der Kopfzeile von „Als Nächstes“.
    const head = page.locator(".upnext-head").first();
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
  await expect(page.locator(".statusbar")).toContainText("Requests pausiert");
  await expect(chat).toBeChecked();
  await expect(cp).toBeChecked();
  await expect(rc.locator(".why-line.ok")).toHaveCount(0);
});

test("Wege einzeln: nur Kanalpunkte aktiv", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?state=cp#/overview");
  const rc = page.locator("section[aria-labelledby='rc-h']");
  await rc.getByRole("switch", { name: "Chatrequests" }).dispatchEvent("click");
  await expect(page.locator(".statusbar")).toContainText("Kanalpunkte");
  await expect(page.locator(".statusbar")).not.toContainText("!sr");
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
  await expect(page.locator(".statusbar")).toContainText("Requests pausiert");
  await plan.getByRole("button", { name: "Planung beenden" }).click();
  await expect(plan.locator(".budget")).toHaveCount(0);
});

test("abgelaufenes Streamende bleibt geschlossen und wird benannt", async ({ page }) => {
  await page.goto("/?state=ended#/overview");
  await expect(page.locator(".statusbar")).toContainText("Automatisch pausiert");
  await expect(page.locator(".statusbar")).toContainText("Streamende erreicht");
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

test("Automatisches Update: Countdown sichtbar, „Nicht jetzt“ setzt für die Sitzung aus", async ({ page }) => {
  await page.goto("/?state=autoupdate#/overview");
  const banner = page.locator(".auto-update-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("installiert Version 0.2.1 in");
  await expect(banner.getByRole("button", { name: "Jetzt installieren" })).toBeVisible();
  await banner.getByRole("button", { name: "Nicht jetzt" }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await page.locator(".settings-nav").getByRole("button", { name: "Updates" }).click();
  await expect(page.locator(".content")).toContainText("bis zum nächsten Start ausgesetzt");
  // Automatik bleibt eingeschaltet – nur diese Sitzung ist ausgesetzt.
  await expect(page.locator(".setting-row", { hasText: "Updates automatisch installieren" }).locator("input[role=switch]")).toBeChecked();
});

test("Automatisches Update: Countdown auch im Kompaktfenster", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 560 });
  await page.goto("/?state=autoupdate#/compact");
  await inViewport(page, ".auto-update-banner button:has-text('Nicht jetzt')");
  await noHorizontalOverflow(page);
});

// Absicherung: Umschalten eines Chatbefehls darf das Dokument nicht verschieben (graues Fenster).
// Hinweis: Der ursprüngliche Fehler trat in der WebView der App auf, nicht in Chromium – dieser
// Test prüft das gewünschte Verhalten, reproduziert den alten Fehler aber nicht.
test("Chatbefehle umschalten verschiebt die App nicht", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Chatbefehle" }).click();
  const switches = page.locator(".settings-section .list").getByRole("switch");
  for (const i of [3, 4, 0]) {
    // Wie ein Nutzer: auf den sichtbaren Schalter (Label) klicken.
    const label = switches.nth(i).locator("xpath=..");
    const before = await switches.nth(i).isChecked();
    await label.click();
    await expect(switches.nth(i)).toBeChecked({ checked: !before });
    await label.click();
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    await inViewport(page, ".topnav");
  }
});

test("eigene Befehle: Vorlage einfügen, Vorschau, Konflikt-Hinweis", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Chatbefehle" }).click();
  await page.selectOption('select[aria-label="Vorlage hinzufügen …"]', "hug");
  const item = page.getByTestId("custom-command").first();
  await expect(item.locator(".cc-preview")).toContainText("Kira umarmt Tom");
  await item.locator("input.input").first().fill("song");
  await expect(item).toContainText("eingebauter Befehl");
  await noHorizontalOverflow(page);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
});

test("fremde Kanalpunkte-Belohnung: Hinweis und Übernahme", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?state=cp-foreign#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Kanalpunkte" }).click();
  await expect(page.getByText("Einlösung von „Song Request“ ignoriert")).toBeVisible();
  await page.getByRole("button", { name: "„Song Request“ verwenden" }).click();
  await expect(page.getByText("Bestehende Belohnung „Song Request“ wird verwendet")).toBeVisible();
});

test("Sammel-Playlist: Einstellungen und Status", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Requests" }).click();
  await page.getByRole("switch", { name: "Wünsche in Playlist sammeln" }).dispatchEvent("click");
  await expect(page.getByText("Songs gesammelt")).toBeVisible();
  await expect(page.getByRole("button", { name: "In Spotify öffnen" })).toBeVisible();
  await noHorizontalOverflow(page);
});

test("Als Nächstes: feste Kartenbreite, seitlich scrollbar per Mausrad und Pfeil", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?state=full#/overview");
  const row = page.locator(".upnext-row");
  const card = page.locator(".upnext-card").first();
  const w = (await card.boundingBox())!.width;
  expect(w).toBeGreaterThanOrEqual(290);
  expect(w).toBeLessThanOrEqual(390);
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await row.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.locator(".strip-nav.prev").click();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(0);
  await noHorizontalOverflow(page);
});

// Universal Request (Beispiel-Backend): Links werden erkannt, Versionen/Playlists verlangen eine Auswahl,
// jede Zeile zeigt das Vorabprüfungsergebnis.
test("Song hinzufügen: Link mit mehreren Versionen zeigt Auswahl und Vorabprüfung", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/queue");
  await page.getByRole("button", { name: "Song hinzufügen" }).first().click();
  await page.getByLabel(/Titel, Interpret oder Link/).fill("https://youtu.be/dQw4w9WgXcQ");
  await expect(page.getByText("Mehrere passende Versionen – bitte wählen")).toBeVisible();
  await expect(page.locator(".verdict").first()).toBeVisible();
  await expect(page.getByText(/Bereits auf Platz \d/).first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test("Song hinzufügen: Playlist lädt seitenweise, Filter ist als Teilmenge gekennzeichnet", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/queue");
  await page.getByRole("button", { name: "Song hinzufügen" }).first().click();
  await page.getByLabel(/Titel, Interpret oder Link/).fill("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
  const loaded = page.getByText(/\d+ von 40 geladen/);
  await expect(loaded).toBeVisible();
  const count = async () => Number((await loaded.textContent())!.match(/(\d+) von 40/)![1]);
  const before = await count();
  await page.getByLabel("In geladenen Titeln filtern").fill("glass");
  await expect(page.getByText("Der Filter durchsucht nur die bereits geladenen Titel.")).toBeVisible();
  await page.getByLabel("In geladenen Titeln filtern").fill("");
  await page.getByRole("button", { name: "Weitere laden" }).click();
  await expect.poll(count).toBeGreaterThan(before);
  await page.getByRole("button", { name: /Wählen: Glass Harbour/ }).first().click();
  await expect(page.getByText("Spotify-Version bestätigen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zurück zur Liste" })).toBeVisible();
});

test("Song hinzufügen: nicht unterstützter Dienst wird verständlich abgelehnt", async ({ page }) => {
  await page.goto("/#/queue");
  await page.getByRole("button", { name: "Song hinzufügen" }).first().click();
  await page.getByLabel(/Titel, Interpret oder Link/).fill("https://www.deezer.com/track/1");
  await expect(page.getByText("Dieser Musikdienst wird nicht unterstützt", { exact: false })).toBeVisible();
});

test("Song ändern über das Zeilenmenü behält den Platz", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/queue");
  const menus = page.getByRole("button", { name: "…" });
  let found = false;
  for (let i = 0; i < (await menus.count()) && !found; i++) {
    await menus.nth(i).click();
    const item = page.getByRole("menuitem", { name: "Song ändern" });
    if (await item.count()) {
      await item.click();
      found = true;
    } else {
      await menus.nth(i).click();
    }
  }
  expect(found, "mindestens ein offener Wunsch hat „Song ändern“").toBe(true);
  await expect(page.getByText("Platz in der Warteschlange bleibt erhalten")).toBeVisible();
});

test("Einstellungen: Musikquellen zeigen Fähigkeiten und maskierte Zugangsdaten", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/settings");
  await page.locator(".settings-nav").getByRole("button", { name: "Musikquellen" }).click();
  await expect(page.getByText("YouTube").first()).toBeVisible();
  await expect(page.getByText("SoundCloud").first()).toBeVisible();
  const secrets = page.locator('.settings-section input[type="password"]');
  expect(await secrets.count()).toBeGreaterThanOrEqual(3);
  await noHorizontalOverflow(page);
});
