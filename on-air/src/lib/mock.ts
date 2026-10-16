// Beispiel-Backend für die Browser-Vorschau (npm run dev ohne Tauri).
// Wird nie im Desktop-Build verwendet und ist in der UI deutlich als Vorschau markiert.
// Zustände für Layout-Tests: ?state=offline|signedout|nodevice|ratelimit|reauth|onboarding|empty

import type { Backend } from "./api";
import type { Acceptance, Activity, AppSnapshot, Block, BlockEntry, PlanConfig, PlanStatus, Settings, SongRequest, Track, UpdateInfo } from "./types";

function cover(a: string, b: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="46" cy="18" r="9" fill="rgba(255,255,255,.18)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const T = (id: string, title: string, artists: string[], dur: number, c: [string, string], explicit = false): Track => ({
  provider: "spotify",
  id,
  uri: `spotify:track:${id}`,
  title,
  artists,
  album: "Beispielalbum",
  image_url: cover(...c),
  duration_ms: dur,
  explicit,
  external_url: null,
});

const TRACKS: Track[] = [
  T("s1", "Mitternachtslicht", ["Nordwind"], 214_000, ["#335C67", "#9EC5AB"]),
  T("s2", "Glass Harbour", ["Lena Holm", "The Quiet Rooms"], 245_000, ["#5B4B8A", "#D8A7CA"]),
  T("s3", "Ein sehr langer Songtitel, der in keine Zeile passt und trotzdem sauber gekürzt werden muss", ["Orchester der langen Namen"], 402_000, ["#7A4419", "#E3B23C"]),
  T("s4", "Low Tide", ["Kairo Beach"], 198_000, ["#1F4E5F", "#79A3B1"], true),
  T("s5", "Sonnenkabel", ["Frequenz 7"], 231_000, ["#2E3A1F", "#A3B18A"]),
  T("s6", "Paper Planes at Dawn", ["Mika Stern"], 187_000, ["#4A2C2A", "#C97B63"]),
];

