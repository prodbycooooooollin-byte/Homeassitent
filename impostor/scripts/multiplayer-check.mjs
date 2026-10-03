// Mehrspieler-Ende-zu-Ende: echte Desktop-App (Electron) + zwei unabhängige
// Browser-Sitzungen in derselben Lobby gegen den gebauten Server.
//
//   npm run build && xvfb-run -a node scripts/multiplayer-check.mjs   (Linux ohne Display)
//
// Prüft u. a.: frische Desktop-Installation → Standardserver, Migration alter
// Einstellungen, Beitritt per Code und Einladungslink (Handy-Breite), synchroner
// Spielzustand, Rollen, Hinweise, Abstimmung, Rateversuch, Punkte, nächste Partie,
// Wiederverbindung, Ablauf der Wiederverbindungsfrist, Hostwechsel.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';
import { browserPlayer, checker, launchBrowser, shooter, startServer, wait } from './lib/harness.mjs';

const PORT = 8794;
const BASE = `http://127.0.0.1:${PORT}`;
const shot = shooter(process.env.SHOTS_DIR ?? 'docs/screenshots');
const { failures, check } = checker();

await startServer(PORT);

// ---------------------------------------------------------------------------
// 1) Frische Desktop-Installation ohne jede Konfiguration → Produktionsserver
{
  const userData = mkdtempSync(join(tmpdir(), 'impostor-fresh-'));
  const env = { ...process.env, IMPOSTOR_USER_DATA: userData };
  delete env.IMPOSTOR_SERVER_URL;
  const app = await electron.launch({ args: ['.', '--no-sandbox'], env });
  const win = await app.firstWindow();
  await win.waitForSelector('.profile-editor', { timeout: 15000 });
  check(!(await win.isVisible('text=Serveradresse')), 'Frische EXE: keine Serveradresse im normalen Ablauf');
  // Alte Einstellungen einer früheren Version mit lokaler Testadresse simulieren
  await win.evaluate(() => {
    localStorage.setItem('impostor.settings', JSON.stringify({ serverUrl: 'ws://localhost:8787/ws', onboardingDone: true, muted: true }));
    localStorage.setItem('impostor.profile', JSON.stringify({ name: 'Frisch', avatar: 2, set: true }));
  });
  await win.reload();
  await win.waitForSelector('.home-actions', { timeout: 15000 });
  await win.click('button[aria-label="Einstellungen"]');
  await win.click('summary:has-text("Erweitert")');
  const server = await win.textContent('.kv dd code');
  check(server === 'https://imposter-hx0a.onrender.com', `Frische EXE + alte localhost-Einstellung → Standardserver (${server})`);
  const source = await win.textContent('.kv dd:nth-of-type(2)');
  check(source === 'Standardserver', `Quelle wird als „Standardserver“ angezeigt (${source})`);
  const stored = await win.evaluate(() => JSON.parse(localStorage.getItem('impostor.settings') ?? '{}'));
  check(stored.serverUrl === undefined && stored.version === 2, 'Alte Serveradresse wurde bei der Migration entfernt');
  await app.close();
}

// ---------------------------------------------------------------------------
// 2) Desktop-App (Host) + zwei Browser
const userData = mkdtempSync(join(tmpdir(), 'impostor-host-'));
const app = await electron.launch({
  args: ['.', '--no-sandbox'],
  env: { ...process.env, IMPOSTOR_SERVER_URL: `ws://127.0.0.1:${PORT}/ws/`, IMPOSTOR_USER_DATA: userData },
});
const A = { name: 'Desktop', page: await app.firstWindow() };
await A.page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
await A.page.waitForSelector('.profile-editor', { timeout: 15000 });
await A.page.fill('input[autocomplete=nickname]', '  Desktop   Döner  ');
await A.page.click('button:has-text("Weiter")');
await A.page.click('button:has-text("Überspringen")');
await A.page.waitForSelector('.conn-line.tone-ok', { timeout: 15000 });
check(true, 'Desktop-App verbindet sich automatisch (normalisierte Adresse mit „/ws/“)');
await A.page.click('button:has-text("Lobby erstellen")');
await A.page.waitForSelector('.code-value');
const code = (await A.page.textContent('.code-value')).trim();
await A.page.click('.invite-btn');
const link = await A.page.inputValue('.invite-link');
check(link === `${BASE}/?lobby=${code}`, `Einladungslink aus der EXE zeigt auf die Web-Version (${link})`);
check(!/file:|\/ws|localhost/.test(link), 'Einladungslink enthält weder Dateipfad noch WebSocket-Pfad');
check(await A.page.isVisible('svg.qr'), 'QR-Code wird angezeigt');
await A.page.keyboard.press('Escape');

