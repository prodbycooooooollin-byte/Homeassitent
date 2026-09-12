// Verifiziert die Weltkarte end-to-end mit zwei parallelen Browser-
// Sitzungen: Marker- und Zeichnungserstellung, Live-Sync ohne Reload (SSE),
// dauerhafte Speicherung über einen harten Reload hinweg, und dass ein
// Nicht-Besitzer fremde Einträge nicht bearbeiten/löschen kann.
//
// Voraussetzung: eine laufende Instanz mit bereits eingerichtetem Server
// (Einrichtungsassistent abgeschlossen) - siehe npm run smoke-test für den
// Teil, der den Assistenten selbst durchläuft.
//
// Nutzung:
//   BASE_URL=http://localhost:3000 node scripts/smoke-test-map.mjs
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ts = Date.now();
const USER_A = { email: `map-test-a-${ts}@example.com`, password: "smoketest123", name: "Map Test A" };
const USER_B = { email: `map-test-b-${ts}@example.com`, password: "smoketest123", name: "Map Test B" };

let failures = 0;
function check(label, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});

async function register(page, creds) {
  await page.goto(`${BASE_URL}/register`);
  await page.fill('input[name="displayName"]', creds.name);
  await page.fill('input[name="email"]', creds.email);
  await page.fill('input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 });
}

const ctxA = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const ctxB = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const pageA = await ctxA.newPage(); // erstellt Marker/Zeichnung
const pageB = await ctxB.newPage(); // sollte Live-Update ohne Reload sehen

try {
  await register(pageA, USER_A);
  await register(pageB, USER_B);

  await pageA.goto(`${BASE_URL}/karte`);
  await pageB.goto(`${BASE_URL}/karte`);
  await pageA.waitForSelector(".leaflet-container", { timeout: 15000 });
  await pageB.waitForSelector(".leaflet-container", { timeout: 15000 });
  await pageA.waitForTimeout(800);
  await pageB.waitForTimeout(800);

  const mapCenterA = pageA.locator(".leaflet-container");
  const box = await mapCenterA.boundingBox();

  // --- Marker erstellen ---
  await pageA.click('button[title="Markierung"]');
  await mapCenterA.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await pageA.waitForSelector("text=Neue Markierung", { timeout: 5000 });
  await pageA.fill('input[placeholder="Titel"]', "Smoke-Test-Marker");
  await pageA.click('button:has-text("Speichern")');
  await pageA.waitForTimeout(1000);

  check(
    "Marker sichtbar bei Ersteller",
    (await pageA.locator(".leaflet-marker-icon").count()) > 0,
  );

  await pageB.waitForTimeout(1500);
  check(
    "Marker erscheint live bei anderem Nutzer ohne Reload",
    await pageB.locator("text=Smoke-Test-Marker").isVisible().catch(() => false),
  );

  // --- Freihandzeichnung erstellen ---
  await pageA.click('button[title="Freihand"]');
  await pageA.waitForTimeout(300);
  await pageA.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await pageA.mouse.down();
  await pageA.waitForTimeout(100);
  await pageA.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.35, { steps: 10 });
  await pageA.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4, { steps: 10 });
  await pageA.waitForTimeout(100);
  await pageA.mouse.up();
  await pageA.waitForTimeout(1000);

  check(
    "Zeichnung als Pfad bei Ersteller gerendert",
    (await pageA.locator("svg.leaflet-zoom-animated path").count()) > 0,
  );

  await pageB.waitForTimeout(1500);
  check(
    "Zeichnung erscheint live bei anderem Nutzer ohne Reload",
    (await pageB.locator("svg.leaflet-zoom-animated path").count()) > 0,
  );

  // --- Persistenz: harter Reload ---
  await pageB.reload();
  await pageB.waitForSelector(".leaflet-container", { timeout: 15000 });
  await pageB.waitForTimeout(1000);
  check(
    "Marker bleibt nach Reload dauerhaft gespeichert",
    await pageB.locator("text=Smoke-Test-Marker").isVisible().catch(() => false),
  );
  check(
    "Zeichnung bleibt nach Reload dauerhaft gespeichert",
    (await pageB.locator("svg.leaflet-zoom-animated path").count()) > 0,
  );

  // --- Rechteprüfung: Nicht-Besitzer darf fremden Marker nicht löschen ---
  await pageB.click(".leaflet-marker-icon");
  await pageB.waitForTimeout(400);
  check(
    "Nicht-Besitzer sieht keinen Löschen-Button bei fremdem Marker",
    !(await pageB.locator('button:has-text("Löschen")').isVisible().catch(() => false)),
  );
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAlle Karten-Checks erfolgreich." : `\n${failures} Check(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
