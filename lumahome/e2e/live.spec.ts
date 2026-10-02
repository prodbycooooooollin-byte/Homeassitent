// Abnahme im Live-Modus gegen einen SIMULIERTEN Home-Assistant-Server
// (tools/fake-ha/server.mjs). Es werden keine echten Geräte angesprochen.
import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiProject, fake, screenOf, tab, waitSaved } from "./helpers";

test.describe.configure({ mode: "serial" });

test("1. Zwei Räume anlegen, einrichten, speichern und nach Neuladen wieder öffnen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("choose-live").click();
  await page.getByLabel("Name deines Zuhauses").fill("Testhaus");
  await page.getByLabel("Name deines Zuhauses").press("Enter");
  await page.getByTestId("start-empty").click();
  await expect(page.getByTestId("floorplan")).toBeVisible();
  // Raum 1: Rechteck aufziehen
  await page.getByTestId("tool-rect").click();
  const svg = page.getByRole("application", { name: /Grundriss/ });
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 340, { steps: 6 });
  await page.mouse.move(box.x + 520, box.y + 420, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-room="Raum 1"]')).toHaveCount(1);
  // Raum 2: per Maßeingabe (Alternative ohne Ziehen)
  await page.getByTestId("tool-dims").click();
  const dlg = page.getByRole("dialog", { name: "Raum mit Maßen anlegen" });
  await dlg.getByLabel("Name").fill("Küche");
  await dlg.getByLabel("Name").press("Tab");
  await dlg.getByLabel("Breite").fill("300");
  await dlg.getByLabel("Breite").press("Tab");
  await dlg.getByRole("button", { name: /Rechts an bestehende Räume/ }).click();
  await dlg.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.locator('[data-room="Küche"]')).toHaveCount(1);
  // Einrichten: Sofa in die Küche (gewählter Raum), Deckenleuchte in Raum 1
  await page.getByRole("radio", { name: /Einrichten/ }).click();
  await page.getByTestId("tool-catalog").click();
  await page.getByLabel("Katalog durchsuchen").fill("Sofa");
  await page.getByRole("button", { name: "Sofa, 3-Sitzer platzieren" }).click();
  await expect(page.getByTestId("properties")).toContainText("Sofa, 3-Sitzer");
  await page.locator('[data-room="Raum 1"]').click({ position: { x: 20, y: 20 } });
  await page.getByTestId("tool-catalog").click();
  await page.getByLabel("Katalog durchsuchen").fill("Deckenleuchte");
  await page.getByRole("button", { name: "Deckenleuchte platzieren" }).click();
  await waitSaved(page);
  const saved = await apiProject(page);
  expect(saved.project.rooms.map((r) => r.name).sort()).toEqual(["Küche", "Raum 1"]);
  expect(saved.project.items.map((i) => i.name).sort()).toEqual(["Deckenleuchte", "Sofa, 3-Sitzer"]);
  await page.reload();
  await expect(page.getByTestId("house-name")).toHaveText("Testhaus");
  await tab(page, "Gestalten");
  await expect(page.locator('[data-room="Raum 1"]')).toHaveCount(1);
  await expect(page.locator('[data-room="Küche"]')).toHaveCount(1);
  await expect(page.locator('[data-item="Sofa, 3-Sitzer"]')).toHaveCount(1);
});

test("2. Grundriss ändern und dieselbe Änderung im 3D-Modell sehen", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Gestalten");
  const { project } = await apiProject(page);
  const kitchen = project.rooms.find((r) => r.name === "Küche")!;
  await page.locator('[data-room="Küche"]').click({ position: { x: 10, y: 10 } });
  const props = page.getByTestId("properties");
  await props.getByLabel("Breite").fill("450");
  await props.getByLabel("Breite").press("Enter");
  await waitSaved(page);
  const after = (await apiProject(page)).project.rooms.find((r) => r.id === kitchen.id)!;
  const xs = after.vertices.map((v) => v.x);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4.5, 3);
  await page.getByRole("radio", { name: "3D" }).click();
  await page.waitForFunction(() => !!(window as unknown as { __lh?: unknown }).__lh);
  await page.waitForTimeout(500);
  const ext = await page.evaluate((id) => (window as unknown as { __lh: { floorExtents: () => Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> } }).__lh.floorExtents()[id], kitchen.id);
  expect(ext.maxX - ext.minX).toBeCloseTo(4.5, 2);
  expect(ext.minX).toBeCloseTo(Math.min(...xs), 2);
});

