import { Maximize2, Pin, SkipForward } from "lucide-react";
import { playbackInfo } from "../components/NowPlaying";
import { RequestList } from "../components/Requests";
import { Cover, toastError } from "../components/ui";
import { api, setAlwaysOnTop, showMainWindow } from "../lib/api";
import { duration } from "../lib/format";
import { t } from "../lib/i18n";
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
  const pct = info && info.dur ? (100 * info.progress) / info.dur : 0;
  return (
    <div className="compact">
      <div className="compact-top">
        <span className={`status-dot tone-${sp.tone}`} title={`${t("sp.label")}: ${sp.short}`}><span className="dot" /></span>
        <span className="small muted ellipsis grow" title={`${t("sp.label")}: ${sp.short} · ${t("tw.label")}: ${tw.short}`}>{sp.short}</span>
        <RequestSwitch open={snap.settings.requests.open} compact />
        <button className="icon-btn sm" aria-pressed={draft.compact_on_top} title={t("compact.on_top")} aria-label={t("compact.on_top")} onClick={() => { const v = !draft.compact_on_top; update((s) => ({ ...s, compact_on_top: v })); void setAlwaysOnTop(v); }}>
          <Pin size={15} fill={draft.compact_on_top ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="compact-np">
        <Cover url={track?.image_url} size={64} className="cover" />
        <div className="col" style={{ gap: 2 }}>
          <div className="ellipsis" style={{ fontWeight: 650 }} title={track?.title}>{track?.title ?? (snap.spotify.playback.state === "idle" ? t("np.nothing") : t("np.unknown"))}</div>
          <div className="small muted ellipsis">{track?.artists.join(", ") ?? ""}</div>
          {info && (
            <div className="row small subtle" style={{ gap: 8, fontVariantNumeric: "tabular-nums" }}>
              <div className={`bar grow ${info.stale ? "stale" : ""}`}><i style={{ width: `${pct}%` }} /></div>
              <span>{duration(info.progress)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="row" style={{ padding: "0 14px 12px", gap: 8 }}>
        <button className="btn grow" disabled={!usable || !info?.pb.actions.can_skip_next} title={usable ? t("np.next") : t("np.disabled_offline")} onClick={() => api.transport("next").catch(toastError)}>
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
