/**
 * Procedural illustration generator.
 *
 * Produces original, deterministic SVG artwork (sunsets, skylines, wetlands …)
 * so every screen stays visually rich while no licensed game imagery exists.
 * These images are illustrations — the UI labels them as such and they can
 * never be flagged as authentic gameplay (enforced in the content schema).
 */
import type { ArtScene } from "@/lib/content/schema";

const W = 1600;
const H = 900;

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Palette = { sky: [string, string, string, string]; sun: string; glow: string; ink: string; water: string; accent: string };

const PALETTES: Palette[] = [
  { sky: ["#140a26", "#4a1f7a", "#b23c86", "#ff8a5b"], sun: "#ffb36b", glow: "#ff6fa8", ink: "#0a0612", water: "#2a1340", accent: "#c084fc" },
  { sky: ["#0b0820", "#2b1655", "#7a3b9a", "#e86a92"], sun: "#ff9fb8", glow: "#c084fc", ink: "#07050f", water: "#1d1238", accent: "#e879f9" },
  { sky: ["#1c1033", "#4a3070", "#d77fa1", "#ffc48a"], sun: "#ffe1a8", glow: "#ffb38a", ink: "#120a1e", water: "#3a2556", accent: "#fda4af" },
  { sky: ["#0d0b1f", "#33196b", "#9d3fa8", "#ff7a7a"], sun: "#ffc27a", glow: "#f472b6", ink: "#080512", water: "#24124a", accent: "#a78bfa" },
];
const NIGHT: Palette = { sky: ["#04030a", "#0d0920", "#1f1145", "#3b1c6e"], sun: "#e9d5ff", glow: "#a855f7", ink: "#030207", water: "#100a24", accent: "#c084fc" };
const INTERIOR: Palette = { sky: ["#07060c", "#120e1c", "#1c1530", "#2a1d48"], sun: "#c084fc", glow: "#a855f7", ink: "#050409", water: "#140f22", accent: "#f0abfc" };

const f = (n: number) => Math.round(n * 10) / 10;

function defs(p: Palette, id: string, horizon: number) {
  return `<defs>
<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".45" stop-color="${p.sky[1]}"/><stop offset=".78" stop-color="${p.sky[2]}"/><stop offset="1" stop-color="${p.sky[3]}"/></linearGradient>
<linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[2]}" stop-opacity=".55"/><stop offset=".35" stop-color="${p.water}"/><stop offset="1" stop-color="${p.ink}"/></linearGradient>
<radialGradient id="${id}g" cx=".5" cy="${f(horizon / H)}" r=".6"><stop offset="0" stop-color="${p.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
<linearGradient id="${id}sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sun}"/><stop offset="1" stop-color="${p.glow}"/></linearGradient>
</defs>`;
}

function sky(id: string) {
  return `<rect width="${W}" height="${H}" fill="url(#${id}s)"/><rect width="${W}" height="${H}" fill="url(#${id}g)"/>`;
}

function sun(id: string, cx: number, cy: number, r: number, stripes = true) {
  let s = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${id}sun)" opacity=".95"/>`;
  if (stripes) {
    for (let i = 0; i < 5; i++) {
      const y = cy + r * 0.15 + i * r * 0.17;
      s += `<rect x="${f(cx - r)}" y="${f(y)}" width="${f(r * 2)}" height="${f(2 + i * 2.2)}" fill="#000" opacity=".35"/>`;
    }
  }
  return s;
}

function stars(r: () => number, n: number, maxY: number) {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += `<circle cx="${f(r() * W)}" cy="${f(r() * maxY)}" r="${f(0.6 + r() * 1.6)}" fill="#fff" opacity="${f(0.25 + r() * 0.7)}"/>`;
  }
  return s;
}

function clouds(r: () => number, p: Palette, n: number, yMax: number) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const y = 80 + r() * yMax;
    const x = r() * W;
    const w = 200 + r() * 420;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(4 + r() * 10)}" rx="6" fill="${p.sky[3]}" opacity="${f(0.15 + r() * 0.25)}"/>`;
  }
  return s;
}

