import { LayoutDashboard, ListMusic, PanelsTopLeft, PictureInPicture2, Settings2, Stethoscope } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DiagnosticsDialog } from "../components/Dialogs";
import { startSpotifyLogin, startTwitchLogin } from "../components/Login";
import { BrandMark, Dialog, toastError } from "../components/ui";
import { effective, rewardSyncText } from "../lib/acceptance";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
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

function RequestState({ snap }: { snap: AppSnapshot }) {
  const e = effective(snap);
  const manualOpen = snap.settings.requests.open;
  const [busy, setBusy] = useState(false);
  return (
    <div className={`req-state ${e.tone}`} role="status" aria-live="polite" title={`${e.label}${e.why ? ` – ${e.why}` : ""}`}>
      <span className="dot" aria-hidden="true" />
      <span className="label">{e.label}</span>
      {e.why && <span className="why ellipsis" style={{ maxWidth: 260 }}>{e.why}</span>}
      <button
        className="req-switch"
        aria-pressed={manualOpen}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.setRequestsOpen(!manualOpen);
            await refresh();
          } catch (err) {
            toastError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        {manualOpen ? t("acc.pause_btn") : t("acc.resume_btn")}
      </button>
    </div>
  );
}

type ConnRow = { key: string; label: string; st: StatusDesc; action?: ReactNode };

function ConnectionSummary({ snap, onDiag, go }: { snap: AppSnapshot; onDiag: (k: "spotify" | "twitch" | "overlay" | "all") => void; go: (r: Route) => void }) {
  const now = useNow();
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
  const issues = rows.filter((r) => r.st.tone === "warn" || r.st.tone === "error").length;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="conn-sum" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="conn-dots" aria-hidden="true">{rows.map((r) => <span key={r.key} className={`sdot ${r.st.tone}`} />)}</span>
        <span>{issues === 0 ? t("conn.all_ok") : issues === 1 ? t("conn.issues_one") : t("conn.issues", { n: issues })}</span>
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

const TITLES: Record<Route, () => string> = {
  overview: () => t("ov.title"),
  queue: () => t("q.title"),
  widgets: () => t("w.title"),
  settings: () => t("s.title"),
};

export function Shell({ snap, route, go, children }: { snap: AppSnapshot; route: Route; go: (r: Route) => void; children: ReactNode }) {
  const [diag, setDiag] = useState<null | "all" | "spotify" | "twitch" | "overlay">(null);
  const upd = useUpdateInfo();
  const updateReady = upd && (upd.state.state === "available" || upd.state.state === "ready");
  const pendingReview =
    snap.queue.filter((r) => r.status === "pending_review" || r.status === "uncertain").length + snap.channel_points.needs_review;
  const nav: { id: Route; icon: ReactNode; label: string; badge?: number | string }[] = [
    { id: "overview", icon: <LayoutDashboard size={18} />, label: t("nav.overview") },
    { id: "queue", icon: <ListMusic size={18} />, label: t("nav.queue"), badge: pendingReview || undefined },
    { id: "widgets", icon: <PanelsTopLeft size={18} />, label: t("nav.widgets") },
    { id: "settings", icon: <Settings2 size={18} />, label: t("nav.settings"), badge: updateReady ? t("up.badge") : undefined },
  ];
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navigation">
        <div className="brand">
          <BrandMark />
          <div><b>ON AIR</b><small>{t("shell.tagline")}</small></div>
        </div>
        {nav.map((n) => (
          <button key={n.id} className="nav-item" aria-current={route === n.id ? "page" : undefined} onClick={() => go(n.id)} title={n.label}>
            {n.icon}
            <span className="label">{n.label}</span>
            {n.badge ? <span className={`badge ${typeof n.badge === "string" ? "accent" : "warn"}`}>{n.badge}</span> : null}
          </button>
        ))}
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setDiag("all")} title={t("nav.diagnostics")}>
            <Stethoscope size={18} /> <span className="label">{t("nav.diagnostics")}</span>
          </button>
          <button className="nav-item" onClick={() => api.openCompact().catch(toastError)} title={t("nav.compact")}>
            <PictureInPicture2 size={18} /> <span className="label">{t("nav.compact")}</span>
          </button>
          <div className="version-line">{updateReady && <span className="dot-accent" aria-hidden="true" />}<span>v{snap.app_version}</span></div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{TITLES[route]()}</span>
          <div className="grow" />
          <ConnectionSummary snap={snap} onDiag={setDiag} go={go} />
          <RequestState snap={snap} />
        </header>
        <main className="content" id="main">{children}</main>
      </div>
      {diag && <DiagnosticsDialog target={diag} onClose={() => setDiag(null)} />}
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
