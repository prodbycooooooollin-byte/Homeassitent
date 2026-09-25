// Spiegel der serialisierten Rust-Typen (onair-core). Keine Secrets.

export type Role = "everyone" | "subscriber" | "vip" | "moderator" | "broadcaster";

export interface Track {
  provider: "spotify";
  id: string;
  uri: string;
  title: string;
  artists: string[];
  album: string | null;
  image_url: string | null;
  duration_ms: number;
  explicit: boolean;
  external_url: string | null;
}

export interface Device {
  id: string | null;
  name: string;
  kind: string;
  is_active: boolean;
  is_restricted: boolean;
  volume_percent: number | null;
}

export interface EpisodeInfo {
  title: string;
  show: string | null;
  image_url: string | null;
  duration_ms: number;
  external_url: string | null;
}

export interface Playback {
  is_playing: boolean;
  track: Track | null;
  episode?: EpisodeInfo | null;
  item_type: string | null;
  progress_ms: number;
  device: Device | null;
  shuffle: boolean;
  repeat: string;
  actions: { can_skip_next: boolean; can_skip_prev: boolean; can_pause: boolean; can_resume: boolean };
  fetched_at_ms: number;
}

export type PlaybackView =
  | { state: "unknown" }
  | { state: "idle"; fetched_at_ms: number }
  | ({ state: "active" } & Playback);

export type AuthStatus =
  | { state: "signed_out" }
  | { state: "signed_in"; scope: string; authorized_at_ms: number }
  | { state: "reauth_required"; reason: string };

export type LinkState =
  | { state: "unknown" }
  | { state: "online" }
  | { state: "degraded"; failures: number; next_retry_ms: number }
  | { state: "offline"; since_ms: number; next_retry_ms: number }
  | { state: "rate_limited"; until_ms: number }
  | { state: "quota_exhausted"; until_ms: number }
  | { state: "blocked"; code: string };

export type DeviceState = { state: "unknown" } | { state: "no_active_device" } | { state: "active"; device: Device };

export interface ErrorInfo {
  code: string;
  details: string;
  at_ms: number;
}

export interface SpotifyState {
  auth: AuthStatus;
  link: LinkState;
  device: DeviceState;
  playback: PlaybackView;
  last_ok_ms: number | null;
  last_error: ErrorInfo | null;
  breaker: "closed" | "open" | "half_open";
  seq: number;
}

export type TwitchLink =
  | { state: "disabled" }
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "reconnecting"; attempt: number; next_retry_ms: number }
  | { state: "blocked"; code: string };

export interface TwitchState {
  auth: AuthStatus;
  link: TwitchLink;
  identity: { user_id: string; login: string; scopes: string[] } | null;
  last_error: ErrorInfo | null;
  connected_since_ms: number | null;
}

export type RequestStatus =
  | "received"
  | "pending_review"
  | "accepted"
  | "handing_off"
  | "handed_off"
  | "playing"
  | "completed"
  | "rejected"
  | "failed"
  | "uncertain";

export interface SongRequest {
  id: string;
  track: Track | null;
  query: string;
  requester: { id: string; name: string; role: Role };
  source: "chat" | "app" | "channel_points";
  source_event: string | null;
  received_at: number;
  status: RequestStatus;
  pending_reason: "moderation" | "offline" | null;
  reason: string | null;
  reason_text: string | null;
  position: number;
  priority: boolean;
  updated_at: number;
  handoff_at: number | null;
  observed_at: number | null;
  finished_at: number | null;
  chat_message_id: string | null;
  redemption: Redemption | null;
}

export type RedemptionStatus = "unfulfilled" | "fulfilled" | "canceled" | "review" | "conflict";

export interface Redemption {
  reward_id: string;
  redemption_id: string;
  status: RedemptionStatus;
  target: RedemptionStatus | null;
  last_error: string | null;
}

export interface Activity {
  id: number;
  ts: number;
  level: "info" | "success" | "warn" | "error";
  kind: string;
  message: string;
  params: Record<string, unknown> | null;
  corr: string | null;
}

export interface CommandCfg {
  enabled: boolean;
  name: string;
  aliases: string[];
  min_role: Role;
  cooldown_s: number;
}

export interface WidgetStyle {
  font_family: string;
  font_scale: number;
  text_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  background_opacity: number;
  radius: number;
  width: number;
  show_cover: boolean;
  show_progress: boolean;
  show_requester: boolean;
  hide_when_paused: boolean;
  animate: boolean;
  queue_count: number;
}

export interface RequestRules {
  open: boolean;
  chat_enabled: boolean;
  mode: "auto" | "moderation";
  min_role: Role;
  max_queue: number;
  per_user_limit: number;
  user_cooldown_s: number;
  global_cooldown_s: number;
  max_duration_s: number;
  block_explicit: boolean;
  allow_duplicates: boolean;
  fair_order: boolean;
  privileged_bypass: boolean;
  handoff_ahead: number;
}

export interface OverlaySettings {
  port: number;
  stale_after_s: number;
  minimal: WidgetStyle;
  glass: WidgetStyle;
  queue: WidgetStyle;
  control_enabled: boolean;
}

export interface Profile {
  id: string;
  name: string;
  rules: RequestRules;
  overlay: OverlaySettings;
}

export interface Replies {
  accepted: string;
  pending_review: string;
  pending_offline: string;
  rejected: string;
  not_found: string;
  closed: string;
  song: string;
  nothing_playing: string;
  queue: string;
  queue_empty: string;
  removed: string;
  nothing_to_remove: string;
  skipped: string;
  voteskip_progress: string;
  no_permission: string;
}

