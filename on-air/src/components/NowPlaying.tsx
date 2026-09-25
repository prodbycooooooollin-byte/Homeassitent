import { ExternalLink, Info, Megaphone, MonitorSpeaker, Music2, Pause, Play, SkipBack, SkipForward, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import { useNow } from "../lib/store";
import type { AppSnapshot, Device } from "../lib/types";
import { Badge, Cover, Dialog, EmptyState, Notice, toastError } from "./ui";

export const STALE_MS = 20_000;

export type ItemKind = "track" | "episode" | "ad" | "unknown";

export function playbackInfo(s: AppSnapshot, now: number) {
  const pb = s.spotify.playback;
  if (pb.state !== "active") return null;
  const age = now - pb.fetched_at_ms;
  const stale = !isSpotifyUsable(s) || age > STALE_MS;
  const kind: ItemKind = pb.track ? "track" : pb.episode ? "episode" : pb.item_type === "ad" ? "ad" : "unknown";
  const dur = pb.track?.duration_ms ?? pb.episode?.duration_ms ?? 0;
  let progress = pb.progress_ms + (pb.is_playing && !stale ? Math.max(0, age) : 0);
  if (dur > 0) progress = Math.min(progress, dur);
  const requester = s.queue.find((r) => r.status === "playing" && r.track?.uri === pb.track?.uri)?.requester.name ?? null;
  const requestSource = s.queue.find((r) => r.status === "playing" && r.track?.uri === pb.track?.uri)?.source ?? null;
  return { pb, stale, progress, dur, requester, requestSource, kind };
}

function HeroFrame({ cover, children }: { cover?: string | null; children: React.ReactNode }) {
  return (
    <section className="hero" aria-label={t("np.title_region")}>
      <div className={`hero-bg ${cover ? "" : "none"}`} style={cover ? { backgroundImage: `url("${cover}")` } : undefined} aria-hidden="true" />
      {children}
    </section>
  );
}

export function NowPlayingCard({ snap, onConnect }: { snap: AppSnapshot; onConnect: () => void }) {
  const now = useNow();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const info = playbackInfo(snap, now);
  const usable = isSpotifyUsable(snap);

  if (snap.spotify.auth.state !== "signed_in") {
    const reauth = snap.spotify.auth.state === "reauth_required";
    return (
      <HeroFrame>
        <EmptyState
          icon={<Music2 size={20} />}
          title={reauth ? t("sp.reauth") : t("sp.signed_out")}
          action={<button className="btn btn-primary btn-lg" onClick={onConnect}>{reauth ? t("sp.reconnect") : t("sp.connect")}</button>}
        >
          {reauth ? t("sp.detail.reauth") : t("sp.detail.signed_out")}
        </EmptyState>
      </HeroFrame>
    );
  }
  if (!info) {
    const unknown = snap.spotify.playback.state === "unknown";
    return (
      <HeroFrame>
        <div className="hero-body">
          <div className="hero-cover"><div className="cover-ph"><MonitorSpeaker size={36} /></div></div>
          <div className="col" style={{ gap: 6 }}>
            <span className="hero-state">{unknown ? t("np.unknown") : t("np.inactive")}</span>
            {!unknown && <span className="muted">{t("np.nothing_hint")}</span>}
            {!unknown && (
              <div className="transport">
                <button className="btn" onClick={() => api.openExternal("https://open.spotify.com/").catch(toastError)}>{t("sp.open_spotify")}</button>
                <button className="btn btn-ghost" onClick={() => setDevicesOpen(true)} disabled={!usable}><MonitorSpeaker size={16} /> {t("sp.choose_device")}</button>
              </div>
            )}
          </div>
        </div>
        {devicesOpen && <DevicesDialog onClose={() => setDevicesOpen(false)} />}
      </HeroFrame>
    );
  }
  const { pb, stale, progress, dur, requester, requestSource, kind } = info;
  const track = pb.track;
  const ep = pb.episode;
  const cover = track?.image_url ?? ep?.image_url ?? null;
  const pct = dur > 0 ? (100 * progress) / dur : 0;
  const disabledReason = !usable ? t("np.disabled_offline") : t("np.disabled_action");
  const controls = usable && kind !== "ad";
  const title = kind === "track" ? track!.title : kind === "episode" ? ep!.title : kind === "ad" ? t("np.ad") : t("np.unknown_title");
  const sub = kind === "track" ? track!.artists.join(", ") : kind === "episode" ? ep!.show ?? "" : kind === "ad" ? t("np.ad_hint") : "";
  const link = track?.external_url ?? ep?.external_url ?? null;
  return (
    <HeroFrame cover={cover}>
      <div className="hero-body">
        <div className="hero-cover">
          {kind === "ad" ? <div className="cover-ph"><Megaphone size={40} /></div> : <Cover url={cover} alt={track?.album ?? ep?.show ?? ""} />}
        </div>
        <div className="col" style={{ gap: 0, minWidth: 0 }}>
          <div className="hero-kicker">
            {requester && <Badge tone="accent">{requestSource === "channel_points" ? <Sparkles size={11} /> : null}{t("np.requested_by", { name: requester })}</Badge>}
            {kind === "episode" && <Badge tone="info">{t("np.podcast")}</Badge>}
            {!pb.is_playing && kind !== "ad" && <Badge>{t("np.paused")}</Badge>}
            {track?.explicit && <Badge title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
          </div>
          <div className="hero-title clamp2" title={title}>{title}</div>
          <div className={kind === "ad" ? "hero-artist" : "hero-artist ellipsis"} title={sub}>
            {sub}
            {kind === "track" && track!.album ? <span className="subtle"> · {track!.album}</span> : null}
          </div>
          {stale ? (
            <div className="row small" style={{ marginTop: 18, color: "var(--warn)", gap: 6 }}><Info size={14} /> {t("np.stale_hint", { time: clockTime(pb.fetched_at_ms, getLang()) })}</div>
          ) : kind !== "ad" && dur > 0 ? (
            <div className="progress small muted" aria-label={`${duration(progress)} / ${duration(dur)}`}>
              <span>{duration(progress)}</span>
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${pct}%` }} /></div>
              <span style={{ textAlign: "right" }}>{duration(dur)}</span>
            </div>
          ) : null}
          <div className="transport">
            <button className="icon-btn lg" aria-label={t("np.prev")} title={controls && pb.actions.can_skip_prev ? t("np.prev") : disabledReason} disabled={!controls || !pb.actions.can_skip_prev} onClick={() => api.transport("previous").catch(toastError)}><SkipBack size={20} /></button>
            {pb.is_playing ? (
              <button className="play-btn" aria-label={t("np.pause")} title={controls ? t("np.pause") : disabledReason} disabled={!controls || !pb.actions.can_pause} onClick={() => api.transport("pause").catch(toastError)}><Pause size={22} /></button>
            ) : (
              <button className="play-btn" aria-label={t("np.play")} title={controls ? t("np.play") : disabledReason} disabled={!controls || !pb.actions.can_resume} onClick={() => api.transport("resume").catch(toastError)}><Play size={22} /></button>
            )}
            <button className="icon-btn lg" aria-label={t("np.next")} title={controls && pb.actions.can_skip_next ? t("np.next") : disabledReason} disabled={!controls || !pb.actions.can_skip_next} onClick={() => api.transport("next").catch(toastError)}><SkipForward size={20} /></button>
            <div className="grow" />
            {pb.device && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDevicesOpen(true)} disabled={!usable} title={t("sp.choose_device")}>
                <MonitorSpeaker size={15} /> <span className="ellipsis" style={{ maxWidth: 160 }}>{pb.device.name}</span>
              </button>
            )}
            {link && (
              <a className="btn btn-ghost btn-sm" href={link} onClick={(e) => { e.preventDefault(); void api.openExternal(link).catch(toastError); }}>
                <ExternalLink size={15} /> <span>{t("np.open_link")}</span>
              </a>
            )}
          </div>
        </div>
      </div>
      {devicesOpen && <DevicesDialog onClose={() => setDevicesOpen(false)} />}
    </HeroFrame>
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
