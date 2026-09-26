// Erzeugt das App-Icon (PNG + ICO) ohne externe Werkzeuge: dunkles abgerundetes
// Quadrat mit violett-cyanfarbenem Herz. Selbst erstellt, keine Fremdlizenz.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const S = 4; // Supersampling
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S;
        // abgerundetes Quadrat
        const dx = Math.max(r - px, 0, px - (size - r)), dy = Math.max(r - py, 0, py - (size - r));
        const inBox = dx * dx + dy * dy <= r * r;
        if (!inBox) continue;
        // Hintergrund mit leichtem Verlauf
        const t = py / size;
        let col = [13 + 20 * (1 - t), 13, 20 + 30 * (1 - t), 255];
        // Herz: (x²+y²-1)³ - x²y³ <= 0
        const hx = (px / size - 0.5) * 3.3, hy = -(py / size - 0.54) * 3.3;
        const v = Math.pow(hx * hx + hy * hy - 1, 3) - hx * hx * hy * hy * hy;
        if (v <= 0) {
          const g = Math.min(1, Math.max(0, (px / size - 0.2) / 0.6 + (py / size - 0.3) * 0.4));
          col = [168 + (34 - 168) * g, 85 + (211 - 85) * g, 247 + (238 - 247) * g, 255];
          // Glanzlicht
          const hl = Math.max(0, 1 - Math.hypot(px / size - 0.36, py / size - 0.38) / 0.12);
          col = col.map((c, i) => (i < 3 ? c + (255 - c) * hl * 0.35 : c));
        } else if (v <= 0.35) {
          // Leuchtsaum
          const a = (1 - v / 0.35) * 0.5;
          col = [col[0] + (168 - col[0]) * a, col[1] + (85 - col[1]) * a, col[2] + (247 - col[2]) * a, 255];
        }
        acc = acc.map((a, i) => a + col[i]);
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const n = S * S;
      raw[o] = Math.round(acc[0] / n); raw[o + 1] = Math.round(acc[1] / n); raw[o + 2] = Math.round(acc[2] / n); raw[o + 3] = Math.round(acc[3] / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(pngs) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = [], datas = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size; e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length; entries.push(e); datas.push(data);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}
mkdirSync('build', { recursive: true });
mkdirSync('public', { recursive: true });
const sizes = [16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: png(s) }));
writeFileSync('build/icon.ico', ico(sizes));
writeFileSync('build/icon.png', png(512));
writeFileSync('public/icon.png', sizes.find((s) => s.size === 256).data);
console.log('Icon erzeugt: build/icon.ico, build/icon.png, public/icon.png');
