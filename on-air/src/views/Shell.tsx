import { Clock, Coins, History, Layers, ListMusic, Music2, Pause, PictureInPicture2, Play, Radio, Search, Settings, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../components/Avatar";
import { WindowControls } from "../components/WindowControls";
import { CommandPalette, useCommandPaletteHotkey } from "../components/CommandPalette";
import { DiagnosticsDialog } from "../components/Dialogs";
import { startSpotifyLogin, startTwitchLogin } from "../components/Login";
import { BrandMark, Dialog, Toggle, toastError } from "../components/ui";
import { effective, rewardSyncText } from "../lib/acceptance";
import { api } from "../lib/api";
import { clockTime, relative } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { spotifyStatus, twitchStatus, type StatusDesc } from "../lib/status";
import { refresh, useNow } from "../lib/store";
import { useUpdateInfo } from "../lib/updates";
import type { AppSnapshot } from "../lib/types";

export type Route = "overview" | "queue" | "widgets" | "settings";

/** Kompakter Schalter (Kompaktmodus): manuelle Pause. */
export function RequestSwitch({ open, effectiveOpen, compact }: { open: boolean; effectiveOpen?: boolean; compact?: boolean }) {
  // Manuell offen, aber durch Plan/Quelle/Technik gesperrt → als „gesperrt“ anzeigen, Schalter bleibt die manuelle Pause.
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

type ConnRow = { key: string; label: string; st: StatusDesc; action?: ReactNode };

function ConnectionSummary({ snap, onDiag, go }: { snap: AppSnapshot; onDiag: (k: "spotify" | "twitch" | "overlay" | "all") => void; go: (r: Route) => void }) {
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
  const rows: ConnRow[] = [
    {
      key: "spotify",
      label: t("sp.label"),
      st: sp,
      action:
        sp.action === "connect" || sp.action === "reconnect" ? (
          <button className="btn btn-sm btn-primary" onClick={() => (snap.settings.spotify.client_id ? void startSpotifyLogin() : go("settings"))}>{sp.action === "reconnect" ? t("sp.reconnect") : t("sp.connect")}</button>
        ) : sp.tone !== "ok" ? (
          <button className="btn btn-sm" onClick={() => onDiag("spotify")}>{t("nav.diagnostics")}</button>
        ) : undefined,
    },
    {
      key: "twitch",
      label: t("tw.label"),
      st: tw,
      action:
        tw.action === "connect" || tw.action === "reconnect" ? (
          <button className="btn btn-sm" onClick={() => (snap.settings.twitch.client_id ? void startTwitchLogin() : go("settings"))}>{t("tw.connect")}</button>
        ) : tw.tone === "warn" || tw.tone === "error" ? (
          <button className="btn btn-sm" onClick={() => onDiag("twitch")}>{t("nav.diagnostics")}</button>
        ) : undefined,
    },
    {
      key: "overlay",
      label: t("conn.overlay"),
      st: snap.overlay.running ? { tone: "ok", short: t("ov.clients", { n: snap.overlay.clients }) } : { tone: "error", short: t("ov.stopped"), code: "overlay_port" },
      action: !snap.overlay.running ? <button className="btn btn-sm" onClick={() => go("widgets")}>{t("nav.widgets")}</button> : undefined,
    },
  ];
  if (snap.settings.channel_points.enabled || snap.channel_points.reward_id) {
    const sync = rewardSyncText(snap);
    const err = snap.channel_points.last_error;
    rows.push({
      key: "cp",
      label: t("conn.channel_points"),
      st: err && !snap.channel_points.reward_id ? { tone: "error", short: err.code } : sync?.pending ? { tone: "warn", short: sync.text } : { tone: "ok", short: sync?.text ?? t("cp.not_created") },
      action: <button className="btn btn-sm" onClick={() => go("settings")}>{t("nav.settings")}</button>,
    });
  }
  // Spotify ist Pflicht: „nicht verbunden“ zählt als Hinweis. Optionale Dienste (Twitch) ohne
  // Anmeldung machen die Zusammenfassung nur „teilweise“, nie „alles verbunden“.
  const issues = rows.filter((r) => r.st.tone === "warn" || r.st.tone === "error" || (r.key === "spotify" && r.st.tone === "neutral")).length;
  const partial = rows.some((r) => r.st.tone === "neutral" || r.st.tone === "busy");
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="conn-sum" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="conn-dots" aria-hidden="true">{rows.map((r) => <span key={r.key} className={`sdot ${r.st.tone}`} />)}</span>
        <span>{issues === 0 ? (partial ? t("conn.partial") : t("conn.all_ok")) : issues === 1 ? t("conn.issues_one") : t("conn.issues", { n: issues })}</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label={t("conn.title")} style={{ right: 0, top: 44 }}>
          {rows.map((r) => (
            <div className="conn-row" key={r.key}>
              <span className={`sdot ${r.st.tone}`} aria-hidden="true" />
              <div className="col" style={{ gap: 0 }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span className="small muted ellipsis" title={r.st.short}>{r.st.short}</span>
              </div>
              {r.action}
            </div>
          ))}
          <div style={{ padding: "8px 10px 4px" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); onDiag("all"); }}><Stethoscope size={14} /> {t("nav.diagnostics")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpotifyGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".9" />
      <g fill="none" stroke="var(--bg)" strokeLinecap="round"><path d="M7 9.3c3.4-1 7.2-.7 10 1" strokeWidth="1.8" /><path d="M7.6 12.5c2.8-.8 5.7-.5 8 .9" strokeWidth="1.5" /><path d="M8.2 15.4c2.2-.6 4.3-.4 6 .7" strokeWidth="1.3" /></g>
    </svg>
  );
}

function TwitchGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 3h16v11l-4 4h-4l-3 3v-3H4z" /><path d="M11 7.5v4M15.5 7.5v4" strokeLinecap="round" />
    </svg>
  );
}

