import { ExternalLink, MonitorSpeaker, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import { useNow } from "../lib/store";
import type { AppSnapshot, Device } from "../lib/types";
import { Badge, Cover, Dialog, EmptyState, Notice, toastError } from "./ui";

export const STALE_MS = 20_000;

export function playbackInfo(s: AppSnapshot, now: number) {
  const pb = s.spotify.playback;
  if (pb.state !== "active") return null;
  const age = now - pb.fetched_at_ms;
  const stale = !isSpotifyUsable(s) || age > STALE_MS;
  const dur = pb.track?.duration_ms ?? 0;
  let progress = pb.progress_ms + (pb.is_playing && !stale ? Math.max(0, age) : 0);
  if (dur > 0) progress = Math.min(progress, dur);
  const requester = s.queue.find((r) => r.status === "playing" && r.track?.uri === pb.track?.uri)?.requester.name ?? null;
  return { pb, stale, progress, dur, requester };
}

export function NowPlayingCard({ snap, onConnect }: { snap: AppSnapshot; onConnect: () => void }) {
  const now = useNow();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const info = playbackInfo(snap, now);
  const usable = isSpotifyUsable(snap);

  if (snap.spotify.auth.state !== "signed_in") {
    return (
      <div className="card">
        <EmptyState
          title={snap.spotify.auth.state === "reauth_required" ? t("sp.reauth") : t("sp.signed_out")}
          action={
            <button className="btn btn-primary" onClick={onConnect}>
              {snap.spotify.auth.state === "reauth_required" ? t("sp.reconnect") : t("sp.connect")}
            </button>
          }
        >
          {snap.spotify.auth.state === "reauth_required" ? t("sp.detail.reauth") : t("sp.detail.signed_out")}
        </EmptyState>
      </div>
    );
  }
  if (!info) {
    const unknown = snap.spotify.playback.state === "unknown";
    return (
      <div className="card">
        <EmptyState
          title={unknown ? t("np.unknown") : t("np.nothing")}
          action={
            !unknown && (
              <button className="btn" onClick={() => setDevicesOpen(true)} disabled={!usable}>
                <MonitorSpeaker size={16} /> {t("sp.choose_device")}
              </button>
            )
          }
        >
          {unknown ? null : t("np.nothing_hint")}
        </EmptyState>
        {devicesOpen && <DevicesDialog onClose={() => setDevicesOpen(false)} />}
      </div>
    );
  }
  const { pb, stale, progress, dur, requester } = info;
  const track = pb.track;
  const pct = dur > 0 ? (100 * progress) / dur : 0;
  const disabledReason = !usable ? t("np.disabled_offline") : t("np.disabled_action");
  return (
    <div className="card glass">
      <div className="np">
        <div className="np-cover">
          <Cover url={track?.image_url} alt={track ? `${track.album ?? track.title}` : ""} />
        </div>
        <div className="col" style={{ gap: 0 }}>
          <div className="row wrap" style={{ marginBottom: 10, gap: 6 }}>
            {pb.device && (
              <Badge>
                <MonitorSpeaker size={12} /> {t("np.on", { device: pb.device.name })}
              </Badge>
            )}
            {requester && <Badge tone="accent">{t("np.requested_by", { name: requester })}</Badge>}
            {track?.explicit && <Badge title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
            {stale && <Badge tone="warn">{t("np.stale", { time: clockTime(pb.fetched_at_ms, getLang()) })}</Badge>}
          </div>
          {track ? (
            <>
              <div className="np-title ellipsis" title={track.title}>
                {track.title}
              </div>
              <div className="np-artist ellipsis" title={track.artists.join(", ")}>
                {track.artists.join(", ")}
                {track.album ? <span className="subtle"> · {track.album}</span> : null}
              </div>
            </>
          ) : (
            <div className="muted">{t("np.not_track")}</div>
          )}
          <div className="progress small muted" aria-label={`${duration(progress)} / ${duration(dur)}`}>
            <span>{duration(progress)}</span>
            <div className={`bar ${stale ? "stale" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{duration(dur)}</span>
          </div>
          <div className="transport">
            <button className="icon-btn" aria-label={t("np.prev")} title={usable && pb.actions.can_skip_prev ? t("np.prev") : disabledReason} disabled={!usable || !pb.actions.can_skip_prev} onClick={() => api.transport("previous").catch(toastError)}>
              <SkipBack size={18} />
            </button>
            {pb.is_playing ? (
              <button className="icon-btn lg solid" aria-label={t("np.pause")} title={usable ? t("np.pause") : disabledReason} disabled={!usable || !pb.actions.can_pause} onClick={() => api.transport("pause").catch(toastError)}>
                <Pause size={20} />
              </button>
            ) : (
              <button className="icon-btn lg solid" aria-label={t("np.play")} title={usable ? t("np.play") : disabledReason} disabled={!usable || !pb.actions.can_resume} onClick={() => api.transport("resume").catch(toastError)}>
                <Play size={20} />
              </button>
            )}
            <button className="icon-btn" aria-label={t("np.next")} title={usable && pb.actions.can_skip_next ? t("np.next") : disabledReason} disabled={!usable || !pb.actions.can_skip_next} onClick={() => api.transport("next").catch(toastError)}>
              <SkipForward size={18} />
            </button>
            <div className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => setDevicesOpen(true)} disabled={!usable} title={usable ? t("sp.choose_device") : t("np.disabled_offline")}>
              <MonitorSpeaker size={15} /> <span>{t("sp.choose_device")}</span>
            </button>
            {track?.external_url && (
              <a className="btn btn-ghost btn-sm" href={track.external_url} onClick={(e) => { e.preventDefault(); void api.openExternal(track.external_url!).catch(toastError); }}>
                <ExternalLink size={15} /> <span>{t("np.open_link")}</span>
              </a>
            )}
          </div>
        </div>
      </div>
      {devicesOpen && <DevicesDialog onClose={() => setDevicesOpen(false)} />}
    </div>
  );
}

export function DevicesDialog({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => {
    setError(null);
    setDevices(null);
    api.devices().then(setDevices, (e) => setError(e.code ?? "error"));
  };
  useEffect(load, []);
  return (
    <Dialog title={t("np.devices_title")} onClose={onClose}>
      <p className="muted small">{t("np.devices_hint")}</p>
      {error && <Notice tone="error" code={error} actions={<button className="btn btn-sm" onClick={load}>{t("common.retry")}</button>} />}
      {!devices && !error && <div className="skeleton" style={{ height: 88 }} />}
      {devices && devices.length === 0 && <EmptyState icon={<MonitorSpeaker size={20} />} title={t("np.devices_empty")} />}
      {devices && devices.length > 0 && (
        <div className="list card" style={{ boxShadow: "none" }}>
          {devices.map((d) => (
            <div className="item" key={d.id ?? d.name}>
              <MonitorSpeaker size={18} className="subtle" />
              <div className="col" style={{ gap: 0 }}>
                <span className="t ellipsis">{d.name}</span>
                <span className="s">{d.kind}{d.is_active ? ` · ${t("np.active")}` : ""}</span>
              </div>
              <button
                className="btn btn-sm"
                disabled={!d.id || d.is_active || d.is_restricted || busy !== null}
                onClick={async () => {
                  setBusy(d.id);
                  try {
                    await api.transfer(d.id!);
                    onClose();
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {t("np.transfer")}
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