test("3. Möbel platzieren, verändern und Änderungen rückgängig machen", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Gestalten");
  await page.getByRole("radio", { name: "2D" }).click();
  await page.getByRole("radio", { name: /Einrichten/ }).click();
  await page.locator('[data-room="Raum 1"]').click({ position: { x: 20, y: 20 } });
  if (!(await page.getByTestId("catalog").isVisible())) await page.getByTestId("tool-catalog").click();
  await page.getByLabel("Katalog durchsuchen").fill("Sessel");
  await page.getByRole("button", { name: "Sessel platzieren" }).click();
  const props = page.getByTestId("properties");
  await expect(props).toContainText("Sessel");
  await props.getByLabel("Breite").fill("120");
  await props.getByLabel("Breite").press("Enter");
  await expect(props.getByLabel("Breite")).toHaveValue("120");
  await page.getByTestId("undo").click();
  await expect(props.getByLabel("Breite")).toHaveValue("85");
  await page.getByTestId("undo").click();
  await expect(page.locator('[data-item="Sessel"]')).toHaveCount(0);
  await page.getByTestId("redo").click();
  await expect(page.locator('[data-item="Sessel"]')).toHaveCount(1);
  await waitSaved(page);
});

test("4. Reale (simulierte) Lampe über die Steuerkarte bedienen und bestätigten Zustand sehen", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Gestalten");
  await page.getByRole("radio", { name: "2D" }).click();
  await page.getByRole("radio", { name: /Verbinden/ }).click();
  await page.locator('[data-item="Deckenleuchte"]').click();
  const panel = page.getByTestId("connect-panel");
  await panel.getByLabel("Geräte durchsuchen").fill("Wohnzimmer");
  const row = panel.getByTestId("candidates").locator("li", { hasText: "Wohnzimmer Decke" });
  await row.getByRole("button", { name: "Zuordnen" }).click();
  await expect(panel).toContainText("light.wohnzimmer");
  await waitSaved(page);
  await tab(page, "Zuhause");
  const { project } = await apiProject(page);
  const lamp = project.items.find((i) => i.name === "Deckenleuchte")!;
  await page.waitForTimeout(800);
  const p = (await screenOf(page, "item", lamp.id))!;
  await page.mouse.click(p.x, p.y + 4);
  const card = page.getByTestId("control-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("state-summary")).toHaveText("Aus");
  await card.getByRole("switch", { name: /Wohnzimmer Decke schalten/ }).click();
  await expect(card.getByTestId("pending")).toBeVisible();
  await expect(card.getByTestId("confirmed")).toBeVisible();
  await expect(card.getByTestId("state-summary")).toHaveText(/^An/);
  const calls = (await fake("/control/calls")) as { service: string; entity_id: string }[];
  expect(calls.some((c) => c.entity_id === "light.wohnzimmer" && c.service === "turn_on")).toBe(true);
});

test("5. Externe Geräteänderung empfangen", async ({ page }) => {
  await page.goto("/");
  const { project } = await apiProject(page);
  const lamp = project.items.find((i) => i.name === "Deckenleuchte")!;
  await page.waitForTimeout(800);
  const p = (await screenOf(page, "item", lamp.id))!;
  await page.mouse.click(p.x, p.y + 4);
  const card = page.getByTestId("control-card");
  await expect(card.getByTestId("state-summary")).toHaveText(/^An/);
  const before = ((await fake("/control/calls")) as unknown[]).length;
  await fake("/control/set", { entity_id: "light.wohnzimmer", state: "off", attributes: { friendly_name: "Wohnzimmer Decke", supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 } });
  await expect(card.getByTestId("state-summary")).toHaveText("Aus");
  expect(((await fake("/control/calls")) as unknown[]).length).toBe(before);
});

test("6./8. Leistungssensor und Energiezähler mit Einheiten; übergeordneter Zähler ohne Doppelzählung", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Energie");
  await expect(page.getByTestId("energy-panel")).toContainText("Noch keine Messquelle zugeordnet");
  await page.getByRole("radio", { name: /Messquellen/ }).click();
  const addMeter = async (label: string, power: string, energy: string, opts: { main?: boolean; parent?: string }) => {
    await page.getByTestId("add-meter").click();
    const d = page.getByRole("dialog", { name: "Messpunkt hinzufügen" });
    await d.getByLabel("Bezeichnung").fill(label);
    await d.getByLabel("Bezeichnung").press("Tab");
    await d.getByRole("button", { name: "Keine – auswählen" }).first().click();
    await d.getByRole("button", { name: new RegExp(power) }).click();
    await d.getByRole("button", { name: "Keine – auswählen" }).click();
    await d.getByRole("button", { name: new RegExp(energy) }).click();
    await expect(d.getByText(/Einheit k?Wh? passt\./)).toHaveCount(2);
    if (opts.main) await d.getByLabel(/Hauszähler \(gesamter Hausverbrauch\)/).check();
    if (opts.parent) await d.getByLabel("Enthalten in (übergeordneter Zähler)").selectOption({ label: `${opts.parent} (Hauszähler)` });
    await d.getByRole("button", { name: "Speichern" }).click();
  };
  await addMeter("Hauszähler", "Hauszähler Leistung", "Hauszähler Energie", { main: true });
  await addMeter("Fernseher", "TV Leistung", "TV Energie", { parent: "Hauszähler" });
  await waitSaved(page);
  await page.getByRole("radio", { name: "Jetzt" }).click();
  // 1,25 kW Hauszähler – nicht zusätzlich die 87,5 W des Fernsehers
  await expect(page.getByTestId("stat-house-power")).toContainText("1,25 kW");
  await expect(page.getByTestId("stat-house-energy")).toContainText("kWh");
  // 87,5 W des Fernsehers werden als gerundete Leistung angezeigt
  await expect(page.getByTestId("energy-panel")).toContainText("88 W");
  await page.getByRole("radio", { name: "Verlauf" }).click();
  const tree = page.getByTestId("meter-tree");
  await expect(tree).toContainText("Hauszähler (Hauszähler)");
  await expect(tree).toContainText("Fernseher");
  await expect(tree).toContainText("Nicht einzeln erfasst");
  // Summe des Tages entspricht dem Hauszähler (0,5 kWh je Stunde), nicht Hauszähler + Fernseher
  const top = page.getByTestId("top-consumers");
  await expect(top).toContainText("Fernseher");
  await expect(top).not.toContainText("Hauszähler");
});

