import { MessageSquare, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { gateText, rewardSyncText } from "../lib/acceptance";
import { t } from "../lib/i18n";
import { refresh } from "../lib/store";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot } from "../lib/types";
import { startTwitchLogin } from "./Login";
import { Toggle, toastError } from "./ui";

/** Request-Steuerung: globaler Schalter und die einzelnen Wege mit wirksamem Zustand. */
export function RequestControl({ snap, onOpenSettings }: { snap: AppSnapshot; onOpenSettings?: (section: string) => void }) {
  const { draft, update } = useSettingsDraft(snap, 150);
  const [busy, setBusy] = useState(false);
  // Sofortige Rückmeldung am Schalter; der Snapshot bestätigt bzw. korrigiert nach dem Refresh.
  const [pending, setPending] = useState<boolean | null>(null);
  const a = snap.acceptance;
  const cmd = `${draft.commands.prefix}${draft.commands.sr.name}`;
  const reward = rewardSyncText(snap);
  const scopeMissing = draft.channel_points.enabled && snap.twitch.auth.state === "signed_in" && !snap.channel_points.scope_ok;
  const toggleManual = async (v: boolean) => {
    setBusy(true);
    setPending(v);
    try {
      await api.setRequestsOpen(v);
      await refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
  return (
    <section className="card card-pad col" style={{ gap: 6 }} aria-labelledby="rc-h">
      <div className="row between">
        <div className="col" style={{ gap: 2 }}>
          <span className="eyebrow" id="rc-h">{t("rc.title")}</span>
          <span style={{ fontWeight: 640 }}>{t("rc.accept")}</span>
        </div>
        <Toggle checked={pending ?? snap.settings.requests.open} disabled={busy} onChange={(v) => void toggleManual(v)} label={<span className="sr-only">{t("rc.accept")}</span>} />
      </div>
      <p className="subtle small" style={{ marginBottom: 6 }}>{t("rc.accept_desc")}</p>

      <div className="source-row">
        <span className={`source-icon ${a.chat.open ? "on" : ""}`}><MessageSquare size={17} /></span>
        <div className="col" style={{ gap: 0 }}>
          <span style={{ fontWeight: 580 }}>{t("rc.chat")}</span>
          <span className="subtle small ellipsis">{t("rc.chat_desc", { cmd })}</span>
          <span className={`why-line ${a.chat.open ? "ok" : a.chat.configured ? "warn" : ""}`}>{gateText(a.chat)}</span>
        </div>
        <Toggle checked={draft.requests.chat_enabled} onChange={(v) => update((s) => ({ ...s, requests: { ...s.requests, chat_enabled: v } }))} label={<span className="sr-only">{t("rc.chat")}</span>} />
      </div>

      <div className="source-row">
        <span className={`source-icon ${a.channel_points.open ? "on" : ""}`}><Sparkles size={17} /></span>
        <div className="col" style={{ gap: 0 }}>
          <span style={{ fontWeight: 580 }}>{t("rc.points")}</span>
          <span className="subtle small ellipsis">{t("rc.points_desc", { title: draft.channel_points.title, cost: draft.channel_points.cost.toLocaleString() })}</span>
          <span className={`why-line ${a.channel_points.open ? "ok" : a.channel_points.configured ? "warn" : ""}`}>{gateText(a.channel_points)}</span>
          {reward && <span className={`why-line ${reward.pending ? "warn" : ""}`}>{reward.text}</span>}
          {snap.channel_points.needs_review > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginTop: 4, color: "var(--warn)" }} onClick={() => onOpenSettings?.("queue")}>
              {t("rc.review", { n: snap.channel_points.needs_review })}
            </button>
          )}
        </div>
        <Toggle
          checked={draft.channel_points.enabled}
          disabled={snap.twitch.auth.state !== "signed_in" && !draft.channel_points.enabled}
          onChange={(v) => update((s) => ({ ...s, channel_points: { ...s.channel_points, enabled: v } }))}
          label={<span className="sr-only">{t("rc.points")}</span>}
        />
      </div>
      {scopeMissing && (
        <div className="notice warn" style={{ marginTop: 6 }}>
          <Sparkles size={16} className="n-icon" />
          <div className="small">{t("cp.scope_missing")}</div>
          <div className="n-actions"><button className="btn btn-sm" onClick={() => void startTwitchLogin()}>{t("rc.grant_scope")}</button></div>
        </div>
      )}
    </section>
  );
}
