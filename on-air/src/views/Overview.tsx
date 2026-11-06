import { ArrowRight, Check, CheckCheck, Gauge, MessageSquare, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { SearchDialog } from "../components/Dialogs";
import { startTwitchLogin } from "../components/Login";
import { NowPlayingCard } from "../components/NowPlaying";
import { PlanPanel } from "../components/PlanPanel";
import { SessionPulse } from "../components/Pulse";
import { statusBadge } from "../components/Requests";
import { Cover, Toggle, toastError } from "../components/ui";
import { effective, gateText, rewardSyncText } from "../lib/acceptance";
import { api } from "../lib/api";
import { duration } from "../lib/format";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import { refresh } from "../lib/store";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot, SongRequest } from "../lib/types";
import { ActivePaths } from "./Queue";
import { StatusNotices } from "./StatusNotices";

/** So viele Karten zeigt der Stapel; der Rest steht in der Warteschlange. */
const SHOWN = 6;

const act = (action: string, id: string) => api.queueAction(action, id).catch(toastError);

/** Karte im Stapel – die ersten drei in Signalfarben (Limette, Blau, Weiß), danach Glas. */
function StackCard({ r, i }: { r: SongRequest; i: number }) {
  const b = statusBadge(r);
  const title = r.track?.title ?? r.query;
  const artist = r.track?.artists.join(", ") ?? "";
  const review = r.status === "pending_review" && r.pending_reason !== "offline";
  const removable = r.status === "accepted" || r.status === "pending_review";
  const inSpotify = r.status === "handed_off";
  const tag = review || r.status === "uncertain" || inSpotify || r.redemption?.status === "review" ? b.label : null;
  return (
    <div className={`scard upnext-card ${i === 0 ? "active" : ""} ${review ? "review" : ""}`} role="listitem">
      <span className="sc-n">{i + 1}</span>
      <Cover url={r.track?.image_url} className="sc-cover" />
      <div style={{ minWidth: 0 }}>
        <div className="sc-title ellipsis" title={title}>{title}</div>
        <div className="sc-sub ellipsis" title={artist}>{artist}</div>
        <div className="sc-meta">
          {r.source === "channel_points" ? <Sparkles size={12} aria-label={t("rc.points")} /> : <MessageSquare size={12} aria-hidden="true" />}
          <span className="ellipsis">{r.requester.name}</span>
        </div>
      </div>
      <div className="sc-side">
        <div className="sc-btns">
          {review && (
            <>
              <button className="sc-btn ok" aria-label={t("q.approve")} title={t("q.approve")} onClick={() => act("approve", r.id)}><Check size={15} /></button>
              <button className="sc-btn red" aria-label={t("q.reject")} title={t("q.reject")} onClick={() => act("reject", r.id)}><X size={15} /></button>
            </>
          )}
          {inSpotify && <button className="sc-btn" aria-label={t("q.dismiss_stuck")} title={t("q.dismiss_stuck_hint")} onClick={() => act("dismiss", r.id)}><CheckCheck size={15} /></button>}
          {removable && !review && <button className="sc-btn" aria-label={t("q.remove")} title={t("q.remove")} onClick={() => act("remove", r.id)}><Trash2 size={14} /></button>}
        </div>
        {tag ? <span className="sc-tag">{tag}</span> : r.track ? <span className="sc-time">{duration(r.track.duration_ms)}</span> : null}
      </div>
    </div>
  );
}

/** „Als Nächstes“ wie ein Warenkorb: farbige Karten, Gesamtdauer unten, runder Plus-Knopf. */
function UpNextStack({ snap, go, onAdd }: { snap: AppSnapshot; go: (r: string) => void; onAdd: () => void }) {
  const upcoming = snap.queue.filter((r) => r.status !== "playing");
  const total = upcoming.reduce((a, r) => a + (r.track?.duration_ms ?? 0), 0);
  return (
    <section className="tile stack upnext" aria-labelledby="next-h">
      <div className="stack-head upnext-head">
        <div className="col" style={{ gap: 2 }}>
          <h2 id="next-h">{t("np.up_next")}</h2>
          <span className="count">{upcoming.length === 1 ? t("np.song_one") : t("np.songs", { n: upcoming.length })}{total > 0 ? ` · ${duration(total)}` : ""}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {upcoming.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => go("queue")}>{t("stack.show_all")}</button>}
          <button className="btn btn-sm btn-primary" onClick={onAdd}><Plus size={15} /> {t("stack.add")}</button>
        </div>
      </div>
      {upcoming.length === 0 ? (
        <div className="stack-empty">
          <h3>{t("stack.empty_title")}</h3>
          <span className="muted">{t("q.empty")}</span>
          <ActivePaths snap={snap} />
        </div>
      ) : (
        <div className="stack-list upnext-row" role="list">
          {upcoming.slice(0, SHOWN).map((r, i) => <StackCard key={r.id} r={r} i={i} />)}
          {upcoming.length > SHOWN && (
            <button className="btn btn-ghost btn-sm more-link" onClick={() => go("queue")}>{t("nx.more", { n: upcoming.length })} <ArrowRight size={14} /></button>
          )}
        </div>
      )}
    </section>
  );
}

