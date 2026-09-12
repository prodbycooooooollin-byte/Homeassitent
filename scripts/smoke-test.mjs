// Pragmatisches End-to-End-Skript für die wichtigsten Abläufe (siehe
// README, Abschnitt "Geprüfte Abläufe"). Kein vollständiges Testsystem,
// sondern eine wiederholbare Verifikation gegen eine laufende Dev-Instanz.
//
// Nutzung:
//   npm run dev            # in einem Terminal
//   BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ts = Date.now();
const email = `smoke-${ts}@example.com`;
const password = "smoketest123";

function log(step, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${step}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();

try {
  // 1) Nicht angemeldet -> Redirect zu /login
  const res = await page.goto(`${BASE_URL}/`);
  log("Unauthenticated / redirects to /login", page.url().includes("/login"), page.url());

  // 2) Registrierung (erstes Konto -> Admin)
  await page.goto(`${BASE_URL}/register`);
  await page.fill('input[name="displayName"]', "Smoke Test");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
  log("Register redirects to dashboard", page.url() === `${BASE_URL}/`);

  // 3) Logout
  await page.click('button:has-text("Abmelden")');
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  log("Logout returns to /login", page.url().includes("/login"));

  // 4) Login mit falschem Passwort -> Fehlermeldung, kein Zugriff
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "falsches-passwort");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  const errorVisible = await page.locator("text=falsch").first().isVisible().catch(() => false);
  log("Wrong password shows error and blocks access", errorVisible && page.url().includes("/login"));

  // 5) Login mit korrektem Passwort (E-Mail wird nach einem Fehlversuch vom
  // Formular automatisch wieder vorausgefüllt, siehe AuthFormState.values)
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
  log("Login with correct password succeeds", page.url() === `${BASE_URL}/`);

  // 6) Settings-Seite ohne Fehler erreichbar (Admin-Bereich sichtbar)
  await page.goto(`${BASE_URL}/einstellungen`);
  log("Settings page reachable for admin", page.url().includes("/einstellungen"));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
