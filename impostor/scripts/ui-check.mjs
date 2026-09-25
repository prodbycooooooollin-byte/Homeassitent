// End-to-End-Prüfung im echten Browser: vier unabhängige Clients spielen über
// den gebauten Server mehrere Partien. Erstellt Screenshots (1366×768 und 1920×1080).
//
//   npm run build && npm run test:ui
//
// Umgebungsvariablen: CHROMIUM_PATH (Standard: Playwright-Chromium), SHOTS_DIR.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import WebSocket from 'ws';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS_DIR ?? 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = spawn('node', ['dist/server/server.mjs'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
process.on('exit', () => server.kill('SIGTERM'));
process.on('uncaughtException', (e) => {
  console.error(e);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error(e);
  process.exit(1);
});
await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('läuft') && res()));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});

const failures = [];
function check(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error('✗', msg);
  } else console.log('✓', msg);
}

async function player(name, avatar, { fresh = false, viewport = { width: 1366, height: 768 }, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (!fresh) {
    await ctx.addInitScript(
      ([n, a]) => {
        if (!localStorage.getItem('impostor.profile')) {
          localStorage.setItem('impostor.profile', JSON.stringify({ name: n, avatar: a, set: true }));
          localStorage.setItem('impostor.settings', JSON.stringify({ onboardingDone: true, muted: true }));
        }
      },
      [name, avatar],
    );
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${name}: JS-Fehler ${e.message}`));
  await page.goto(BASE);
  return { name, ctx, page };
}

/** Minimaler Protokoll-Bot: tritt bei, ist bereit, bestätigt die Rolle, gibt Hinweise. */
async function bot(name, avatar, lobbyCode) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  let seq = 0;
  let me = null;
  const send = (cmd) => ws.send(JSON.stringify({ type: 'cmd', actionId: `${name}-${++seq}`, cmd }));
  ws.on('message', (d) => {
    const msg = JSON.parse(String(d));
    if (msg.type === 'welcome') {
      me = msg.playerId;
      send({ t: 'joinLobby', code: lobbyCode });
    }
    if (msg.type !== 'state' || !msg.view) return;
    const v = msg.view;
    const self = v.lobby.players.find((p) => p.id === me);
    if (v.lobby.phase === 'lobby' && self && !self.ready) send({ t: 'setReady', ready: true });
    if (v.match?.phase === 'roleReveal' && !v.match.acknowledged.includes(me)) send({ t: 'ackRole' });
    if (v.match?.phase === 'clues' && v.match.activePlayerId === me) {
      setTimeout(() => send({ t: 'submitClue', text: `${name} · ${v.match.clues.length + 1}` }), 30);
    }
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'hello', token: null, profile: { name, avatar }, protocol: 1 }));
  return { ws };
}

const shot = (p, file) => p.page.screenshot({ path: `${SHOTS}/${file}.jpg`, type: 'jpeg', quality: 78 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Erststart mit Profil + Onboarding ---------------------------------------
const A = await player('Alex', 0, { fresh: true });
await A.page.waitForSelector('text=Wer spielt mit?');
await wait(500);
await shot(A, '01-profil');
await A.page.fill('input[autocomplete=nickname]', 'Alex');
await A.page.click('button[aria-label="Lila"]');
await A.page.click('button:has-text("Weiter")');
await A.page.waitForSelector('text=Wort ansehen');
await wait(600);
await shot(A, '02-onboarding');
for (let i = 0; i < 3; i++) await A.page.click('.onb-actions .btn-primary');
await A.page.waitForSelector('text=Lobby erstellen');
await A.page.waitForSelector('text=Mit dem Spielserver verbunden');
await wait(900);
await shot(A, '03-start');

// --- Lobby -------------------------------------------------------------------
await A.page.click('text=Lobby erstellen');
await A.page.waitForSelector('.code-value');
const code = (await A.page.textContent('.code-value')).trim();
check(/^[A-Z0-9]{5}$/.test(code), `Lobbycode ${code} hat 5 gut lesbare Zeichen`);

const B = await player('Bea', 3);
const C = await player('Cem', 6);
const D = await player('Dana', 9, { reduced: true });

// Fehlerfall: falscher Code
await B.page.waitForSelector('text=Mit dem Spielserver verbunden');
await B.page.fill('#join-code', 'AAAAA');
await B.page.click('button:has-text("Beitreten")');
await B.page.waitForSelector('text=Code nicht gefunden');
check(true, 'Falscher Code zeigt „Code nicht gefunden."');

// Beitritt per Tastatur (Tab/Enter) für D
await D.page.waitForSelector('text=Mit dem Spielserver verbunden');
await D.page.focus('#join-code');
await D.page.keyboard.type(code.toLowerCase());
await D.page.keyboard.press('Enter');
for (const p of [B, C]) {
  await p.page.fill('#join-code', code);
  await p.page.click('button:has-text("Beitreten")');
}
const all = [A, B, C, D];
for (const p of all) await p.page.waitForSelector('.seat-card >> nth=3');
check(await D.page.evaluate(() => document.documentElement.classList.contains('reduce-motion')), 'Reduzierte Bewegung folgt der Systemeinstellung');
await shot(A, '04-lobby-beitritt');

for (const p of all) await p.page.click('.ready-btn');
await A.page.waitForSelector('.start-btn:not([disabled])');
await wait(400);
await shot(A, '05-lobby-bereit');

// --- Partie 1: Rollen, Hinweise, vorzeitige Abstimmung -----------------------
await A.page.click('.start-btn');
await wait(500);
await shot(A, '06-austeilen');
for (const p of all) await p.page.waitForSelector('text=Karte umdrehen', { timeout: 8000 });
const roles = {};
for (const p of all) {
  await p.page.click('.reveal-actions button');
  await wait(650);
  const text = await p.page.textContent('.reveal-card');
  roles[p.name] = text.includes('Du bist der Impostor') ? 'impostor' : 'insider';
}
const impostors = all.filter((p) => roles[p.name] === 'impostor');
const insiders = all.filter((p) => roles[p.name] === 'insider');
check(impostors.length === 1, 'Genau eine Person sieht „Du bist der Impostor"');
const words = await Promise.all(insiders.map((p) => p.page.textContent('.role-word')));
check(new Set(words).size === 1, `Drei Eingeweihte sehen dasselbe Wort (${words[0]})`);
const imp = impostors[0];
const impHtml = await imp.page.content();
check(!impHtml.includes(words[0]), 'Das Wort steht nirgends im DOM des Impostors');
await shot(insiders[0], '07-rolle-eingeweiht');
await shot(imp, '08-rolle-impostor');
for (const p of all) await p.page.click('button:has-text("Verstanden")');
await A.page.waitForSelector('.phase-name:has-text("Hinweise")');

const clues = ['Stadion', 'Ballon d’Or', 'Rasen', 'Pfiff', 'Kurve', 'Nachspielzeit'];
async function activePlayer() {
  for (let t = 0; t < 40; t++) {
    for (const p of all) {
      if (await p.page.isEnabled('.clue-input').catch(() => false)) return p;
    }
    await wait(100);
  }
  throw new Error('niemand am Zug');
}
for (let i = 0; i < clues.length; i++) {
  const p = await activePlayer();
  const others = all.filter((x) => x !== p);
  check(!(await others[0].page.isEnabled('.clue-input')), i === 0 ? 'Nur die aktive Person kann schreiben' : null ?? 'Eingabe gesperrt für andere');
  await p.page.fill('.clue-input', clues[i]);
  await p.page.keyboard.press('Enter');
  await p.page.waitForFunction((n) => document.querySelectorAll('.clue-mini').length >= n, i + 1);
  if (i === 2) {
    await wait(700);
    await shot(p, '09-hinweis-meine-sicht');
  }
}
// Doppelter Hinweis wird abgelehnt
{
  const p = await activePlayer();
  await p.page.fill('.clue-input', 'stadion');
  await p.page.keyboard.press('Enter');
  await p.page.waitForSelector('text=Dieser Hinweis wurde schon gegeben.');
  check(true, 'Doppelter Hinweis → „Dieser Hinweis wurde schon gegeben."');
  await p.page.fill('.clue-input', '');
}
await wait(600);
await shot(A, '10-hinweise');

// Vorzeitige Abstimmung: 3 von 4 schlagen vor
for (const p of [A, B, C]) {
  await p.page.click('.propose .btn');
  await wait(150);
}
await A.page.waitForSelector('.phase-name:has-text("Diskussion")');
await A.page.fill('.chat-input', 'Wer hat „Kurve" gesagt? 🤔');
await A.page.keyboard.press('Enter');
await B.page.fill('.chat-input', 'Klingt eher nach Rennstrecke …');
await B.page.keyboard.press('Enter');
await wait(500);
await shot(C, '11-diskussion');
for (const p of all) await p.page.click('button:has-text("Bereit zur Wahl")');
await A.page.waitForSelector('.phase-name:has-text("Geheime Wahl")');
// Alle Eingeweihten wählen den Impostor, der Impostor wählt jemanden
const impName = imp.name;
for (const p of insiders) {
  await p.page.click(`.seat-card.selectable:has-text("${impName}")`);
  if (p === insiders[0]) {
    await wait(300);
    await shot(p, '12-wahl-auswahl');
  }
  await p.page.click('button:has-text("Stimme für")');
}
await wait(300);
await shot(imp, '13-wahl-verdeckt');
const votedPublic = await imp.page.$$eval('.seat-vote-card', (els) => els.length);
check(votedPublic === 3, 'Öffentlich sichtbar: 3 verdeckte Stimmkarten, keine Zielpersonen');
await imp.page.click(`.seat-card.selectable >> nth=0`);
await imp.page.click('button:has-text("Stimme für")');
await wait(1400);
await shot(A, '14-aufloesung-spannung');
await A.page.waitForSelector('.winner-banner', { timeout: 6000 });
await wait(1400);
await shot(A, '15-aufloesung');
const banner = await A.page.textContent('.winner-banner');
check(banner.includes('Die Eingeweihten gewinnen'), 'Mehrheit auf dem Impostor → Eingeweihte gewinnen');

// --- Partie 2: Rateversuch -----------------------------------------------------
for (const p of all) {
  await p.page.waitForSelector('button:has-text("Noch eine Partie")', { timeout: 8000 });
  await p.page.click('button:has-text("Noch eine Partie")');
}
await A.page.waitForSelector('.start-btn:not([disabled])');
await A.page.click('.start-btn');
for (const p of all) {
  await p.page.waitForSelector('text=Karte umdrehen', { timeout: 8000 });
  await p.page.click('.reveal-actions button');
}
await wait(700);
let imp2;
for (const p of all) if ((await p.page.textContent('.reveal-card')).includes('Impostor')) imp2 = p;
for (const p of all) await p.page.click('button:has-text("Verstanden")');
await imp2.page.waitForSelector('.btn-guess:not([disabled])');
await imp2.page.click('.btn-guess');
await imp2.page.fill('.dialog input', 'Sicher falsch');
await imp2.page.click('.dialog button:has-text("Weiter")');
await shot(imp2, '16-raten-bestaetigen');
await imp2.page.click('button:has-text("Endgültig raten")');
await A.page.waitForSelector('.winner-banner', { timeout: 8000 });
const banner2 = await A.page.textContent('.winner-banner');
check(banner2.includes('Die Eingeweihten gewinnen') && banner2.includes('falsch'), 'Falscher Rateversuch → sofortiger Sieg der Eingeweihten');

// --- Große Auflösung 1920×1080 -------------------------------------------------
await A.page.setViewportSize({ width: 1920, height: 1080 });
await wait(2200);
await shot(A, '17-ergebnis-1920');
for (const p of all) await p.page.click('button:has-text("Noch eine Partie")');
await A.page.waitForSelector('.start-btn:not([disabled])');
await A.page.click('.start-btn');
await A.page.waitForSelector('text=Karte umdrehen', { timeout: 8000 });
await A.page.click('.reveal-actions button');
await wait(700);
await shot(A, '18-rolle-1920');

// Wiederverbindung: B lädt neu, erhält dieselbe Rolle zurück
const beforeRole = (await B.page.textContent('.phase-name')) ?? '';
await B.page.reload();
await B.page.waitForSelector('.phase-name', { timeout: 8000 });
check((await B.page.textContent('.phase-name')) === beforeRole, 'Neu laden stellt die laufende Partie wieder her');

// Späteinsteiger sieht nur den Hinweis
const E = await player('Emil', 1);
await E.page.waitForSelector('text=Mit dem Spielserver verbunden');
await E.page.fill('#join-code', code);
await E.page.click('button:has-text("Beitreten")');
await E.page.waitForSelector('text=Du spielst ab der nächsten Partie mit.');
check(true, 'Späteinsteiger: „Partie läuft – du spielst ab der nächsten Partie mit"');
await shot(E, '19-spaeteinsteiger');

// --- Große Runde: 10 Personen, 12 Durchgänge, 120 Hinweise ---------------------
// Eine echte Browser-Sitzung + neun Protokoll-Bots über WebSocket.
{
  const H = await player('Host', 5);
  await H.page.waitForSelector('text=Mit dem Spielserver verbunden');
  await H.page.click('text=Lobby erstellen');
  await H.page.waitForSelector('.code-value');
  const code10 = (await H.page.textContent('.code-value')).trim();
  await H.page.click('.segmented button:has-text("12")');
  await H.page.click('.segmented button:has-text("ohne")');
  const bots = [];
  for (let i = 0; i < 9; i++) bots.push(await bot(`Bot ${i + 1}`, i % 12, code10));
  await H.page.waitForSelector('.seat-card >> nth=9');
  await H.page.click('.ready-btn');
  await wait(300);
  await shot(H, '20-lobby-10');
  await H.page.click('.start-btn');
  await H.page.waitForSelector('text=Karte umdrehen', { timeout: 8000 });
  await H.page.click('.reveal-actions button');
  await wait(600);
  await H.page.click('button:has-text("Verstanden")');
  let n = 0;
  for (let guard = 0; guard < 2000 && n < 120; guard++) {
    n = await H.page.$$eval('.clue-mini', (e) => e.length).catch(() => n);
    if (await H.page.isEnabled('.clue-input').catch(() => false)) {
      await H.page.fill('.clue-input', `Host-Hinweis ${n}`);
      await H.page.keyboard.press('Enter');
    }
    await wait(60);
  }
  await H.page.waitForSelector('.phase-name:has-text("Diskussion")', { timeout: 10000 }).catch(async (e) => {
    await shot(H, 'fehler-10');
    console.error('Stand:', n, 'Hinweise;', await H.page.textContent('.instruction'));
    throw e;
  });
  await wait(500);
  check((await H.page.$$eval('.clue-mini', (e) => e.length)) === 120, '120 Hinweise in der Historie (10 Personen × 12 Durchgänge)');
  await shot(H, '21-historie-120');
  await H.page.click('.history .segmented button:has-text("Personen")');
  await wait(300);
  await shot(H, '22-historie-personen');
  for (const b of bots) b.ws.close();
}

await browser.close();
server.kill('SIGTERM');

if (failures.length) {
  console.error(`\n${failures.length} Prüfung(en) fehlgeschlagen:`);
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('\nAlle UI-Prüfungen bestanden. Screenshots in', SHOTS);
