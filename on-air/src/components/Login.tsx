import { Copy, Loader2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { api, copyText } from "../lib/api";
import { describeError } from "../lib/errors";
import { t } from "../lib/i18n";
import { refresh } from "../lib/store";
import type { AppSnapshot } from "../lib/types";
import { Dialog, Notice, toast } from "./ui";

// Gemeinsamer Zustand der Spotify-Anmeldung (ein Vorgang gleichzeitig).
let state: { pending: boolean; error: { code: string; message: string } | null } = { pending: false, error: null };
const ls = new Set<() => void>();
const set = (s: typeof state) => {
  state = s;
  ls.forEach((l) => l());
};

export async function startSpotifyLogin() {
  if (state.pending) return;
  set({ pending: true, error: null });
  try {
    await api.spotifyLogin();
    set({ pending: false, error: null });
    toast(t("onb.s1_done"));
  } catch (e) {
    const err = e as { code: string; message: string };
    set({ pending: false, error: err.code === "login_cancelled" ? null : err });
  } finally {
    void refresh();
  }
}

export function useSpotifyLogin() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => state,
  );
}

export function SpotifyLoginStatus() {
  const s = useSpotifyLogin();
  if (s.pending)
    return (
      <div className="row muted small">
        <Loader2 size={15} className="spin" /> {t("sp.waiting_browser")}
        <button className="btn btn-ghost btn-sm" onClick={() => api.spotifyCancelLogin()}>{t("common.cancel")}</button>
      </div>
    );
  if (s.error) return <Notice tone="error" code={s.error.code} technical={s.error.message} />;
  return null;
}

export function TwitchCodeDialog({ snap }: { snap: AppSnapshot }) {
  const dc = snap.twitch_device_code;
  if (!dc) return null;
  return (
    <Dialog title={t("tw.device_title")} onClose={() => api.twitchLoginCancel()}>
      <p className="muted">{t("tw.device_text")}</p>
      <div className="row" style={{ justifyContent: "center", gap: 12, padding: "8px 0" }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" }}>{dc.user_code}</span>
        <button className="icon-btn" aria-label={t("common.copy")} onClick={async () => (await copyText(dc.user_code)) && toast(t("common.copied"))}>
          <Copy size={16} />
        </button>
      </div>
      <div className="row muted small" style={{ justifyContent: "center" }}>
        <Loader2 size={15} className="spin" /> {t("tw.device_waiting")}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => api.openExternal(dc.verification_uri).catch(() => undefined)}>twitch.tv/activate</button>
      </div>
    </Dialog>
  );
}

export async function startTwitchLogin() {
  try {
    await api.twitchLoginStart();
    void refresh();
  } catch (e) {
    const d = describeError((e as { code: string }).code);
    toast(`${d.title} – ${d.action}`, "error");
  }
}