function defaults(): Settings {
  const cmd = (name: string, min_role: Settings["commands"]["sr"]["min_role"], cooldown_s: number, aliases: string[] = []) => ({ enabled: true, name, aliases, min_role, cooldown_s });
  const style = (o: Partial<Settings["overlay"]["glass"]>) => ({
    font_family: "Inter, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
    font_scale: 1, text_color: "#F4F4F5", secondary_color: "#B4B7BD", accent_color: "#7FD6B5", background_color: "#101114",
    background_opacity: 0, radius: 14, width: 520, show_cover: true, show_progress: false, show_requester: true,
    hide_when_paused: false, animate: true, queue_count: 3, ...o,
  });
  return {
    language: "de", theme: "dark", reduced_motion: false, adaptive_colors: true, close_behavior: "ask", onboarding_done: true,
    spotify: { client_id: "beispiel-client-id", redirect_port: 43821, poll_playing_ms: 3000 },
    twitch: { client_id: "beispiel-twitch-id", enabled: true },
    requests: { open: true, chat_enabled: true, mode: "auto", min_role: "everyone", max_queue: 25, per_user_limit: 2, user_cooldown_s: 120, global_cooldown_s: 0, max_duration_s: 600, block_explicit: false, allow_duplicates: false, fair_order: true, privileged_bypass: true, handoff_ahead: 1 },
    commands: {
      prefix: "!", reply_in_chat: true,
      sr: cmd("sr", "everyone", 0, ["songrequest"]), song: cmd("song", "everyone", 10), queue: cmd("queue", "everyone", 15),
      remove: cmd("remove", "everyone", 0, ["wrongsong"]), skip: cmd("skip", "moderator", 3), voteskip: cmd("voteskip", "everyone", 0),
      voteskip_needed: 5, min_reply_interval_ms: 1200, custom: [],
      playlist: cmd("playlist", "everyone", 20, ["pl"]), playlist_fallback_url: "",
      replies: {
        accepted: "@{user} „{title}“ von {artist} ist auf Platz {position}.", pending_review: "@{user} „{title}“ wartet auf Freigabe.",
        pending_offline: "@{user} Request gespeichert – er wird geprüft, sobald Spotify wieder erreichbar ist.", rejected: "@{user} Request nicht angenommen: {reason}",
        not_found: "@{user} Dazu habe ich keinen Song gefunden.", closed: "@{user} Songrequests sind gerade geschlossen.", song: "Läuft gerade: {title} – {artist}",
        nothing_playing: "Gerade läuft nichts.", queue: "Als Nächstes: {list}", queue_empty: "Die Warteschlange ist leer.", removed: "@{user} „{title}“ wurde entfernt.",
        nothing_to_remove: "@{user} Du hast keinen offenen Request.", skipped: "Übersprungen.", voteskip_progress: "Skip-Abstimmung: {votes}/{needed}", no_permission: "",
        playlist: "@{user} Aktuelle Playlist „{name}“: {url}", playlist_link: "@{user} Aktuelle Playlist: {url}", playlist_album: "@{user} Gerade läuft das Album „{name}“: {url}",
        playlist_private: "@{user} Die aktuelle Playlist ist privat und kann nicht geteilt werden.", no_playlist: "@{user} Gerade läuft keine Playlist.", points_refund: " Deine Kanalpunkte werden erstattet.",
        choose_version: "@{user} Ich habe mehrere passende Versionen gefunden: {options}. Wähle mit !auswahl <Nummer> (oder !abbrechen).",
        choose_from_list: "@{user} „{name}“ (Seite {page}/{pages}): {options}. Wähle mit !auswahl <Nummer>, blättern mit !weiter / !zurueck, !abbrechen beendet.",
        choose_request: "@{user} Welchen Wunsch möchtest du ändern? {options}. Wähle mit !auswahl <Nummer>.",
        no_selection: "@{user} Du hast gerade keine offene Auswahl.", selection_invalid: "@{user} Bitte eine Nummer aus der Liste wählen (!auswahl 1).",
        selection_canceled: "@{user} Auswahl abgebrochen.", selection_expired: "@{user} Deine Auswahl ist abgelaufen – schick den Wunsch einfach nochmal.",
        selection_last_page: "@{user} Keine weiteren Titel.",
        replaced: "@{user} Dein Wunsch wurde geändert: „{title}“ von {artist}. Dein Platz in der Warteschlange bleibt erhalten.",
        replace_nothing: "@{user} Du hast keinen offenen Wunsch, den du ändern kannst.",
        replace_locked: "@{user} Dieser Wunsch wurde bereits an Spotify übergeben und kann hier nicht mehr ausgetauscht werden.",
        replace_same: "@{user} Das ist bereits dein Wunsch.", replace_failed: "@{user} Nicht geändert – dein bisheriger Wunsch bleibt: {reason}",
        last_songs: "Zuletzt gespielt: {list}", last_songs_empty: "In dieser Session wurde noch nichts anderes gespielt.",
        playlist_hint: " Lieber einen Song aus der Playlist? !sr {url}",
      },
      choose: cmd("auswahl", "everyone", 0, ["choose", "wahl", "pick"]), next_page: cmd("weiter", "everyone", 0, ["next"]),
      prev_page: cmd("zurueck", "everyone", 0, ["zurück", "back", "prev"]), cancel: cmd("abbrechen", "everyone", 0, ["cancel"]),
      replace: cmd("ersetzen", "everyone", 20, ["replace"]), last_songs: cmd("letztersong", "everyone", 30, ["lastsong", "letzter song", "last song"]),
      last_songs_global_cooldown_s: 10,
    },
    overlay: { port: 43822, stale_after_s: 20, minimal: style({}), glass: style({ background_opacity: 0.55, show_progress: true }), queue: style({ background_opacity: 0.7, width: 420, queue_count: 4 }), control_enabled: false },
    nowplaying_file: { enabled: false, path: "", template: "{artist} – {title}" },
    profiles: [], active_profile: null, hotkey_skip: "", compact_on_top: true,
    channel_points: { enabled: false, title: "Song wünschen", cost: 500, prompt: "Spotify-Link oder Titel und Interpret", global_cooldown_s: 0, max_per_stream: 0, max_per_user_per_stream: 0, mode: "auto", external_reward: null },
    updates: { check_on_start: true, auto_install: true },
    request_playlist: { enabled: false, name: "ON AIR – Songwünsche", public: false, include_app: false },
    sources: { youtube: true, apple_music: true, soundcloud: true, selection_timeout_s: 120, chat_page_size: 5, max_options: 3 },
  };
}