const browser = await launchBrowser();
const B = await browserPlayer(browser, BASE, 'Bea', 3);
await B.page.waitForSelector('.conn-line.tone-ok');
await B.page.fill('#join-code', code.toLowerCase());
await B.page.keyboard.press('Enter');
// C: frisches Handy-Profil über den Einladungslink
const C = await browserPlayer(browser, BASE, 'x', 0, { fresh: true, viewport: { width: 390, height: 844 }, path: `/?lobby=${code}` });
await C.page.waitForSelector('text=eingeladen');
await shot(C.page, 'mp-einladung-handy');
await C.page.fill('input[autocomplete=nickname]', 'Cem');
await C.page.click('button:has-text("Weiter zur Lobby")');
await C.page.click('button:has-text("Überspringen")');
await C.page.waitForSelector('.lobby', { timeout: 15000 });
check(new URL(C.page.url()).searchParams.get('lobby') === null, 'Einladungslink-Beitritt: Code aus der Adresszeile entfernt');
const all = [A, B, C];
for (const p of all) await p.page.waitForSelector('.seat-card >> nth=2');
const names = await A.page.$$eval('.seat-card .pc-name', (els) => els.map((e) => e.textContent));
check(names.includes('Desktop Döner'), `Name mit Umlaut und Leerzeichen bereinigt (${names.join(', ')})`);
check((await A.page.textContent('.ss-reason')).includes('Warte auf'), 'Lobby erklärt, auf wen gewartet wird');
check(await A.page.isVisible('text=4/10 Plätze belegt') === false && (await A.page.textContent('.seat-counter')).includes('3/10'), 'Platzanzeige passt zur Kapazität (3/10)');
check((await B.page.textContent('.host-only')).includes('Desktop Döner'), 'Gäste sehen, dass nur der Host Regeln ändert');

// Regeländerung durch den Host wird an alle synchronisiert
await A.page.click('.preset:has-text("Einsteiger")');
await B.page.waitForSelector('.preset.on:has-text("Einsteiger")');
check(true, 'Regeländerung (Einsteiger) erscheint bei allen Clients');

async function readyAndStart() {
  for (const p of all) {
    if (!(await p.page.getAttribute('.ready-btn', 'aria-pressed').catch(() => 'false'))?.includes('true')) await p.page.click('.ready-btn');
  }
  await A.page.waitForSelector('.start-btn[aria-disabled="false"]', { timeout: 8000 });
  await A.page.click('.start-btn');
}

async function reveal() {
  const roles = new Map();
  for (const p of all) {
    await p.page.waitForSelector('text=Karte umdrehen', { timeout: 10000 });
    await p.page.click('.reveal-actions button');
  }
  await wait(700);
  for (const p of all) {
    const text = await p.page.textContent('.reveal-card');
    roles.set(p, text.includes('Du bist der Impostor') ? 'impostor' : 'insider');
    if (roles.get(p) === 'insider') p.word = (await p.page.textContent('.role-word')).trim();
  }
  for (const p of all) await p.page.click('button:has-text("Verstanden")');
  const imp = all.filter((p) => roles.get(p) === 'impostor');
  const ins = all.filter((p) => roles.get(p) === 'insider');
  check(imp.length === 1, 'Genau ein Impostor');
  check(ins.length === 2 && ins[0].word === ins[1].word, `Eingeweihte sehen dasselbe Wort (${ins[0]?.word})`);
  check(!(await imp[0].page.content()).includes(ins[0].word), 'Wort steht nicht im DOM des Impostors');
  await A.page.waitForSelector('.phase-steps li.current:has-text("Hinweise")');
  return { imp: imp[0], ins, word: ins[0].word };
}

async function activePlayer() {
  for (let t = 0; t < 60; t++) {
    for (const p of all) if (await p.page.isEnabled('.clue-input').catch(() => false)) return p;
    await wait(100);
  }
  throw new Error('niemand am Zug');
}

