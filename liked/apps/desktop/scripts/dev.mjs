// Entwicklung: Vite-Server für die Oberfläche; Electron lädt den gebauten Stand.
// Für die Browser-Vorschau genügt: npx vite (Demo-Daten, TikTok nicht verfügbar).
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const b = run('npm', ['run', 'build']);
b.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  run('npx', ['electron', '.']);
});