/** Request-Kachel: wirksamer Zustand groß, darunter die Wege mit Pegel und Schalter. */
function RequestsTile({ snap, go }: { snap: AppSnapshot; go: (r: string) => void }) {
  const { draft, update } = useSettingsDraft(snap, 150);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const a = snap.acceptance;
  const e = effective(snap);
  const reward = rewardSyncText(snap);
  const cmd = `${draft.commands.prefix}${draft.commands.sr.name}`;
  const scopeMissing = draft.channel_points.enabled && snap.twitch.auth.state === "signed_in" && !snap.channel_points.scope_ok;
  const manual = pending ?? snap.settings.requests.open;
  const toggleManual = async (v: boolean) => {
    setBusy(true);
    setPending(v);
    try {
      await api.setRequestsOpen(v);
      await refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
  const meter = (open: boolean, configured: boolean) => (open ? "ok" : configured ? "warn" : "");
  return (
    <section className="tile t-requests" aria-labelledby="rc-h">
      <div className="tile-head">
        <span className="tile-title" id="rc-h"><Gauge size={14} /> {t("rc.title")}</span>
        <Toggle checked={manual} disabled={busy} onChange={(v) => void toggleManual(v)} ariaLabel={t("rc.accept")} />
      </div>
      <div className="big-state">
        <b className={e.tone === "open" ? "open" : e.tone === "auto" ? "auto" : ""}>{e.tone === "open" ? t("tile.open") : e.tone === "auto" ? t("tile.auto") : t("tile.closed")}</b>
        <span>{e.why || t("rc.accept_desc")}</span>
      </div>
      <div className="lanes">
        <div className="lane-row source-row">
          <span className={`lane-ic ${a.chat.open ? "on" : ""}`}><MessageSquare size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="ln">{t("rc.chat")} <span className="subtle small">· {cmd}</span></div>
            <div className={`lw why-line ${a.chat.open ? "ok" : a.chat.configured ? "warn" : ""}`}>{gateText(a.chat)}</div>
            <div className={`meter ${meter(a.chat.open, a.chat.configured)}`}><i style={{ width: a.chat.open ? "100%" : a.chat.configured ? "45%" : "8%" }} /></div>
          </div>
          <Toggle checked={draft.requests.chat_enabled} onChange={(v) => update((s) => ({ ...s, requests: { ...s.requests, chat_enabled: v } }))} ariaLabel={t("rc.chat")} />
        </div>
        <div className="lane-row source-row">
          <span className={`lane-ic ${a.channel_points.open ? "on" : ""}`}><Sparkles size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="ln">{t("rc.points")} <span className="subtle small">· {draft.channel_points.cost.toLocaleString()}</span></div>
            <div className={`lw why-line ${a.channel_points.open ? "ok" : a.channel_points.configured ? "warn" : ""}`} title={reward?.text}>{gateText(a.channel_points)}{reward?.pending ? ` · ${reward.text}` : ""}</div>
            <div className={`meter ${meter(a.channel_points.open, a.channel_points.configured)}`}><i style={{ width: a.channel_points.open ? "100%" : a.channel_points.configured ? "45%" : "8%" }} /></div>
          </div>
          <Toggle
            checked={draft.channel_points.enabled}
            disabled={snap.twitch.auth.state !== "signed_in" && !draft.channel_points.enabled}
            onChange={(v) => update((s) => ({ ...s, channel_points: { ...s.channel_points, enabled: v } }))}
            ariaLabel={t("rc.points")}
          />
        </div>
      </div>
      <div className="tile-foot">
        {scopeMissing && <button className="btn btn-sm" onClick={() => void startTwitchLogin()}>{t("rc.grant_scope")}</button>}
        {snap.channel_points.needs_review > 0 && <button className="btn btn-sm" style={{ color: "var(--warn)" }} onClick={() => go("queue")}>{t("rc.review", { n: snap.channel_points.needs_review })}</button>}
        {reward?.pending && snap.channel_points.last_error && <button className="btn btn-sm" onClick={() => api.channelPointsResync().then(refresh, toastError)}>{t("cp.resync")}</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => go("settings")}>{t("tile.rules")} <ArrowRight size={14} /></button>
      </div>
    </section>
  );
}

export function Overview({ snap, go, onConnectSpotify }: { snap: AppSnapshot; go: (r: string) => void; onConnectSpotify: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="page live-page">
      <div className="studio">
        <div className="notices"><StatusNotices snap={snap} onConnectSpotify={onConnectSpotify} /></div>
        <NowPlayingCard snap={snap} onConnect={onConnectSpotify} />
        <UpNextStack snap={snap} go={go} onAdd={() => setAdding(true)} />
        <div className="row2">
          <SessionPulse snap={snap} />
          <RequestsTile snap={snap} go={go} />
          <PlanPanel snap={snap} className="tile t-plan" />
        </div>
      </div>
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={isSpotifyUsable(snap) ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </div>
  );
}
