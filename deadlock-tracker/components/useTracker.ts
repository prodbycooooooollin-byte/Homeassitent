"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TrackedPlayerDto {
  accountId: number;
  name: string;
  avatar?: string;
  lastSyncAt?: number;
  lastSyncOk?: boolean;
  lastError?: string;
}

/** Gespeicherter „Ich"-Account (localStorage ist optional – nie darauf verlassen). */
export function useStoredPrimary(): [number | null, (id: number | null) => void] {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("dl.primary") ?? localStorage.getItem("dl.account"));
      if (v) setId(v);
    } catch {}
  }, []);
  const set = useCallback((v: number | null) => {
    setId(v);
    try {
      v ? localStorage.setItem("dl.primary", String(v)) : localStorage.removeItem("dl.primary");
      localStorage.removeItem("dl.account");
    } catch {}
  }, []);
  return [id, set];
}

/** Ruft fn sofort und dann im Intervall auf; pausiert, wenn der Tab verborgen ist. */
export function useInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    const onVis = () => document.visibilityState === "visible" && ref.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms]);
}