/** Statusleiste unten: Requests, Kanalpunkte, Streamende und Verbindungen auf einen Blick. */
function StatusBar({ snap, go, onDiag }: { snap: AppSnapshot; go: (r: Route) => void; onDiag: (k: "spotify" | "twitch" | "all") => void }) {
  const now = useNow(5000);
  const e = effective(snap);
  const manualOpen = snap.settings.requests.open;
  const [busy, setBusy] = useState(false);
  const cp = snap.settings.channel_points;
  const twitchIn = snap.twitch.auth.state === "signed_in";
  const plan = snap.plan;
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
  const reward = rewardSyncText(snap);
  return (
    <footer className="statusbar" aria-label={t("sb.label")}>
      <div className="sb-group" role="status" aria-live="polite" title={`${e.label}${e.why ? ` – ${e.why}` : ""}`}>
        <span className={`sb-dot ${e.tone}`} aria-hidden="true" />
        <span className="sb-strong">{e.label}</span>
        {e.why && <span className="sb-why ellipsis">{e.why}</span>}
        <button className="sb-btn sb-req" aria-pressed={manualOpen} title={t("req.toggle_hint")} disabled={busy} onClick={() => void run(() => api.setRequestsOpen(!manualOpen))}>
          <span className="sb-btn-ic" aria-hidden="true">{manualOpen ? <Pause size={13} /> : <Play size={13} />}</span>
          {manualOpen ? t("acc.pause_btn") : t("acc.resume_btn")}
        </button>
      </div>
      <span className="sb-sep" aria-hidden="true" />
      <div className="sb-group" title={reward?.text}>
        <span className="sb-label">{t("sb.points")}</span>
        <Toggle
          checked={cp.enabled}
          disabled={busy || (!twitchIn && !cp.enabled)}
          ariaLabel={t("sb.points")}
          onChange={(v) => void run(() => api.updateSettings({ ...snap.settings, channel_points: { ...cp, enabled: v } }))}
        />
        <span className="sb-cost num"><Coins size={16} aria-hidden="true" /> {cp.cost.toLocaleString(getLang() === "en" ? "en" : "de")}</span>
        {reward?.pending && <span className="sb-dot auto" title={reward.text} aria-label={reward.text} />}
      </div>
      <div className="grow" />
      <div className="sb-group">
        <Clock size={17} aria-hidden="true" className="subtle" />
        {plan.active && plan.end_at_ms ? (
          <>
            <span className="sb-label">{t("sb.stream_end")}</span>
            <span className="sb-strong num">{clockTime(plan.end_at_ms, getLang())}</span>
            <button className="sb-btn" disabled={busy} onClick={() => void run(() => api.planExtend(15))}>+15 Min</button>
          </>
        ) : (
          <button className="sb-btn" onClick={() => go("settings")} title={t("plan.intro")}>{t("sb.plan")}</button>
        )}
      </div>
      <span className="sb-sep" aria-hidden="true" />
      <span className="sb-clock num" aria-hidden="true">{clockTime(now, getLang())}</span>
      <div className="sb-group" style={{ gap: 6 }}>
        <button className={`sb-svc tone-${sp.tone}`} title={`${t("sp.label")}: ${sp.short}`} aria-label={`${t("sp.label")}: ${sp.short}`} onClick={() => onDiag("spotify")}><SpotifyGlyph /></button>
        <button className={`sb-svc tone-${tw.tone}`} title={`${t("tw.label")}: ${tw.short}`} aria-label={`${t("tw.label")}: ${tw.short}`} onClick={() => onDiag("twitch")}><TwitchGlyph /></button>
      </div>
    </footer>
  );
}

