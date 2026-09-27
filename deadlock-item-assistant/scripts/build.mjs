import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/renderer/fonts', { recursive: true });
const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', platform: 'node', format: 'cjs', external: ['electron', 'tesseract.js', '@tesseract.js-data/eng'] });
await build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.js', platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/main/capturePreload.ts'], outfile: 'dist/main/capturePreload.js', platform: 'node', format: 'cjs', external: ['electron'] });
await build({ ...common, entryPoints: ['src/renderer/capture.ts'], outfile: 'dist/renderer/capture.js', platform: 'browser', format: 'iife' });
await build({ ...common, entryPoints: ['src/renderer/overlay.ts'], outfile: 'dist/renderer/overlay.js', platform: 'browser', format: 'iife' });
await build({ ...common, entryPoints: ['src/renderer/control.ts'], outfile: 'dist/renderer/control.js', platform: 'browser', format: 'iife' });
for (const f of ['overlay.html', 'overlay.css', 'control.html', 'control.css', 'theme.css', 'capture.html']) cpSync(`src/renderer/${f}`, `dist/renderer/${f}`);
// Schriften (SIL Open Font License 1.1) lokal mitliefern – keine Online-Abhängigkeit
const fonts = [
  ['barlow-semi-condensed', [400, 500, 600, 700]],
  ['barlow-condensed', [500, 600, 700]],
  ['cinzel', [600, 700]],
];
for (const [name, weights] of fonts) {
  for (const w of weights) cpSync(`node_modules/@fontsource/${name}/files/${name}-latin-${w}-normal.woff2`, `dist/renderer/fonts/${name}-latin-${w}-normal.woff2`);
  cpSync(`node_modules/@fontsource/${name}/LICENSE`, `dist/renderer/fonts/LICENSE-${name}.txt`);
}
