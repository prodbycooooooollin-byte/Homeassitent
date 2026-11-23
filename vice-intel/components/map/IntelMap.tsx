"use client";
import { Thumb } from "@/components/ui/Thumb";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Crosshair, Egg, Lock, MapPin, Maximize2, Minimize2, Minus, Plus, RotateCcw, Search, Wallet, X } from "lucide-react";
import type { EntityKind } from "@/lib/content/schema";
import type { MapPin as Pin } from "@/lib/map/points";
import { HAS_MAP_IMAGE, MapBase, mapDisclaimer } from "./MapBase";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KIND_META } from "@/lib/ui-meta";
import { cn } from "@/lib/cn";

const KIND_STYLE: Record<EntityKind, { color: string; icon: typeof MapPin }> = {
  location: { color: "#38bdf8", icon: MapPin },
  "easter-egg": { color: "#c084fc", icon: Egg },
  mission: { color: "#fb7185", icon: Crosshair },
  unlock: { color: "#fbbf24", icon: Lock },
  money: { color: "#4ade80", icon: Wallet },
  character: { color: "#94a3b8", icon: MapPin },
};

/** View = map-space centre + zoom factor (1 = whole map). */
type View = { x: number; y: number; s: number };
const HOME: View = { x: 500, y: 520, s: 1 };
const MIN_S = 1;
const MAX_S = 8;

const clampView = (v: View): View => {
  const s = Math.max(MIN_S, Math.min(MAX_S, v.s));
  const half = 500 / s;
  // keep the map on screen, with a little slack at full zoom-out
  const lo = Math.min(half, 500) - 120;
  const hi = 1000 - lo;
  return { s, x: Math.max(lo, Math.min(hi, v.x)), y: Math.max(lo, Math.min(hi, v.y)) };
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Cluster = { key: string; x: number; y: number; pins: Pin[] };

/** Screen-space clustering: pins closer than ~34px at the current zoom merge into a count bubble. */
function cluster(pins: Pin[], s: number, pxPerUnit: number): Cluster[] {
  const radius = 34 / (pxPerUnit * s);
  const out: Cluster[] = [];
  for (const p of pins) {
    if (p.kind === "location") continue; // region markers never cluster
    const c = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < radius);
    if (c) {
      c.pins.push(p);
      c.x = c.pins.reduce((a, q) => a + q.x, 0) / c.pins.length;
      c.y = c.pins.reduce((a, q) => a + q.y, 0) / c.pins.length;
    } else out.push({ key: p.id, x: p.x, y: p.y, pins: [p] });
  }
  return out;
}

