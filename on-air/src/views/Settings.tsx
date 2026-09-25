import { CalendarClock, Copy, Database, Download, ExternalLink, FolderOpen, Layers, ListChecks, LogOut, MessageSquare, Monitor, Music2, Palette, Plug, RefreshCw, Save, Sparkles, Stethoscope, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { DiagnosticsDialog } from "../components/Dialogs";
import { PlanPanel } from "../components/PlanPanel";
import { UpdatePanel } from "../components/UpdatePanel";
import { useUpdateInfo } from "../lib/updates";
import { SpotifyLoginStatus, startSpotifyLogin, startTwitchLogin, useSpotifyLogin } from "../components/Login";
import { Dialog, Field, Notice, Segmented, SettingRow, Toggle, toast, toastError } from "../components/ui";
import { api, autostart, copyText, isTauri, openTextFile, saveTextFile } from "../lib/api";
import { t } from "../lib/i18n";
import { spotifyStatus, twitchStatus } from "../lib/status";
import { refresh, useNow } from "../lib/store";
import { useSettingsDraft } from "../lib/useSettings";
import type { AppSnapshot, CommandCfg, Replies, Role, Settings } from "../lib/types";

type Update = (fn: (s: Settings) => Settings) => void;

const ROLES: Role[] = ["everyone", "subscriber", "vip", "moderator", "broadcaster"];

function RoleSelect({ value, onChange, label }: { value: Role; onChange: (r: Role) => void; label: string }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as Role)} aria-label={label}>
      {ROLES.map((r) => (
        <option key={r} value={r}>{t(`role.${r}` as const)}</option>
      ))}
    </select>
  );
}

function Num({ value, onChange, min, max, label, width = 110 }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string; width?: number }) {
  return <input className="input" style={{ width }} type="number" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />;
}

const SECTIONS = [
  { id: "connections", icon: Plug, label: () => t("set.connections") },
  { id: "playback", icon: Music2, label: () => t("set.playback") },
  { id: "requests", icon: ListChecks, label: () => t("set.requests") },
  { id: "channel_points", icon: Sparkles, label: () => t("set.channel_points") },
  { id: "plan", icon: CalendarClock, label: () => t("set.plan") },
  { id: "commands", icon: MessageSquare, label: () => t("set.commands") },
  { id: "profiles", icon: Layers, label: () => t("set.profiles") },
  { id: "appearance", icon: Palette, label: () => t("set.appearance") },
  { id: "system", icon: Monitor, label: () => t("set.system") },
  { id: "updates", icon: RefreshCw, label: () => t("set.updates") },
  { id: "data", icon: Database, label: () => t("set.data") },
] as const;
export type SettingsSection = (typeof SECTIONS)[number]["id"];

export function SettingsView({ snap, initial }: { snap: AppSnapshot; initial?: SettingsSection }) {
  const [sec, setSec] = useState<SettingsSection>(initial ?? "connections");
  const { draft, update } = useSettingsDraft(snap);
  const upd = useUpdateInfo();
  const updBadge = upd && (upd.state.state === "available" || upd.state.state === "ready");
  const current = SECTIONS.find((x) => x.id === sec)!;
  return (
    <div className="page">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("s.title")}>
          {SECTIONS.map(({ id, icon: Icon, label }) => (
            <button key={id} aria-current={sec === id} onClick={() => setSec(id)}>
              <Icon size={16} /> <span className="grow">{label()}</span>
              {id === "updates" && updBadge && <span className="badge accent">{t("up.badge")}</span>}
              {id === "channel_points" && snap.channel_points.needs_review > 0 && <span className="badge warn">{snap.channel_points.needs_review}</span>}
            </button>
          ))}
        </nav>
        <div className="settings-section">
          <h1>{sec === "updates" ? t("up.title") : current.label()}</h1>
          {sec === "connections" && <Connections snap={snap} draft={draft} update={update} />}
          {sec === "playback" && <Playback draft={draft} update={update} />}
          {sec === "requests" && <Rules draft={draft} update={update} />}
          {sec === "channel_points" && <ChannelPoints snap={snap} draft={draft} update={update} />}
          {sec === "plan" && <PlanPanel snap={snap} full />}
          {sec === "commands" && <Commands draft={draft} update={update} />}
          {sec === "profiles" && <Profiles snap={snap} />}
          {sec === "appearance" && <Appearance draft={draft} update={update} />}
          {sec === "system" && <SystemTab draft={draft} update={update} />}
          {sec === "updates" && <UpdatePanel snap={snap} />}
          {sec === "data" && <DataTab snap={snap} />}
        </div>
      </div>
    </div>
  );
}

