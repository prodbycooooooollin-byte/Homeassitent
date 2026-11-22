"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Crosshair, Egg, Lock, MapPin, Minus, Plus, RotateCcw, Search, Wallet, X } from "lucide-react";
import type { EntityKind } from "@/lib/content/schema";
import type { MapPin as Pin } from "@/lib/map/points";
import { HAS_MAP_IMAGE, MapBase, mapDisclaimer } from "./MapBase";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { artUrl, KIND_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

const KIND_STYLE: Record<EntityKind, { color: string; icon: typeof MapPin }> = {
  location: { color: "#38bdf8", icon: MapPin },
  "easter-egg": { color: "#c084fc", icon: Egg },
  mission: { color: "#fb7185", icon: Crosshair },
  unlock: { color: "#fbbf24", icon: Lock },
  money: { color: "#4ade80", icon: Wallet },
  character: { color: "#94a3b8", icon: MapPin },
};

type View = { x: number; y: number; s: number }; // centre + zoom

export function IntelMap({ pins, initialFocus, kinds, height = "h-[70vh]", calibrate = false }: { pins: Pin[]; initialFocus?: string; kinds?: EntityKind[]; height?: string; calibrate?: boolean }) {
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const available = useMemo(() => (kinds ?? (Array.from(new Set(pins.map((p) => p.kind))) as EntityKind[])), [pins, kinds]);
  const [enabled, setEnabled] = useState<Set<EntityKind>>(new Set(available));
  const [q, setQ] = useState("");
  const focusPin = pins.find((p) => p.id === initialFocus);
  const [selected, setSelected] = useState<Pin | null>(focusPin ?? null);
  const [view, setView] = useState<View>(focusPin ? { x: focusPin.x, y: focusPin.y, s: 2.4 } : { x: 500, y: 520, s: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ d: number; s: number } | null>(null);
  const lastMoved = useRef(false);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return pins.filter((p) => enabled.has(p.kind) && (!t || `${p.title} ${p.summary} ${p.region ?? ""}`.toLowerCase().includes(t)));
  }, [pins, enabled, q]);

  const size = 1000 / view.s;
  const vb = { x: view.x - size / 2, y: view.y - size / 2, w: size, h: size };

  const clamp = (v: View): View => ({ s: Math.max(1, Math.min(6, v.s)), x: Math.max(0, Math.min(1000, v.x)), y: Math.max(0, Math.min(1000, v.y)) });
  const zoom = useCallback((f: number) => setView((v) => clamp({ ...v, s: v.s * f })), []);

  const toUnits = (dxPx: number, dyPx: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const scale = size / Math.min(r.width, r.height);
    return { dx: dxPx * scale, dy: dyPx * scale };
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const select = (p: Pin) => {
    setSelected(p);
    setView((v) => clamp({ x: p.x, y: p.y, s: Math.max(v.s, 2) }));
  };

  const pinR = 9 / Math.sqrt(view.s);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Sidebar: search + filters + list */}
      <div className="order-2 space-y-3 lg:order-1">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-ink-900/70 px-3 focus-within:border-violet-500/50">
          <Search className="h-4 w-4 text-fg-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the map…" aria-label="Search the map" className="h-full flex-1 bg-transparent text-[15px] placeholder:text-fg-faint focus:outline-none" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
          {available.map((k) => {
            const on = enabled.has(k);
            const st = KIND_STYLE[k];
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setEnabled((s) => {
                    const n = new Set(s);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })
                }
                className={cn("chip py-1 text-[13px]", on && "border-white/20 bg-white/[0.07] text-fg")}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? st.color : "transparent", border: `2px solid ${st.color}` }} />
                {KIND_META[k].plural}
              </button>
            );
          })}
        </div>
        <ul className="surface max-h-[46vh] divide-y divide-white/[0.05] overflow-y-auto lg:max-h-[calc(70vh-110px)]">
          {visible.map((p) => {
            const Icon = KIND_STYLE[p.kind].icon;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => select(p)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04]", selected?.id === p.id && "bg-violet-500/10")}>
                  <Icon className="h-4 w-4 shrink-0" style={{ color: KIND_STYLE[p.kind].color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.title}</span>
                    <span className="block truncate text-xs text-fg-faint">{p.region ?? KIND_META[p.kind].label}</span>
                  </span>
                  <StatusBadge status={p.status} size="sm" short />
                </button>
              </li>
            );
          })}
          {visible.length === 0 ? <li className="p-4 text-sm text-fg-muted">No pins match.</li> : null}
        </ul>
      </div>

      {/* Map */}
      <div className={cn("relative order-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1424] lg:order-2", height, "min-h-[380px]")}>
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full touch-none select-none"
          role="application"
          aria-label="Schematic map of Leonida. Use the list to select places."
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()];
              pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
            } else drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
          }}
          onPointerMove={(e) => {
            if (!pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2 && pinchStart.current) {
              const [a, b] = [...pointers.current.values()];
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              setView((v) => clamp({ ...v, s: pinchStart.current!.s * (d / pinchStart.current!.d) }));
              return;
            }
            const d = drag.current;
            if (!d) return;
            const { dx, dy } = toUnits(e.clientX - d.px, e.clientY - d.py);
            if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) d.moved = true;
            setView((v) => clamp({ ...v, x: d.vx - dx, y: d.vy - dy }));
          }}
          onClick={(e) => {
            if (!calibrate || lastMoved.current) return;
            const svg = svgRef.current!;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const m = svg.getScreenCTM();
            if (!m) return;
            const p = pt.matrixTransform(m.inverse());
            setProbe({ x: Math.round(p.x), y: Math.round(p.y) });
          }}
          onPointerUp={(e) => {
            lastMoved.current = Boolean(drag.current?.moved);
            pointers.current.delete(e.pointerId);
            if (pointers.current.size < 2) pinchStart.current = null;
            if (pointers.current.size === 0) drag.current = null;
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            drag.current = null;
          }}
        >
          <defs>
            <radialGradient id="im-glow">
              <stop offset="0" stopColor="#a855f7" stopOpacity=".6" />
              <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
            </radialGradient>
          </defs>
          <MapBase zoom={view.s} id="im" />

          {/* Region labels from official locations */}
          {!HAS_MAP_IMAGE && pins
            .filter((p) => p.kind === "location")
            .map((p) => (
              <text key={`l-${p.id}`} x={p.x} y={p.y - 24 / Math.sqrt(view.s)} textAnchor="middle" fill="#e2e8f0" fillOpacity=".55" fontSize={15 / Math.sqrt(view.s)} fontWeight={700} letterSpacing="2" className="pointer-events-none uppercase">
                {p.title.replace(" National Park", "")}
              </text>
            ))}

          {visible.map((p) => {
            const st = KIND_STYLE[p.kind];
            const on = selected?.id === p.id;
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`${p.title} (${KIND_META[p.kind].label})`}
                className="cursor-pointer outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  select(p);
                }}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(p)}
              >
                {on ? <circle cx={p.x} cy={p.y} r={pinR * 4} fill="url(#im-glow)" /> : null}
                {p.precision === "region" && p.kind !== "location" ? <circle cx={p.x} cy={p.y} r={pinR * 3} fill={st.color} fillOpacity=".08" stroke={st.color} strokeOpacity=".4" strokeDasharray="3 3" /> : null}
                <circle cx={p.x} cy={p.y} r={on ? pinR * 1.35 : pinR} fill={p.kind === "location" ? "#0a1424" : st.color} stroke={p.kind === "location" ? st.color : "#0b0911"} strokeWidth={pinR * 0.35} />
                {p.kind === "location" ? <circle cx={p.x} cy={p.y} r={pinR * 0.4} fill={st.color} /> : null}
              </g>
            );
          })}
        </svg>

        {calibrate ? (
          <div className="absolute bottom-3 left-3 rounded-xl border border-violet-400/40 bg-ink-950/85 px-3 py-2 font-mono text-xs backdrop-blur">
            {probe ? <>mapPoint: {"{"} x: {probe.x}, y: {probe.y} {"}"}</> : "Calibration: click the map to read coordinates"}
          </div>
        ) : null}

        {/* Controls */}
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-950/70 backdrop-blur">
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1.4)} className="p-2.5 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)} className="border-t border-white/10 p-2.5 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
          <button type="button" aria-label="Reset view" onClick={() => setView({ x: 500, y: 520, s: 1 })} className="border-t border-white/10 p-2.5 hover:bg-white/10"><RotateCcw className="h-4 w-4" /></button>
        </div>
        <p className="pointer-events-none absolute left-3 top-3 max-w-[60%] rounded-lg bg-ink-950/60 px-2 py-1 text-[10px] text-fg-faint backdrop-blur">{mapDisclaimer()}</p>

        {/* Preview card */}
        {selected ? (
          <div className="absolute inset-x-3 bottom-3 animate-fade-up sm:left-auto sm:w-[340px]">
            <div className="glass overflow-hidden rounded-2xl">
              <div className="flex gap-3 p-3">
                <span className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-700">
                  {selected.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artUrl(selected.art.scene, selected.art.seed)} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-semibold leading-tight">{selected.title}</p>
                    <button type="button" aria-label="Close preview" onClick={() => setSelected(null)} className="-mr-1 -mt-1 rounded-lg p-1 text-fg-faint hover:bg-white/10 hover:text-fg">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusBadge status={selected.status} size="sm" short />
                    <span className="text-[11px] text-fg-faint">{KIND_META[selected.kind].label}{selected.precision !== "exact" ? ` · ${selected.precision} location` : ""}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-fg-muted">{selected.summary}</p>
                </div>
              </div>
              <Link href={selected.href} className="flex items-center justify-center gap-1.5 border-t border-white/10 py-2.5 text-sm font-medium text-violet-300 hover:bg-violet-500/10">
                Open intel <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
