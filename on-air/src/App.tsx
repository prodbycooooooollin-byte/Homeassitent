import { useEffect, useState } from "react";
import { TwitchCodeDialog, startSpotifyLogin } from "./components/Login";
import { EmptyState, ToastHost } from "./components/ui";
import { api, isPreviewBackend } from "./lib/api";
import { setLang, t } from "./lib/i18n";
import { refresh, useSnapshot } from "./lib/store";
import type { AppSnapshot } from "./lib/types";
import { CompactView } from "./views/Compact";
import { Onboarding } from "./views/Onboarding";
import { Overview } from "./views/Overview";
import { QueueView } from "./views/Queue";
import { SettingsView } from "./views/Settings";
import { CloseDialog, Shell, type Route } from "./views/Shell";
import { WidgetsView } from "./views/Widgets";

const ROUTES: Route[] = ["overview", "queue", "widgets", "settings"];

function readRoute(): Route | "compact" | "history" {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "compact") return "compact";
  if (h === "history") return "history";
  return (ROUTES as string[]).includes(h) ? (h as Route) : "overview";
}

function useTheme(snap: AppSnapshot | null) {
  useEffect(() => {
    if (!snap) return;
    const s = snap.settings;
    setLang(s.language);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const theme = s.theme === "system" ? (mq.matches ? "light" : "dark") : s.theme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.motion = s.reduced_motion ? "reduced" : "full";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [snap?.settings.theme, snap?.settings.reduced_motion, snap?.settings.language, snap]);
}

export function App() {
  const { snap, error } = useSnapshot();
  const [route, setRoute] = useState(readRoute);
  const [closeAsk, setCloseAsk] = useState(false);
  const [preview, setPreview] = useState(false);
  const [onbDismissed, setOnbDismissed] = useState(false);
  useTheme(snap);
  if (snap) setLang(snap.settings.language);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    void isPreviewBackend().then(setPreview);
    let un: (() => void) | undefined;
    void api.onCloseRequested(() => setCloseAsk(true)).then((u) => (un = u));
    const vis = () => void api.setUiVisible(document.visibilityState === "visible").catch(() => undefined);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("visibilitychange", vis);
      un?.();
    };
  }, []);

  const go = (r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
  };

  if (!snap) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center" }}>
        {error ? (
          <EmptyState title={t("common.load_failed")} action={<button className="btn" onClick={() => void refresh()}>{t("common.retry")}</button>}>
            <span className="mono">{error}</span>
          </EmptyState>
        ) : (
          <div className="skeleton" style={{ width: 220, height: 12 }} aria-label={t("common.loading")} />
        )}
      </div>
    );
  }

  const banner = preview ? <div className="preview-banner" role="note">{t("common.preview_banner")}</div> : null;

  if (route === "compact") {
    return (
      <>
        {banner}
        <CompactView snap={snap} />
        <ToastHost />
      </>
    );
  }

  const connectSpotify = () => (snap.settings.spotify.client_id ? void startSpotifyLogin() : go("settings"));
  return (
    <>
      {banner}
      <Shell snap={snap} route={route === "history" ? "queue" : route} go={go}>
        {route === "overview" && <Overview snap={snap} go={(r) => go(r as Route)} onConnectSpotify={connectSpotify} />}
        {(route === "queue" || route === "history") && <QueueView snap={snap} initialTab={route === "history" ? "history" : "queue"} />}
        {route === "widgets" && <WidgetsView snap={snap} />}
        {route === "settings" && <SettingsView snap={snap} />}
      </Shell>
      {!snap.settings.onboarding_done && !onbDismissed && <Onboarding snap={snap} onDone={() => setOnbDismissed(true)} />}
      <TwitchCodeDialog snap={snap} />
      {closeAsk && <CloseDialog onClose={() => setCloseAsk(false)} />}
      <ToastHost />
    </>
  );
}
