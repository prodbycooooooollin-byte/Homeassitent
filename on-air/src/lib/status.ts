import { t } from "./i18n";
import { clockTime, secondsUntil } from "./format";
import { getLang } from "./i18n";
import type { AppSnapshot } from "./types";

export type Tone = "ok" | "warn" | "error" | "busy" | "neutral";

export interface StatusDesc {
  tone: Tone;
  short: string;
  detail?: string;
  code?: string;
  technical?: string;
  /** Primäre Handlung für diesen Zustand. */
  action?: "connect" | "reconnect" | "diagnose" | "devices";
}

export function spotifyStatus(s: AppSnapshot, now: number): StatusDesc {
  const sp = s.spotify;
  const tech = sp.last_error ? `${sp.last_error.code}: ${sp.last_error.details}` : undefined;
  if (sp.auth.state === "signed_out") return { tone: "neutral", short: t("sp.signed_out"), detail: t("sp.detail.signed_out"), action: "connect" };
  if (sp.auth.state === "reauth_required")
    return { tone: "error", short: t("sp.reauth"), detail: t("sp.detail.reauth"), code: "reauth_required", technical: sp.auth.reason, action: "reconnect" };
  switch (sp.link.state) {
    case "unknown":
      return { tone: "busy", short: t("sp.connecting") };
    case "degraded":
      return { tone: "warn", short: t("sp.degraded"), detail: `${t("sp.detail.degraded")} ${t("sp.retry_in", { s: secondsUntil(sp.link.next_retry_ms, now) })}`, technical: tech, action: "diagnose" };
    case "offline":
      return { tone: "warn", short: t("sp.offline"), detail: `${t("sp.detail.offline")} ${t("sp.retry_in", { s: secondsUntil(sp.link.next_retry_ms, now) })}`, code: "network", technical: tech, action: "diagnose" };
    case "rate_limited":
      return { tone: "warn", short: t("sp.rate_limited"), detail: `${t("sp.detail.rate_limited")} ${t("sp.paused_until", { time: clockTime(sp.link.until_ms, getLang()) })}`, code: "rate_limited", technical: tech };
    case "quota_exhausted":
      return { tone: "error", short: t("sp.quota"), detail: `${t("sp.detail.quota")} ${t("sp.paused_until", { time: clockTime(sp.link.until_ms, getLang()) })}`, code: "quota_exhausted", technical: tech, action: "diagnose" };
    case "blocked":
      return { tone: "error", short: t("sp.blocked"), code: sp.link.code, technical: tech, action: "diagnose" };
    case "online":
      if (sp.device.state === "active") return { tone: "ok", short: `${t("sp.online")} · ${sp.device.device.name}` };
      return { tone: "warn", short: t("sp.no_device"), detail: t("sp.detail.no_device"), code: "no_active_device", action: "devices" };
  }
}

export function twitchStatus(s: AppSnapshot, now: number): StatusDesc {
  const tw = s.twitch;
  const tech = tw.last_error ? `${tw.last_error.code}: ${tw.last_error.details}` : undefined;
  if (tw.auth.state === "signed_out") return { tone: "neutral", short: t("tw.disabled"), action: "connect" };
  if (tw.auth.state === "reauth_required") return { tone: "error", short: t("tw.reauth"), code: "reauth_required", technical: tw.auth.reason, action: "reconnect" };
  switch (tw.link.state) {
    case "connected":
      return { tone: "ok", short: tw.identity ? `${t("tw.connected")} · ${tw.identity.login}` : t("tw.connected") };
    case "connecting":
    case "disabled":
      return { tone: "busy", short: t("tw.connecting") };
    case "reconnecting":
      return { tone: "warn", short: t("tw.reconnecting"), detail: t("sp.retry_in", { s: secondsUntil(tw.link.next_retry_ms, now) }), code: "reconnecting", technical: tech, action: "diagnose" };
    case "blocked":
      return { tone: "error", short: t("tw.blocked"), detail: t("tw.detail.blocked"), code: tw.link.code, technical: tech, action: "reconnect" };
  }
}

export function isSpotifyUsable(s: AppSnapshot): boolean {
  return s.spotify.auth.state === "signed_in" && s.spotify.link.state === "online";
}
