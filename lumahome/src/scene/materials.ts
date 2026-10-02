// Gemeinsame Materialien und kleine prozedurale Texturen (keine Downloads).
import * as THREE from "three";
import { MATERIALS } from "@/catalog/catalog";
import type { FloorMaterial } from "@/model/types";
import type { Quality } from "@/store/ui";

const cache = new Map<string, THREE.Material>();
const texCache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat: number): THREE.Texture {
  const k = `${key}:${size}`;
  const hit = texCache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(repeat, repeat);
  texCache.set(k, t);
  return t;
}

const FLOOR_BASE: Record<FloorMaterial, string> = {
  oak: "#D8BE96",
  walnut: "#A27C5A",
  tiles: "#E9E7E1",
  stone: "#CFCBC2",
  carpet: "#D9D2C6",
  concrete: "#C9C9C4",
  grass: "#9DB383",
  decking: "#B88E66",
  paving: "#C8C3B8",
};

function floorTexture(m: FloorMaterial): THREE.Texture {
  const base = FLOOR_BASE[m];
  return canvasTexture(
    `floor-${m}`,
    256,
    (ctx, s) => {
      const r = rng(m.length * 97);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      if (m === "grass") {
        for (let i = 0; i < 4000; i++) {
          const g = 120 + Math.floor(r() * 60);
          ctx.fillStyle = `rgba(${g - 50},${g},${g - 70},${0.25 + r() * 0.35})`;
          ctx.fillRect(r() * s, r() * s, 1 + r() * 2, 2 + r() * 4);
        }
      } else if (m === "decking") {
        const board = s / 6;
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = `rgba(90,55,30,${0.05 + r() * 0.1})`;
          ctx.fillRect(i * board, 0, board, s);
          ctx.fillStyle = "rgba(50,30,15,0.45)";
          ctx.fillRect(i * board, 0, 2, s);
        }
      } else if (m === "paving") {
        const t = s / 4;
        for (let x = 0; x < 4; x++)
          for (let y = 0; y < 8; y++) {
            ctx.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
            ctx.fillRect(x * t + (y % 2) * (t / 2), (y * t) / 2, t, t / 2);
          }
        ctx.strokeStyle = "rgba(110,105,95,0.35)";
        for (let y = 0; y <= 8; y++) {
          ctx.beginPath();
          ctx.moveTo(0, (y * t) / 2);
          ctx.lineTo(s, (y * t) / 2);
          ctx.stroke();
        }
      } else if (m === "oak" || m === "walnut") {
        const plank = s / 8;
        for (let i = 0; i < 8; i++) {
          const off = r() * s;
          ctx.fillStyle = `rgba(${m === "oak" ? "120,80,40" : "60,35,20"},${0.04 + r() * 0.08})`;
          ctx.fillRect(0, i * plank, s, plank);
          ctx.fillStyle = "rgba(60,40,20,0.18)";
          ctx.fillRect(0, i * plank, s, 1);
          ctx.fillRect(off, i * plank, 1, plank);
          for (let g = 0; g < 6; g++) {
            ctx.fillStyle = `rgba(90,60,30,${0.03 + r() * 0.04})`;
            ctx.fillRect(0, i * plank + r() * plank, s, 1);
          }
        }
      } else if (m === "tiles" || m === "stone") {
        const n = m === "tiles" ? 8 : 4;
        const t = s / n;
        for (let x = 0; x < n; x++)
          for (let y = 0; y < n; y++) {
            ctx.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
            ctx.fillRect(x * t, y * t, t, t);
          }
        ctx.strokeStyle = m === "tiles" ? "rgba(140,140,130,0.35)" : "rgba(120,115,105,0.3)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i <= n; i++) {
          ctx.beginPath();
          ctx.moveTo(i * t, 0);
          ctx.lineTo(i * t, s);
          ctx.moveTo(0, i * t);
          ctx.lineTo(s, i * t);
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 2500; i++) {
          ctx.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${r() * 0.05})`;
          ctx.fillRect(r() * s, r() * s, 2, 2);
        }
      }
    },
    1,
  );
}

/** Wiederholung der Bodentextur: 256 px entsprechen 1,6 m (Dielen) bzw. 1,2 m (Fliesen). */
export function floorRepeat(m: FloorMaterial): number {
  return m === "tiles" ? 1 / 1.2 : m === "stone" ? 1 / 1.6 : 1 / 1.6;
}

export function floorMaterial(m: FloorMaterial, quality: Quality): THREE.Material {
  const key = `floor:${m}:${quality}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({
    color: quality === "low" ? FLOOR_BASE[m] : "#ffffff",
    map: quality === "low" ? null : floorTexture(m),
    roughness: m === "tiles" ? 0.45 : m === "stone" ? 0.7 : m === "carpet" ? 1 : 0.75,
    metalness: 0,
  });
  if (mat.map) mat.map.repeat.set(floorRepeat(m), floorRepeat(m));
  cache.set(key, mat);
  return mat;
}

export function wallMaterial(color: string, cut = false): THREE.Material {
  const key = `wall:${color}:${cut}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({ color: cut ? "#3B423F" : color, roughness: 0.92, metalness: 0 });
  cache.set(key, mat);
  return mat;
}

export const slabMaterial = () => cached("slab", () => new THREE.MeshStandardMaterial({ color: "#E4E1D9", roughness: 0.95 }));
export const slabEdgeMaterial = () => cached("slab-edge", () => new THREE.MeshStandardMaterial({ color: "#C9C5BB", roughness: 0.95 }));
export const glassMaterial = () =>
  cached("glass", () => new THREE.MeshStandardMaterial({ color: "#CFE3EA", transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, depthWrite: false }));
export const frameMaterial = () => cached("frame", () => new THREE.MeshStandardMaterial({ color: "#F7F6F2", roughness: 0.5 }));
export const doorMaterial = () => cached("door", () => new THREE.MeshStandardMaterial({ color: "#EDE7DC", roughness: 0.7 }));
export const shutterMaterial = () => cached("shutter", () => new THREE.MeshStandardMaterial({ color: "#8E9590", roughness: 0.6, metalness: 0.2 }));
export const openFrameMaterial = () => cached("frame-open", () => new THREE.MeshStandardMaterial({ color: "#C98A1B", roughness: 0.5, emissive: "#6b4300", emissiveIntensity: 0.4 }));

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key) as T | undefined;
  if (hit) return hit;
  const m = make();
  cache.set(key, m);
  return m;
}

function fabricTexture(): THREE.Texture {
  return canvasTexture(
    "fabric",
    128,
    (ctx, s) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, s, s);
      const r = rng(7);
      for (let y = 0; y < s; y += 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
        ctx.fillRect(0, y, s, 1);
      }
      for (let x = 0; x < s; x += 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.02})`;
        ctx.fillRect(x, 0, 1, s);
      }
    },
    3,
  );
}

