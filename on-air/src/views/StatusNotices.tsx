import { useState } from "react";
import { DevicesDialog } from "../components/NowPlaying";
import { DiagnosticsDialog } from "../components/Dialogs";
import { Notice } from "../components/ui";
import { t } from "../lib/i18n";
import { spotifyStatus, twitchStatus } from "../lib/status";
import { useNow } from "../lib/store";
import type { AppSnapshot } from "../lib/types";
import { api } from "../lib/api";

/** Zeigt nur bei echten Problemen einen Hinweis – mit konkreter nächster Handlung. */
export function StatusNotices({ snap, onConnectSpotify }: { snap: AppSnapshot; onConnectSpotify: () => void }) {
  const now = useNow();
  const [diag, setDiag] = useState<null | "spotify" | "twitch">(null);
  const [devices, setDevices] = useState(false);
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const notices = [];
  if (sp.tone === "warn" || sp.tone === "error") {
    notices.push(
      <Notice
        key="sp"
        tone={sp.tone}
        title={`${t("sp.label")}: ${sp.short}`}
        code={sp.code}
        technical={sp.technical}
        actions={
          <>
            {sp.action === "reconnect" && <button className="btn btn-primary btn-sm" onClick={onConnectSpotify}>{t("sp.reconnect")}</button>}
            {sp.action === "devices" && (
              <>
                <button className="btn btn-sm" onClick={() => api.openExternal("https://open.spotify.com/")}>{t("sp.open_spotify")}</button>
                <button className="btn btn-sm" onClick={() => setDevices(true)}>{t("sp.choose_device")}</button>
              </>
            )}
            {sp.action === "diagnose" && <button className="btn btn-sm" onClick={() => setDiag("spotify")}>{t("nav.diagnostics")}</button>}
          </>
        }
      >
        {sp.detail}
      </Notice>,
    );
  }
  if (tw.tone === "warn" || tw.tone === "error") {
    notices.push(
      <Notice
        key="tw"
        tone={tw.tone}
        title={`${t("tw.label")}: ${tw.short}`}
        code={tw.code}
        technical={tw.technical}
        actions={
          tw.action === "reconnect" ? (
            <button className="btn btn-sm" onClick={() => api.twitchLoginStart().catch(() => undefined)}>{t("tw.connect")}</button>
          ) : (
            <button className="btn btn-sm" onClick={() => setDiag("twitch")}>{t("nav.diagnostics")}</button>
          )
        }
      >
        {tw.detail}
      </Notice>,
    );
  }
  if (snap.overlay.error) {
    notices.push(<Notice key="ov" tone="error" code="overlay_port" technical={snap.overlay.error} />);
  }
  if (!notices.length) return diag ? <DiagnosticsDialog target={diag} onClose={() => setDiag(null)} /> : null;
  return (
    <div className="col" style={{ gap: 10 }}>
      {notices}
      {diag && <DiagnosticsDialog target={diag} onClose={() => setDiag(null)} />}
      {devices && <DevicesDialog onClose={() => setDevices(false)} />}
    </div>
  );
}