export function createMockBackend(): Backend {
  const scenario = new URLSearchParams(window.location.search).get("state") ?? "";
  const now = () => Date.now();
  const start = now();
  const settings = defaults();
  const creds = new Set<string>();
  if (scenario === "onboarding") {
    settings.onboarding_done = false;
    settings.spotify.client_id = "";
    settings.twitch.client_id = "";
  }
  const cpOn = ["cp", "cp-foreign", "plan", "overplanned", "full", "ended"].includes(scenario);
  settings.channel_points.enabled = cpOn;
  const red = (id: string, status: "unfulfilled" | "fulfilled" | "canceled" | "review" | "conflict" = "unfulfilled") => ({ reward_id: "rw-1", redemption_id: id, status, target: null, last_error: null });
  let reqN = 0;
  const mkReq = (track: Track, name: string, status: SongRequest["status"], extra: Partial<SongRequest> = {}): SongRequest => ({
    id: `r${++reqN}`, track, query: track.title, requester: { id: `twitch:${name}`, name, role: "everyone" }, source: "chat", source_event: null,
    received_at: now() - reqN * 60_000, status, pending_reason: null, reason: null, reason_text: null, position: reqN, priority: false,
    updated_at: now(), handoff_at: null, observed_at: null, finished_at: null, chat_message_id: null, redemption: null, ...extra,
  });
  let queue: SongRequest[] = scenario === "empty" ? [] : [
    mkReq(TRACKS[0], "nachteule_92", "playing"),
    mkReq(TRACKS[1], "Lumi", "handed_off"),
    mkReq(TRACKS[2], "sehr_langer_benutzername_der_umbricht", "accepted"),
    mkReq(TRACKS[3], "kalle", "accepted"),
    mkReq(TRACKS[4], "Mara", "pending_review", { pending_reason: "moderation" }),
    mkReq(TRACKS[5], "jonas", "uncertain", { reason: "not_in_spotify_queue" }),
  ];
  if (cpOn) {
    queue[2] = { ...queue[2], source: "channel_points", redemption: red("r-a") };
    queue[3] = { ...queue[3], source: "channel_points", redemption: red("r-b") };
  }
  if (scenario === "overplanned" || scenario === "full") {
    for (let i = 0; i < 5; i++) queue.push(mkReq(TRACKS[i], `viewer_${i + 7}`, "accepted"));
  }
  const planCfg: PlanConfig = {
    enabled: ["plan", "overplanned", "ended"].includes(scenario),
    end_at_ms: scenario === "ended" ? now() - 60_000 : now() + (scenario === "overplanned" ? 14 : 30) * 60_000,
    buffer_ms: 120_000,
  };
  let updatePhase: UpdateInfo["state"] = scenario === "autoupdate" ? { state: "ready", version: "0.2.1", notes: "- Beispiel-Neuerung für die Vorschau" } : scenario === "update" ? { state: "available", version: "0.2.1", notes: "- Beispiel-Neuerung für die Vorschau\n- Weitere Verbesserung", date: null } : { state: "not_configured" };
  const updateListeners = new Set<(u: UpdateInfo) => void>();
  let autoAt: number | null = scenario === "autoupdate" ? now() + 30_000 : null;
  let postponed = false;
  const updateInfo = (): UpdateInfo => ({
    current_version: "0.2.0", state: updatePhase, last_check_ms: scenario.includes("update") ? now() - 3_600_000 : null, endpoint: "(Vorschau)", configured: scenario.includes("update"), mode: scenario.includes("update") ? "checksum" : "off",
    auto: { enabled: settings.updates.auto_install, waiting: postponed ? "postponed" : updatePhase.state === "ready" && !autoAt ? "live" : null, install_at_ms: autoAt, postponed },
  });
  const setUpdate = (st: UpdateInfo["state"]) => {
    updatePhase = st;
    updateListeners.forEach((l) => l(updateInfo()));
  };
  let recent: SongRequest[] = [mkReq(TRACKS[5], "alex", "completed"), mkReq(TRACKS[3], "spam_bot", "rejected", { reason: "user_cooldown", reason_text: "bitte warte noch 40 s" })];
  if (cpOn) recent = [mkReq(TRACKS[1], "Kira", "completed", { source: "channel_points", reason: "not_observed", redemption: red("r-c", "review") }), mkReq(TRACKS[4], "Tom", "rejected", { source: "channel_points", redemption: red("r-d", "canceled") }), ...recent];
  let activity: Activity[] = [
    { id: 5, ts: now() - 20_000, level: "success", kind: "request.accepted", message: "Request angenommen: „Low Tide“ von Kairo Beach (für kalle)", params: null, corr: null },
    { id: 4, ts: now() - 95_000, level: "success", kind: "spotify.recovered", message: "Spotify-Verbindung wiederhergestellt", params: null, corr: null },
    { id: 3, ts: now() - 180_000, level: "warn", kind: "spotify.offline", message: "Spotify nicht erreichbar – automatische Prüfung läuft, Anmeldung bleibt erhalten", params: null, corr: null },
    { id: 2, ts: now() - 400_000, level: "success", kind: "twitch.connected", message: "Twitch-Chat verbunden (beispielkanal)", params: null, corr: null },
    { id: 1, ts: now() - 600_000, level: "info", kind: "requests.opened", message: "Requests geöffnet", params: null, corr: null },
  ];
  let blocks: BlockEntry[] = [];
  let isPlaying = scenario !== "paused";
  let progressBase = 72_000;
  let fetchedAt = now();
  const listeners = new Set<(s: AppSnapshot) => void>();

  const computePlan = (): PlanStatus => {
    const n = now();
    if (!planCfg.enabled || !planCfg.end_at_ms) return { active: false, end_at_ms: null, now_ms: n, remaining_ms: 0, current_remaining_ms: 0, planned_ms: 0, reserved_ms: 0, buffer_ms: 0, free_ms: 0, ended: false, exhausted: false, overplanned_ms: 0, uncertain: [], etas: [] };
    const cur = queue.find((r) => r.status === "playing")?.track ?? TRACKS[0];
    const prog = progressBase + (isPlaying ? n - fetchedAt : 0);
    const curRem = Math.max(0, cur.duration_ms - prog);
    const items = queue.filter((r) => r.status !== "playing");
    const planned = items.filter((r) => r.status !== "pending_review").reduce((a, r) => a + (r.track?.duration_ms ?? 0), 0);
    const reserved = items.filter((r) => r.status === "pending_review").reduce((a, r) => a + (r.track?.duration_ms ?? 0), 0);
    const remaining = planCfg.end_at_ms - n;
    const free = remaining - curRem - planned - reserved - planCfg.buffer_ms;
    let t0 = n + curRem;
    const etas = items.map((r) => {
      const start = t0;
      t0 += r.track?.duration_ms ?? 0;
      return { id: r.id, start_ms: start, fits: start + (r.track?.duration_ms ?? 0) <= planCfg.end_at_ms! - planCfg.buffer_ms };
    });
    return { active: true, end_at_ms: planCfg.end_at_ms, now_ms: n, remaining_ms: remaining, current_remaining_ms: curRem, planned_ms: planned, reserved_ms: reserved, buffer_ms: planCfg.buffer_ms, free_ms: free, ended: remaining <= 0, exhausted: remaining <= 0 || free < 60_000, overplanned_ms: free < 0 ? Math.min(-free, planned + reserved) : 0, uncertain: isPlaying ? [] : ["paused"], etas };
  };
  const computeAcceptance = (plan: PlanStatus): Acceptance => {
    const common: Block[] = [];
    if (!settings.requests.open) common.push({ code: "manual_pause" });
    const planBlocks: Block[] = !plan.active ? [] : plan.ended ? [{ code: "stream_ended" }] : plan.exhausted ? [{ code: "budget_exhausted", free_ms: Math.max(0, plan.free_ms) }] : [];
    const chat: Block[] = [...(settings.requests.chat_enabled ? [] : [{ code: "source_disabled" } as Block]), ...common, ...planBlocks];
    const cp: Block[] = [...(settings.channel_points.enabled ? [] : [{ code: "source_disabled" } as Block]), ...common, ...planBlocks];
    const onlyPlan = (b: Block[]) => b.length > 0 && b.every((x) => x.code === "stream_ended" || x.code === "budget_exhausted");
    return {
      chat: { configured: settings.requests.chat_enabled, open: chat.length === 0, blocks: chat },
      channel_points: { configured: settings.channel_points.enabled, open: cp.length === 0, blocks: cp },
      any_open: chat.length === 0 || cp.length === 0,
      paused_by_plan: (settings.requests.chat_enabled && onlyPlan(chat)) || (settings.channel_points.enabled && onlyPlan(cp)),
    };
  };

  const snapshot = (): AppSnapshot => {
    const signedIn = scenario !== "signedout" && scenario !== "onboarding" && scenario !== "reauth";
    const link: AppSnapshot["spotify"]["link"] =
      scenario === "offline" ? { state: "offline", since_ms: now() - 95_000, next_retry_ms: now() + 17_000 }
      : scenario === "ratelimit" ? { state: "rate_limited", until_ms: now() + 25_000 }
      : signedIn ? { state: "online" } : { state: "unknown" };
    const noDevice = scenario === "nodevice";
    const device = { id: "d1", name: "Streaming-PC", kind: "Computer", is_active: true, is_restricted: false, volume_percent: 64 };
    const current = queue.find((r) => r.status === "playing")?.track ?? TRACKS[0];
    const plan = computePlan();
    const acceptance = computeAcceptance(plan);
    const isAd = scenario === "ad";
    const isEpisode = scenario === "episode";
    return {
      app_version: "0.2.0 (Vorschau)",
      spotify: {
        auth: scenario === "reauth" ? { state: "reauth_required", reason: "invalid_grant: Refresh token revoked" } : signedIn ? { state: "signed_in", scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing", authorized_at_ms: now() - 12 * 86_400_000 } : { state: "signed_out" },
        link,
        device: noDevice ? { state: "no_active_device" } : signedIn ? { state: "active", device } : { state: "unknown" },
        playback: !signedIn ? { state: "unknown" } : noDevice ? { state: "idle", fetched_at_ms: now() } : {
          state: "active", is_playing: isPlaying, track: isAd || isEpisode ? null : current, item_type: isAd ? "ad" : isEpisode ? "episode" : "track",
          episode: isEpisode ? { title: "Folge 142: Warum wir Musik anders hören", show: "Beispiel-Podcast", image_url: cover("#3B2A5A", "#B9A7FF"), duration_ms: 2_640_000, external_url: null } : null,
          progress_ms: isEpisode ? 1_210_000 : progressBase, device, shuffle: false, repeat: "off",
          actions: { can_skip_next: true, can_skip_prev: true, can_pause: true, can_resume: true },
          fetched_at_ms: scenario === "offline" ? now() - 95_000 : fetchedAt,
        },
        last_ok_ms: now(),
        last_error: scenario === "offline" ? { code: "network", details: "Netzwerkfehler: Verbindung fehlgeschlagen: dns error", at_ms: now() } : scenario === "ratelimit" ? { code: "rate_limited", details: "Rate Limit – Pause 30000 ms", at_ms: now() } : null,
        breaker: scenario === "offline" ? "open" : "closed",
        seq: 1,
      },
      spotify_profile: signedIn ? { id: "beispiel", display_name: "Beispielkonto" } : null,
      spotify_redirect_uri: `http://127.0.0.1:${settings.spotify.redirect_port}/callback`,
      twitch: scenario === "onboarding" ? { auth: { state: "signed_out" }, link: { state: "disabled" }, identity: null, last_error: null, connected_since_ms: null }
        : { auth: { state: "signed_in", scope: "user:read:chat user:write:chat", authorized_at_ms: start }, link: scenario === "offline" ? { state: "reconnecting", attempt: 3, next_retry_ms: now() + 8000 } : { state: "connected" }, identity: { user_id: "1", login: "beispielkanal", scopes: [] }, last_error: null, connected_since_ms: start },
      twitch_device_code: null,
      queue,
      recent,
      activity,
      settings: structuredClone(settings),
      overlay: { port: settings.overlay.port, running: false, error: null, clients: 0 },
      session: { accepted: queue.filter((r) => r.status === "accepted").length, handed_off: 1, playing: 1, completed: 4, rejected: 2 },
      session_started_ms: start,
      server_time_ms: now(),
      acceptance,
      plan,
      plan_config: { ...planCfg },
      channel_points: {
        configured: settings.channel_points.enabled, scope_ok: true, reward_id: cpOn || settings.channel_points.enabled ? "rw-1" : null,
        desired_enabled: settings.channel_points.enabled, desired_paused: !acceptance.channel_points.open, confirmed_enabled: cpOn ? true : null,
        confirmed_paused: cpOn ? !acceptance.channel_points.open : null, in_sync: true, last_error: null, reconciled: true,
        open: queue.filter((r) => r.redemption).length, needs_review: recent.filter((r) => r.redemption?.status === "review").length,
        external: settings.channel_points.enabled && !!settings.channel_points.external_reward,
        last_redemption_ms: cpOn ? start - 4 * 60_000 : null,
        foreign_reward: scenario === "cp-foreign" && !settings.channel_points.external_reward ? { id: "rw-own", title: "Song Request", user: "Kira", at_ms: start - 60_000 } : null,
      },
      request_playlist: settings.request_playlist.enabled
        ? { enabled: true, scope_ok: scenario !== "rp-scope", playlists: [{ id: "pl1", url: "https://open.spotify.com/playlist/pl1", name: settings.request_playlist.name, count: 1287 }], total: 1287, pending: 0, last_added_ms: start - 3 * 60_000, last_error: null }
        : { enabled: false, scope_ok: true, playlists: [], total: 0, pending: 0, last_added_ms: null, last_error: null },
      update_pause: false,
      awaiting: [],
      providers: [
        { provider: "spotify", enabled: true, configured: true, tracks: "full", playlists: true, albums: true },
        { provider: "youtube", enabled: settings.sources.youtube, configured: creds.has("youtube"), tracks: creds.has("youtube") ? "full" : "basic", playlists: creds.has("youtube"), albums: false },
        { provider: "apple_music", enabled: settings.sources.apple_music, configured: creds.has("apple_music"), tracks: "full", playlists: creds.has("apple_music"), albums: true },
        { provider: "soundcloud", enabled: settings.sources.soundcloud, configured: creds.has("soundcloud"), tracks: creds.has("soundcloud") ? "full" : "basic", playlists: creds.has("soundcloud"), albums: false },
      ],
    };
  };
  const push = () => {
    const s = snapshot();
    listeners.forEach((l) => l(s));
  };
  const log = (message: string, level: Activity["level"] = "info") => {
    activity = [{ id: activity.length + 10, ts: now(), level, kind: "preview", message, params: null, corr: null }, ...activity].slice(0, 40);
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
    get_snapshot: () => snapshot(),
    spotify_login: async () => { await sleep(1200); throw { code: "login_failed", message: "Browser-Vorschau: keine echte Anmeldung möglich" }; },
    spotify_cancel_login: () => undefined,
    spotify_logout: () => undefined,
    twitch_login_start: () => { throw { code: "config", message: "Browser-Vorschau: keine echte Anmeldung möglich" }; },
    twitch_login_cancel: () => undefined,
    twitch_logout: () => undefined,
    transport: (a) => {
      if (a.action === "pause") isPlaying = false;
      if (a.action === "resume") isPlaying = true;
      if (a.action === "next") {
        const playing = queue.find((r) => r.status === "playing");
        if (playing) { recent = [{ ...playing, status: "completed" }, ...recent]; queue = queue.filter((r) => r !== playing); }
        const next = queue.find((r) => r.status === "handed_off");
        if (next) next.status = "playing";
        const acc = queue.find((r) => r.status === "accepted");
        if (acc) acc.status = "handed_off";
        progressBase = 0;
      }
      fetchedAt = now();
      log(`Vorschau: ${String(a.action)}`);
    },
    list_devices: () => [{ id: "d1", name: "Streaming-PC", kind: "Computer", is_active: true, is_restricted: false, volume_percent: 64 }, { id: "d2", name: "Handy", kind: "Smartphone", is_active: false, is_restricted: false, volume_percent: 40 }],
    transfer_playback: () => undefined,
    search: async (a) => { await sleep(300); const q = String(a.query).toLowerCase(); return TRACKS.filter((t) => `${t.title} ${t.artists.join(" ")}`.toLowerCase().includes(q)).concat(TRACKS).slice(0, 6); },
    resolve_input: async (a) => {
      await sleep(350);
      const input = String(a.input).trim();
      if (/^https?:\/\/(www\.)?deezer\./i.test(input)) return { kind: "failed", error: { code: "unsupported_content", what: "host:deezer.com" } };
      if (/playlist/i.test(input)) {
        const items = TRACKS.concat(TRACKS.map((t, i) => ({ ...t, id: `${t.id}b${i}` }))).map((t, i) => ({ provider: "spotify", id: t.id, url: null, title: t.title, artists: t.artists, uploader: null, duration_ms: t.duration_ms, isrc: null, image_url: t.image_url, available: i !== 4, spotify: t }));
        return { kind: "collection", collection: { ref: { provider: "spotify", kind: "playlist", id: "pl1" }, name: "Beispiel-Playlist", url: "https://open.spotify.com/playlist/pl1", image_url: null, total: 40 }, page: { items, cursor: null, next: "12", total: 40 } };
      }
      if (/youtu/i.test(input)) return { kind: "versions", origin: { provider: "youtube", url: input, title: "Glass Harbour (Live)", artists: [], duration_ms: null, isrc: null, method: "metadata" }, options: [TRACKS[1], { ...TRACKS[1], id: "s2l", title: "Glass Harbour - Live", duration_ms: 262_000 }] };
      const q = input.toLowerCase();
      const hit = TRACKS.find((t) => `${t.artists.join(" ")} ${t.title}`.toLowerCase().includes(q));
      return hit ? { kind: "track", track: hit, origin: { provider: null, url: null, title: null, artists: [], duration_ms: null, isrc: null, method: "search" } } : { kind: "versions", origin: { provider: null, url: null, title: null, artists: [], duration_ms: null, isrc: null, method: "search" }, options: TRACKS.slice(0, 3) };
    },
    collection_page: async (a) => {
      await sleep(300);
      const cur = Number(a.cursor ?? 0);
      const items = TRACKS.map((t, i) => ({ provider: "spotify", id: `${t.id}p${cur + i}`, url: null, title: `${t.title} ${cur + i + 1}`, artists: t.artists, uploader: null, duration_ms: t.duration_ms, isrc: null, image_url: t.image_url, available: true, spotify: { ...t, id: `${t.id}p${cur + i}` } }));
      return { collection: { ref: a.collection, name: "Beispiel-Playlist", url: "https://open.spotify.com/playlist/pl1", image_url: null, total: 40 }, page: { items, cursor: String(cur), next: cur + items.length < 40 ? String(cur + items.length) : null, total: 40 } };
    },
    match_item: async (a) => { await sleep(200); const it = a.item as { spotify?: Track }; return it.spotify ? { kind: "track", track: it.spotify, origin: { provider: "spotify", url: null, title: null, artists: [], duration_ms: null, isrc: null, method: "user_choice" } } : { kind: "failed", error: { code: "no_spotify_match" } }; },
    precheck: (a) => {
      const t = a.track as Track;
      const dup = queue.findIndex((r) => r.track?.id === t.id);
      const notices = dup >= 0 ? [{ code: "duplicate_position", text: `Bereits auf Platz ${dup + 1}` }] : [];
      if (t.duration_ms > settings.requests.max_duration_s * 1000) return { ok: false, blocking: { code: "too_long", text: `Maximal ${Math.ceil(settings.requests.max_duration_s / 60)} Minuten erlaubt` }, notices, moderation: false };
      if (!settings.requests.open) notices.push({ code: "closed", text: "Requests sind gerade pausiert (du kannst trotzdem hinzufügen)" });
      return { ok: true, blocking: null, notices, moderation: false };
    },
    replace_request: (a) => {
      const r = queue.find((x) => x.id === a.id);
      if (!r || !(r.status === "accepted" || r.status === "pending_review")) return { flow: "notice", notice: { code: "replace_locked" } };
      r.track = a.track as Track; r.rev = (r.rev ?? 0) + 1;
      log(`Wunsch ersetzt: „${r.track.title}“ – Platz bleibt erhalten`);
      return { flow: "replaced", request: r };
    },
    set_provider_credential: (a) => { if (a.value) creds.add(String(a.provider)); else creds.delete(String(a.provider)); },
    last_played: () => TRACKS.slice(1, 6).map((t, i) => ({ id: i, track: t, played_at: now() - (i + 1) * 200_000, requester_name: i === 1 ? "kira_live" : null })),
    add_request: (a) => { const r = mkReq(a.track as Track, "Du", "accepted"); queue = [...queue, r]; log(`Request angenommen: „${r.track!.title}“`, "success"); return { outcome: "accepted", request: r, position: queue.length }; },
    queue_action: (a) => {
      const r = queue.find((x) => x.id === a.id);
      if (!r) throw { code: "not_found", message: "nicht gefunden" };
      switch (a.action) {
        case "approve": r.status = "accepted"; r.pending_reason = null; break;
        case "reject": case "remove": queue = queue.filter((x) => x !== r); recent = [{ ...r, status: "rejected" }, ...recent]; break;
        case "prioritize": r.priority = true; break;
        case "unprioritize": r.priority = false; break;
        case "retry": r.status = "accepted"; r.reason = null; break;
        case "dismiss": queue = queue.filter((x) => x !== r); recent = [{ ...r, status: "completed" }, ...recent]; break;
        case "move": {
          const movable = queue.filter((x) => (x.status === "accepted" || x.status === "pending_review") && x.priority === r.priority && x !== r);
          const idx = Math.min(Number(a.index ?? 0), movable.length);
          const rest = queue.filter((x) => x !== r);
          const anchor = movable[idx];
          const at = anchor ? rest.indexOf(anchor) : rest.indexOf(movable[movable.length - 1]) + 1;
          rest.splice(at, 0, r);
          queue = rest;
          break;
        }
      }
    },
    set_requests_open: (a) => { settings.requests.open = Boolean(a.open); log(a.open ? "Requests geöffnet" : "Requests pausiert"); },
    update_settings: (a) => { Object.assign(settings, a.settings as Settings); return structuredClone(settings); },
    export_settings: () => JSON.stringify({ format: "onair.settings", version: 1, settings }, null, 2),
    import_settings: (a) => { const v = JSON.parse(String(a.raw)); Object.assign(settings, v.settings); return settings; },
    profile_action: (a) => {
      if (a.action === "save") settings.profiles.push({ id: `p${settings.profiles.length + 1}`, name: String(a.name), rules: structuredClone(settings.requests), overlay: structuredClone(settings.overlay) });
      if (a.action === "apply") settings.active_profile = String(a.id);
      if (a.action === "delete") settings.profiles = settings.profiles.filter((p) => p.id !== a.id);
    },
    blocklist_list: () => blocks,
    blocklist_add: (a) => { blocks = [{ kind: a.kind as BlockEntry["kind"], value: String(a.value), label: String(a.label), created_at: now() }, ...blocks]; },
    blocklist_remove: (a) => { blocks = blocks.filter((b) => !(b.kind === a.kind && b.value === a.value)); },
    history: (a) => TRACKS.filter((t) => `${t.title} ${t.artists.join(" ")}`.toLowerCase().includes(String(a.search ?? "").toLowerCase())).map((t, i) => ({ id: i, track: t, played_at: now() - i * 240_000, requester_name: i % 2 ? "Lumi" : null })),
    run_diagnostics: async () => { await sleep(700); return [
      { id: "spotify.config", status: "ok", code: "ok", detail: "http://127.0.0.1:43821/callback" },
      { id: "spotify.auth", status: "ok", code: "ok", detail: "12 Tage seit Anmeldung" },
      { id: "spotify.api", status: scenario === "offline" ? "warn" : "ok", code: scenario === "offline" ? "network" : "ok", detail: scenario === "offline" ? "dns error" : "" },
      { id: "spotify.device", status: scenario === "nodevice" ? "warn" : "ok", code: scenario === "nodevice" ? "no_active_device" : "ok", detail: "Streaming-PC" },
      { id: "spotify.search", status: "ok", code: "ok", detail: "" },
      { id: "spotify.queue", status: "ok", code: "ok", detail: "" },
      { id: "twitch.auth", status: "ok", code: "ok", detail: "beispielkanal" },
      { id: "twitch.chat", status: "ok", code: "ok", detail: "" },
      { id: "overlay.server", status: "error", code: "overlay_port", detail: "Vorschau: kein Overlay-Server" },
    ]; },
    diagnostics_export: () => ({ format: "onair.diagnostics", hinweis: "Vorschau – keine echten Daten" }),
    write_export_file: () => undefined,
    read_import_file: () => "",
    open_external: (a) => { window.open(String(a.url), "_blank", "noopener"); },
    open_logs_folder: () => undefined,
    get_control_token: () => "vorschau-token-0000000000000000",
    set_ui_visible: () => undefined,
    open_compact: () => { window.open(`${window.location.pathname}${window.location.search}#/compact`, "onair-compact", "width=380,height=560"); },
    close_action: () => undefined,
    quit_app: () => undefined,
    plan_set_end: (a) => { planCfg.enabled = true; planCfg.end_at_ms = Number(a.endAtMs); if (a.bufferMs != null) planCfg.buffer_ms = Number(a.bufferMs); log("Streamplanung gestartet"); },
    plan_extend: (a) => { planCfg.end_at_ms = Math.max(now(), planCfg.end_at_ms ?? now()) + Number(a.minutes) * 60_000; planCfg.enabled = true; },
    plan_set_buffer: (a) => { planCfg.buffer_ms = Number(a.bufferMs); },
    plan_stop: () => { planCfg.enabled = false; log("Streamplanung beendet"); },
    channel_points_resync: () => undefined,
    // Vorschau: Farben aus der Beispiel-URL ableiten (die Beispielcover sind Farbverläufe).
    cover_colors: (a) => {
      const hex = [...decodeURIComponent(String(a.url)).matchAll(/#([0-9a-fA-F]{6})/g)].map((m) => m[1]);
      const rgb = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number];
      const v = rgb(hex[1] ?? "6080C8");
      const av = rgb(hex[0] ?? "20304A");
      return { vibrant: v, average: av, muted: false };
    },
    redemption_decide: (a) => {
      const r = [...queue, ...recent].find((x) => x.id === a.id);
      if (r?.redemption) r.redemption = { ...r.redemption, status: a.fulfill ? "fulfilled" : "canceled" };
    },
    update_info: () => updateInfo(),
    update_check: async () => { setUpdate({ state: "checking" }); await sleep(700); setUpdate(scenario === "update" ? { state: "available", version: "0.2.1", notes: "- Beispiel-Neuerung für die Vorschau", date: null } : { state: "up_to_date", checked_at_ms: now() }); return updateInfo(); },
    update_download: () => {
      let received = 0;
      const total = 12_400_000;
      const id = setInterval(() => {
        received = Math.min(total, received + 1_300_000);
        setUpdate(received >= total ? { state: "ready", version: "0.2.1", notes: "- Beispiel-Neuerung für die Vorschau" } : { state: "downloading", version: "0.2.1", received, total });
        if (received >= total) clearInterval(id);
      }, 250);
    },
    update_preflight: () => ({ live: null, pending_requests: queue.length, open_redemptions: queue.filter((r) => r.redemption).length, plan_active: planCfg.enabled }),
    update_install: () => { throw { code: "error", message: "Vorschau: keine Installation möglich" }; },
    update_later: () => undefined,
    update_postpone: () => { autoAt = null; postponed = true; setUpdate(updatePhase); },
  };

  return {
    isPreview: true,
    async invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
      const h = handlers[cmd];
      if (!h) throw { code: "error", message: `Vorschau: ${cmd} nicht verfügbar` };
      const r = await h(args);
      setTimeout(push, 30);
      return r as T;
    },
    onSnapshot(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onCloseRequested() {
      return () => undefined;
    },
    onUpdate(cb) {
      updateListeners.add(cb);
      return () => updateListeners.delete(cb);
    },
  };
}
