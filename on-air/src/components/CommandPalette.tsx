import {
  Coins, Contrast, History, Layers, ListMusic, Pause, PictureInPicture2, Play, Plus, Radio, Search, Settings, SkipForward, Stethoscope, Timer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import { refresh } from "../lib/store";
import type { AppSnapshot } from "../lib/types";
import { SearchDialog } from "./Dialogs";
import { toastError } from "./ui";

type Cmd = { id: string; group: "nav" | "live" | "app"; label: string; icon: ReactNode; hint?: string; disabled?: boolean; run: () => unknown };

/** Strg+K / ⌘K öffnet die Palette – von überall in der App. */
export function useCommandPaletteHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

function score(label: string, q: string): number {
  if (!q) return 1;
  const l = label.toLowerCase();
  const s = q.toLowerCase().trim();
  if (l.startsWith(s)) return 3;
  if (l.includes(s)) return 2;
  // Buchstaben in Reihenfolge („rp“ → „Requests pausieren“)
  let i = 0;
  for (const ch of l) if (ch === s[i]) i++;
  return i === s.length ? 1 : 0;
}

export function CommandPalette({ snap, onClose, go, onDiag }: { snap: AppSnapshot; onClose: () => void; go: (r: string) => void; onDiag: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);

  const usable = isSpotifyUsable(snap);
  const pb = snap.spotify.playback;
  const playing = pb.state === "active" && pb.is_playing;
  const open = snap.settings.requests.open;
  const cp = snap.settings.channel_points;
  const act = (f: () => Promise<unknown>) => async () => {
    try {
      await f();
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  const cmds: Cmd[] = useMemo(() => [
    { id: "go-live", group: "nav", label: t("nav.live"), icon: <Radio size={16} />, run: () => go("overview") },
    { id: "go-queue", group: "nav", label: t("nav.queue"), icon: <ListMusic size={16} />, run: () => go("queue") },
    { id: "go-history", group: "nav", label: t("nav.history"), icon: <History size={16} />, run: () => go("history") },
    { id: "go-widgets", group: "nav", label: t("nav.overlays"), icon: <Layers size={16} />, run: () => go("widgets") },
    { id: "go-settings", group: "nav", label: t("nav.settings"), icon: <Settings size={16} />, run: () => go("settings") },
    { id: "req", group: "live", label: open ? t("cmd.req_pause") : t("cmd.req_open"), icon: open ? <Pause size={16} /> : <Play size={16} />, run: act(() => api.setRequestsOpen(!open)) },
    { id: "add", group: "live", label: t("cmd.add"), icon: <Plus size={16} />, disabled: !usable, run: () => setAdding(true) },
    { id: "skip", group: "live", label: t("cmd.skip"), icon: <SkipForward size={16} />, disabled: !usable, run: act(() => api.transport("next")) },
    { id: "pp", group: "live", label: t("cmd.playpause"), icon: playing ? <Pause size={16} /> : <Play size={16} />, disabled: !usable || pb.state !== "active", run: act(() => api.transport(playing ? "pause" : "resume")) },
    { id: "plan", group: "live", label: t("cmd.plan15"), icon: <Timer size={16} />, disabled: !snap.plan.active, run: act(() => api.planExtend(15)) },
    {
      id: "points", group: "live", label: cp.enabled ? t("cmd.points_off") : t("cmd.points_on"), icon: <Coins size={16} />,
      disabled: snap.twitch.auth.state !== "signed_in" && !cp.enabled,
      run: act(() => api.updateSettings({ ...snap.settings, channel_points: { ...cp, enabled: !cp.enabled } })),
    },
    { id: "compact", group: "app", label: t("nav.compact"), icon: <PictureInPicture2 size={16} />, run: act(() => api.openCompact()) },
    { id: "diag", group: "app", label: t("nav.diagnostics"), icon: <Stethoscope size={16} />, run: onDiag },
    {
      id: "theme", group: "app", label: t("cmd.theme"), icon: <Contrast size={16} />,
      run: act(() => api.updateSettings({ ...snap.settings, theme: document.documentElement.dataset.theme === "light" ? "dark" : "light" })),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [snap, usable, open, playing]);

  const shown = cmds
    .map((c) => ({ c, s: score(c.label, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
  const cur = Math.min(sel, Math.max(0, shown.length - 1));
  const run = (c: Cmd | undefined) => {
    if (!c || c.disabled) return;
    if (c.id !== "add") onClose();
    void c.run();
  };
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cur]);

  if (adding) {
    return <SearchDialog onClose={onClose} disabledReason={usable ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />;
  }

  // Gruppen nur ohne Suchbegriff anzeigen (mit Suche zählt die Relevanz).
  const groups: Cmd["group"][] = q ? [] : ["nav", "live", "app"];
  const label = { nav: t("cmd.group.nav"), live: t("cmd.group.live"), app: t("cmd.group.app") };
  let idx = -1;
  const renderItem = (c: Cmd) => {
    idx++;
    const i = idx;
    return (
      <button
        key={c.id}
        data-i={i}
        role="option"
        aria-selected={i === cur}
        className="palette-item"
        disabled={c.disabled}
        onMouseMove={() => setSel(i)}
        onClick={() => run(c)}
      >
        <span className="pi-ic">{c.icon}</span>
        <span className="ellipsis">{c.label}</span>
        {c.hint && <span className="pi-hint">{c.hint}</span>}
      </button>
    );
  };
  const ordered = q ? shown : groups.flatMap((g) => shown.filter((c) => c.group === g));

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("cmd.search")}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={input}
            value={q}
            placeholder={t("cmd.placeholder")}
            aria-label={t("cmd.search")}
            role="combobox"
            aria-expanded="true"
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(ordered.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); run(ordered[cur]); }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list" role="listbox" ref={listRef}>
          {ordered.length === 0 && <div className="subtle" style={{ padding: "18px 14px" }}>{t("cmd.empty")}</div>}
          {q
            ? ordered.map(renderItem)
            : groups.map((g) => {
                const items = ordered.filter((c) => c.group === g);
                if (!items.length) return null;
                return (
                  <div key={g} role="group" aria-label={label[g]}>
                    <div className="palette-group">{label[g]}</div>
                    {items.map(renderItem)}
                  </div>
                );
              })}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> {t("cmd.hint_nav")}</span>
          <span><span className="kbd">↵</span> {t("cmd.hint_run")}</span>
          <span><span className="kbd">Esc</span> {t("cmd.hint_close")}</span>
        </div>
      </div>
    </div>
  );
}