function Playback({ draft, update }: { draft: Settings; update: Update }) {
  return (
    <section className="card card-pad">
      <SettingRow title={t("s.poll")} desc={t("s.poll_hint")}>
        <Segmented
          label={t("s.poll")}
          value={String(draft.spotify.poll_playing_ms)}
          onChange={(v) => update((s) => ({ ...s, spotify: { ...s.spotify, poll_playing_ms: Number(v) } }))}
          options={[2000, 3000, 5000, 8000].map((ms) => ({ value: String(ms), label: `${ms / 1000} s` }))}
        />
      </SettingRow>
      <SettingRow title={t("s.rules.ahead")} desc={t("s.rules.ahead_hint")}>
        <Num label={t("s.rules.ahead")} value={draft.requests.handoff_ahead} min={1} max={5} onChange={(v) => update((s) => ({ ...s, requests: { ...s.requests, handoff_ahead: v } }))} />
      </SettingRow>
      <SettingRow title={t("s.app.hotkey")} desc={t("s.app.hotkey_hint")}>
        <input className="input" style={{ width: 180 }} placeholder="Ctrl+Alt+N" value={draft.hotkey_skip} onChange={(e) => update((s) => ({ ...s, hotkey_skip: e.target.value }))} aria-label={t("s.app.hotkey")} />
      </SettingRow>
    </section>
  );
}

