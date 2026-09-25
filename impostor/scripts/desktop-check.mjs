// Startet die gebaute Desktop-App (Electron) gegen einen lokalen Server und prüft,
// dass Fenster, Preload-Brücke und Serververbindung funktionieren.
//   npm run build && xvfb-run -a node scripts/desktop-check.mjs   (Linux ohne Display)
import { spawn } from 'node:child_process';
import { _electron as electron } from 'playwright-core';

const PORT = 8797;
const server = spawn('node', ['dist/server/server.mjs'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
process.on('exit', () => server.kill('SIGTERM'));
await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('läuft') && res()));

const app = await electron.launch({
  args: ['.', '--no-sandbox'],
  env: { ...process.env, IMPOSTOR_SERVER_URL: `ws://127.0.0.1:${PORT}/ws` },
});
const win = await app.firstWindow();
await win.waitForSelector('.profile-editor, .home-actions', { timeout: 15000 });
const firstRun = await win.isVisible('.profile-editor');
const bridge = await win.evaluate(() => ({ desktop: !!window.impostorDesktop?.isDesktop, server: window.impostorDesktop?.defaultServer, proto: location.protocol }));
console.log('Brücke:', bridge);
if (firstRun) {
  await win.fill('input[autocomplete=nickname]', 'Desktop');
  await win.click('button:has-text("Weiter")');
  for (let i = 0; i < 3; i++) await win.click('.onb-actions .btn-primary');
}
await win.waitForSelector('text=Mit dem Spielserver verbunden', { timeout: 10000 });
await win.click('text=Lobby erstellen');
await win.waitForSelector('.code-value');
console.log('Lobby erstellt:', await win.textContent('.code-value'));
const invite = await win.$('button[aria-label="Einladungslink kopieren"]');
console.log('Einladungslink-Button in der Desktop-App:', invite ? 'vorhanden (falsch)' : 'nicht angeboten (richtig)');
await win.screenshot({ path: process.env.SHOT ?? 'desktop-check.png' });
await app.close();
const ok = bridge.desktop && bridge.proto === 'file:' && !invite;
console.log(ok ? 'Desktop-Prüfung bestanden.' : 'Desktop-Prüfung FEHLGESCHLAGEN.');
process.exit(ok ? 0 : 1);