export interface Settings {
  language: "de" | "en";
  theme: "dark" | "light" | "system";
  reduced_motion: boolean;
  close_behavior: "ask" | "tray" | "quit";
  onboarding_done: boolean;
  spotify: { client_id: string; redirect_port: number; poll_playing_ms: number };
  twitch: { client_id: string; enabled: boolean };
  requests: RequestRules;
  commands: {
    prefix: string;
    reply_in_chat: boolean;
    sr: CommandCfg;
    song: CommandCfg;
    queue: CommandCfg;
    remove: CommandCfg;
    skip: CommandCfg;
    voteskip: CommandCfg;
    voteskip_needed: number;
    replies: Replies;
    min_reply_interval_ms: number;
  };
  overlay: OverlaySettings;
  nowplaying_file: { enabled: boolean; path: string; template: string };
  profiles: Profile[];
  active_profile: string | null;
  hotkey_skip: string;
  compact_on_top: boolean;
  channel_points: ChannelPointsSettings;
  updates: { check_on_start: boolean; auto_install: boolean };
}

export interface ChannelPointsSettings {
  enabled: boolean;
  title: string;
  cost: number;
  prompt: string;
  global_cooldown_s: number;
  max_per_stream: number;
  max_per_user_per_stream: number;
  mode: "auto" | "moderation";
}

export type Block =
  | { code: "manual_pause" }
  | { code: "source_disabled" }
  | { code: "stream_ended" }
  | { code: "budget_exhausted"; free_ms: number }
  | { code: "plan_uncertain"; reasons: string[] }
  | { code: "update_pause" }
  | { code: "reconciling" }
  | { code: "technical"; detail: string };

export interface SourceGate {
  configured: boolean;
  open: boolean;
  blocks: Block[];
}

export interface Acceptance {
  chat: SourceGate;
  channel_points: SourceGate;
  any_open: boolean;
  paused_by_plan: boolean;
}

export interface PlanConfig {
  enabled: boolean;
  end_at_ms: number | null;
  buffer_ms: number;
}

export interface PlanStatus {
  active: boolean;
  end_at_ms: number | null;
  now_ms: number;
  remaining_ms: number;
  current_remaining_ms: number;
  planned_ms: number;
  reserved_ms: number;
  buffer_ms: number;
  free_ms: number;
  ended: boolean;
  exhausted: boolean;
  overplanned_ms: number;
  uncertain: string[];
  etas: { id: string; start_ms: number | null; fits: boolean | null }[];
}

export interface ChannelPointsStatus {
  configured: boolean;
  scope_ok: boolean;
  reward_id: string | null;
  desired_enabled: boolean;
  desired_paused: boolean;
  confirmed_enabled: boolean | null;
  confirmed_paused: boolean | null;
  in_sync: boolean;
  last_error: ErrorInfo | null;
  reconciled: boolean;
  open: number;
  needs_review: number;
}

export type UpdateState =
  | { state: "not_configured" }
  | { state: "unchecked" }
  | { state: "checking" }
  | { state: "up_to_date"; checked_at_ms: number }
  | { state: "available"; version: string; notes: string | null; date: string | null }
  | { state: "downloading"; version: string; received: number; total: number | null }
  | { state: "ready"; version: string; notes: string | null }
  | { state: "installing"; version: string }
  | { state: "failed"; stage: "check" | "download" | "install"; code: string; message: string; version: string | null };

export interface UpdateInfo {
  current_version: string;
  state: UpdateState;
  last_check_ms: number | null;
  endpoint: string;
  configured: boolean;
  /** signature = eigener Signaturschlüssel, checksum = HTTPS + Herkunft + SHA-256, off = Entwicklungsbuild */
  mode: "signature" | "checksum" | "off";
  auto: AutoUpdateStatus;
}

export type AutoWait = "disabled" | "postponed" | "live" | "plan" | "handoff" | "playing" | "recently_playing";

export interface AutoUpdateStatus {
  enabled: boolean;
  waiting: AutoWait | null;
  /** Countdown bis zur automatischen Installation läuft. */
  install_at_ms: number | null;
  postponed: boolean;
}

export interface UpdatePreflight {
  live: boolean | null;
  pending_requests: number;
  open_redemptions: number;
  plan_active: boolean;
}

export interface DeviceCode {
  user_code: string;
  verification_uri: string;
  expires_in_s: number;
  interval_s: number;
}

export interface AppSnapshot {
  app_version: string;
  spotify: SpotifyState;
  spotify_profile: { id: string; display_name: string | null } | null;
  spotify_redirect_uri: string;
  twitch: TwitchState;
  twitch_device_code: DeviceCode | null;
  queue: SongRequest[];
  recent: SongRequest[];
  activity: Activity[];
  settings: Settings;
  overlay: { port: number; running: boolean; error: string | null; clients: number };
  session: Record<string, number>;
  session_started_ms: number;
  server_time_ms: number;
  acceptance: Acceptance;
  plan: PlanStatus;
  plan_config: PlanConfig;
  channel_points: ChannelPointsStatus;
  update_pause: boolean;
}

export interface Check {
  id: string;
  status: "ok" | "warn" | "error" | "skipped";
  code: string;
  detail: string;
}

export interface BlockEntry {
  kind: "user" | "track" | "artist";
  value: string;
  label: string;
  created_at: number;
}

export interface HistoryEntry {
  id: number;
  track: Track;
  played_at: number;
  requester_name: string | null;
}

export type SubmitOutcome =
  | { outcome: "accepted"; request: SongRequest; position: number }
  | { outcome: "pending_review"; request: SongRequest }
  | { outcome: "pending_offline"; request: SongRequest }
  | { outcome: "rejected"; code: string; text: string; request: SongRequest | null }
  | { outcome: "duplicate" };

export interface CmdError {
  code: string;
  message: string;
}