export type NavRoute = Route | "history";

/** Laufzeit kompakt: „2:13 h“, „47 Min“. */
function upFor(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m} Min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/** „Signal“-Karte: Zustand aller Verbindungen und was der Verbindungswächter repariert hat. */
function HealthCard({ snap, onDiag }: { snap: AppSnapshot; onDiag: () => void }) {
  const now = useNow(15_000);
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const rel = snap.reliability;
  const ov = snap.overlay.running ? "ok" : "error";
  const svc = [
    { k: "sp", label: t("sp.label"), tone: sp.tone },
    { k: "tw", label: t("tw.label"), tone: tw.tone },
    { k: "ov", label: t("health.overlay"), tone: ov },
  ];
  const width = (tone: string) => (tone === "ok" ? "100%" : tone === "busy" || tone === "warn" ? "60%" : tone === "error" ? "30%" : "12%");
  const anyBad = svc.some((x) => x.tone === "error" || x.tone === "warn");
  const big = rel?.healthy_since_ms
    ? t("health.stable_since", { time: upFor(now - rel.healthy_since_ms) })
    : sp.tone === "neutral" && tw.tone === "neutral" ? t("health.offline") : t("health.checking");
  const heals = rel?.heals ?? 0;
  const sub = heals === 0 ? t("health.heals_none") : heals === 1 ? t("health.heals_one") : t("health.heals", { n: heals });
  const last = rel?.last_heal_ms && rel.last_heal_service
    ? t("health.last_heal", { what: rel.last_heal_service === "spotify" ? "Spotify" : "Twitch", time: relative(rel.last_heal_ms, now, getLang()) })
    : null;
  return (
    <>
      <button type="button" className="health" onClick={onDiag} title={last ?? sub}>
        <div className="health-head">
          <span className="eyebrow">{t("health.title")}</span>
          <span className={`sdot ${anyBad ? "warn" : rel?.healthy_since_ms ? "ok" : "neutral"}`} aria-hidden="true" />
        </div>
        <div>
          <div className="health-big">{big}</div>
          <div className="health-sub">{sub}</div>
        </div>
        <div className="health-rows">
          {svc.map((x) => (
            <div className="health-svc" key={x.k}>
              <span>{x.label}</span>
              <div className={`meter ${x.tone}`}><i style={{ width: width(x.tone) }} /></div>
            </div>
          ))}
        </div>
      </button>
      <button type="button" className="side-mini-health" onClick={onDiag} aria-label={t("health.title")} title={big}>
        {svc.map((x) => <span key={x.k} className={`sdot ${x.tone}`} />)}
      </button>
    </>
  );
}

