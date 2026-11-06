import {
  Bell, Coins, History, Layers, ListMusic, Music2, Pause, PictureInPicture2, Play, Plus, Radio, Search, Settings, SkipForward, Stethoscope, Timer, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityLog } from "../components/Activity";
import { Avatar } from "../components/Avatar";
import { CommandPalette, useCommandPaletteHotkey } from "../components/CommandPalette";
import { DiagnosticsDialog, SearchDialog } from "../components/Dialogs";
import { startSpotifyLogin, startTwitchLogin } from "../components/Login";
import { WindowControls } from "../components/WindowControls";
import { BrandMark, Dialog, toastError } from "../components/ui";
import { effective } from "../lib/acceptance";
import { api } from "../lib/api";
import { clockTime, relative } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable, spotifyStatus, twitchStatus, type StatusDesc } from "../lib/status";
import { refresh, useNow } from "../lib/store";
import { useUpdateInfo } from "../lib/updates";
import type { AppSnapshot } from "../lib/types";

export type Route = "overview" | "queue" | "widgets" | "settings";
export type NavRoute = Route | "history";

/** Kompakter Schalter (Kompaktmodus): manuelle Pause. */
export function RequestSwitch({ open, effectiveOpen, compact }: { open: boolean; effectiveOpen?: boolean; compact?: boolean }) {
  const blocked = open && effectiveOpen === false;
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`req-switch ${blocked ? "blocked" : ""}`}
      aria-pressed={open}
      title={t("req.toggle_hint")}
      disabled={busy}
      style={compact ? { height: 28 } : undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await api.setRequestsOpen(!open);
          await refresh();
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="dot" aria-hidden="true" />
      {blocked ? t("acc.auto") : open ? t("req.open") : t("req.closed")}
    </button>
  );
}

/** Aktuelles Cover (für Kino-Hintergrund und Kompaktmodus). */
export function currentCover(snap: AppSnapshot): string | null {
  const pb = snap.spotify.playback;
  return pb.state === "active" ? (pb.track?.image_url ?? pb.episode?.image_url ?? null) : null;
}

/** Cover unscharf über das ganze Fenster; überblendet beim Titelwechsel. */
export function Backdrop({ url }: { url: string | null }) {
  const [layers, setLayers] = useState<{ a: string | null; b: string | null; front: "a" | "b" }>({ a: url, b: null, front: "a" });
  useEffect(() => {
    setLayers((l) => {
      const cur = l.front === "a" ? l.a : l.b;
      if (cur === url) return l;
      return l.front === "a" ? { a: l.a, b: url, front: "b" } : { a: url, b: l.b, front: "a" };
    });
  }, [url]);
  const img = (u: string | null, on: boolean) => <div className={`backdrop-img ${on && u ? "on" : ""}`} style={u ? { backgroundImage: `url("${u}")` } : undefined} />;
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-aura" />
      {img(layers.a, layers.front === "a")}
      {img(layers.b, layers.front === "b")}
      <div className="backdrop-veil" />
      <div className="backdrop-grain" />
    </div>
  );
}

type ConnRow = { key: string; label: string; st: StatusDesc; action?: ReactNode };

