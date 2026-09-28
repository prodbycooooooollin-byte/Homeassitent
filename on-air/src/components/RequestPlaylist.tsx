import { ExternalLink, ListPlus } from "lucide-react";
import { startSpotifyLogin } from "./Login";
import { Field, Notice, SettingRow, Toggle, toastError } from "./ui";
import { api } from "../lib/api";
import { relative } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { useNow } from "../lib/store";
import type { AppSnapshot, Settings } from "../lib/types";

type Update = (fn: (s: Settings) => Settings) => void;

/** Sammel-Playlist: jeder angenommene Songwunsch landet einmal in einer Spotify-Playlist. */
export function RequestPlaylistCard({ snap, draft, update }: { snap: AppSnapshot; draft: Settings; update: Update }) {
  const now = useNow();
  const c = draft.request_playlist;
  const st = snap.request_playlist;
  const set = (patch: Partial<Settings["request_playlist"]>) => update((s) => ({ ...s, request_playlist: { ...s.request_playlist, ...patch } }));
  const signedIn = snap.spotify.auth.state === "signed_in";
  const current = st.playlists[st.playlists.length - 1];
  const nf = new Intl.NumberFormat(getLang() === "en" ? "en" : "de");
  return (
    <section className="card card-pad col" style={{ gap: 4 }} aria-labelledby="rp-h">
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <span className="e-icon"><ListPlus size={18} /></span>
        <div className="col" style={{ gap: 2 }}>
          <h2 id="rp-h">{t("rp.title")}</h2>
          <p className="muted small">{t("rp.desc")}</p>
        </div>
      </div>
      <SettingRow title={t("rp.enable")} desc={t("rp.enable_desc")}>
        <Toggle checked={c.enabled} onChange={(v) => set({ enabled: v })} ariaLabel={t("rp.enable")} />
      </SettingRow>
      {c.enabled && signedIn && !st.scope_ok && (
        <Notice tone="warn" title={t("rp.scope_title")} actions={<button className="btn btn-sm btn-primary" onClick={() => void startSpotifyLogin()}>{t("sp.reconnect")}</button>}>
          {t("rp.scope_desc")}
        </Notice>
      )}
      {c.enabled && st.scope_ok && st.last_error && <Notice tone="warn" code={st.last_error.code} technical={st.last_error.details} />}
      <div className="form-grid" style={{ marginTop: 6 }}>
        <Field label={t("rp.name")} hint={t("rp.name_hint")}><input className="input" maxLength={100} value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      </div>
      <SettingRow title={t("rp.public")} desc={t("rp.public_desc")}><Toggle checked={c.public} onChange={(v) => set({ public: v })} ariaLabel={t("rp.public")} /></SettingRow>
      <SettingRow title={t("rp.include_app")} desc={t("rp.include_app_desc")}><Toggle checked={c.include_app} onChange={(v) => set({ include_app: v })} ariaLabel={t("rp.include_app")} /></SettingRow>
      {(st.total > 0 || st.playlists.length > 0) && (
        <div className="kpis" style={{ marginTop: 10 }}>
          <div className="kpi"><div className="v num">{nf.format(st.total)}</div><div className="l">{t("rp.total")}</div></div>
          <div className="kpi"><div className="v num">{st.pending}</div><div className="l">{t("rp.pending")}</div></div>
          <div className="kpi"><div className="v" style={{ fontSize: 15 }}>{st.last_added_ms ? relative(st.last_added_ms, now, getLang()) : "–"}</div><div className="l">{t("rp.last")}</div></div>
        </div>
      )}
      {st.playlists.length > 0 && (
        <div className="list card" style={{ boxShadow: "none", marginTop: 10 }}>
          {st.playlists.map((p) => (
            <div key={p.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span className="t ellipsis">{p.name}{p === current && <span className="badge accent" style={{ marginLeft: 8 }}>{t("rp.current")}</span>}</span>
                <span className="subtle small num">{t("rp.count", { n: nf.format(p.count) })}</span>
              </div>
              <button className="btn btn-sm" onClick={() => api.openExternal(p.url).catch(toastError)}><ExternalLink size={14} /> {t("rp.open")}</button>
            </div>
          ))}
        </div>
      )}
      <p className="subtle small" style={{ marginTop: 8 }}>{t("rp.note")}</p>
    </section>
  );
}
