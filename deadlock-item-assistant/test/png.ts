import * as fs from 'node:fs';
import { PNG } from 'pngjs';
import type { Raster } from '../src/vision/raster';

export function loadPng(file: string): Raster {
  const p = PNG.sync.read(fs.readFileSync(file));
  return { w: p.width, h: p.height, data: new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length) };
}

export function savePng(file: string, r: Raster) {
  const p = new PNG({ width: r.w, height: r.h });
  Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length).copy(p.data);
  fs.writeFileSync(file, PNG.sync.write(p));
}
