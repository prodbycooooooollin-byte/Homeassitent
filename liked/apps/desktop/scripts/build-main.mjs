import { build } from 'esbuild';

// Zentraler Server, mit dem sich jede installierte App automatisch verbindet (Render, siehe render.yaml).
// Überschreibbar beim Build über die Umgebungsvariable LIKED_SERVER_URL (in CI: GitHub-Variable).
export const DEFAULT_SERVER_URL = 'https://liked-partyspiel-server.onrender.com';
const serverUrl = process.env.LIKED_SERVER_URL || DEFAULT_SERVER_URL;
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  external: ['electron'],
  define: { __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl) },
  logLevel: 'info'
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist/main/main.cjs' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist/main/preload.cjs' });