function palm(x: number, base: number, h: number, lean: number, color: string) {
  const topX = x + lean;
  const topY = base - h;
  let s = `<path d="M${f(x)} ${f(base)} Q ${f(x + lean * 0.3)} ${f(base - h * 0.55)} ${f(topX)} ${f(topY)}" stroke="${color}" stroke-width="${f(h * 0.045)}" fill="none" stroke-linecap="round"/>`;
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (Math.PI * 2 * i) / fronds + 0.3;
    const len = h * (0.32 + (i % 2) * 0.08);
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len * 0.55 + len * 0.25;
    const cx = topX + Math.cos(a) * len * 0.5;
    const cy = topY + Math.sin(a) * len * 0.3 - len * 0.18;
    s += `<path d="M${f(topX)} ${f(topY)} Q ${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}" stroke="${color}" stroke-width="${f(h * 0.03)}" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

function skyline(r: () => number, base: number, color: string, opts: { count: number; maxH: number; windows?: string; minW?: number }) {
  let s = "";
  let x = -20;
  while (x < W + 20) {
    const w = (opts.minW ?? 40) + r() * 70;
    const h = opts.maxH * (0.25 + r() * 0.75);
    s += `<rect x="${f(x)}" y="${f(base - h)}" width="${f(w)}" height="${f(h + 2)}" fill="${color}"/>`;
    if (r() > 0.7) s += `<rect x="${f(x + w / 2 - 2)}" y="${f(base - h - 30)}" width="4" height="30" fill="${color}"/>`;
    if (opts.windows) {
      for (let wy = base - h + 10; wy < base - 8; wy += 14) {
        for (let wx = x + 6; wx < x + w - 6; wx += 11) {
          if (r() > 0.78) s += `<rect x="${f(wx)}" y="${f(wy)}" width="4" height="6" fill="${opts.windows}" opacity="${f(0.4 + r() * 0.6)}"/>`;
        }
      }
    }
    x += w + r() * 6;
  }
  return s;
}

function ridge(r: () => number, base: number, amp: number, color: string, step = 60) {
  let d = `M0 ${H} L0 ${f(base)}`;
  let y = base;
  for (let x = 0; x <= W + step; x += step) {
    y = Math.max(base - amp, Math.min(base + amp * 0.3, y + (r() - 0.55) * amp * 0.6));
    d += ` L${x} ${f(y)}`;
  }
  return `<path d="${d} L${W} ${H} Z" fill="${color}"/>`;
}

function water(id: string, top: number, r: () => number, p: Palette) {
  let s = `<rect y="${f(top)}" width="${W}" height="${f(H - top)}" fill="url(#${id}w)"/>`;
  for (let i = 0; i < 22; i++) {
    const y = top + 8 + Math.pow(r(), 1.6) * (H - top);
    const w = 40 + r() * 260;
    s += `<rect x="${f(r() * W)}" y="${f(y)}" width="${f(w)}" height="2" fill="${p.sun}" opacity="${f(0.08 + r() * 0.22)}"/>`;
  }
  return s;
}

function sunReflection(cx: number, top: number, p: Palette) {
  let s = "";
  for (let i = 0; i < 9; i++) {
    const w = 220 - i * 18;
    s += `<rect x="${f(cx - w / 2)}" y="${f(top + 6 + i * 13)}" width="${f(w)}" height="4" rx="2" fill="${p.sun}" opacity="${f(0.55 - i * 0.05)}"/>`;
  }
  return s;
}

function cypress(x: number, base: number, h: number, color: string) {
  return `<path d="M${f(x)} ${f(base)} L${f(x - h * 0.05)} ${f(base - h * 0.5)} L${f(x - h * 0.16)} ${f(base - h * 0.62)} L${f(x - h * 0.03)} ${f(base - h * 0.7)} L${f(x - h * 0.12)} ${f(base - h * 0.86)} L${f(x)} ${f(base - h)} L${f(x + h * 0.14)} ${f(base - h * 0.8)} L${f(x + h * 0.04)} ${f(base - h * 0.68)} L${f(x + h * 0.18)} ${f(base - h * 0.56)} L${f(x + h * 0.05)} ${f(base - h * 0.48)} Z" fill="${color}"/>`;
}

function pine(x: number, base: number, h: number, color: string) {
  return `<path d="M${f(x)} ${f(base - h)} L${f(x + h * 0.22)} ${f(base - h * 0.35)} L${f(x + h * 0.08)} ${f(base - h * 0.38)} L${f(x + h * 0.3)} ${f(base)} L${f(x - h * 0.3)} ${f(base)} L${f(x - h * 0.08)} ${f(base - h * 0.38)} L${f(x - h * 0.22)} ${f(base - h * 0.35)} Z" fill="${color}"/>`;
}

function crane(x: number, base: number, h: number, color: string) {
  return `<g stroke="${color}" stroke-width="7" fill="none"><path d="M${x} ${base} L${x} ${base - h} M${x - 40} ${base} L${x} ${base - h * 0.6} M${x + 40} ${base} L${x} ${base - h * 0.6}"/><path d="M${x - 60} ${base - h} L${x + 260} ${base - h}" stroke-width="10"/><path d="M${x + 200} ${base - h} L${x + 200} ${base - h + 120}" stroke-width="2"/></g>`;
}

function boat(x: number, y: number, s: number, color: string, light: string) {
  return `<path d="M${f(x)} ${f(y)} L${f(x + 160 * s)} ${f(y)} L${f(x + 140 * s)} ${f(y + 22 * s)} L${f(x + 14 * s)} ${f(y + 22 * s)} Z" fill="${color}"/><rect x="${f(x + 50 * s)}" y="${f(y - 22 * s)}" width="${f(60 * s)}" height="${f(22 * s)}" rx="4" fill="${color}"/><rect x="${f(x + 58 * s)}" y="${f(y - 16 * s)}" width="${f(44 * s)}" height="${f(6 * s)}" fill="${light}" opacity=".8"/>`;
}

function carSilhouette(x: number, y: number, s: number, color: string, accent: string) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><path d="M0 60 Q10 30 70 26 L150 6 Q220 -4 290 22 L380 34 Q410 40 412 60 L412 74 L0 74 Z" fill="${color}"/><path d="M160 14 L270 24 L250 34 L140 30 Z" fill="${accent}" opacity=".35"/><rect x="330" y="44" width="70" height="5" rx="2" fill="${accent}"/><rect x="6" y="50" width="40" height="5" rx="2" fill="#ff5f8a"/><circle cx="90" cy="76" r="28" fill="#000"/><circle cx="320" cy="76" r="28" fill="#000"/><circle cx="90" cy="76" r="12" fill="#2a2338"/><circle cx="320" cy="76" r="12" fill="#2a2338"/></g>`;
}

