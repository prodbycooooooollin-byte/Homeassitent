"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Hover-Karte mit Portal (wird nicht von overflow-Containern abgeschnitten), Hover-Intent-Verzögerung,
 * automatischem Umklappen am Bildschirmrand, Tastatur-Fokus und Klick-Toggle für Touch.
 */
export function HoverCard({ content, children, width = 340, side = "bottom", disabled, className = "" }: {
  content: React.ReactNode; children: React.ReactNode; width?: number; side?: "bottom" | "top"; disabled?: boolean; className?: string;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; flip: boolean } | null>(null);

  const show = useCallback((delay = 140) => { if (disabled) return; clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); }, [disabled]);
  const hide = useCallback((delay = 120) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), delay); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const h = card.current?.offsetHeight ?? 200;
    const w = Math.min(width, window.innerWidth - 16);
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const below = r.bottom + 8 + h <= window.innerHeight - 8;
    const flip = side === "top" ? r.top - h - 8 >= 8 : !below && r.top - h - 8 >= 8;
    setPos({ left, top: flip ? r.top - h - 8 : r.bottom + 8, flip });
  }, [open, width, side, content]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  return (
    <>
      <span ref={trigger} className={`inline-flex ${className}`} onMouseEnter={() => show()} onMouseLeave={() => hide()} onFocus={() => show(0)} onBlur={() => hide(0)}
        onClick={() => setOpen((o) => !o)}>
        {children}
      </span>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={card} role="tooltip" onMouseEnter={() => { clearTimeout(timer.current); }} onMouseLeave={() => hide()}
          className="surface hover-card fixed z-[80] max-h-[80vh] overflow-y-auto p-3.5 shadow-2xl"
          style={{ width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 16 : width), left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden", transformOrigin: pos?.flip ? "bottom center" : "top center" }}>
          {content}
        </div>, document.body)}
    </>
  );
}