export function IntelMap({
  pins,
  initialFocus,
  kinds,
  height = "h-[calc(100svh-330px)] lg:h-[70vh]",
  calibrate = false,
}: {
  pins: Pin[];
  initialFocus?: string;
  kinds?: EntityKind[];
  height?: string;
  calibrate?: boolean;
}) {
  const available = useMemo(() => kinds ?? (Array.from(new Set(pins.map((p) => p.kind))) as EntityKind[]), [pins, kinds]);
  const [enabled, setEnabled] = useState<Set<EntityKind>>(new Set(available));
  const [q, setQ] = useState("");
  const focusPin = pins.find((p) => p.id === initialFocus);
  const [selected, setSelected] = useState<Pin | null>(focusPin ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(focusPin ? clampView({ x: focusPin.x, y: focusPin.y, s: 3 }) : HOME);
  const [full, setFull] = useState(false);
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const [pxPerUnit, setPxPerUnit] = useState(0.6);

  const viewRef = useRef(view);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const anim = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startView: View; startDist?: number; startMid?: { x: number; y: number }; last?: { x: number; y: number; t: number }; vel: { x: number; y: number }; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const lastMoved = useRef(false);

  const setView = useCallback((v: View) => {
    const c = clampView(v);
    viewRef.current = c;
    setViewState(c);
  }, []);

  const stopAnim = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  const flyTo = useCallback(
    (target: View, ms = 650) => {
      stopAnim();
      const from = viewRef.current;
      const to = clampView(target);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return setView(to);
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = easeInOut(t);
        // zoom interpolated geometrically for a natural feel
        const s = from.s * Math.pow(to.s / from.s, e);
        setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s });
        if (t < 1) anim.current = requestAnimationFrame(step);
        else anim.current = null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [setView],
  );

  /** Convert a client (screen) point to map coordinates. */
  const toMap = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: viewRef.current.x, y: viewRef.current.y };
  }, []);

  /** Zoom by factor keeping the map point under (clientX, clientY) fixed. */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number, animate = false) => {
      const v = viewRef.current;
      const s = Math.max(MIN_S, Math.min(MAX_S, v.s * factor));
      if (clientX === undefined || clientY === undefined) {
        return animate ? flyTo({ ...v, s }, 260) : setView({ ...v, s });
      }
      const p = toMap(clientX, clientY);
      const k = v.s / s;
      const next = { s, x: p.x + (v.x - p.x) * k, y: p.y + (v.y - p.y) * k };
      return animate ? flyTo(next, 280) : setView(next);
    },
    [flyTo, setView, toMap],
  );

  // Track rendered scale for clustering and to size pins.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPxPerUnit(Math.min(r.width, r.height) / 1000);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  // Wheel / trackpad zoom towards the cursor.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
      zoomAt(factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, full]);

  // Keep the URL shareable (?focus=…) without a navigation.
  useEffect(() => {
    if (calibrate) return;
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("focus", selected.id);
    else url.searchParams.delete("focus");
    window.history.replaceState(null, "", url);
  }, [selected, calibrate]);

  // Fullscreen: Escape leaves it, page scroll locks while open.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return pins.filter((p) => enabled.has(p.kind) && (!t || `${p.title} ${p.summary} ${p.region ?? ""}`.toLowerCase().includes(t)));
  }, [pins, enabled, q]);

  const clusters = useMemo(() => cluster(visible, view.s, pxPerUnit), [visible, view.s, pxPerUnit]);
  const regions = visible.filter((p) => p.kind === "location");

  const select = (p: Pin) => {
    setSelected(p);
    flyTo({ x: p.x, y: p.y, s: Math.max(viewRef.current.s, p.kind === "location" ? 2.2 : 3.2) });
  };

  const size = 1000 / view.s;
  const vb = `${view.x - size / 2} ${view.y - size / 2} ${size} ${size}`;
  const unit = 1 / view.s; // 1 screen-ish unit at current zoom (map units)
  const pinR = 13 * unit * (0.6 / Math.max(0.3, pxPerUnit));

  /* ------------------------------ gestures ------------------------------ */

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    stopAnim();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { startView: viewRef.current, startDist: Math.hypot(a.x - b.x, a.y - b.y), startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vel: { x: 0, y: 0 }, moved: true };
    } else {
      gesture.current = { startView: viewRef.current, last: { x: e.clientX, y: e.clientY, t: performance.now() }, vel: { x: 0, y: 0 }, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    const r = svgRef.current!.getBoundingClientRect();
    const unitsPerPx = 1000 / g.startView.s / Math.min(r.width, r.height);

    if (pts.length >= 2 && g.startDist && g.startMid) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.max(MIN_S, Math.min(MAX_S, g.startView.s * (dist / g.startDist)));
      // anchor: map point under the starting midpoint stays under the fingers
      const anchorX = g.startView.x + (g.startMid.x - (r.left + r.width / 2)) * unitsPerPx;
      const anchorY = g.startView.y + (g.startMid.y - (r.top + r.height / 2)) * unitsPerPx;
      const unitsPerPxNow = 1000 / s / Math.min(r.width, r.height);
      setView({ s, x: anchorX - (mid.x - (r.left + r.width / 2)) * unitsPerPxNow, y: anchorY - (mid.y - (r.top + r.height / 2)) * unitsPerPxNow });
      return;
    }
    const start = g.last!;
    const v = viewRef.current;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      g.moved = true;
      // capture only once a drag starts, so taps still reach the pins
      svgRef.current?.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    const dt = Math.max(1, now - start.t);
    const upp = 1000 / v.s / Math.min(r.width, r.height);
    g.vel = { x: (-dx * upp) / dt, y: (-dy * upp) / dt };
    g.last = { x: e.clientX, y: e.clientY, t: now };
    setView({ ...v, x: v.x - dx * upp, y: v.y - dy * upp });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    lastMoved.current = Boolean(g?.moved);
    if (pointers.current.size === 1) {
      // continue panning with the remaining finger
      const [p] = [...pointers.current.values()];
      gesture.current = { startView: viewRef.current, last: { x: p.x, y: p.y, t: performance.now() }, vel: { x: 0, y: 0 }, moved: true };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    // inertia
    if (g?.moved && (Math.abs(g.vel.x) + Math.abs(g.vel.y)) > 0.02 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let vx = g.vel.x * 16;
      let vy = g.vel.y * 16;
      const step = () => {
        vx *= 0.92;
        vy *= 0.92;
        const v = viewRef.current;
        setView({ ...v, x: v.x + vx, y: v.y + vy });
        if (Math.abs(vx) + Math.abs(vy) > 0.05) anim.current = requestAnimationFrame(step);
        else anim.current = null;
      };
      anim.current = requestAnimationFrame(step);
      return;
    }
    // double tap / double click zooms in at that point
    if (!g?.moved) {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        zoomAt(2, e.clientX, e.clientY, true);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const v = viewRef.current;
    const stepU = 120 / v.s;
    const map: Record<string, () => void> = {
      "+": () => zoomAt(1.5, undefined, undefined, true),
      "=": () => zoomAt(1.5, undefined, undefined, true),
      "-": () => zoomAt(1 / 1.5, undefined, undefined, true),
      ArrowLeft: () => flyTo({ ...v, x: v.x - stepU }, 200),
      ArrowRight: () => flyTo({ ...v, x: v.x + stepU }, 200),
      ArrowUp: () => flyTo({ ...v, y: v.y - stepU }, 200),
      ArrowDown: () => flyTo({ ...v, y: v.y + stepU }, 200),
      "0": () => flyTo(HOME),
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  };

  /* -------------------------------- render ------------------------------- */

  const ctrlBtn = "grid h-10 w-10 place-items-center text-fg/90 transition hover:bg-white/10 active:bg-white/15";

  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]", full && "lg:grid-cols-1")}>
      {/* Sidebar */}
      <div className={cn("order-2 space-y-3 lg:order-1", full && "hidden")}>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-ink-900/70 px-3 focus-within:border-violet-500/50">
          <Search className="h-4 w-4 text-fg-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the map…" aria-label="Search the map" className="h-full flex-1 bg-transparent text-[15px] placeholder:text-fg-faint focus:outline-none" />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Clear">
              <X className="h-4 w-4 text-fg-faint" />
            </button>
          ) : null}
        </label>
        <LayerToggles available={available} enabled={enabled} setEnabled={setEnabled} counts={pins} />
        <ul className="surface max-h-[46vh] divide-y divide-white/[0.05] overflow-y-auto lg:max-h-[calc(70vh-110px)]">
          {visible.map((p) => {
            const Icon = KIND_STYLE[p.kind].icon;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => select(p)}
                  onMouseEnter={() => setHover(p.id)}
                  onMouseLeave={() => setHover(null)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.04]", selected?.id === p.id && "bg-violet-500/10")}
                >
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
      <div
        ref={wrapRef}
        className={cn(
          "relative order-1 overflow-hidden border border-white/[0.08] bg-[#0a1424] lg:order-2",
          full ? "fixed inset-0 z-[60] rounded-none border-0" : cn("min-h-[380px] rounded-2xl", height),
        )}
      >
        <svg
          ref={svgRef}
          viewBox={vb}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full cursor-grab touch-none select-none outline-none active:cursor-grabbing"
          role="application"
          tabIndex={0}
          aria-label="Map of Leonida. Drag to pan, scroll or pinch to zoom, double-tap to zoom in. Arrow keys pan, plus and minus zoom."
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => {
            if (!calibrate || lastMoved.current) return;
            const p = toMap(e.clientX, e.clientY);
            setProbe({ x: Math.round(p.x), y: Math.round(p.y) });
          }}
        >
          <defs>
            <radialGradient id="im-glow">
              <stop offset="0" stopColor="#a855f7" stopOpacity=".6" />
              <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
            </radialGradient>
            <filter id="im-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy={1.5 * unit} stdDeviation={2 * unit} floodColor="#000" floodOpacity=".6" />
            </filter>
          </defs>
          <MapBase zoom={view.s} id="im" />

          {/* Region labels (built-in map only; a real map has its own) */}
          {!HAS_MAP_IMAGE &&
            regions.map((p) => (
              <text
                key={`l-${p.id}`}
                x={p.x}
                y={p.y - 26 * unit}
                textAnchor="middle"
                fill="#e2e8f0"
                fillOpacity=".6"
                fontSize={15 * unit * (0.6 / Math.max(0.3, pxPerUnit))}
                fontWeight={700}
                letterSpacing={2 * unit}
                className="pointer-events-none uppercase"
              >
                {p.title.replace(" National Park", "")}
              </text>
            ))}

          {/* Region markers */}
          {regions.map((p) => {
            const on = selected?.id === p.id;
            return (
              <g key={p.id} role="button" tabIndex={0} aria-label={`${p.title} (region)`} className="cursor-pointer" onClick={(e) => (e.stopPropagation(), select(p))} onKeyDown={(e) => e.key === "Enter" && select(p)}>
                <circle cx={p.x} cy={p.y} r={pinR * (on ? 1.5 : 1.15)} fill="#0a1424" stroke={KIND_STYLE.location.color} strokeWidth={pinR * 0.32} filter="url(#im-shadow)" />
                <circle cx={p.x} cy={p.y} r={pinR * 0.42} fill={KIND_STYLE.location.color} />
              </g>
            );
          })}

          {/* Pins & clusters */}
          {clusters.map((c) => {
            if (c.pins.length > 1) {
              const r = pinR * (1.35 + Math.min(0.8, c.pins.length * 0.08));
              return (
                <g
                  key={c.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.pins.length} places — zoom in`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    flyTo({ x: c.x, y: c.y, s: viewRef.current.s * 2.2 });
                  }}
                >
                  <circle cx={c.x} cy={c.y} r={r * 1.6} fill="#a855f7" fillOpacity=".14" />
                  <circle cx={c.x} cy={c.y} r={r} fill="#1b1230" stroke="#c084fc" strokeWidth={pinR * 0.25} filter="url(#im-shadow)" />
                  <text x={c.x} y={c.y} dy=".35em" textAnchor="middle" fill="#f5f3ff" fontSize={r * 0.95} fontWeight={700} className="pointer-events-none">
                    {c.pins.length}
                  </text>
                </g>
              );
            }
            const p = c.pins[0];
            const st = KIND_STYLE[p.kind];
            const on = selected?.id === p.id;
            const hot = hover === p.id;
            const showLabel = on || hot || view.s >= 4.5;
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`${p.title} (${KIND_META[p.kind].label})`}
                className="cursor-pointer outline-none"
                onClick={(e) => (e.stopPropagation(), select(p))}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(p)}
              >
                <circle cx={p.x} cy={p.y - pinR} r={pinR * 2.2} fill="transparent" />
                {on ? <circle cx={p.x} cy={p.y} r={pinR * 4.5} fill="url(#im-glow)" /> : null}
                {p.precision === "region" ? <circle cx={p.x} cy={p.y} r={pinR * 3} fill={st.color} fillOpacity=".07" stroke={st.color} strokeOpacity=".35" strokeDasharray={`${3 * unit} ${3 * unit}`} /> : null}
                {/* teardrop pin */}
                <g transform={`translate(${p.x} ${p.y}) scale(${(on || hot ? 1.3 : 1) * pinR / 10})`} filter="url(#im-shadow)">
                  <path d="M0 0 C -2 -6 -9 -9 -9 -16 A 9 9 0 1 1 9 -16 C 9 -9 2 -6 0 0 Z" fill={st.color} stroke="#0b0911" strokeWidth="1.6" />
                  <circle cx="0" cy="-16" r="3.4" fill="#0b0911" />
                </g>
                {showLabel ? (
                  <text x={p.x} y={p.y + pinR * 1.9} textAnchor="middle" fontSize={11 * unit * (0.6 / Math.max(0.3, pxPerUnit))} fontWeight={600} fill="#fff" stroke="#07060b" strokeWidth={3 * unit} paintOrder="stroke" className="pointer-events-none">
                    {p.title}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Floating layer toggles in fullscreen */}
        {full ? (
          <div className="absolute left-3 right-16 top-[max(12px,env(safe-area-inset-top))] flex flex-wrap gap-2">
            <LayerToggles available={available} enabled={enabled} setEnabled={setEnabled} counts={pins} glass />
          </div>
        ) : null}

        {/* Controls */}
        <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex flex-col gap-2">
          <div className="glass flex flex-col overflow-hidden rounded-xl">
            <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.6, undefined, undefined, true)} className={ctrlBtn}><Plus className="h-4 w-4" /></button>
            <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.6, undefined, undefined, true)} className={cn(ctrlBtn, "border-t border-white/10")}><Minus className="h-4 w-4" /></button>
          </div>
          <div className="glass flex flex-col overflow-hidden rounded-xl">
            <button type="button" aria-label="Reset view" onClick={() => (setSelected(null), flyTo(HOME))} className={ctrlBtn}><RotateCcw className="h-4 w-4" /></button>
            <button type="button" aria-label={full ? "Exit full screen" : "Full screen"} onClick={() => setFull((f) => !f)} className={cn(ctrlBtn, "border-t border-white/10")}>
              {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Zoom indicator + disclaimer */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
          <span className="rounded-md bg-ink-950/70 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted backdrop-blur">{view.s.toFixed(1)}×</span>
          {!selected ? <span className="hidden rounded-md bg-ink-950/60 px-2 py-0.5 text-[10px] text-fg-faint backdrop-blur sm:inline">{mapDisclaimer()}</span> : null}
        </div>

        {calibrate ? (
          <div className="absolute bottom-10 left-3 rounded-xl border border-violet-400/40 bg-ink-950/85 px-3 py-2 font-mono text-xs backdrop-blur">
            {probe ? <>mapPoint: {"{"} x: {probe.x}, y: {probe.y} {"}"}</> : "Calibration: click the map to read coordinates"}
          </div>
        ) : null}

        {/* Preview card */}
        {selected ? (
          <div className="absolute inset-x-3 bottom-3 animate-fade-up sm:left-auto sm:w-[360px]">
            <div className="glass overflow-hidden rounded-2xl shadow-card">
              <div className="flex gap-3 p-3">
                <Thumb src={selected.src} art={selected.art} className="h-20 w-24 shrink-0 rounded-xl" contain={selected.kind === "unlock"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-semibold leading-tight">{selected.title}</p>
                    <button type="button" aria-label="Close preview" onClick={() => setSelected(null)} className="-mr-1 -mt-1 rounded-lg p-1 text-fg-faint hover:bg-white/10 hover:text-fg">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={selected.status} size="sm" short />
                    <span className="text-[11px] text-fg-faint">
                      {KIND_META[selected.kind].label}
                      {selected.precision !== "exact" ? ` · ${selected.precision} location` : ""}
                    </span>
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

function LayerToggles({
  available,
  enabled,
  setEnabled,
  counts,
  glass,
}: {
  available: EntityKind[];
  enabled: Set<EntityKind>;
  setEnabled: (fn: (s: Set<EntityKind>) => Set<EntityKind>) => void;
  counts: Pin[];
  glass?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
      {available.map((k) => {
        const on = enabled.has(k);
        const st = KIND_STYLE[k];
        const n = counts.filter((p) => p.kind === k).length;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() =>
              setEnabled((s) => {
                const next = new Set(s);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                return next;
              })
            }
            className={cn("chip py-1 text-[13px]", glass && "glass", on && "border-white/20 bg-white/[0.08] text-fg")}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? st.color : "transparent", border: `2px solid ${st.color}` }} />
            {KIND_META[k].plural}
            <span className="text-fg-faint">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
