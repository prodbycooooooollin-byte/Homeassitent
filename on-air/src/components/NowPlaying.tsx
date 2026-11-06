import { ExternalLink, Info, Megaphone, MonitorSpeaker, Music2, Pause, Play, SkipBack, SkipForward, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { clockTime, duration } from "../lib/format";
import { getLang, t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import { useNow } from "../lib/store";
import type { AppSnapshot, Device } from "../lib/types";
import { Avatar } from "./Avatar";
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
  const req = s.queue.find((r) => r.status === "playing" && r.track?.uri === pb.track?.uri);
  return { pb, stale, progress, dur, requester: req?.requester.name ?? null, requestSource: req?.source ?? null, kind };
}

/** Längstes Wort (für die automatische Schriftgröße: lange Wörter werden kleiner statt umzubrechen). */
const longest = (s: string) => Math.max(6, ...s.split(/\s+/).map((w) => w.length));

function Frame({ art, children }: { art?: string | null; children: React.ReactNode }) {
  return (
    <section className="hero" aria-label={t("np.title_region")}>
      <div className={`hero-art ${art ? "" : "none"}`} style={art ? { backgroundImage: `url("${art}")` } : undefined} aria-hidden="true" />
      {children}
    </section>
  );
}

/** Bühne „Jetzt läuft“ im Filmplakat-Stil: riesiger Titel, Interpret als Konturschrift, Cover rechts. */
export function NowPlayingCard({ snap, onConnect }: { snap: AppSnapshot; onConnect: () => void }) {
  const now = useNow();
  const [devicesOpen, setDevicesOpen] = useState(false);
  const info = playbackInfo(snap, now);
  const usable = isSpotifyUsable(snap);
  const today = new Date(now).toLocaleDateString(getLang() === "en" ? "en-GB" : "de-DE", { weekday: "long", day: "numeric", month: "long" });

  if (snap.spotify.auth.state !== "signed_in") {
    const reauth = snap.spotify.auth.state === "reauth_required";
    return (
      <Frame>
        <div className="hero-top"><span className="live-pill paused"><span className="lamp" /> ON AIR</span></div>
        <div className="hero-empty">
          <div className="hero-date"><i />{today}</div>
          <h2>{reauth ? t("sp.reauth") : t("hero.connect_title")}</h2>
          <p>{reauth ? t("sp.detail.reauth") : t("sp.detail.signed_out")}</p>
          <button className="btn-white" onClick={onConnect}><Music2 size={18} /> {reauth ? t("sp.reconnect") : t("sp.connect")}</button>
        </div>
      </Frame>
    );
  }
  if (!info) {
    const unknown = snap.spotify.playback.state === "unknown";
    return (
      <Frame>
        <div className="hero-top"><span className="live-pill paused"><span className="lamp" /> {t("np.now_playing")}</span></div>
        <div className="hero-empty">
          <div className="hero-date"><i />{today}</div>
          <h2>{unknown ? t("np.unknown") : t("np.inactive")}</h2>
          {!unknown && <p>{t("np.nothing_hint")}</p>}
          {!unknown && (
            <div className="hero-actions">
              <button className="btn-white" onClick={() => api.openExternal("https://open.spotify.com/").catch(toastError)}><Play size={18} /> {t("sp.open_spotify")}</button>
              <button className="btn-outline" onClick={() => setDevicesOpen(true)} disabled={!usable}><MonitorSpeaker size={18} /> {t("sp.choose_device")}</button>
            </div>
          )}
        </div>
        {devicesOpen && <DevicesDialog onClose={() => setDevicesOpen(false)} />}
      </Frame>
    );
  }

  const { pb, stale, progress, dur, requester, requestSource, kind } = info;
  const track = pb.track;
  const ep = pb.episode;
  const cover = track?.image_url ?? ep?.image_url ?? null;
  const pct = dur > 0 ? Math.max(0, Math.min(1, progress / dur)) : 0;
  const disabledReason = !usable ? t("np.disabled_offline") : t("np.disabled_action");
  const controls = usable && kind !== "ad";
  const title = kind === "track" ? track!.title : kind === "episode" ? ep!.title : kind === "ad" ? t("np.ad") : t("np.unknown_title");
  const sub = kind === "track" ? track!.artists.join(", ") : kind === "episode" ? ep!.show ?? "" : kind === "ad" ? t("np.ad_hint") : "";
  const link = track?.external_url ?? ep?.external_url ?? null;
  const playing = pb.is_playing && !stale;
  const state = kind === "episode" ? t("np.podcast") : !pb.is_playing && kind !== "ad" ? t("np.paused") : t("np.on_air");
  return (
    <Frame art={kind === "ad" ? null : cover}>
      <div className="hero-top">
        <span className={`live-pill ${playing ? "" : "paused"}`}><span className={`lamp ${playing ? "on" : ""}`} aria-hidden="true" /> {state}</span>
        <div className="row" style={{ gap: 8 }}>
          {track?.explicit && <Badge tone="glass" title={t("q.explicit_label")}>{t("q.explicit")}</Badge>}
          {pb.device && (
            <button className="hero-device" onClick={() => setDevicesOpen(true)} disabled={!usable} title={t("sp.choose_device")}>
              <MonitorSpeaker size={15} /> <span className="ellipsis">{pb.device.name}</span>
            </button>
          )}
          {link && (
            <button className="hero-device" style={{ padding: "0 10px" }} title={t("np.open_link")} aria-label={t("np.open_link")} onClick={() => api.openExternal(link).catch(toastError)}>
              <ExternalLink size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="hero-main">
        <div className="hero-text">
          <div className="hero-date"><i />{kind === "track" && track!.album ? track!.album : today}</div>
          <h2 className="hero-title stage-title" title={title} style={{ ["--lw" as string]: longest(title) }}>{title}</h2>
          {sub && <div className="hero-artist" title={sub} style={{ ["--aw" as string]: Math.max(8, sub.length * 0.62) }}>{sub}</div>}
          <div className="hero-meta">
            {requester ? (
              <span className="hero-req">
                <Avatar name={requester} size={30} />
                <span>{t("np.requested_from")} <b>{requester}</b></span>
                {requestSource === "channel_points" && <Sparkles size={14} aria-label={t("rc.points")} />}
              </span>
            ) : (
              <span>{t("hero.own_music")}</span>
            )}
          </div>
          <div className="hero-actions">
            <button className="btn-white" aria-label={t("np.next")} title={controls && pb.actions.can_skip_next ? t("np.next") : disabledReason} disabled={!controls || !pb.actions.can_skip_next} onClick={() => api.transport("next").catch(toastError)}>
              <SkipForward size={18} /> {t("np.next")}
            </button>
            {pb.is_playing ? (
              <button className="btn-outline" aria-label={t("np.pause")} title={controls ? t("np.pause") : disabledReason} disabled={!controls || !pb.actions.can_pause} onClick={() => api.transport("pause").catch(toastError)}>
                <Pause size={18} /> {t("np.pause")}
              </button>
            ) : (
              <button className="btn-outline" aria-label={t("np.play")} title={controls ? t("np.play") : disabledReason} disabled={!controls || !pb.actions.can_resume} onClick={() => api.transport("resume").catch(toastError)}>
                <Play size={18} /> {t("np.play")}
              </button>
            )}
            <button className="btn-round" aria-label={t("np.prev")} title={controls && pb.actions.can_skip_prev ? t("np.prev") : disabledReason} disabled={!controls || !pb.actions.can_skip_prev} onClick={() => api.transport("previous").catch(toastError)}>
              <SkipBack size={18} />
            </button>
          </div>
        </div>
        <div className="hero-cover">
          {kind === "ad" ? <div className="cover-ph"><Megaphone size={48} /></div> : <Cover url={cover} alt={track?.album ?? ep?.show ?? ""} />}
        </div>
      </div>
      {stale ? (
        <div className="hero-stale"><Info size={15} /> {t("np.stale_hint", { time: clockTime(pb.fetched_at_ms, getLang()) })}</div>
      ) : kind !== "ad" && dur > 0 ? (
        <div className="hero-progress">
          <span>{duration(progress)}</span>
          <div className="bar" role="progressbar" aria-label={`${duration(progress)} / ${duration(dur)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
            <i style={{ transform: `scaleX(${pct})` }} />
            <span className="knob-track" style={{ transform: `translateX(${pct * 100}%)` }}><span className="knob" /></span>
          </div>
          <span>{duration(dur)}</span>
        </div>
      ) : null}
      {devicesOpen && <DevicesDialog onClose={() => setDevicesOpen(false)} />}
    </Frame>
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
        <div className="list">
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
