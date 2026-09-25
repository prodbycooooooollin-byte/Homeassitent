import { hasKey, t } from "./i18n";
import type { AppSnapshot, Block, SourceGate } from "./types";

export function blockText(b: Block): string {
  if (b.code === "technical") {
    const k = `tech.${b.detail}`;
    return hasKey(k) ? t(k) : t("block.technical");
  }
  return t(`block.${b.code}` as const);
}

export function gateText(g: SourceGate): string {
  if (g.open) return t("rc.takes");
  if (!g.configured) return t("rc.off");
  return g.blocks.map(blockText).join(" · ");
}

export type Effective = { tone: "open" | "auto" | "paused" | "none"; label: string; why: string };

/** Wirksamer Annahmestatus für Topbar und Kompaktmodus. */
export function effective(s: AppSnapshot): Effective {
  const a = s.acceptance;
  const cmd = `${s.settings.commands.prefix}${s.settings.commands.sr.name}`;
  if (!a.chat.configured && !a.channel_points.configured) return { tone: "none", label: t("acc.none"), why: "" };
  if (a.any_open) {
    const list = [a.chat.open ? cmd : null, a.channel_points.open ? t("q.src_points") : null].filter(Boolean).join(" + ");
    return { tone: "open", label: t("acc.open"), why: t("acc.via", { list }) };
  }
  const first = (a.chat.configured ? a.chat.blocks : a.channel_points.blocks).find((b) => b.code !== "source_disabled");
  if (a.paused_by_plan) return { tone: "auto", label: t("acc.auto"), why: first ? blockText(first) : "" };
  return { tone: "paused", label: t("acc.paused"), why: first ? blockText(first) : "" };
}

/** Kanalpunkte-Belohnung: gewünschter vs. bestätigter Zustand als Text. */
export function rewardSyncText(s: AppSnapshot): { text: string; pending: boolean } | null {
  const cp = s.channel_points;
  if (!cp.reward_id && !cp.desired_enabled) return null;
  if (!cp.in_sync) {
    if (!cp.desired_enabled) return { text: t("rc.reward_pending_disable"), pending: true };
    if (cp.desired_paused) return { text: t("rc.reward_pending_pause"), pending: true };
    return { text: t("rc.reward_pending_enable"), pending: true };
  }
  if (cp.confirmed_enabled === false) return { text: t("rc.reward_disabled"), pending: false };
  if (cp.confirmed_paused) return { text: t("rc.reward_paused"), pending: false };
  return { text: t("rc.reward_active"), pending: false };
}
