import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/renderer', { recursive: true });
const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.js', platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/renderer/overlay.ts'], outfile: 'dist/renderer/overlay.js', platform: 'browser', format: 'iife' });
await build({ ...common, entryPoints: ['src/renderer/control.ts'], outfile: 'dist/renderer/control.js', platform: 'browser', format: 'iife' });
for (const f of ['overlay.html', 'overlay.css', 'control.html', 'control.css']) cpSync(`src/renderer/${f}`, `dist/renderer/${f}`);
