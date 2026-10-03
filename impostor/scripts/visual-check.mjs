// Screenshots der wichtigsten Ansichten in mehreren Fenstergrößen und
// automatische Prüfung auf horizontales Scrollen / abgeschnittene Aktionen.
//   npm run build && node scripts/visual-check.mjs
import { bot, browserPlayer, checker, launchBrowser, shooter, startServer, wait } from './lib/harness.mjs';

const PORT = 8795;
const BASE = `http://127.0.0.1:${PORT}`;
const shot = shooter(process.env.SHOTS_DIR ?? 'docs/screenshots');
const { failures, check } = checker();

const SIZES = [
  { id: '1920', width: 1920, height: 1080 },
  { id: '1366', width: 1366, height: 768 },
  { id: '1024', width: 1024, height: 700 },
  { id: 'phone', width: 390, height: 844 },
];

await startServer(PORT);
const browser = await launchBrowser();

async function noHorizontalScroll(page, label) {
  const over = await page.evaluate(() => {
    const el = document.scrollingElement;
    const screen = document.querySelector('.screen');
    return Math.max(el.scrollWidth - el.clientWidth, screen ? screen.scrollWidth - screen.clientWidth : 0);
  });
  check(over <= 1, `${label}: kein horizontales Scrollen (${over}px)`);
}

async function buttonsVisible(page, label, selectors) {
  for (const sel of selectors) {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    const vp = page.viewportSize();
    const ok = !!box && box.x >= -1 && box.x + box.width <= vp.width + 1;
    check(ok, `${label}: „${sel}" vollständig sichtbar`);
  }
}

for (const size of SIZES) {
  const viewport = { width: size.width, height: size.height };
  // Frisches Profil → Profilwahl
  const fresh = await browserPlayer(browser, BASE, 'x', 0, { fresh: true, viewport });
  await fresh.page.waitForSelector('text=Wer spielt mit?');
  await wait(500);
  await shot(fresh.page, `v-${size.id}-profil`);
  await noHorizontalScroll(fresh.page, `${size.id} Profil`);
  await fresh.ctx.close();

  // Startseite
  const host = await browserPlayer(browser, BASE, 'Alex', 4, { viewport });
  await host.page.waitForSelector('.conn-line.tone-ok', { timeout: 10000 });
  await wait(700);
  await shot(host.page, `v-${size.id}-start`);
  await noHorizontalScroll(host.page, `${size.id} Start`);
  await buttonsVisible(host.page, `${size.id} Start`, ['button:has-text("Lobby erstellen")', 'button:has-text("Beitreten")']);

  // Regeln
  await host.page.click('button:has-text("So funktioniert")');
  await wait(400);
  await shot(host.page, `v-${size.id}-regeln`);
  await host.page.keyboard.press('Escape');
  await wait(300);

  // Lobby mit 4 Personen
  await host.page.click('button:has-text("Lobby erstellen")');
  await host.page.waitForSelector('.code-value');
  const code = (await host.page.textContent('.code-value')).trim();
  const bots = [];
  for (let i = 0; i < 3; i++) bots.push(await bot(PORT, ['Bea', 'Cem', 'Dana Maria-Luisa'][i], i + 1, code, { autoClue: false }));
  await wait(900);
  await shot(host.page, `v-${size.id}-lobby`);
  await noHorizontalScroll(host.page, `${size.id} Lobby`);
  await buttonsVisible(host.page, `${size.id} Lobby`, ['.ready-btn', '.start-btn']);

  if (size.id === '1366' || size.id === 'phone') {
    await host.page.click('.invite-btn');
    await wait(400);
    await shot(host.page, `v-${size.id}-einladen`);
    await host.page.keyboard.press('Escape');
    await wait(300);
    await host.page.click('button[aria-label="Einstellungen"]');
    await wait(400);
    await shot(host.page, `v-${size.id}-einstellungen`);
    await host.page.keyboard.press('Escape');
    await wait(300);
  }

  // Partie starten
  await host.page.click('.ready-btn');
  await wait(300);
  await host.page.click('.start-btn');
  await host.page.waitForSelector('text=Karte umdrehen', { timeout: 8000 });
  await host.page.click('.reveal-actions button');
  await wait(700);
  await shot(host.page, `v-${size.id}-rolle`);
  await host.page.click('button:has-text("Verstanden")');
  await wait(600);
  // Bots geben Hinweise, bis der Host dran ist
  for (let i = 0; i < 12; i++) {
    const v = bots[0].state.view;
    const active = v?.match?.activePlayerId;
    const b = bots.find((x) => x.id === active);
    if (!b) break;
    b.send({ t: 'submitClue', text: `Hinweis ${b.id.slice(0, 3)}${i}` });
    await wait(250);
  }
  await wait(600);
  await shot(host.page, `v-${size.id}-partie`);
  await noHorizontalScroll(host.page, `${size.id} Partie`);
  await buttonsVisible(host.page, `${size.id} Partie`, ['.clue-form .btn', '.propose .btn']);
  for (const b of bots) b.ws.close();
  await host.ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} Prüfung(en) fehlgeschlagen`);
  process.exit(1);
}
console.log('\nVisuelle Prüfung bestanden.');
process.exit(0);