/** Verbindungs-Chip in der Kopfzeile mit Popover (Zustand + nächste Handlung je Dienst). */
function ConnectionChip({ snap, onDiag, go }: { snap: AppSnapshot; onDiag: (k: "spotify" | "twitch" | "overlay" | "all") => void; go: (r: NavRoute) => void }) {
  const now = useNow(5000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const rel = snap.reliability;
  const rows: ConnRow[] = [
    {
      key: "spotify", label: t("sp.label"), st: sp,
      action: sp.action === "connect" || sp.action === "reconnect"
        ? <button className="btn btn-sm btn-primary" onClick={() => (snap.settings.spotify.client_id ? void startSpotifyLogin() : go("settings"))}>{sp.action === "reconnect" ? t("sp.reconnect") : t("sp.connect")}</button>
        : sp.tone !== "ok" ? <button className="btn btn-sm" onClick={() => onDiag("spotify")}>{t("nav.diagnostics")}</button> : undefined,
    },
    {
      key: "twitch", label: t("tw.label"), st: tw,
      action: tw.action === "connect" || tw.action === "reconnect"
        ? <button className="btn btn-sm" onClick={() => (snap.settings.twitch.client_id ? void startTwitchLogin() : go("settings"))}>{t("tw.connect")}</button>
        : tw.tone === "warn" || tw.tone === "error" ? <button className="btn btn-sm" onClick={() => onDiag("twitch")}>{t("nav.diagnostics")}</button> : undefined,
    },
    {
      key: "overlay", label: t("conn.overlay"),
      st: snap.overlay.running ? { tone: "ok", short: t("ov.clients", { n: snap.overlay.clients }) } : { tone: "error", short: t("ov.stopped"), code: "overlay_port" },
      action: !snap.overlay.running ? <button className="btn btn-sm" onClick={() => go("widgets")}>{t("nav.overlays")}</button> : undefined,
    },
  ];
  const issues = rows.filter((r) => r.st.tone === "warn" || r.st.tone === "error" || (r.key === "spotify" && r.st.tone === "neutral")).length;
  const partial = rows.some((r) => r.st.tone === "neutral" || r.st.tone === "busy");
  const label = issues === 0 ? (partial ? t("conn.partial") : t("conn.all_ok")) : issues === 1 ? t("conn.issues_one") : t("conn.issues", { n: issues });
  const stable = rel?.healthy_since_ms ? t("health.stable_since", { time: upFor(now - rel.healthy_since_ms) }) : null;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="conn-chip" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={label}>
        <span className="row" style={{ gap: 4 }} aria-hidden="true">{rows.map((r) => <span key={r.key} className={`sdot ${r.st.tone}`} />)}</span>
        <span className="lbl">{label}</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label={t("conn.title")} style={{ right: 0, top: 54 }}>
          {rows.map((r) => (
            <div className="conn-row" key={r.key}>
              <span className={`sdot ${r.st.tone}`} aria-hidden="true" />
              <div className="col" style={{ gap: 0 }}>
                <span style={{ fontWeight: 700 }}>{r.label}</span>
                <span className="small muted ellipsis" title={r.st.short}>{r.st.short}</span>
              </div>
              {r.action}
            </div>
          ))}
          <div className="row between" style={{ padding: "10px 12px 4px", borderTop: "1px solid var(--border)" }}>
            <span className="small subtle">
              {stable ?? t("health.checking")} · {(rel?.heals ?? 0) === 0 ? t("health.heals_none") : (rel?.heals ?? 0) === 1 ? t("health.heals_one") : t("health.heals", { n: rel?.heals ?? 0 })}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); onDiag("all"); }}><Stethoscope size={14} /> {t("nav.diagnostics")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Laufzeit kompakt: „2:13 h“, „47 Min“. */
export function upFor(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m} Min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

function SpotifyGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".9" />
      <g fill="none" stroke="var(--surface)" strokeLinecap="round"><path d="M7 9.3c3.4-1 7.2-.7 10 1" strokeWidth="1.8" /><path d="M7.6 12.5c2.8-.8 5.7-.5 8 .9" strokeWidth="1.5" /><path d="M8.2 15.4c2.2-.6 4.3-.4 6 .7" strokeWidth="1.3" /></g>
    </svg>
  );
}

function TwitchGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 3h16v11l-4 4h-4l-3 3v-3H4z" /><path d="M11 7.5v4M15.5 7.5v4" strokeLinecap="round" />
    </svg>
  );
}

