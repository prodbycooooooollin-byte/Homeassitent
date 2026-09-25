import { Maximize2, Megaphone, Pin, SkipForward } from "lucide-react";
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
      <div className="compact-top">
        <span className={`status-dot tone-${sp.tone}`} title={`${t("sp.label")}: ${sp.short}`}><span className="dot" /></span>
        <span className="small muted ellipsis grow" title={`${t("sp.label")}: ${sp.short} · ${t("tw.label")}: ${tw.short}`}>{sp.short}</span>
        <RequestSwitch open={snap.settings.requests.open} effectiveOpen={acc.any_open} compact />
        <button className="icon-btn sm" aria-pressed={draft.compact_on_top} title={t("compact.on_top")} aria-label={t("compact.on_top")} onClick={() => { const v = !draft.compact_on_top; update((s) => ({ ...s, compact_on_top: v })); void setAlwaysOnTop(v); }}>
          <Pin size={15} fill={draft.compact_on_top ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="compact-np">
        {kind === "ad" ? <div className="cover cover-ph" style={{ width: 64, height: 64 }}><Megaphone size={24} /></div> : <Cover url={track?.image_url ?? ep?.image_url} size={64} className="cover" />}
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 650 }} title={title}>{title}</div>
          {sub && <div className="small muted ellipsis" title={sub}>{sub}</div>}
          {info && info.stale ? (
            <div className="small" style={{ color: "var(--warn)" }} title={t("np.stale_hint", { time: clockTime(info.pb.fetched_at_ms, getLang()) })}>{t("np.stale", { time: clockTime(info.pb.fetched_at_ms, getLang()) })}</div>
          ) : info && kind !== "ad" && info.dur > 0 ? (
            <div className="row small subtle" style={{ gap: 8, fontVariantNumeric: "tabular-nums" }}>
              <div className="bar grow"><i style={{ width: `${pct}%` }} /></div>
              <span>{info.pb.is_playing ? duration(info.progress) : t("np.paused")}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="row" style={{ padding: "0 14px 12px", gap: 8 }}>
        <button className="btn grow" disabled={!usable || kind === "ad" || !info?.pb.actions.can_skip_next} title={usable ? t("np.next") : t("np.disabled_offline")} onClick={() => api.transport("next").catch(toastError)}>
          <SkipForward size={16} /> {t("np.next")}
        </button>
        <button className="icon-btn" title={t("compact.open_main")} aria-label={t("compact.open_main")} onClick={() => showMainWindow().catch(toastError)}>
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="section-label" style={{ paddingTop: 4 }}>{t("compact.next")} · {upcoming.length}</div>
      <div className="compact-list">
        {upcoming.length === 0 ? <div className="subtle small" style={{ padding: "4px 14px" }}>{t("q.empty")}</div> : <RequestList items={upcoming} compact />}
      </div>
    </div>
  );
}