function woodTexture(): THREE.Texture {
  return canvasTexture(
    "wood",
    128,
    (ctx, s) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, s, s);
      const r = rng(11);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(80,50,20,${0.03 + r() * 0.06})`;
        ctx.fillRect(0, r() * s, s, 1 + r() * 2);
      }
    },
    1,
  );
}

export function partMaterial(color: string, material: string, quality: Quality): THREE.Material {
  const def = MATERIALS[material] ?? MATERIALS.lack;
  const key = `part:${color}:${def.id}:${quality}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const map = quality === "low" ? null : def.pattern === "fabric" ? fabricTexture() : def.pattern === "wood" ? woodTexture() : null;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: def.roughness, metalness: def.metalness, map });
  cache.set(key, mat);
  return mat;
}

export function glowMaterial(color: string, intensity: number): THREE.Material {
  const key = `glow:${color}:${intensity.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({ color: "#FFF9EC", emissive: color, emissiveIntensity: intensity, roughness: 0.6, toneMapped: false });
  cache.set(key, mat);
  return mat;
}

export function tintMaterial(color: string, opacity: number): THREE.Material {
  const key = `tint:${color}:${opacity.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  cache.set(key, mat);
  return mat;
}

export const selectionMaterial = () =>
  cached("selection", () => new THREE.MeshBasicMaterial({ color: "#4D7163", transparent: true, opacity: 0.18, depthWrite: false }));
export const issueMaterial = () => cached("issue", () => new THREE.MeshBasicMaterial({ color: "#C98A1B", transparent: true, opacity: 0.22, depthWrite: false }));
export const ghostMaterial = () => cached("ghost", () => new THREE.MeshStandardMaterial({ color: "#4D7163", transparent: true, opacity: 0.35, depthWrite: false }));

export const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
  cone: new THREE.CylinderGeometry(0.15, 0.5, 1, 24, 1, true),
};
