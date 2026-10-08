"use client";
import { useState } from "react";
import type { ItemAsset } from "@/lib/assets";
import { Icon } from "../Icon";

const SLOT = { weapon: "#f0a04c", vitality: "#3ecf8e", spirit: "#a77be8" } as Record<string, string>;
const ROMAN = ["", "I", "II", "III", "IV"];

export function ItemIcon({ id, item, size = 40, sold }: { id: number; item?: ItemAsset; size?: number; sold?: boolean }) {
  const [bad, setBad] = useState(false);
  const color = SLOT[item?.slot ?? ""] ?? "#8b94a8";
  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg" title={item ? `${item.name}${item.cost ? ` · ${item.cost} Souls` : ""}` : `Item #${id}`}
      style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${color}aa`, background: `linear-gradient(145deg, ${color}44, #0c0f16)`, opacity: sold ? 0.45 : 1 }}>
      {item?.image && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} loading="lazy" onError={() => setBad(true)} className="h-full w-full object-contain p-0.5" />
      ) : (
        <span className="display absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/70">{item ? item.name.slice(0, 2).toUpperCase() : "?"}</span>
      )}
      {item && <span className="display absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold" style={{ color }}>{ROMAN[item.tier] ?? item.tier}</span>}
      {sold && <span className="absolute inset-0 flex items-center justify-center text-loss"><Icon name="x" size={size * 0.6} /></span>}
    </div>
  );
}
