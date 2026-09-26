import { build } from 'esbuild';

const serverUrl = process.env.LIKED_SERVER_URL ?? 'http://localhost:8787';
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
