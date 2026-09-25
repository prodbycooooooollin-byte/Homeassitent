// Baut Electron-Hauptprozess und Preload (CommonJS).
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'info',
  define: {
    __DEFAULT_SERVER__: JSON.stringify(process.env.IMPOSTOR_SERVER_URL ?? ''),
  },
};

await build({ ...common, entryPoints: ['desktop/main.ts'], outfile: 'dist/desktop/main.cjs' });
await build({ ...common, entryPoints: ['desktop/preload.ts'], outfile: 'dist/desktop/preload.cjs' });