async function giveClues(n, prefix) {
  for (let i = 0; i < n; i++) {
    const p = await activePlayer();
    const others = all.filter((x) => x !== p);
    check(!(await others[0].page.isEnabled('.clue-input')), `Zug ${i + 1}: nur die aktive Person kann schreiben`);
    if (i === 0) {
      const ins = await others[0].page.textContent('.instruction');
      check(ins.includes('Warte'), `Wartende sehen einen Wartehinweis („${ins.trim()}“)`);
      check((await p.page.textContent('.instruction')).includes('Du bist dran'), 'Aktive Person sieht „Du bist dran“');
    }
    await p.page.fill('.clue-input', `${prefix} ${i + 1}`);
    await p.page.keyboard.press('Enter');
    await A.page.waitForFunction((k) => document.querySelectorAll('.clue-mini').length >= k, i + 1);
  }
  // Alle Clients sehen dieselbe Historie
  for (const p of all) await p.page.waitForFunction((k) => document.querySelectorAll('.clue-mini').length >= k, n, { timeout: 5000 }).catch(() => {});
  const hist = await Promise.all(all.map((p) => p.page.$$eval('.clue-mini .clue-text', (els) => els.map((e) => e.textContent))));
  check(hist.every((h) => JSON.stringify(h) === JSON.stringify(hist[0])), 'Hinweisverlauf ist bei allen Clients identisch');
}

async function scores() {
  const out = [];
  for (const p of all) {
    await p.page.waitForSelector('.score-list', { timeout: 10000 });
    out.push(await p.page.$$eval('.score-list li', (els) => els.map((e) => `${e.querySelector('span')?.textContent}=${e.querySelector('strong')?.textContent}`).sort().join('|')));
  }
  return out;
}

// --- Partie 1: vorzeitige Abstimmung, Mehrheit auf dem Impostor -------------
await readyAndStart();
let m = await reveal();
await giveClues(3, 'Hinweis');
for (const p of all) {
  const btn = p.page.locator('.propose .btn');
  if (await btn.isEnabled().catch(() => false)) await btn.click();
  await wait(150);
}
await A.page.waitForSelector('.phase-steps li.current:has-text("Diskussion")', { timeout: 8000 });
await B.page.fill('.chat-input', 'Wer war das?');
await B.page.keyboard.press('Enter');
await A.page.waitForSelector('.bubble-text:has-text("Wer war das?")');
check(true, 'Diskussions-Chat kommt bei allen an');
for (const p of all) await p.page.click('button:has-text("Bereit zur Wahl")');
await A.page.waitForSelector('.phase-steps li.current:has-text("Wahl")', { timeout: 8000 });
const impName = await m.imp.page.evaluate(() => document.querySelector('.seat-card.is-me .pc-name')?.textContent);
for (const p of m.ins) {
  await p.page.click(`.seat-card.selectable:has-text("${impName}")`);
  await p.page.click('button:has-text("Stimme für")');
  await p.page.waitForSelector('.vote-done');
}
check(!(await m.imp.page.isVisible('.seat-card.selected')), 'Impostor sieht keine fremden Stimmen (keine Auswahl-Markierung)');
await m.imp.page.click('.seat-card.selectable >> nth=0');
await m.imp.page.click('button:has-text("Stimme für")');
for (const p of all) await p.page.waitForSelector('.winner-banner', { timeout: 10000 });
const banners = await Promise.all(all.map((p) => p.page.textContent('.winner-banner .wb-title')));
check(banners.every((b) => b === 'Die Eingeweihten gewinnen'), `Alle sehen dasselbe Ergebnis (${banners.join(' / ')})`);
await wait(1500);
await shot(A.page, 'mp-ergebnis-desktop');
const s1 = await scores();
check(s1.every((x) => x === s1[0]), `Punkte bei allen gleich (${s1[0]})`);
check(s1[0].split('|').filter((x) => x.endsWith('=1')).length === 2 && s1[0].includes(`${impName}=0`), 'Punkte: zwei Eingeweihte +1, Impostor 0');

