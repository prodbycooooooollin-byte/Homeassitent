// UI-Durchlauf im Browser (Browser-Plattform) mit Screenshots.
// Die Spielerdaten stammen aus einem lokalen Fixture-Server (fiktiver Testspieler „AuroraX“),
// der die echte Recherche-Pipeline durchläuft. Screenshots sind KEINE Belege für echte Spielerwerte.
//
//   npm run build && npm run screenshots

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { openDb } from '../server/db.ts';
import { loadConfig } from '../server/config.ts';
import { Fetcher } from '../server/net/fetcher.ts';
import { claimNext, enqueue, runJob, seedSources } from '../server/jobs.ts';
import { createApi } from '../server/api.ts';

const OUT = process.env.SHOT_DIR || 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

// ---------------- Fixture-Quellen
const routes: Record<string, string> = {};
const fixture = http.createServer((req, res) => {
  const u = new URL(req.url!, 'http://x');
  const body = routes[u.pathname + u.search] ?? routes[u.pathname];
  if (body === undefined) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': u.pathname.startsWith('/home') ? 'text/html' : u.pathname.startsWith('/raw') ? 'text/plain' : 'application/json' });
  res.end(body);
});
await new Promise<void>((ok) => fixture.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`;
routes['/v1/leaderboard/Europe'] = JSON.stringify({ entries: [{ account_name: 'AuroraX', possible_account_ids: [100], rank: 116 }, { account_name: 'Basalt', possible_account_ids: [200], rank: 115 }] });
routes[`/deadlock/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent('Category:Players')}&cmnamespace=0&cmlimit=500&format=json`] = JSON.stringify({ query: { categorymembers: [{ title: 'AuroraX' }] } });
routes[`/deadlock/api.php?action=query&prop=revisions&rvprop=content|timestamp&rvslots=main&format=json&formatversion=2&titles=AuroraX`] = JSON.stringify({
  query: { pages: [{ title: 'AuroraX', revisions: [{ timestamp: '2026-09-01T10:00:00Z', slots: { main: { content: `{{Infobox player|id=AuroraX|team=[[Team Nebula]]|twitch=aurorax_tv|homepage=${base}/home/aurora|steam=76561197960265828}}` } } }] }] },
});
routes['/home/aurora'] = `<html><head><meta property="article:modified_time" content="2026-09-20T12:00:00Z"></head><body><h1>AuroraX – Deadlock settings (TESTFIXTURE)</h1><p>Sensitivity: 1.3</p><p>800 DPI</p><p>citadel_crosshair_pip_gap 3; citadel_crosshair_color_r 0; citadel_crosshair_color_g 255; citadel_crosshair_color_b 255; citadel_crosshair_dot_size 2</p></body></html>`;
routes['/gh/repos/o/r'] = JSON.stringify({ default_branch: 'main', license: { spdx_id: 'GPL-3.0' } });
routes['/gh/repos/o/r/git/trees/main'] = JSON.stringify({ tree: [{ path: 'Preset/video.txt', type: 'blob', size: 300, sha: 'a' }] });
routes['/gh/repos/o/r/commits'] = JSON.stringify([{ commit: { committer: { date: '2026-09-29T00:00:00Z' } } }]);
routes['/raw/o/r/main/Preset/video.txt'] = readFileSync('test/fixtures/video.foreign.txt', 'utf8');

// ---------------- echte Pipeline gegen Fixtures
const cfg = { ...loadConfig({}), allowPrivateNetworkForTests: true, userAgent: 'CITADEL-Screenshots/1.0 (test@example.invalid)', corsOrigins: ['http://localhost:4173'] };
const db = openDb(':memory:');
seedSources(db, cfg, [
  { id: 'lb', adapter: 'deadlock-api-leaderboard', name: 'Deadlock-API Rangliste (Fixture)', intervalHours: 24, config: { baseUrl: base, regions: ['Europe'] } },
  { id: 'lp', adapter: 'liquipedia', name: 'Liquipedia (Fixture)', intervalHours: 24, config: { apiUrl: `${base}/deadlock/api.php` } },
  { id: 'web-pages', adapter: 'web-pages', name: 'Spieler-Homepages', intervalHours: 24 },
  { id: 'gh', adapter: 'github-configs', name: 'GitHub-Configs (Fixture)', intervalHours: 24, config: { apiBase: `${base}/gh`, rawBase: `${base}/raw`, repos: [{ owner: 'o', repo: 'r', relation: 'community-preset', attribution: 'Test-Preset (Fixture)' }] } },
  { id: 'brave-search', adapter: 'brave-search', name: 'Brave Search', intervalHours: 24 },
]);
const fetcher = new Fetcher({ db, userAgent: cfg.userAgent, allowPrivate: true, defaultMaxBytes: 1_000_000, throttleScale: 0 });
for (const id of ['lb', 'lp', 'web-pages', 'gh']) {
  enqueue(db, id, 'source', {}, `source:${id}`);
  for (let j = claimNext(db); j; j = claimNext(db)) console.log(id, (await runJob({ db, cfg, fetcher, ai: null, log: () => {} }, j)).summary);
}
db.prepare("UPDATE sources SET status = 'inaktiv: BRAVE_SEARCH_API_KEY fehlt – automatische Suche inaktiv' WHERE id = 'brave-search'").run();
const apiServer = createApi(db, cfg);
await new Promise<void>((ok) => apiServer.listen(8787, '127.0.0.1', ok));

// ---------------- UI
const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function shot(name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('screenshot', name);
}

await page.goto('http://localhost:4173/#overview');
await shot('01-uebersicht');
await page.click('text=Config Studio');
await page.setInputFiles('.dropzone input[type=file]', ['test/fixtures/video.local.txt', 'test/fixtures/autoexec.cfg', 'test/fixtures/gameinfo.gi']);
await page.waitForSelector('text=Anzeige');
await shot('02-config-studio');
await page.click('.studio-cats >> text=Grafik');
await page.locator('.setting', { hasText: 'Schattenqualität' }).locator('input.input').fill('1');
await page.keyboard.press('Enter');
await page.locator('.setting', { hasText: 'Bewegungsunschärfe' }).locator('.toggle').click();
await shot('03-config-studio-aenderungen');
await page.click('text=Änderungen prüfen');
await shot('04-aenderungen-pruefen');
await page.keyboard.press('Escape');
await page.click('.studio-cats >> text=video.txt');
await shot('05-expertenmodus');
await page.click('.studio-cats >> text=Config importieren');
await page.setInputFiles('.studio-main .dropzone input[type=file]', ['test/fixtures/video.foreign.txt']);
await shot('06-config-erklaerung');
await page.keyboard.press('Escape');
await page.click('.nav >> text=Crosshairs');
await shot('07-crosshairs');
await page.click('.nav >> text=Spieler');
await page.waitForSelector('text=AuroraX');
await page.click('text=AuroraX');
await shot('08-spieler');
await page.click('.nav >> text=Optimieren');
await shot('09-optimieren');
await page.click('.nav >> text=Benchmarks');
await page.click('text=Neuer Test');
const csv = ['Application,ProcessID,MsBetweenPresents', ...Array.from({ length: 3000 }, (_, i) => `deadlock.exe,1,${(6.5 + Math.sin(i / 40) * 0.8 + (i % 97 === 0 ? 9 : 0)).toFixed(3)}`)].join('\n');
await page.locator('.panel', { hasText: 'Baseline' }).locator('input[type=file]').setInputFiles({ name: 'beispiel-baseline.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
await shot('10-benchmarks');
await page.click('.nav >> text=Profile & Backups');
await page.click('text=Aktuellen Entwurf als Profil speichern');
await shot('11-profile');
await browser.close();
preview.kill();
apiServer.close();
fixture.close();
if (errors.length) {
  console.error('Browserfehler:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK – keine Browserfehler');
