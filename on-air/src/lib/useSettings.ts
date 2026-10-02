import { useCallback, useEffect, useRef, useState } from "react";
import { toastError } from "../components/ui";
import { api } from "./api";
import { setSnapshot } from "./store";
import type { AppSnapshot, Settings } from "./types";

/**
 * Lokaler Entwurf der Einstellungen mit verzögertem Speichern. Änderungen
 * erscheinen sofort in der UI (und über den Overlay-Server in der Vorschau).
 */
export function useSettingsDraft(snap: AppSnapshot, delayMs = 400) {
  const [draft, setDraft] = useState<Settings>(snap.settings);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);

  useEffect(() => {
    if (!dirty.current) {
      setDraft(snap.settings);
      latest.current = snap.settings;
    }
  }, [snap.settings]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    try {
      const saved = await api.updateSettings(latest.current);
      dirty.current = false;
      setSnapshot({ ...snap, settings: saved });
    } catch (e) {
      dirty.current = false;
      toastError(e);
    }
  }, [snap]);

  const update = useCallback(
    (fn: (s: Settings) => Settings) => {
      setDraft((prev) => {
        const next = fn(structuredClone(prev));
        latest.current = next;
        return next;
      });
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => () => void flush(), [flush]);
  return { draft, update, flush };
}

/** Kleine Hilfe: `<b>…</b>` in übersetzten Anleitungen sicher rendern. */
export function richParts(text: string): { bold: boolean; text: string }[] {
  const out: { bold: boolean; text: string }[] = [];
  const re = /<b>(.*?)<\/b>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ bold: false, text: text.slice(last, m.index) });
    out.push({ bold: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ bold: false, text: text.slice(last) });
  return out;
}