function ChannelPoints({ snap, draft, update }: { snap: AppSnapshot; draft: Settings; update: Update }) {
  const cp = draft.channel_points;
  const st = snap.channel_points;
  const set = (patch: Partial<Settings["channel_points"]>) => update((s) => ({ ...s, channel_points: { ...s.channel_points, ...patch } }));
  const twitchOk = snap.twitch.auth.state === "signed_in";
  const state = (enabled: boolean | null, paused: boolean | null) =>
    enabled === null ? t("cp.unknown") : !enabled ? t("cp.disabled") : paused ? t("cp.paused") : t("cp.active");
  const err = st.last_error;
  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="card card-pad">
        <SettingRow title={t("cp.enable")} desc={t("cp.enable_desc")}>
          <Toggle checked={cp.enabled} disabled={!twitchOk && !cp.enabled} onChange={(v) => set({ enabled: v })} />
        </SettingRow>
        {!twitchOk && <p className="small" style={{ color: "var(--warn)" }}>{t("cp.twitch_required")}</p>}
        {twitchOk && cp.enabled && !st.scope_ok && (
          <Notice tone="warn" title={t("tech.missing_scope")} actions={<button className="btn btn-sm btn-primary" onClick={() => void startTwitchLogin()}>{t("rc.grant_scope")}</button>}>
            {t("cp.scope_missing")}
          </Notice>
        )}
      </section>
      <section className="card card-pad col" style={{ gap: 14 }}>
        <span className="eyebrow">{t("cp.reward")}</span>
        <div className="form-grid">
          <Field label={t("cp.reward_name")} hint="max. 45"><input className="input" maxLength={45} value={cp.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label={t("cp.cost")}><input className="input" type="number" min={1} value={cp.cost} onChange={(e) => set({ cost: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          <Field label={t("cp.mode")}>
            <Segmented label={t("cp.mode")} value={cp.mode} onChange={(v) => set({ mode: v })} options={[{ value: "auto", label: t("s.rules.mode_auto") }, { value: "moderation", label: t("s.rules.mode_moderation") }]} />
          </Field>
        </div>
        <Field label={t("cp.prompt")} hint="max. 200"><input className="input" maxLength={200} value={cp.prompt} onChange={(e) => set({ prompt: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label={t("cp.cooldown")}><Num label={t("cp.cooldown")} value={cp.global_cooldown_s} min={0} max={604800} onChange={(v) => set({ global_cooldown_s: v })} /></Field>
          <Field label={t("cp.max_stream")} hint={t("cp.zero_unlimited")}><Num label={t("cp.max_stream")} value={cp.max_per_stream} min={0} max={1000} onChange={(v) => set({ max_per_stream: v })} /></Field>
          <Field label={t("cp.max_user")} hint={t("cp.zero_unlimited")}><Num label={t("cp.max_user")} value={cp.max_per_user_per_stream} min={0} max={1000} onChange={(v) => set({ max_per_user_per_stream: v })} /></Field>
        </div>
        <p className="subtle small">{t("cp.flow_note")}</p>
      </section>
      <section className="card card-pad col" style={{ gap: 10 }}>
        <span className="eyebrow">{t("cp.sync")}</span>
        <div className="kpis">
          <div className="kpi"><div className="v" style={{ fontSize: 15 }}>{st.reward_id || st.desired_enabled ? state(st.desired_enabled, st.desired_paused) : t("cp.not_created")}</div><div className="l">{t("cp.desired")}</div></div>
          <div className="kpi"><div className="v" style={{ fontSize: 15 }}>{st.reward_id ? state(st.confirmed_enabled, st.confirmed_paused) : t("cp.not_created")}</div><div className="l">{t("cp.confirmed")}</div></div>
          <div className="kpi"><div className="v" style={{ fontSize: 15, color: st.in_sync ? "var(--positive)" : "var(--warn)" }}>{st.in_sync ? t("cp.in_sync") : t("cp.pending")}</div><div className="l">Sync</div></div>
          <div className="kpi"><div className="v">{st.open}</div><div className="l">{t("cp.open_redemptions", { n: "" }).replace(":", "").trim()}</div></div>
        </div>
        {err && <Notice tone={st.reward_id ? "warn" : "error"} code={err.code === "reward_title_taken" ? undefined : err.code} title={err.code.startsWith("reward_title") || err.code === "not_affiliate" ? t(`tech.${err.code}` as never) : undefined} technical={err.details}>{err.code === "reward_title_taken" ? t("cp.foreign_note") : undefined}</Notice>}
      </section>
    </div>
  );
}

function Connections({ snap, draft, update }: { snap: AppSnapshot; draft: Settings; update: Update }) {
  const now = useNow();
  const sp = spotifyStatus(snap, now);
  const tw = twitchStatus(snap, now);
  const login = useSpotifyLogin();
  const signedIn = snap.spotify.auth.state === "signed_in";
  const days = snap.spotify.auth.state === "signed_in" ? Math.floor((now - snap.spotify.auth.authorized_at_ms) / 86_400_000) : 0;
  const twSigned = snap.twitch.auth.state === "signed_in";
  return (
    <div className="grid-2">
      <section className="card card-pad col" style={{ gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Spotify</h2>
          <span className={`pill tone-${sp.tone}`} style={{ cursor: "default" }}><span className="dot" /> {sp.short}</span>
        </div>
        <Field label={t("s.spotify_client_id")} hint={t("s.spotify_client_hint")} htmlFor="sp-cid">
          <input id="sp-cid" className="input mono" value={draft.spotify.client_id} spellCheck={false} autoComplete="off" onChange={(e) => update((s) => ({ ...s, spotify: { ...s.spotify, client_id: e.target.value.trim() } }))} placeholder="z. B. 1a2b3c4d5e6f…" />
        </Field>
        <Field label={t("s.redirect_uri")}>
          <div className="code-box">
            <code>{snap.spotify_redirect_uri}</code>
            <button className="btn btn-sm" onClick={async () => (await copyText(snap.spotify_redirect_uri)) && toast(t("common.copied"))}><Copy size={14} /> {t("common.copy")}</button>
          </div>
        </Field>
        <div className="row wrap">
          <Field label={t("s.redirect_port")}>
            <Num value={draft.spotify.redirect_port} min={1024} max={65535} label={t("s.redirect_port")} onChange={(v) => update((s) => ({ ...s, spotify: { ...s.spotify, redirect_port: v } }))} />
          </Field>
        </div>
        <div className="row wrap">
          {signedIn ? (
            <>
              <span className="muted">{t("s.signed_in_as", { name: snap.spotify_profile?.display_name ?? snap.spotify_profile?.id ?? "Spotify" })}</span>
              <div className="grow" />
              <button className="btn btn-danger btn-sm" onClick={() => api.spotifyLogout().then(refresh, toastError)}><LogOut size={14} /> {t("sp.signout")}</button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={!draft.spotify.client_id || login.pending} onClick={() => void startSpotifyLogin()} title={draft.spotify.client_id ? undefined : t("s.spotify_client_hint")}>
              {snap.spotify.auth.state === "reauth_required" ? t("sp.reconnect") : t("sp.connect")}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => api.openExternal("https://developer.spotify.com/dashboard").catch(toastError)}><ExternalLink size={14} /> {t("s.spotify_guide")}</button>
        </div>
        <SpotifyLoginStatus />
        {signedIn && days > 150 && <Notice tone="warn" code="refresh_token_expiring" />}
        {signedIn && <p className="subtle small">{t("s.token_age", { days })}</p>}
      </section>

      <section className="card card-pad col" style={{ gap: 14, alignSelf: "start" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Twitch</h2>
          <span className={`pill tone-${tw.tone}`} style={{ cursor: "default" }}><span className="dot" /> {tw.short}</span>
        </div>
        <Field label={t("s.twitch_client_id")} hint={t("s.twitch_client_hint")} htmlFor="tw-cid">
          <input id="tw-cid" className="input mono" value={draft.twitch.client_id} spellCheck={false} autoComplete="off" onChange={(e) => update((s) => ({ ...s, twitch: { ...s.twitch, client_id: e.target.value.trim() } }))} />
        </Field>
        <div className="row wrap">
          {twSigned ? (
            <>
              <span className="muted">{snap.twitch.identity ? t("s.signed_in_as", { name: snap.twitch.identity.login }) : ""}</span>
              <div className="grow" />
              <button className="btn btn-danger btn-sm" onClick={() => api.twitchLogout().then(refresh, toastError)}><LogOut size={14} /> {t("tw.signout")}</button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={!draft.twitch.client_id} onClick={() => void startTwitchLogin()}>{t("tw.connect")}</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => api.openExternal("https://dev.twitch.tv/console/apps/create").catch(toastError)}><ExternalLink size={14} /> {t("s.twitch_guide")}</button>
        </div>
        {tw.tone === "error" && <Notice tone="error" code={tw.code} technical={tw.technical}>{tw.detail}</Notice>}
      </section>
    </div>
  );
}

function Rules({ draft, update }: { draft: Settings; update: Update }) {
  const r = draft.requests;
  const set = (patch: Partial<Settings["requests"]>) => update((s) => ({ ...s, requests: { ...s.requests, ...patch } }));
  return (
    <section className="card card-pad">
      <SettingRow title={t("rc.accept")} desc={t("rc.accept_desc")}><Toggle checked={r.open} onChange={(v) => set({ open: v })} /></SettingRow>
      <SettingRow title={t("rc.chat")} desc={t("rc.chat_desc", { cmd: "!sr" })}><Toggle checked={r.chat_enabled} onChange={(v) => set({ chat_enabled: v })} /></SettingRow>
      <SettingRow title={t("s.rules.mode")}>
        <Segmented label={t("s.rules.mode")} value={r.mode} onChange={(v) => set({ mode: v })} options={[{ value: "auto", label: t("s.rules.mode_auto") }, { value: "moderation", label: t("s.rules.mode_moderation") }]} />
      </SettingRow>
      <SettingRow title={t("s.rules.min_role")}><RoleSelect label={t("s.rules.min_role")} value={r.min_role} onChange={(v) => set({ min_role: v })} /></SettingRow>
      <SettingRow title={t("s.rules.max_queue")}><Num label={t("s.rules.max_queue")} value={r.max_queue} min={1} max={500} onChange={(v) => set({ max_queue: v })} /></SettingRow>
      <SettingRow title={t("s.rules.per_user")}><Num label={t("s.rules.per_user")} value={r.per_user_limit} min={0} max={50} onChange={(v) => set({ per_user_limit: v })} /></SettingRow>
      <SettingRow title={t("s.rules.user_cd")}><Num label={t("s.rules.user_cd")} value={r.user_cooldown_s} min={0} max={3600} onChange={(v) => set({ user_cooldown_s: v })} /></SettingRow>
      <SettingRow title={t("s.rules.global_cd")}><Num label={t("s.rules.global_cd")} value={r.global_cooldown_s} min={0} max={3600} onChange={(v) => set({ global_cooldown_s: v })} /></SettingRow>
      <SettingRow title={t("s.rules.max_dur")}><Num label={t("s.rules.max_dur")} value={Math.round(r.max_duration_s / 60)} min={1} max={120} onChange={(v) => set({ max_duration_s: v * 60 })} /></SettingRow>
      <SettingRow title={t("s.rules.explicit")}><Toggle checked={r.block_explicit} onChange={(v) => set({ block_explicit: v })} /></SettingRow>
      <SettingRow title={t("s.rules.duplicates")}><Toggle checked={r.allow_duplicates} onChange={(v) => set({ allow_duplicates: v })} /></SettingRow>
      <SettingRow title={t("s.rules.fair")} desc={t("s.rules.fair_hint")}><Toggle checked={r.fair_order} onChange={(v) => set({ fair_order: v })} /></SettingRow>
      <SettingRow title={t("s.rules.bypass")}><Toggle checked={r.privileged_bypass} onChange={(v) => set({ privileged_bypass: v })} /></SettingRow>
    </section>
  );
}

const CMDS = ["sr", "song", "queue", "remove", "skip", "voteskip"] as const;

function Commands({ draft, update }: { draft: Settings; update: Update }) {
  const c = draft.commands;
  const setCmd = (k: (typeof CMDS)[number], patch: Partial<CommandCfg>) => update((s) => ({ ...s, commands: { ...s.commands, [k]: { ...s.commands[k], ...patch } } }));
  const setReply = (k: keyof Replies, v: string) => update((s) => ({ ...s, commands: { ...s.commands, replies: { ...s.commands.replies, [k]: v } } }));
  return (
    <div className="col" style={{ gap: 20 }}>
      <section className="card card-pad">
        <SettingRow title={t("s.cmd.prefix")}>
          <input className="input" style={{ width: 70 }} maxLength={3} value={c.prefix} onChange={(e) => update((s) => ({ ...s, commands: { ...s.commands, prefix: e.target.value } }))} aria-label={t("s.cmd.prefix")} />
        </SettingRow>
        <SettingRow title={t("s.cmd.reply")}><Toggle checked={c.reply_in_chat} onChange={(v) => update((s) => ({ ...s, commands: { ...s.commands, reply_in_chat: v } }))} /></SettingRow>
        <SettingRow title={t("s.cmd.voteskip_needed")}><Num label={t("s.cmd.voteskip_needed")} value={c.voteskip_needed} min={1} max={100} onChange={(v) => update((s) => ({ ...s, commands: { ...s.commands, voteskip_needed: v } }))} /></SettingRow>
        <SettingRow title={t("s.cmd.interval")}><Num label={t("s.cmd.interval")} value={c.min_reply_interval_ms} min={500} max={10000} onChange={(v) => update((s) => ({ ...s, commands: { ...s.commands, min_reply_interval_ms: v } }))} /></SettingRow>
      </section>
      <section className="card">
        <div className="list">
          {CMDS.map((k) => {
            const cfg = c[k];
            return (
              <div key={k} className="item" style={{ gridTemplateColumns: "auto minmax(0,1fr)", alignItems: "start", padding: "14px 20px" }}>
                <Toggle checked={cfg.enabled} onChange={(v) => setCmd(k, { enabled: v })} />
                <div className="col" style={{ gap: 10 }}>
                  <div>
                    <b className="mono" style={{ fontSize: 14 }}>{c.prefix}{cfg.name}</b> <span className="muted small">– {t(`s.cmd.desc.${k}` as const)}</span>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
                    <Field label={t("s.cmd.name")}><input className="input" value={cfg.name} onChange={(e) => setCmd(k, { name: e.target.value.replace(/\s/g, "").toLowerCase() })} /></Field>
                    <Field label={t("s.cmd.aliases")}><input className="input" value={cfg.aliases.join(", ")} onChange={(e) => setCmd(k, { aliases: e.target.value.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean) })} /></Field>
                    <Field label={t("s.cmd.role")}><RoleSelect label={t("s.cmd.role")} value={cfg.min_role} onChange={(v) => setCmd(k, { min_role: v })} /></Field>
                    <Field label={t("s.cmd.cooldown")}><Num label={t("s.cmd.cooldown")} value={cfg.cooldown_s} min={0} max={3600} onChange={(v) => setCmd(k, { cooldown_s: v })} width={100} /></Field>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="card card-pad col" style={{ gap: 12 }}>
        <h2>{t("s.cmd.replies")}</h2>
        <p className="muted small">{t("s.cmd.replies_hint")}</p>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {(Object.keys(c.replies) as (keyof Replies)[]).map((k) => (
            <Field key={k} label={<span className="mono">{k}</span>}>
              <input className="input" value={c.replies[k]} maxLength={400} onChange={(e) => setReply(k, e.target.value)} />
            </Field>
          ))}
        </div>
      </section>
    </div>
  );
}

function Profiles({ snap }: { snap: AppSnapshot }) {
  const [name, setName] = useState("");
  const s = snap.settings;
  const run = (p: Promise<void>) => p.then(() => { toast(t("common.saved")); void refresh(); }, toastError);
  return (
    <section className="card card-pad col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 4 }}>
        <h2>{t("s.prof.title")}</h2>
        <p className="muted small">{t("s.prof.desc")}</p>
      </div>
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { run(api.profile("save", { name })); setName(""); } }}>
        <input className="input grow" style={{ minWidth: 200 }} placeholder={t("s.prof.name")} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("s.prof.name")} maxLength={40} />
        <button className="btn" type="submit" disabled={!name.trim()}><Save size={15} /> {t("s.prof.save_current")}</button>
      </form>
      {s.profiles.length === 0 ? (
        <p className="subtle">{t("s.prof.empty")}</p>
      ) : (
        <div className="list card" style={{ boxShadow: "none" }}>
          {s.profiles.map((p) => (
            <div className="item" key={p.id} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div className="row">
                <span className="t ellipsis">{p.name}</span>
                {s.active_profile === p.id && <span className="badge accent">{t("s.prof.active")}</span>}
              </div>
              <div className="actions">
                <button className="btn btn-sm" onClick={() => run(api.profile("apply", { id: p.id }))} disabled={s.active_profile === p.id}>{t("s.prof.apply")}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => run(api.profile("update", { id: p.id }))}>{t("s.prof.update")}</button>
                <button className="icon-btn sm" aria-label={t("common.remove")} title={t("common.remove")} onClick={() => run(api.profile("delete", { id: p.id }))}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Appearance({ draft, update }: { draft: Settings; update: Update }) {
  return (
    <section className="card card-pad">
      <SettingRow title={t("s.app.language")}>
        <Segmented label={t("s.app.language")} value={draft.language} onChange={(v) => update((s) => ({ ...s, language: v }))} options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} />
      </SettingRow>
      <SettingRow title={t("s.app.theme")}>
        <Segmented label={t("s.app.theme")} value={draft.theme} onChange={(v) => update((s) => ({ ...s, theme: v }))} options={[{ value: "dark", label: t("s.app.theme_dark") }, { value: "light", label: t("s.app.theme_light") }, { value: "system", label: t("s.app.theme_system") }]} />
      </SettingRow>
      <SettingRow title={t("s.app.motion")}><Toggle checked={draft.reduced_motion} onChange={(v) => update((s) => ({ ...s, reduced_motion: v }))} /></SettingRow>
      <SettingRow title={t("s.app.compact_top")}><Toggle checked={draft.compact_on_top} onChange={(v) => update((s) => ({ ...s, compact_on_top: v }))} /></SettingRow>
    </section>
  );
}

function SystemTab({ draft, update }: { draft: Settings; update: Update }) {
  const [auto, setAuto] = useState<{ supported: boolean; enabled: boolean; set(v: boolean): Promise<void> } | null>(null);
  useEffect(() => void autostart().then(setAuto, () => setAuto({ supported: false, enabled: false, set: async () => {} })), []);
  return (
    <section className="card card-pad">
      <SettingRow title={t("s.app.close")}>
        <Segmented label={t("s.app.close")} value={draft.close_behavior} onChange={(v) => update((s) => ({ ...s, close_behavior: v }))} options={[{ value: "ask", label: t("s.app.close_ask") }, { value: "tray", label: t("s.app.close_tray") }, { value: "quit", label: t("s.app.close_quit") }]} />
      </SettingRow>
      <SettingRow title={t("s.app.autostart")} desc={auto?.supported === false ? t("s.app.autostart_unsupported") : t("s.app.autostart_hint")}>
        <Toggle
          checked={!!auto?.enabled}
          disabled={!auto?.supported}
          onChange={async (v) => {
            if (!auto) return;
            try {
              await auto.set(v);
              setAuto({ ...auto, enabled: v });
            } catch (e) {
              toastError(e);
            }
          }}
        />
      </SettingRow>
    </section>
  );
}

function DataTab({ snap }: { snap: AppSnapshot }) {
  const [diag, setDiag] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  return (
    <div className="col" style={{ gap: 20 }}>
      <section className="card card-pad">
        <SettingRow title={t("s.data.export")} desc={t("s.data.export_hint")}>
          <button className="btn" onClick={async () => { try { if (await saveTextFile("onair-einstellungen.json", await api.exportSettings())) toast(t("common.saved")); } catch (e) { toastError(e); } }}><Download size={15} /> {t("s.data.export")}</button>
        </SettingRow>
        <SettingRow title={t("s.data.import")}>
          <button className="btn" onClick={async () => { try { const raw = await openTextFile(); if (raw) { await api.importSettings(raw); toast(t("s.saved_toast")); void refresh(); } } catch (e) { toastError(e); } }}><Upload size={15} /> {t("s.data.import")}</button>
        </SettingRow>
        <SettingRow title={t("s.data.diag")} desc={t("diag.hint")}>
          <button className="btn" onClick={() => setDiag(true)}><Stethoscope size={15} /> {t("s.data.diag_run")}</button>
          <button className="btn" onClick={async () => { try { setReport(JSON.stringify(await api.diagnosticsExport(), null, 2)); } catch (e) { toastError(e); } }}>{t("s.data.diag_export")}</button>
        </SettingRow>
        <SettingRow title={t("s.data.logs")}>
          <button className="btn" disabled={!isTauri} title={isTauri ? undefined : t("s.app.autostart_unsupported")} onClick={() => api.openLogsFolder().catch(toastError)}><FolderOpen size={15} /> {t("s.data.logs")}</button>
        </SettingRow>
      </section>
      <p className="subtle small">{t("s.data.version", { v: snap.app_version })}</p>
      {diag && <DiagnosticsDialog onClose={() => setDiag(false)} />}
      {report && (
        <Dialog
          title={t("s.data.diag_preview")}
          onClose={() => setReport(null)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setReport(null)}>{t("common.cancel")}</button>
              <button className="btn btn-primary" onClick={async () => { try { if (await saveTextFile("onair-diagnose.json", report)) { toast(t("common.saved")); setReport(null); } } catch (e) { toastError(e); } }}><Download size={15} /> {t("common.save")}</button>
            </>
          }
        >
          <p className="muted small">{t("s.data.diag_preview_hint")}</p>
          <pre className="mono" style={{ maxHeight: 420, overflow: "auto", background: "var(--surface-2)", padding: 12, borderRadius: 8, margin: 0 }}>{report}</pre>
        </Dialog>
      )}
    </div>
  );
}
