import { CheckCircle2, Download, RefreshCw, Rocket } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { dateTime } from "../lib/format";
import { getLang, hasKey, t } from "../lib/i18n";
import { useUpdateInfo } from "../lib/updates";
import { useNow } from "../lib/store";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot, UpdatePreflight } from "../lib/types";
import { Dialog, Notice, SettingRow, Toggle, toastError } from "./ui";

function errText(code: string) {
  const k = `up.err.${code}`;
  return hasKey(k) ? t(k) : t("up.err.generic");
}

export function UpdatePanel({ snap }: { snap: AppSnapshot }) {
  const info = useUpdateInfo();
  const { draft, update } = useSettingsDraft(snap, 150);
  const [confirm, setConfirm] = useState<UpdatePreflight | "loading" | null>(null);
  if (!info) return <div className="card card-pad"><div className="skeleton" style={{ height: 80 }} /></div>;
  const st = info.state;
  const busy = st.state === "checking" || st.state === "downloading" || st.state === "installing";
  const openConfirm = async () => {
    setConfirm("loading");
    try {
      setConfirm(await api.updatePreflight());
    } catch (e) {
      setConfirm(null);
      toastError(e);
    }
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="card card-pad col" style={{ gap: 14 }}>
        <div className="row between wrap">
          <div className="col" style={{ gap: 2 }}>
            <span className="eyebrow">{t("up.installed")}</span>
            <span style={{ fontSize: 22, fontWeight: 700 }} className="num">ON AIR {info.current_version}</span>
            <span className="subtle small">{t("up.last_check")}: {info.last_check_ms ? dateTime(info.last_check_ms, getLang()) : t("up.never")}</span>
          </div>
          <button className="btn" disabled={busy || st.state === "not_configured"} onClick={() => api.updateCheck().catch(toastError)}>
            <RefreshCw size={15} className={st.state === "checking" ? "spin" : ""} /> {st.state === "checking" ? t("up.checking") : t("up.check")}
          </button>
        </div>

        {st.state === "not_configured" && <Notice tone="info" title={t("up.not_configured")}>{t("up.not_configured_desc")}</Notice>}
        {st.state === "up_to_date" && <Notice tone="ok" title={t("up.current")} />}
        {st.state === "failed" && (
          <Notice tone={st.code === "invalid_signature" ? "error" : "warn"} title={t(`up.failed.${st.stage}` as const)} technical={st.message}
            actions={<button className="btn btn-sm" onClick={() => api.updateLater().catch(toastError)}>{t("common.close")}</button>}>
            {errText(st.code)}
          </Notice>
        )}
        {(st.state === "available" || st.state === "downloading" || st.state === "ready" || st.state === "installing") && (
          <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
            <div className="card-pad col" style={{ gap: 12 }}>
              <div className="row between wrap">
                <span style={{ fontWeight: 650 }}>
                  {st.state === "available" && t("up.available", { v: st.version })}
                  {st.state === "downloading" && t("up.downloading", { v: st.version })}
                  {st.state === "ready" && t("up.ready", { v: st.version })}
                  {st.state === "installing" && t("up.installing")}
                </span>
                {st.state === "ready" && <CheckCircle2 size={18} color="var(--positive)" />}
              </div>
              {"notes" in st && st.notes && (
                <details open>
                  <summary className="small muted" style={{ cursor: "pointer" }}>{t("up.notes")}</summary>
                  <pre className="small" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontFamily: "inherit", color: "var(--text-2)" }}>{st.notes}</pre>
                </details>
              )}
              {st.state === "downloading" && (
                <div className="col" style={{ gap: 4 }}>
                  <div className="progress-line" role="progressbar" aria-valuenow={st.total ? Math.round((100 * st.received) / st.total) : undefined}>
                    <i style={{ width: st.total ? `${(100 * st.received) / st.total}%` : "30%" }} />
                  </div>
                  <span className="subtle small num">{(st.received / 1_048_576).toFixed(1)} MB{st.total ? ` / ${(st.total / 1_048_576).toFixed(1)} MB` : ""}</span>
                </div>
              )}
              <div className="row wrap" style={{ gap: 8 }}>
                {st.state === "available" && <button className="btn btn-primary" onClick={() => api.updateDownload().catch(toastError)}><Download size={15} /> {t("up.download")}</button>}
                {st.state === "ready" && <button className="btn btn-primary" onClick={() => void openConfirm()}><Rocket size={15} /> {t("up.install")}</button>}
                {(st.state === "available" || st.state === "ready") && <button className="btn btn-ghost" onClick={() => api.updateLater().catch(toastError)}>{t("up.later")}</button>}
              </div>
              {st.state === "ready" && info.auto.enabled && !info.auto.install_at_ms && (
                <span className="small" style={{ color: "var(--text-2)" }}>
                  {info.auto.postponed ? t("up.auto_postponed") : info.auto.waiting && info.auto.waiting !== "disabled" && info.auto.waiting !== "postponed" ? t("up.auto_waiting", { why: t(`up.wait.${info.auto.waiting}` as const) }) : null}
                </span>
              )}
              <span className="subtle small">{t("up.scope_note")}</span>
            </div>
          </div>
        )}
      </section>
      <section className="card card-pad col" style={{ gap: 0 }}>
        <SettingRow title={t("up.auto_install")} desc={t("up.auto_install_desc")}>
          <Toggle checked={draft.updates.auto_install} disabled={st.state === "not_configured"} onChange={(v) => update((s) => ({ ...s, updates: { ...s.updates, auto_install: v } }))} />
        </SettingRow>
        <SettingRow title={t("up.auto")} desc={t("up.auto_desc")}>
          {/* Automatisches Installieren schließt die Hintergrundprüfung ein. */}
          <Toggle checked={draft.updates.check_on_start || draft.updates.auto_install} disabled={st.state === "not_configured" || draft.updates.auto_install} onChange={(v) => update((s) => ({ ...s, updates: { ...s.updates, check_on_start: v } }))} />
        </SettingRow>
      </section>
      {confirm && (
        <Dialog
          title={t("up.confirm_title")}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>{t("up.later")}</button>
              <button className="btn btn-primary" disabled={confirm === "loading"} onClick={() => { setConfirm(null); api.updateInstall().catch(toastError); }}>
                {confirm !== "loading" && confirm.live ? t("up.install_anyway") : t("up.install")}
              </button>
            </>
          }
        >
          <p className="muted">{t("up.confirm_text")}</p>
          {confirm === "loading" ? (
            <div className="skeleton" style={{ height: 40 }} />
          ) : (
            <>
              {confirm.live === true && <Notice tone="warn" title={t("up.live")} />}
              {confirm.live === null && <Notice tone="info" title={t("up.live_unknown")} />}
              {confirm.live === false && <span className="subtle small">{t("up.not_live")}</span>}
              {confirm.pending_requests > 0 && <span className="small muted">{t("up.pending", { n: confirm.pending_requests })}</span>}
              {confirm.open_redemptions > 0 && <span className="small muted">{t("up.redemptions", { n: confirm.open_redemptions })}</span>}
              {confirm.plan_active && <span className="small muted">{t("up.plan_active")}</span>}
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

/** Countdown vor einer automatischen Installation – in jedem Fenster sichtbar. */
export function AutoUpdateBanner() {
  const info = useUpdateInfo();
  const now = useNow(250);
  const at = info?.auto.install_at_ms;
  if (!info || !at || info.state.state !== "ready") return null;
  const secs = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <div className="auto-update-banner" role="alertdialog" aria-live="assertive" aria-label={t("up.install")}>
      <Rocket size={18} className="n-icon" aria-hidden="true" />
      <div className="col" style={{ gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 640 }}>{t("up.countdown", { v: info.state.version, s: secs })}</span>
        <span className="small muted">{t("up.countdown_hint")}</span>
      </div>
      <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
        <button className="btn btn-sm" autoFocus onClick={() => api.updatePostpone().catch(toastError)}>{t("up.postpone")}</button>
        <button className="btn btn-sm btn-primary" onClick={() => api.updateInstall().catch(toastError)}>{t("up.install_now")}</button>
      </div>
    </div>
  );
}