export function Shell({ snap, route, go, children }: { snap: AppSnapshot; route: NavRoute; go: (r: NavRoute) => void; children: ReactNode }) {
  const [diag, setDiag] = useState<null | "all" | "spotify" | "twitch" | "overlay">(null);
  const [palette, setPalette] = useState(false);
  const openPalette = useCallback(() => setPalette(true), []);
  const contentRef = useRef<HTMLElement>(null);
  // Jede Seite beginnt oben (der Inhaltsbereich wird zwischen den Seiten geteilt).
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [route]);
  useCommandPaletteHotkey(openPalette);
  const upd = useUpdateInfo();
  const updateReady = upd && (upd.state.state === "available" || upd.state.state === "ready");
  const pendingReview =
    snap.queue.filter((r) => r.status === "pending_review" || r.status === "uncertain").length + snap.channel_points.needs_review;
  const nav: { id: NavRoute; label: string; icon: ReactNode; badge?: number; dot?: boolean }[] = [
    { id: "overview", label: t("nav.live"), icon: <Radio size={19} /> },
    { id: "queue", label: t("nav.queue"), icon: <ListMusic size={19} />, badge: pendingReview || undefined },
    { id: "history", label: t("nav.history"), icon: <History size={19} /> },
    { id: "widgets", label: t("nav.overlays"), icon: <Layers size={19} /> },
    { id: "settings", label: t("nav.settings"), icon: <Settings size={19} />, dot: !!updateReady },
  ];
  const current = nav.find((n) => n.id === route) ?? nav[0];
  const profile = snap.spotify_profile?.display_name ?? snap.spotify_profile?.id ?? null;
  const live = effective(snap).tone === "open";
  return (
    <div className="app">
      <aside className="side" aria-label="Navigation">
        <button className="brand" onClick={() => go("overview")} aria-label="ON AIR">
          <BrandMark size={34} />
          <span>
            <b className="row" style={{ gap: 9 }}>ON AIR<span className={`lamp ${live ? "on" : ""}`} aria-hidden="true" /></b>
            <small>{t("brand.tag")}</small>
          </span>
        </button>
        <nav className="navtabs">
          <span className="nav-label">{t("nav.section")}</span>
          {nav.map((n) => (
            <button key={n.id} className="navtab" aria-current={route === n.id ? "page" : undefined} onClick={() => go(n.id)} title={n.label}>
              {n.icon}
              <span>{n.label}</span>
              {n.badge ? <span className="navtab-badge">{n.badge}</span> : null}
              {n.dot ? <span className="gear-dot" style={{ position: "static", marginLeft: "auto" }} aria-hidden="true" title={t("up.badge")} /> : null}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <HealthCard snap={snap} onDiag={() => setDiag("all")} />
          <div className="side-actions">
            <button className="btn btn-sm" onClick={() => api.openCompact().catch(toastError)} title={t("nav.compact")}><PictureInPicture2 size={15} /> <span>{t("nav.compact")}</span></button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topnav" data-tauri-drag-region>
          <div className="page-kicker" data-tauri-drag-region>
            <small data-tauri-drag-region>{t("nav.kicker")}</small>
            {/* Unterseiten haben eine eigene große Überschrift – hier nicht doppelt. */}
            {route === "overview" && <b data-tauri-drag-region>{current.label}</b>}
          </div>
          <div className="topnav-right" data-tauri-drag-region>
            <button className="search-btn" onClick={openPalette} aria-label={t("cmd.open")} title={t("cmd.open")}>
              <Search size={16} />
              <span>{t("cmd.search")}</span>
              <span className="kbd">{getLang() === "en" ? "Ctrl K" : "Strg K"}</span>
            </button>
            <ConnectionSummary snap={snap} onDiag={setDiag} go={go} />
            <button className="avatar-btn" onClick={() => go("settings")} title={profile ? t("s.signed_in_as", { name: profile }) : t("sp.connect")} aria-label={t("nav.account")}>
              {profile ? <Avatar name={profile} size={34} /> : <span className="avatar ghost" style={{ width: 34, height: 34 }}><Music2 size={16} /></span>}
            </button>
            <WindowControls />
          </div>
        </header>
        <main className="content" id="main" ref={contentRef}>{children}</main>
        <StatusBar snap={snap} go={go} onDiag={(k) => setDiag(k)} />
      </div>
      {diag && <DiagnosticsDialog target={diag} onClose={() => setDiag(null)} />}
      {palette && <CommandPalette snap={snap} onClose={() => setPalette(false)} go={(r) => go(r as NavRoute)} onDiag={() => setDiag("all")} />}
    </div>
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
