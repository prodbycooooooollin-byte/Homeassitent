import { History, LayoutDashboard, ListMusic, PanelsTopLeft, PictureInPicture2, Settings2, Stethoscope } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DiagnosticsDialog } from "../components/Dialogs";
import { startSpotifyLogin, startTwitchLogin } from "../components/Login";
import { BrandMark, Dialog, Pill, toastError } from "../components/ui";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { spotifyStatus, twitchStatus } from "../lib/status";
import { refresh, useNow } from "../lib/store";
import type { AppSnapshot } from "../lib/types";

export type Route = "overview" | "queue" | "widgets" | "history" | "settings";

export function RequestSwitch({ open, compact }: { open: boolean; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="req-switch"
      aria-pressed={open}
      title={t("req.toggle_hint")}
      disabled={busy}
      style={compact ? { height: 30, fontSize: 12.5 } : undefined}
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
      {open ? t("req.open") : t("req.closed")}
    </button>
  );
}

export function Shell({ snap, route, go, children }: { snap: AppSnapshot; route: Route; go: (r: Route) => void; children: ReactNode }) {
  const now = useNow();
  const [diag, setDiag] = useState<null | "all" | "spotify" | "twitch" | "overlay">(null);
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const pendingReview = snap.queue.filter((r) => r.status === "pending_review" || r.status === "uncertain").length;
  const nav: { id: Route; icon: ReactNode; label: string; badge?: number }[] = [
    { id: "overview", icon: <LayoutDashboard size={18} />, label: t("nav.overview") },
    { id: "queue", icon: <ListMusic size={18} />, label: t("nav.queue"), badge: pendingReview || undefined },
    { id: "widgets", icon: <PanelsTopLeft size={18} />, label: t("nav.widgets") },
    { id: "history", icon: <History size={18} />, label: t("nav.history") },
    { id: "settings", icon: <Settings2 size={18} />, label: t("nav.settings") },
  ];
  const onSpotifyPill = () => {
    if (sp.action === "connect" || sp.action === "reconnect") {
      if (snap.settings.spotify.client_id) void startSpotifyLogin();
      else go("settings");
    } else setDiag("spotify");
  };
  const onTwitchPill = () => {
    if (tw.action === "connect" || tw.action === "reconnect") {
      if (snap.settings.twitch.client_id) void startTwitchLogin();
      else go("settings");
    } else setDiag("twitch");
  };
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navigation">
        <div className="brand"><BrandMark /><span>ON AIR</span></div>
        {nav.map((n) => (
          <button key={n.id} className="nav-item" aria-current={route === n.id ? "page" : undefined} onClick={() => go(n.id)} title={n.label}>
            {n.icon}
            <span className="label">{n.label}</span>
            {n.badge ? <span className="badge warn">{n.badge}</span> : null}
          </button>
        ))}
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setDiag("all")} title={t("nav.diagnostics")}>
            <Stethoscope size={18} /> <span className="label">{t("nav.diagnostics")}</span>
          </button>
          <button className="nav-item" onClick={() => api.openCompact().catch(toastError)} title={t("nav.compact")}>
            <PictureInPicture2 size={18} /> <span className="label">{t("nav.compact")}</span>
          </button>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <Pill tone={sp.tone} label={t("sp.label")} text={sp.short} onClick={onSpotifyPill} />
          <Pill tone={tw.tone} label={t("tw.label")} text={tw.short} onClick={onTwitchPill} />
          <Pill
            tone={snap.overlay.running ? "ok" : "error"}
            label={t("ov.label")}
            text={snap.overlay.running ? t("ov.clients", { n: snap.overlay.clients }) : t("ov.stopped")}
            onClick={() => go("widgets")}
          />
          <div className="grow" />
          <RequestSwitch open={snap.settings.requests.open} />
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
