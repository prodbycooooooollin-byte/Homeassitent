// Pragmatisches End-to-End-Skript für die wichtigsten Abläufe (siehe
// README, Abschnitt "Geprüfte Abläufe"). Kein vollständiges Testsystem,
// sondern eine wiederholbare Verifikation gegen eine laufende Dev-Instanz.
//
// Nutzung:
//   npm run dev            # in einem Terminal
//   BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
//
// Hinweis: Läuft am besten gegen eine frisch migrierte, leere Datenbank
// (das erste registrierte Konto wird automatisch Admin).
import { chromium } from "playwright";
import net from "node:net";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ts = Date.now();
const adminEmail = `smoke-admin-${ts}@example.com`;
const memberEmail = `smoke-member-${ts}@example.com`;
const password = "smoketest123";

function log(step, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${step}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

// --- Minimaler, protokoll-korrekter Fake-Minecraft-Server (Server List
// Ping) für den "Verbindung testen"-Knopf im Einrichtungsassistenten. Echte
// externe Minecraft-Server sind aus dieser Sandbox per rohem TCP nicht
// erreichbar - siehe README, Abschnitt "Geprüfte Abläufe".
function encodeVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let temp = v & 0x7f;
    v >>>= 7;
    if (v !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}
function encodeString(s) {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([encodeVarInt(b.length), b]);
}
const FAKE_MC_PORT = 25599;
const fakeMcServer = net.createServer((socket) => {
  socket.on("data", () => {
    const payload = JSON.stringify({
      version: { name: "1.20.1", protocol: 763 },
      players: { max: 20, online: 3, sample: [] },
      description: { text: "Smoke-Test-Server" },
    });
    const body = Buffer.concat([encodeVarInt(0x00), encodeString(payload)]);
    socket.write(Buffer.concat([encodeVarInt(body.length), body]));
    socket.end();
  });
});
await new Promise((res) => fakeMcServer.listen(FAKE_MC_PORT, "127.0.0.1", res));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();

async function register(displayName, email) {
  await page.goto(`${BASE_URL}/register`);
  await page.fill('input[name="displayName"]', displayName);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
}

try {
  // 1) Nicht angemeldet -> Redirect zu /login
  await page.goto(`${BASE_URL}/`);
  log("Unauthenticated / redirects to /login", page.url().includes("/login"), page.url());

  // 2) Registrierung (erstes Konto -> Admin)
  await register("Smoke Admin", adminEmail);
  log("Register redirects to dashboard", page.url() === `${BASE_URL}/`);

  // 3) Logout
  await page.click('button:has-text("Abmelden")');
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  log("Logout returns to /login", page.url().includes("/login"));

  // 4) Login mit falschem Passwort -> Fehlermeldung, kein Zugriff
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', "falsches-passwort");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  const errorVisible = await page.locator("text=falsch").first().isVisible().catch(() => false);
  log("Wrong password shows error and blocks access", errorVisible && page.url().includes("/login"));

  // 5) Login mit korrektem Passwort (E-Mail wird nach einem Fehlversuch vom
  // Formular automatisch wieder vorausgefüllt, siehe AuthFormState.values)
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
  log("Login with correct password succeeds", page.url() === `${BASE_URL}/`);

  // 6) Einrichtungsassistent: Server anlegen und Verbindung testen
  await page.goto(`${BASE_URL}/einstellungen`);
  log("Settings page reachable for admin", page.url().includes("/einstellungen"));
  log(
    "Setup wizard visible for admin",
    await page.locator("text=Einrichtungsassistent").isVisible(),
  );

  await page.fill('input[value="Unser Server"]', "Smoke-Test-Server");
  await page.fill('input[placeholder="play.unserserver.de"]', "127.0.0.1");
  await page.fill('input[placeholder="25565"]', String(FAKE_MC_PORT));

  await page.click('button:has-text("Weiter")'); // -> Schritt 2
  await page.click('button:has-text("Weiter")'); // -> Schritt 3
  await page.click('button:has-text("Weiter")'); // -> Schritt 4

  await page.click('button:has-text("Verbindung testen")');
  await page.waitForTimeout(1500);
  const slpOk = await page.locator("text=/Online -/").isVisible().catch(() => false);
  log("SLP connection test against fake server succeeds", slpOk);

  await page.click('button:has-text("Speichern")');
  await page.waitForTimeout(800);

  await page.click('button:has-text("Schlüssel erzeugen")');
  await page.waitForTimeout(500);
  const keyVisible = await page.locator("code", { hasText: "cba_" }).isVisible().catch(() => false);
  log("Agent API key generated and displayed once", keyVisible);

  await page.click('button:has-text("Einrichtung abschließen")');
  await page.waitForTimeout(800);
  log(
    "Setup completion switches wizard to management view",
    await page.locator("text=Serververbindung").first().isVisible(),
  );

  // 7) Demo-Modus sollte nach Abschluss nicht mehr erzwungen sein
  const demoForced = await page.locator("text=Aktuell erzwungen").isVisible().catch(() => false);
  log("Demo mode no longer forced after setup completion", !demoForced);

  // 8) Rechteprüfung: zweites (Mitglieds-)Konto sieht keinen Admin-Bereich
  await page.click('button:has-text("Abmelden")');
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  await register("Smoke Member", memberEmail);
  await page.goto(`${BASE_URL}/einstellungen`);
  const seesWizard = await page.locator("text=Einrichtungsassistent").isVisible().catch(() => false);
  const seesMembers = await page.locator("text=Mitglieder (").isVisible().catch(() => false);
  log("Non-admin member cannot see server setup or member management", !seesWizard && !seesMembers);
  log("Non-admin member can still see own account section", await page.locator("text=Konto").first().isVisible());
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  fakeMcServer.close();
}