/** App-Symbol im Dock (wie auf einem Startbildschirm). */
function AppIcon({ label, children, onClick, tone, disabled, badge, pressed }: { label: string; children: ReactNode; onClick: () => void; tone?: "on" | "live" | "warn"; disabled?: boolean; badge?: number; pressed?: boolean }) {
  return (
    <button type="button" className={`app-ico ${tone ?? ""}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed}>
      {children}
      {badge ? <span className="badge-n">{badge}</span> : null}
      <span className="tip" aria-hidden="true">{label}</span>
    </button>
  );
}

/** Dock: Uhr, Schnellaktionen als App-Symbole, Request-Zustand und Dienste. */
function Dock({ snap, go, onDiag, onAdd }: { snap: AppSnapshot; go: (r: NavRoute) => void; onDiag: (k: "spotify" | "twitch" | "all") => void; onAdd: () => void }) {
  const now = useNow(5000);
  const [busy, setBusy] = useState(false);
  const e = effective(snap);
  const manualOpen = snap.settings.requests.open;
  const cp = snap.settings.channel_points;
  const twitchIn = snap.twitch.auth.state === "signed_in";
  const plan = snap.plan;
  const usable = isSpotifyUsable(snap);
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const date = new Date(now).toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return (
    <footer className="dock statusbar" aria-label={t("sb.label")}>
      <div className="dock-clock" aria-hidden="true">
        <b>{clockTime(now, getLang())}</b>
        <span>{date}</span>
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <div className="dock-apps">
        <button
          type="button"
          className={`app-ico sb-req ${manualOpen ? (e.tone === "open" ? "live" : "warn") : ""}`}
          aria-pressed={manualOpen}
          aria-label={manualOpen ? t("acc.pause_btn") : t("acc.resume_btn")}
          title={t("req.toggle_hint")}
          disabled={busy}
          onClick={() => void run(() => api.setRequestsOpen(!manualOpen))}
        >
          {manualOpen ? <Pause size={21} /> : <Play size={21} />}
          <span className="tip" aria-hidden="true">{manualOpen ? t("acc.pause_btn") : t("acc.resume_btn")}</span>
        </button>
        <AppIcon label={t("np.next")} disabled={!usable} onClick={() => void run(() => api.transport("next"))}><SkipForward size={21} /></AppIcon>
        <AppIcon label={t("q.add")} onClick={onAdd}><Plus size={22} /></AppIcon>
        <AppIcon
          label={`${t("sb.points")} · ${cp.cost.toLocaleString(getLang() === "en" ? "en" : "de")}`}
          tone={cp.enabled ? "on" : undefined}
          pressed={cp.enabled}
          disabled={busy || (!twitchIn && !cp.enabled)}
          onClick={() => void run(() => api.updateSettings({ ...snap.settings, channel_points: { ...cp, enabled: !cp.enabled } }))}
        >
          <Coins size={21} />
        </AppIcon>
        <AppIcon
          label={plan.active && plan.end_at_ms ? `${t("sb.stream_end")} ${clockTime(plan.end_at_ms, getLang())} · +15 Min` : t("sb.plan")}
          tone={plan.active ? "on" : undefined}
          disabled={busy}
          onClick={() => (plan.active ? void run(() => api.planExtend(15)) : go("settings"))}
        >
          <Timer size={21} />
        </AppIcon>
        <AppIcon label={t("nav.compact")} onClick={() => api.openCompact().catch(toastError)}><PictureInPicture2 size={20} /></AppIcon>
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <div className="dock-status" role="status" aria-live="polite">
        <div className="ds-main" title={`${e.label}${e.why ? ` – ${e.why}` : ""}`}>
          <b><span className={`lamp ${e.tone === "open" ? "on" : ""}`} aria-hidden="true" style={e.tone === "auto" ? { background: "var(--warn)" } : undefined} />{e.label}</b>
          <span>{e.why || (plan.active && plan.end_at_ms ? `${t("sb.stream_end")} ${clockTime(plan.end_at_ms, getLang())}` : " ")}</span>
        </div>
        <button className={`svc tone-${sp.tone}`} title={`${t("sp.label")}: ${sp.short}`} aria-label={`${t("sp.label")}: ${sp.short}`} onClick={() => onDiag("spotify")}><SpotifyGlyph /></button>
        <button className={`svc tone-${tw.tone}`} title={`${t("tw.label")}: ${tw.short}`} aria-label={`${t("tw.label")}: ${tw.short}`} onClick={() => onDiag("twitch")}><TwitchGlyph /></button>
      </div>
    </footer>
  );
}

/** Aktivität als Schublade von rechts (statt Dauerplatz auf der Live-Seite). */
function ActivityDrawer({ snap, onClose }: { snap: AppSnapshot; onClose: () => void }) {
  const now = useNow(15_000);
  const rel = snap.reliability;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-h">
        <div className="drawer-head">
          <h2 id="drawer-h">{t("act.title")}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}><X size={18} /></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-section">
            <div className="kpis">
              <div className="kpi"><div className="v">{rel?.healthy_since_ms ? upFor(now - rel.healthy_since_ms) : "–"}</div><div className="l">{t("health.title")}</div></div>
              <div className="kpi"><div className="v">{rel?.heals ?? 0}</div><div className="l">{t("drawer.heals")}</div></div>
            </div>
            {rel?.last_heal_ms && rel.last_heal_service && (
              <span className="small subtle">{t("health.last_heal", { what: rel.last_heal_service === "spotify" ? "Spotify" : "Twitch", time: relative(rel.last_heal_ms, now, getLang()) })}</span>
            )}
          </div>
          <ActivityLog items={snap.activity} limit={40} />
        </div>
      </aside>
    </>
  );
}

export function Shell({ snap, route, go, children }: { snap: AppSnapshot; route: NavRoute; go: (r: NavRoute) => void; children: ReactNode }) {
  const [diag, setDiag] = useState<null | "all" | "spotify" | "twitch" | "overlay">(null);
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const openPalette = useCallback(() => setPalette(true), []);
  useCommandPaletteHotkey(openPalette);
  const stageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [route]);
  const upd = useUpdateInfo();
  const updateReady = !!upd && (upd.state.state === "available" || upd.state.state === "ready");
  const pendingReview = snap.queue.filter((r) => r.status === "pending_review" || r.status === "uncertain").length + snap.channel_points.needs_review;
  const warnings = snap.activity.filter((a) => (a.level === "warn" || a.level === "error") && snap.server_time_ms - a.ts < 15 * 60_000).length;
  const nav: { id: NavRoute; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "overview", label: t("nav.studio"), icon: <Radio size={17} /> },
    { id: "queue", label: t("nav.queue"), icon: <ListMusic size={17} />, badge: pendingReview || undefined },
    { id: "history", label: t("nav.history"), icon: <History size={17} /> },
    { id: "widgets", label: t("nav.overlays"), icon: <Layers size={17} /> },
  ];
  const profile = snap.spotify_profile?.display_name ?? snap.spotify_profile?.id ?? null;
  const live = effective(snap).tone === "open";
  const usable = isSpotifyUsable(snap);
  return (
    <>
      <Backdrop url={currentCover(snap)} />
      <div className="os">
        <header className="topbar topnav" data-tauri-drag-region>
          <button className="brand" onClick={() => go("overview")} aria-label="ON AIR">
            <BrandMark size={40} />
            <span className="brand-word">
              <b>ON AIR <span className={`lamp ${live ? "on" : ""}`} aria-hidden="true" /></b>
              <small>{t("brand.tag")}</small>
            </span>
          </button>
          <nav className="navpill" aria-label="Navigation">
            {nav.map((n) => (
              <button key={n.id} aria-current={route === n.id ? "page" : undefined} onClick={() => go(n.id)} title={n.label}>
                {n.icon}
                <span className="lbl">{n.label}</span>
                {n.badge ? <span className="np-badge">{n.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="tools" data-tauri-drag-region>
            <button className="search-pill" onClick={openPalette} aria-label={t("cmd.open")} title={t("cmd.open")}>
              <Search size={16} />
              <span>{t("cmd.search")}</span>
              <span className="kbd">{getLang() === "en" ? "Ctrl K" : "Strg K"}</span>
            </button>
            <ConnectionChip snap={snap} onDiag={setDiag} go={go} />
            <button className="tool" onClick={() => setDrawer(true)} aria-label={t("act.title")} title={t("act.title")}>
              <Bell size={18} />
              {warnings > 0 && <span className="dot" aria-hidden="true" />}
            </button>
            <button className="tool" aria-current={route === "settings" ? "page" : undefined} onClick={() => go("settings")} aria-label={t("nav.settings")} title={t("nav.settings")}>
              <Settings size={18} />
              {updateReady && <span className="dot accent" aria-hidden="true" />}
            </button>
            <button className="avatar-btn" onClick={() => go("settings")} title={profile ? t("s.signed_in_as", { name: profile }) : t("sp.connect")} aria-label={t("nav.account")}>
              {profile ? <Avatar name={profile} size={44} /> : <span className="avatar ghost" style={{ width: 44, height: 44 }}><Music2 size={17} /></span>}
            </button>
            <WindowControls />
          </div>
        </header>
        <main className="stagearea content" id="main" ref={stageRef}>{children}</main>
        <Dock snap={snap} go={go} onDiag={(k) => setDiag(k)} onAdd={() => setAdding(true)} />
      </div>
      {drawer && <ActivityDrawer snap={snap} onClose={() => setDrawer(false)} />}
      {diag && <DiagnosticsDialog target={diag} onClose={() => setDiag(null)} />}
      {palette && <CommandPalette snap={snap} onClose={() => setPalette(false)} go={(r) => go(r as NavRoute)} onDiag={() => setDiag("all")} />}
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={usable ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </>
  );
}

export function CloseDialog({ onClose }: { onClose: () => void }) {
  const [remember, setRemember] = useState(false);
  const act = (a: "tray" | "quit") => api.closeAction(a, remember).then(onClose, toastError);
  return (
    <Dialog
      title={t("close.title")}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={() => act("quit")}>{t("close.quit")}</button>
          <button className="btn btn-primary" onClick={() => act("tray")}>{t("close.tray")}</button>
        </>
      }
    >
      <p className="muted">{t("close.text")}</p>
      <label className="row" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>{t("close.remember")}</span>
      </label>
    </Dialog>
  );
}