test("7. Verbrauchsverlauf mit erkennbaren Messlücken", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Energie");
  await page.getByRole("radio", { name: "Verlauf" }).click();
  await page.getByRole("radio", { name: "Tag", exact: true }).click();
  const chart = page.getByTestId("history-chart");
  await expect(chart).toBeVisible();
  const hour = new Date().getHours();
  test.skip(hour < 5, "Die simulierte Lücke 02:00–05:00 liegt erst ab 05:00 vollständig in der Vergangenheit.");
  await expect(chart.locator("rect[data-gap]")).toHaveCount(3);
  await expect(chart).toContainText("Messlücke (3)");
  // Zeitraumauswahl Woche/Monat
  await page.getByRole("radio", { name: "Woche", exact: true }).click();
  await expect(page.getByTestId("range-title")).toContainText("–");
  await page.getByRole("radio", { name: "Monat", exact: true }).click();
  await expect(chart).toBeVisible();
});

test("9. Verbindungsabbruch und Wiederverbindung", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("connection-status")).toContainText("Live verbunden");
  await fake("/control/refuse", { ms: 4000 });
  await fake("/control/drop", {});
  await expect(page.getByTestId("connection-status")).toContainText("Getrennt");
  // Änderung während des Abbruchs – muss nach der Neusynchronisierung sichtbar sein
  await fake("/control/set", { entity_id: "light.kueche", state: "on", attributes: { friendly_name: "Küche Licht", supported_color_modes: ["onoff"] } });
  await tab(page, "Geräte");
  await expect(page.getByTestId("connection-detail")).toContainText("Grund:");
  await expect(page.getByTestId("connection-status")).toContainText("Live verbunden", { timeout: 30_000 });
  await page.getByLabel("Nicht zugeordnete Geräte durchsuchen").fill("Küche Licht");
  await expect(page.getByTestId("unassigned")).toContainText("An");
});

test("10. Projekt exportieren und vollständig wieder importieren", async ({ page }) => {
  // Dateien in einem ASCII-Pfad ablegen (Chromium liest Upload-Pfade mit Umlauten nicht zuverlässig)
  const dir = mkdtempSync(join(tmpdir(), "lumahome-e2e-"));
  await page.goto("/");
  const original = (await apiProject(page)).project;
  await page.getByRole("button", { name: "Einstellungen und Projekt" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
  const file = join(dir, "export.lumahome.json");
  await download.saveAs(file);
  const exported = JSON.parse(readFileSync(file, "utf8"));
  expect(exported.format).toBe("lumahome-project");
  expect(JSON.stringify(exported)).not.toContain("e2e-token-0123456789");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  // Projekt verändern: Küche löschen
  await tab(page, "Gestalten");
  await page.getByRole("radio", { name: "2D" }).click();
  await page.getByRole("radio", { name: /Grundriss/ }).click();
  await page.locator('[data-room="Küche"]').click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Raum löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^(Raum und Objekte löschen|Raum löschen)$/ }).click();
  await expect(page.locator('[data-room="Küche"]')).toHaveCount(0);
  await waitSaved(page);
  // Ungültige Datei: Import wird abgelehnt, Projekt bleibt erhalten
  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ format: "lumahome-project", formatVersion: 1, project: { rooms: "kaputt" } }));
  await page.getByRole("button", { name: "Einstellungen und Projekt" }).click();
  await page.getByTestId("import-file").setInputFiles(bad);
  await expect(page.getByText("Import abgelehnt")).toBeVisible();
  // Gültiger Import stellt alles wieder her
  await page.getByTestId("import-file").setInputFiles(file);
  await page.getByTestId("confirm-import").click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator('[data-room="Küche"]')).toHaveCount(1);
  await waitSaved(page);
  const restored = (await apiProject(page)).project;
  expect(restored).toEqual({ ...original, updatedAt: restored.updatedAt });
});