// --- Partie 2: richtiger Rateversuch ------------------------------------------
for (const p of all) await p.page.click('button:has-text("Noch eine Partie")');
await readyAndStart();
m = await reveal();
check(!(await m.ins[0].page.isVisible('.btn-guess')), 'Eingeweihte sehen keinen Rate-Button');
await m.imp.page.click('.btn-guess');
await m.imp.page.fill('.dialog input', ` ${m.word.toUpperCase()} `);
await m.imp.page.click('.dialog button:has-text("Weiter")');
await m.imp.page.click('button:has-text("Endgültig raten")');
for (const p of all) await p.page.waitForSelector('.winner-banner', { timeout: 10000 });
check((await B.page.textContent('.wb-title')) === 'Der Impostor gewinnt', 'Richtiger Rateversuch → Impostor gewinnt bei allen');
const s2 = await scores();
check(s2.every((x) => x === s2[0]), `Punkte nach Partie 2 bei allen gleich (${s2[0]})`);

// --- Partie 3: Wiederverbindung und Ablauf der Frist ---------------------------
for (const p of all) await p.page.click('button:has-text("Noch eine Partie")');
await readyAndStart();
m = await reveal();
await giveClues(1, 'Vorher');
const cRoleBefore = m.imp === C ? 'impostor' : 'insider';
await C.page.goto('about:blank');
await A.page.waitForSelector('.pause-card', { timeout: 20000 });
const pauseText = await A.page.textContent('.pause-card');
check(pauseText.includes('Cem') && /Abbruch ohne Wertung in \d+ s/.test(pauseText), `Pause zeigt wer fehlt und Restzeit („${pauseText.replace(/\s+/g, ' ').trim()}“)`);
await shot(A.page, 'mp-pause');
await C.page.goto(BASE);
await C.page.waitForSelector('.phase-steps', { timeout: 15000 });
await A.page.waitForSelector('.pause-card', { state: 'detached', timeout: 15000 });
check(true, 'Nach Rückkehr läuft die Partie weiter');
const cHist = await C.page.$$eval('.clue-mini', (e) => e.length);
check(cHist === 1, 'Wiedereinstieg: Hinweise bleiben erhalten');
await C.page.click('.peek-btn');
const cRoleAfter = (await C.page.textContent('.mini-role')).includes('Impostor') ? 'impostor' : 'insider';
check(cRoleAfter === cRoleBefore, `Wiedereinstieg: dieselbe Rolle (${cRoleAfter})`);
const seatCount = await A.page.$$eval('.seat-card', (e) => e.length);
check(seatCount === 3, 'Wiedereinstieg erzeugt keinen doppelten Spieler');

// B geht verloren und kommt nicht zurück → nach 60 s ohne Wertung beendet
await B.page.goto('about:blank');
await A.page.waitForSelector('.pause-card', { timeout: 20000 });
console.log('… warte auf Ablauf der Wiederverbindungsfrist (60 s)');
await A.page.waitForSelector('text=Partie ohne Wertung beendet', { timeout: 90000 });
const abortText = await A.page.textContent('.abort-card');
check(abortText.includes('Bea') && abortText.includes('nicht rechtzeitig'), `Abbruch nennt Person und Grund („${abortText.replace(/\s+/g, ' ').slice(0, 80)}…“)`);
const s3 = await A.page.$$eval('.score-list li', (els) => els.map((e) => `${e.querySelector('span')?.textContent}=${e.querySelector('strong')?.textContent}`).sort().join('|'));
const expected = s2[0].split('|').filter((x) => !x.startsWith('Bea=')).join('|');
check(s3 === expected, `Abbruch vergibt keine Punkte (${s3}; Bea hat die Lobby nach Fristablauf verlassen)`);

// --- Hostwechsel: Desktop-Host verlässt die Lobby ------------------------------
await A.page.click('button:has-text("Zur Lobby")');
await C.page.click('button:has-text("Zur Lobby")').catch(() => {});
await A.page.waitForSelector('.lobby', { timeout: 10000 });
await A.page.click('button[aria-label="Lobby verlassen"]');
await wait(500);
await shot(A.page, 'mp-verlassen-dialog');
await A.page.click('.dialog button.btn-danger', { timeout: 5000 });
await A.page.waitForSelector('.home-actions', { timeout: 10000 });
await C.page.waitForSelector('.start-btn', { timeout: 10000 });
check(true, 'Host verlässt die Lobby → verbleibende Person wird Host (Start-Button sichtbar)');

await app.close();
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} Prüfung(en) fehlgeschlagen:`);
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('\nMehrspieler-Prüfung (Desktop-App + 2 Browser) bestanden.');
process.exit(0);