/* ------------------------------------------------------------------ */

export function renderScene(scene: ArtScene, seed: number): string {
  const r = rng(seed * 9973 + scene.length * 131);
  const id = `a${seed}`;
  let p = PALETTES[Math.floor(r() * PALETTES.length)];
  if (scene === "night-sky") p = NIGHT;
  if (scene === "garage" || scene === "vault" || scene === "interior" || scene === "club") p = INTERIOR;

  const horizon = 560 + r() * 60;
  let body = "";

  switch (scene) {
    case "skyline": {
      const sx = 380 + r() * 840;
      body += sky(id) + clouds(r, p, 6, 300) + sun(id, sx, horizon - 120, 150);
      body += skyline(r, horizon, p.sky[1], { count: 30, maxH: 260, minW: 50 });
      body += skyline(r, horizon + 4, p.ink, { count: 30, maxH: 360, windows: p.sun });
      body += water(id, horizon, r, p) + sunReflection(sx, horizon, p);
      body += palm(120, H + 20, 520, 70, p.ink) + palm(W - 160, H + 30, 460, -60, p.ink);
      break;
    }
    case "beach": {
      const sx = 600 + r() * 400;
      body += sky(id) + clouds(r, p, 5, 260) + sun(id, sx, horizon - 90, 170);
      body += water(id, horizon, r, p) + sunReflection(sx, horizon, p);
      body += `<path d="M0 ${H - 170} Q ${W * 0.4} ${H - 230} ${W} ${H - 150} L${W} ${H} L0 ${H} Z" fill="${p.ink}" opacity=".95"/>`;
      body += palm(220, H - 150, 520, 90, p.ink) + palm(330, H - 160, 380, 40, p.ink) + palm(W - 200, H - 140, 500, -80, p.ink);
      break;
    }
    case "keys": {
      const sx = 300 + r() * 1000;
      body += sky(id) + clouds(r, p, 7, 280) + sun(id, sx, horizon - 70, 120);
      body += water(id, horizon, r, p) + sunReflection(sx, horizon, p);
      for (let i = 0; i < 4; i++) {
        const cx = 150 + i * 420 + r() * 120;
        body += `<ellipse cx="${f(cx)}" cy="${f(horizon + 6)}" rx="${f(120 + r() * 80)}" ry="16" fill="${p.ink}"/>`;
        body += palm(cx - 30, horizon + 4, 110 + r() * 50, 15, p.ink);
      }
      const by = horizon + 90;
      body += `<rect x="0" y="${f(by)}" width="${W}" height="14" fill="${p.ink}"/>`;
      for (let x = 30; x < W; x += 110) body += `<rect x="${x}" y="${f(by + 12)}" width="12" height="${f(H - by)}" fill="${p.ink}"/>`;
      for (let x = 10; x < W; x += 60) body += `<circle cx="${x}" cy="${f(by - 6)}" r="2.5" fill="${p.sun}" opacity=".8"/>`;
      break;
    }
    case "swamp": {
      const sx = 400 + r() * 800;
      body += sky(id) + clouds(r, p, 5, 260) + sun(id, sx, horizon - 60, 130, false);
      body += water(id, horizon, r, p) + sunReflection(sx, horizon, p);
      body += ridge(r, horizon + 4, 30, p.sky[1], 40);
      for (let i = 0; i < 14; i++) {
        const x = r() * W;
        const h = 160 + r() * 260;
        body += cypress(x, horizon + 10, h, p.ink);
        body += `<g opacity=".25" transform="translate(0 ${f(2 * (horizon + 10))}) scale(1 -1)">${cypress(x, horizon + 10, h * 0.9, p.ink)}</g>`;
      }
      for (let i = 0; i < 90; i++) {
        const x = r() * W;
        const h = 30 + r() * 90;
        body += `<path d="M${f(x)} ${H} q ${f((r() - 0.5) * 30)} ${f(-h / 2)} ${f((r() - 0.5) * 40)} ${f(-h)}" stroke="${p.ink}" stroke-width="3" fill="none"/>`;
      }
      if (seed % 3 === 1) body += `<ellipse cx="${f(sx + 160)}" cy="${f(horizon + 40)}" rx="140" ry="26" fill="${p.ink}"/><ellipse cx="${f(sx + 160)}" cy="${f(horizon + 30)}" rx="60" ry="14" fill="${p.accent}" opacity=".7"/><ellipse cx="${f(sx + 160)}" cy="${f(horizon + 34)}" rx="200" ry="60" fill="${p.accent}" opacity=".12"/>`;
      break;
    }
    case "mountain": {
      body += sky(id) + clouds(r, p, 6, 220) + sun(id, 300 + r() * 1000, horizon - 200, 110, false);
      body += ridge(r, horizon - 160, 160, p.sky[1], 80);
      body += ridge(r, horizon - 40, 120, p.water, 60);
      body += ridge(r, horizon + 90, 80, p.ink, 50);
      for (let i = 0; i < 40; i++) body += pine(r() * W, H - r() * 140, 60 + r() * 140, p.ink);
      break;
    }
    case "highway": {
      body += sky(id) + sun(id, W / 2, horizon - 90, 160);
      body += skyline(r, horizon, p.ink, { count: 40, maxH: 220, windows: p.sun });
      body += `<path d="M${W / 2 - 30} ${f(horizon)} L${W / 2 + 30} ${f(horizon)} L${W + 200} ${H} L-200 ${H} Z" fill="#0a0812"/>`;
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const y = horizon + (H - horizon) * t * t + 10;
        const w = 4 + 30 * t;
        body += `<rect x="${f(W / 2 - w / 2)}" y="${f(y)}" width="${f(w)}" height="${f(6 + 30 * t)}" fill="${p.sun}" opacity=".7"/>`;
      }
      body += `<path d="M${W / 2 - 10} ${f(horizon)} L-100 ${H}" stroke="${p.glow}" stroke-width="6" opacity=".8"/><path d="M${W / 2 + 10} ${f(horizon)} L${W + 100} ${H}" stroke="#ff5f8a" stroke-width="6" opacity=".7"/>`;
      body += carSilhouette(W / 2 - 330, H - 180, 1.6, "#06040c", p.accent);
      break;
    }
    case "garage": {
      body += `<rect width="${W}" height="${H}" fill="${p.sky[1]}"/><path d="M0 0 L${W} 0 L${W - 250} 300 L250 300 Z" fill="${p.sky[0]}"/><path d="M250 640 L${W - 250} 640 L${W} ${H} L0 ${H} Z" fill="${p.sky[0]}"/>`;
      for (let i = 0; i < 4; i++) body += `<rect x="${380 + i * 230}" y="${120 + i * 8}" width="140" height="8" rx="4" fill="#fff" opacity=".85"/><path d="M${380 + i * 230} 130 L${330 + i * 230} 640 L${570 + i * 230} 640 L${520 + i * 230} 130 Z" fill="#fff" opacity=".035"/>`;
      body += `<path d="M420 680 Q 480 520 760 500 Q 1060 480 1180 560 Q 1230 600 1220 690 Z" fill="#2a2338"/><path d="M460 680 Q 520 560 760 540 Q 1040 525 1170 600" stroke="#3b3250" stroke-width="5" fill="none"/>`;
      body += `<rect x="770" y="560" width="70" height="80" rx="12" fill="#f5b942"/><path d="M785 562 v-26 a20 20 0 0 1 40 0 v26" stroke="#f5b942" stroke-width="10" fill="none"/>`;
      break;
    }
    case "harbor": {
      const sx = 300 + r() * 1000;
      body += sky(id) + clouds(r, p, 6, 260) + sun(id, sx, horizon - 80, 130);
      body += skyline(r, horizon, p.sky[1], { count: 20, maxH: 180 });
      body += crane(200 + r() * 200, horizon, 300, p.ink) + crane(900 + r() * 200, horizon, 260, p.ink);
      body += `<rect y="${f(horizon - 30)}" width="${W}" height="34" fill="${p.ink}"/>`;
      for (let i = 0; i < 10; i++) body += `<rect x="${f(r() * W)}" y="${f(horizon - 60 - r() * 40)}" width="${f(70 + r() * 40)}" height="40" fill="${[p.ink, p.water, p.sky[1]][i % 3]}"/>`;
      body += water(id, horizon + 4, r, p) + sunReflection(sx, horizon + 4, p);
      body += boat(260, horizon + 120, 1.6, p.ink, p.sun) + boat(980, horizon + 170, 2.2, p.ink, p.accent);
      break;
    }
    case "industrial": {
      body += sky(id) + clouds(r, p, 4, 240) + sun(id, 300 + r() * 1000, horizon - 120, 140, false);
      for (let i = 0; i < 6; i++) {
        const x = 200 + i * 220 + r() * 60;
        const h = 220 + r() * 200;
        body += `<rect x="${f(x)}" y="${f(horizon - h)}" width="34" height="${f(h)}" fill="${p.ink}"/>`;
        body += `<circle cx="${f(x + 40)}" cy="${f(horizon - h - 50)}" r="${f(40 + r() * 30)}" fill="${p.sky[3]}" opacity=".25"/><circle cx="${f(x + 110)}" cy="${f(horizon - h - 110)}" r="${f(60 + r() * 30)}" fill="${p.sky[3]}" opacity=".15"/>`;
      }
      body += skyline(r, horizon + 10, p.ink, { count: 20, maxH: 160, windows: p.sun, minW: 90 });
      body += `<rect y="${f(horizon + 8)}" width="${W}" height="${f(H - horizon)}" fill="${p.ink}"/>`;
      body += `<path d="M0 ${f(horizon + 120)} L${W} ${f(horizon + 70)}" stroke="${p.sky[2]}" stroke-width="4" opacity=".6"/><path d="M0 ${f(horizon + 140)} L${W} ${f(horizon + 90)}" stroke="${p.sky[2]}" stroke-width="4" opacity=".6"/>`;
      break;
    }
    case "night-sky": {
      body += sky(id) + stars(r, 220, horizon);
      body += `<circle cx="${f(300 + r() * 1000)}" cy="160" r="60" fill="${p.sun}" opacity=".85"/>`;
      const bx = 500 + r() * 600;
      body += `<path d="M${f(bx - 30)} 120 L${f(bx + 30)} 120 L${f(bx + 260)} ${f(horizon)} L${f(bx - 260)} ${f(horizon)} Z" fill="${p.accent}" opacity=".18"/><ellipse cx="${f(bx)}" cy="110" rx="110" ry="24" fill="#1d1335"/><ellipse cx="${f(bx)}" cy="98" rx="46" ry="22" fill="${p.accent}" opacity=".8"/>`;
      body += ridge(r, horizon, 40, p.sky[1], 40);
      for (let i = 0; i < 30; i++) body += r() > 0.5 ? pine(r() * W, H, 120 + r() * 200, p.ink) : palm(r() * W, H + 10, 200 + r() * 200, (r() - 0.5) * 80, p.ink);
      break;
    }
    case "club": {
      body += `<rect width="${W}" height="${H}" fill="${p.sky[0]}"/>`;
      const cols = ["#a855f7", "#f472b6", "#60a5fa", "#e879f9"];
      for (let i = 0; i < 9; i++) {
        const x = r() * W;
        body += `<path d="M${f(x)} 0 L${f(x - 160 - r() * 260)} ${H} L${f(x + 160 + r() * 260)} ${H} Z" fill="${cols[i % 4]}" opacity="${f(0.06 + r() * 0.1)}"/>`;
      }
      body += `<rect x="300" y="200" width="1000" height="18" rx="9" fill="#f472b6" opacity=".7"/><rect x="300" y="200" width="1000" height="18" rx="9" fill="#f472b6" opacity=".25" transform="translate(0 6)"/>`;
      for (let i = 0; i < 60; i++) {
        const x = r() * W;
        const y = 640 + r() * 220;
        body += `<circle cx="${f(x)}" cy="${f(y - 70)}" r="${f(20 + r() * 8)}" fill="#05030a"/><rect x="${f(x - 32)}" y="${f(y - 50)}" width="64" height="${f(H - y + 60)}" rx="26" fill="#05030a"/>`;
      }
      break;
    }
    case "vault": {
      body += `<rect width="${W}" height="${H}" fill="${p.sky[1]}"/><rect y="${H - 180}" width="${W}" height="180" fill="${p.sky[0]}"/>`;
      body += `<circle cx="${W / 2}" cy="430" r="300" fill="#1f1a2e" stroke="#3a3150" stroke-width="18"/><circle cx="${W / 2}" cy="430" r="220" fill="#17131f" stroke="#4a3f66" stroke-width="6"/>`;
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        body += `<circle cx="${f(W / 2 + Math.cos(a) * 262)}" cy="${f(430 + Math.sin(a) * 262)}" r="14" fill="#4a3f66"/>`;
      }
      body += `<circle cx="${W / 2}" cy="430" r="70" fill="none" stroke="${p.accent}" stroke-width="10" opacity=".8"/>`;
      for (let i = 0; i < 3; i++) body += `<line x1="${W / 2}" y1="430" x2="${f(W / 2 + Math.cos(i * 2.09) * 130)}" y2="${f(430 + Math.sin(i * 2.09) * 130)}" stroke="${p.accent}" stroke-width="14" stroke-linecap="round" opacity=".7"/>`;
      body += `<rect x="${W / 2 - 600}" y="0" width="200" height="${H}" fill="${p.accent}" opacity=".04"/>`;
      if (seed % 2 === 1) for (let i = 0; i < 8; i++) body += `<rect x="${f(180 + i * 30)}" y="${f(640 - i * 18)}" width="180" height="40" rx="4" fill="#3f8f5a" stroke="#14301e" stroke-width="3"/>`;
      break;
    }
    case "suburb": {
      body += sky(id) + clouds(r, p, 5, 280) + sun(id, 300 + r() * 1000, horizon - 110, 140);
      body += `<path d="M0 ${f(horizon - 180)} L${W} ${f(horizon - 200)}" stroke="${p.ink}" stroke-width="3"/><path d="M0 ${f(horizon - 160)} Q ${W / 2} ${f(horizon - 120)} ${W} ${f(horizon - 180)}" stroke="${p.ink}" stroke-width="2" fill="none"/>`;
      for (let i = 0; i < 7; i++) {
        const x = i * 240 + r() * 60;
        const w = 160 + r() * 40;
        const h = 90 + r() * 40;
        body += `<rect x="${f(x)}" y="${f(horizon - h)}" width="${f(w)}" height="${f(h)}" fill="${p.ink}"/><path d="M${f(x - 12)} ${f(horizon - h)} L${f(x + w / 2)} ${f(horizon - h - 60)} L${f(x + w + 12)} ${f(horizon - h)} Z" fill="${p.ink}"/><rect x="${f(x + 24)}" y="${f(horizon - h + 26)}" width="30" height="24" fill="${p.sun}" opacity=".7"/>`;
        if (r() > 0.4) body += palm(x + w + 40, horizon + 4, 260 + r() * 120, (r() - 0.5) * 60, p.ink);
      }
      body += `<rect y="${f(horizon)}" width="${W}" height="${f(H - horizon)}" fill="${p.ink}"/>`;
      break;
    }
    case "interior":
    default: {
      body += `<rect width="${W}" height="${H}" fill="${p.sky[0]}"/>`;
      for (let i = 0; i < 7; i++) {
        const x = r() * W;
        body += `<rect x="${f(x)}" y="${f(r() * 300)}" width="${f(120 + r() * 300)}" height="${f(300 + r() * 500)}" rx="18" fill="${[p.sky[1], p.sky[2], p.sky[3]][i % 3]}" opacity="${f(0.25 + r() * 0.35)}"/>`;
      }
      body += `<circle cx="${f(W * (0.3 + r() * 0.4))}" cy="${f(H * 0.45)}" r="260" fill="${p.glow}" opacity=".18"/>`;
      body += `<path d="M0 ${H - 140} L${W} ${H - 200} L${W} ${H} L0 ${H} Z" fill="${p.ink}"/>`;
      break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img">${defs(p, id, horizon)}${body}<rect width="${W}" height="${H}" fill="url(#${id}v)"/></svg>`;
}
