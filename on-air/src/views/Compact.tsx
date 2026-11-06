import { Maximize2, Megaphone, Pause, Pin, Play, SkipBack, SkipForward } from "lucide-react";
import { playbackInfo } from "../components/NowPlaying";
import { RequestList } from "../components/Requests";
import { Cover, toastError } from "../components/ui";
import { api, setAlwaysOnTop, showMainWindow } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable, spotifyStatus, twitchStatus } from "../lib/status";
import { useNow } from "../lib/store";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot } from "../lib/types";
import { RequestSwitch } from "./Shell";
import { WindowControls } from "../components/WindowControls";

/** Kompaktmodus für einen zweiten Monitor: Titel, nächste Songs, Skip, Request-Schalter. */
export function CompactView({ snap }: { snap: AppSnapshot }) {
  const now = useNow();
  const info = playbackInfo(snap, now);
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const usable = isSpotifyUsable(snap);
  const { draft, update } = useSettingsDraft(snap);
  const upcoming = snap.queue.filter((r) => r.status !== "playing");
  const track = info?.pb.track;
  const ep = info?.pb.episode;
  const kind = info?.kind;
  const pct = info && info.dur ? (100 * info.progress) / info.dur : 0;
  const title = kind === "track" ? track!.title : kind === "episode" ? ep!.title : kind === "ad" ? t("np.ad") : kind === "unknown" ? t("np.unknown_title")
    : snap.spotify.auth.state === "signed_out" ? t("sp.signed_out")
    : snap.spotify.auth.state === "reauth_required" ? t("sp.reauth")
    : snap.spotify.playback.state === "idle" ? t("np.nothing") : t("np.unknown");
  const sub = kind === "track" ? track!.artists.join(", ") : kind === "episode" ? ep?.show ?? t("np.podcast") : kind === "ad" ? t("np.ad_hint") : "";
  const acc = snap.acceptance;
  return (
    <div className="compact">
      <div className="compact-top" data-tauri-drag-region>
        <span className={`status-dot tone-${sp.tone}`} title={`${t("sp.label")}: ${sp.short}`}><span className="dot" /></span>
        <span className="small muted ellipsis grow" title={`${t("sp.label")}: ${sp.short} · ${t("tw.label")}: ${tw.short}`}>{sp.short}</span>
        <RequestSwitch open={snap.settings.requests.open} effectiveOpen={acc.any_open} compact />
        <button className="icon-btn sm" aria-pressed={draft.compact_on_top} title={t("compact.on_top")} aria-label={t("compact.on_top")} onClick={() => { const v = !draft.compact_on_top; update((s) => ({ ...s, compact_on_top: v })); void setAlwaysOnTop(v); }}>
          <Pin size={15} fill={draft.compact_on_top ? "currentColor" : "none"} />
        </button>
        <WindowControls maximizable={false} />
      </div>
      <div className="compact-card">
        <div className={`hero-bg ${track?.image_url ?? ep?.image_url ? "" : "none"}`} style={track?.image_url ?? ep?.image_url ? { backgroundImage: `url("${track?.image_url ?? ep?.image_url}")` } : undefined} aria-hidden="true" />
        <div className="compact-brand">
          <span className={`lamp ${acc.any_open ? "on" : ""}`} aria-hidden="true" /> ON AIR
          <span className="time num">{clockTime(now, getLang())}</span>
        </div>
        <div className="compact-np">
          {kind === "ad" ? <div className="cover cover-ph" style={{ width: 76, height: 76 }}><Megaphone size={24} /></div> : <Cover url={track?.image_url ?? ep?.image_url} size={76} className="cover" />}
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="c-kicker">{info?.requester ? `${t("np.requested_from")} ${info.requester}` : info?.pb.is_playing ? t("np.now_playing") : t("np.paused")}</span>
            <div className="c-title ellipsis" title={title}>{title}</div>
            {sub && <div className="c-sub ellipsis" title={sub}>{sub}</div>}
          </div>
        </div>
        {info && info.stale ? (
          <div className="compact-ctl" style={{ gridTemplateColumns: "1fr", color: "var(--warn)" }} title={t("np.stale_hint", { time: clockTime(info.pb.fetched_at_ms, getLang()) })}>{t("np.stale", { time: clockTime(info.pb.fetched_at_ms, getLang()) })}</div>
        ) : info && kind !== "ad" && info.dur > 0 ? (
          <div className="compact-ctl">
            <span>{duration(info.progress)}</span>
            <div className="bar"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})` }} /></div>
            <span>{duration(info.dur)}</span>
          </div>
        ) : null}
        <div className="compact-buttons">
          <button className="icon-btn" disabled={!usable || kind === "ad" || !info?.pb.actions.can_skip_prev} aria-label={t("np.prev")} title={t("np.prev")} onClick={() => api.transport("previous").catch(toastError)}><SkipBack size={18} /></button>
          {info?.pb.is_playing ? (
            <button className="play-btn" disabled={!usable || kind === "ad" || !info?.pb.actions.can_pause} aria-label={t("np.pause")} title={t("np.pause")} onClick={() => api.transport("pause").catch(toastError)}><Pause size={20} /></button>
          ) : (
            <button className="play-btn" disabled={!usable || kind === "ad" || !info?.pb.actions.can_resume} aria-label={t("np.play")} title={t("np.play")} onClick={() => api.transport("resume").catch(toastError)}><Play size={20} /></button>
          )}
          <button className="icon-btn" disabled={!usable || kind === "ad" || !info?.pb.actions.can_skip_next} aria-label={t("np.next")} title={usable ? t("np.next") : t("np.disabled_offline")} onClick={() => api.transport("next").catch(toastError)}><SkipForward size={18} /></button>
          <button className="icon-btn" title={t("compact.open_main")} aria-label={t("compact.open_main")} onClick={() => showMainWindow().catch(toastError)}><Maximize2 size={16} /></button>
        </div>
      </div>
      <div className="section-label" style={{ paddingTop: 14 }}>{t("compact.next")} · {upcoming.length}</div>
      <div className="compact-list">
        {upcoming.length === 0 ? <div className="subtle small" style={{ padding: "4px 14px" }}>{t("q.empty")}</div> : <RequestList items={upcoming} compact />}
      </div>
    </div>
  );
}
