// Bündelt den Echtzeitserver in eine einzelne Datei (dist/server/server.mjs).
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  // optionale native Beschleuniger von ws
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
