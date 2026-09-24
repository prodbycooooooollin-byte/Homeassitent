import { CheckCircle2, Copy, ExternalLink, MonitorSpeaker } from "lucide-react";
import { useState } from "react";
import { SpotifyLoginStatus, startSpotifyLogin, startTwitchLogin, useSpotifyLogin } from "../components/Login";
import { Rich } from "../components/Rich";
import { BrandMark, Field, Notice, toast, toastError } from "../components/ui";
import { api, copyText } from "../lib/api";
import { t } from "../lib/i18n";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot } from "../lib/types";
import { widgetUrl } from "./Widgets";

export function Onboarding({ snap, onDone }: { snap: AppSnapshot; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const { draft, update, flush } = useSettingsDraft(snap, 300);
  const login = useSpotifyLogin();
  const spOk = snap.spotify.auth.state === "signed_in";
  const twOk = snap.twitch.auth.state === "signed_in";
  const device = snap.spotify.device.state === "active" ? snap.spotify.device.device : null;
  const url = widgetUrl(snap.overlay.port, "glass");
  const finish = async () => {
    update((s) => ({ ...s, onboarding_done: true }));
    await flush();
    onDone();
  };
  return (
    <div className="onb" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb-card card card-pad col" style={{ gap: 20 }}>
        <div className="row" style={{ gap: 12 }}>
          <BrandMark size={34} />
          <div className="col" style={{ gap: 0 }}>
            <h1 id="onb-title">{t("onb.title")}</h1>
            <span className="muted">{t("onb.subtitle")}</span>
          </div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <div className="steps" aria-hidden="true">{[1, 2, 3, 4].map((n) => <span key={n} className={n <= step ? "on" : ""} />)}</div>
          <span className="subtle small">{t("onb.step", { n: step })}</span>
        </div>

        {step === 1 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>{t("onb.s1")}</h2>
            {spOk ? (
              <Notice tone="ok" title={t("onb.s1_done")} />
            ) : (
              <>
                <p className="muted">{t("onb.s1_text")}</p>
                <ol className="guide">
                  <li><Rich text={t("onb.s1_g1")} /></li>
                  <li><Rich text={t("onb.s1_g2")} /></li>
                  <li>
                    <Rich text={t("onb.s1_g3", { uri: "" })} />
                    <div className="code-box" style={{ marginTop: 6 }}>
                      <code>{snap.spotify_redirect_uri}</code>
                      <button className="btn btn-sm" onClick={async () => (await copyText(snap.spotify_redirect_uri)) && toast(t("common.copied"))}><Copy size={14} /></button>
                    </div>
                  </li>
                  <li><Rich text={t("onb.s1_g4")} /></li>
                  <li><Rich text={t("onb.s1_g5")} /></li>
                </ol>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => api.openExternal("https://developer.spotify.com/dashboard").catch(toastError)}><ExternalLink size={14} /> Spotify Developer Dashboard</button>
                <Field label={t("s.spotify_client_id")} htmlFor="onb-cid">
                  <input id="onb-cid" className="input mono" value={draft.spotify.client_id} spellCheck={false} onChange={(e) => update((s) => ({ ...s, spotify: { ...s.spotify, client_id: e.target.value.trim() } }))} />
                </Field>
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={!draft.spotify.client_id || login.pending} onClick={async () => { await flush(); void startSpotifyLogin(); }}>{t("sp.connect")}</button>
                <SpotifyLoginStatus />
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>{t("onb.s2")}</h2>
            {twOk ? (
              <Notice tone="ok" title={t("onb.s2_done")} />
            ) : (
              <>
                <p className="muted">{t("onb.s2_text")}</p>
                <ol className="guide">
                  <li><Rich text={t("onb.s2_g1")} /></li>
                  <li><Rich text={t("onb.s2_g2")} /></li>
                  <li><Rich text={t("onb.s2_g3")} /></li>
                  <li><Rich text={t("onb.s2_g4")} /></li>
                </ol>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => api.openExternal("https://dev.twitch.tv/console/apps/create").catch(toastError)}><ExternalLink size={14} /> Twitch Developer Console</button>
                <Field label={t("s.twitch_client_id")} htmlFor="onb-tw">
                  <input id="onb-tw" className="input mono" value={draft.twitch.client_id} spellCheck={false} onChange={(e) => update((s) => ({ ...s, twitch: { ...s.twitch, client_id: e.target.value.trim() } }))} />
                </Field>
                <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={!draft.twitch.client_id} onClick={async () => { await flush(); void startTwitchLogin(); }}>{t("tw.connect")}</button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>{t("onb.s3")}</h2>
            <p className="muted">{t("onb.s3_text")}</p>
            {!spOk ? (
              <Notice tone="warn" code="not_signed_in" />
            ) : device ? (
              <Notice tone="ok" title={t("onb.s3_ok", { device: device.name })} />
            ) : (
              <div className="notice info"><MonitorSpeaker size={18} className="n-icon" /><div>{t("onb.s3_wait")}</div><div className="n-actions"><button className="btn btn-sm" onClick={() => api.openExternal("https://open.spotify.com/").catch(toastError)}>{t("sp.open_spotify")}</button></div></div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>{t("onb.s4")}</h2>
            <p className="muted">{t("onb.s4_text")}</p>
            <div className="code-box">
              <code>{url}</code>
              <button className="btn btn-primary btn-sm" onClick={async () => (await copyText(url)) && toast(t("common.copied"))}><Copy size={14} /> {t("w.copy_url")}</button>
            </div>
            {!snap.overlay.running && <Notice tone="error" code="overlay_port" technical={snap.overlay.error ?? undefined} />}
          </div>
        )}

        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={() => (step === 1 ? void finish() : setStep(step - 1))}>{step === 1 ? t("onb.later") : t("common.back")}</button>
          <div className="row">
            {step < 4 && ((step === 1 && !spOk) || (step === 2 && !twOk) || (step === 3 && !device)) && (
              <button className="btn btn-ghost" onClick={() => setStep(step + 1)}>{t("common.skip_step")}</button>
            )}
            {step < 4 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={(step === 1 && !spOk) || (step === 2 && !twOk) || (step === 3 && !device)}>
                {t("common.next")}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void finish()}><CheckCircle2 size={16} /> {t("onb.finish")}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
