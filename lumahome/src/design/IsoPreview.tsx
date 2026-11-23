// Kleine isometrische Vorschau eines Katalogmodells (reines SVG).
import { memo } from "react";
import type { CatalogEntry, Part } from "@/catalog/catalog";

const C = Math.cos(Math.PI / 6);
const S = Math.sin(Math.PI / 6);

function color(p: Part, e: CatalogEntry): string {
  switch (p.color) {
    case "main":
      return e.defaultColor;
    case "accent":
      return e.accent;
    case "dark":
      return "#3A3F3C";
    case "metal":
      return "#B9BDB8";
    case "glass":
      return "#CFE3EA";
    case "light":
      return "#F7F5F0";
    case "fabric2":
      return e.defaultColor;
    default:
      return p.color;
  }
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(Math.max(0, Math.min(255, x * f))));
  return `rgb(${c.join(",")})`;
}

export const IsoPreview = memo(function IsoPreview({ entry, size = 72 }: { entry: CatalogEntry; size?: number }) {
  const { w, d, h } = entry.size;
  const proj = (x: number, y: number, z: number) => ({ x: (x - z) * C, y: -y + (x + z) * S });
  const parts = entry.parts
    .map((p) => {
      const pw = p.w * w;
      const ph = p.h * h;
      const pd = p.d * d;
      const cx = p.x * w;
      const cy = p.y * h;
      const cz = p.z * d;
      return { p, x0: cx - pw / 2, x1: cx + pw / 2, y0: cy - ph / 2, y1: cy + ph / 2, z0: cz - pd / 2, z1: cz + pd / 2 };
    })
    .sort((a, b) => a.x0 + a.z0 + a.y0 * 0.5 - (b.x0 + b.z0 + b.y0 * 0.5));
  const pts = parts.flatMap((b) => [proj(b.x0, b.y0, b.z0), proj(b.x1, b.y1, b.z1), proj(b.x0, b.y1, b.z1), proj(b.x1, b.y0, b.z0), proj(b.x1, b.y1, b.z0), proj(b.x0, b.y1, b.z0)]);
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const poly = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
  return (
    <svg viewBox={vb} width={size} height={size} aria-hidden className="overflow-visible">
      {parts.map((b, i) => {
        const base = color(b.p, entry);
        const glass = b.p.color === "glass";
        const op = glass ? 0.45 : 1;
        const top = [proj(b.x0, b.y1, b.z0), proj(b.x1, b.y1, b.z0), proj(b.x1, b.y1, b.z1), proj(b.x0, b.y1, b.z1)];
        const front = [proj(b.x0, b.y0, b.z1), proj(b.x1, b.y0, b.z1), proj(b.x1, b.y1, b.z1), proj(b.x0, b.y1, b.z1)];
        const right = [proj(b.x1, b.y0, b.z0), proj(b.x1, b.y0, b.z1), proj(b.x1, b.y1, b.z1), proj(b.x1, b.y1, b.z0)];
        const stroke = "rgba(36,42,40,0.18)";
        const sw = Math.max(w, h, d) * 0.006;
        return (
          <g key={i} opacity={op}>
            <polygon points={poly(front)} fill={shade(base, 0.86)} stroke={stroke} strokeWidth={sw} />
            <polygon points={poly(right)} fill={shade(base, 0.72)} stroke={stroke} strokeWidth={sw} />
            <polygon points={poly(top)} fill={b.p.glow ? "#FFF3D6" : shade(base, 1.04)} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      })}
    </svg>
  );
});
