// Startet Server (mit Neustart bei Änderungen) und Vite-Dev-Server parallel.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
