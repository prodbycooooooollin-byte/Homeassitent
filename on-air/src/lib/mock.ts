// Beispiel-Backend für die Browser-Vorschau (npm run dev ohne Tauri).
// Wird nie im Desktop-Build verwendet und ist in der UI deutlich als Vorschau markiert.
// Zustände für Layout-Tests: ?state=offline|signedout|nodevice|ratelimit|reauth|onboarding|empty

import type { Backend } from "./api";
import type { Activity, AppSnapshot, BlockEntry, Settings, SongRequest, Track } from "./types";

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
    language: "de", theme: "dark", reduced_motion: false, close_behavior: "ask", onboarding_done: true,
    spotify: { client_id: "beispiel-client-id", redirect_port: 43821, poll_playing_ms: 3000 },
    twitch: { client_id: "beispiel-twitch-id", enabled: true },
    requests: { open: true, mode: "auto", min_role: "everyone", max_queue: 25, per_user_limit: 2, user_cooldown_s: 120, global_cooldown_s: 0, max_duration_s: 600, block_explicit: false, allow_duplicates: false, fair_order: true, privileged_bypass: true, handoff_ahead: 1 },
    commands: {
      prefix: "!", reply_in_chat: true,
      sr: cmd("sr", "everyone", 0, ["songrequest"]), song: cmd("song", "everyone", 10), queue: cmd("queue", "everyone", 15),
      remove: cmd("remove", "everyone", 0, ["wrongsong"]), skip: cmd("skip", "moderator", 3), voteskip: cmd("voteskip", "everyone", 0),
      voteskip_needed: 5, min_reply_interval_ms: 1200,
      replies: {
        accepted: "@{user} „{title}“ von {artist} ist auf Platz {position}.", pending_review: "@{user} „{title}“ wartet auf Freigabe.",
        pending_offline: "@{user} Request gespeichert – er wird geprüft, sobald Spotify wieder erreichbar ist.", rejected: "@{user} Request nicht angenommen: {reason}",
        not_found: "@{user} Dazu habe ich keinen Song gefunden.", closed: "@{user} Songrequests sind gerade geschlossen.", song: "Läuft gerade: {title} – {artist}",
        nothing_playing: "Gerade läuft nichts.", queue: "Als Nächstes: {list}", queue_empty: "Die Warteschlange ist leer.", removed: "@{user} „{title}“ wurde entfernt.",
        nothing_to_remove: "@{user} Du hast keinen offenen Request.", skipped: "Übersprungen.", voteskip_progress: "Skip-Abstimmung: {votes}/{needed}", no_permission: "",
      },
    },
    overlay: { port: 43822, stale_after_s: 20, minimal: style({}), glass: style({ background_opacity: 0.55, show_progress: true }), queue: style({ background_opacity: 0.7, width: 420, queue_count: 4 }), control_enabled: false },
    nowplaying_file: { enabled: false, path: "", template: "{artist} – {title}" },
    profiles: [], active_profile: null, hotkey_skip: "", compact_on_top: true,
  };
}

export function createMockBackend(): Backend {
  const scenario = new URLSearchParams(window.location.search).get("state") ?? "";
  const now = () => Date.now();
  const start = now();
  const settings = defaults();
  if (scenario === "onboarding") {
    settings.onboarding_done = false;
    settings.spotify.client_id = "";
    settings.twitch.client_id = "";
  }
  let reqN = 0;
  const mkReq = (track: Track, name: string, status: SongRequest["status"], extra: Partial<SongRequest> = {}): SongRequest => ({
    id: `r${++reqN}`, track, query: track.title, requester: { id: `twitch:${name}`, name, role: "everyone" }, source: "chat", source_event: null,
    received_at: now() - reqN * 60_000, status, pending_reason: null, reason: null, reason_text: null, position: reqN, priority: false,
    updated_at: now(), handoff_at: null, observed_at: null, finished_at: null, chat_message_id: null, ...extra,
  });
  let queue: SongRequest[] = scenario === "empty" ? [] : [
    mkReq(TRACKS[0], "nachteule_92", "playing"),
    mkReq(TRACKS[1], "Lumi", "handed_off"),
    mkReq(TRACKS[2], "sehr_langer_benutzername_der_umbricht", "accepted"),
    mkReq(TRACKS[3], "kalle", "accepted"),
    mkReq(TRACKS[4], "Mara", "pending_review", { pending_reason: "moderation" }),
    mkReq(TRACKS[5], "jonas", "uncertain", { reason: "not_in_spotify_queue" }),
  ];
  let recent: SongRequest[] = [mkReq(TRACKS[5], "alex", "completed"), mkReq(TRACKS[3], "spam_bot", "rejected", { reason: "user_cooldown", reason_text: "bitte warte noch 40 s" })];
  let activity: Activity[] = [
    { id: 5, ts: now() - 20_000, level: "success", kind: "request.accepted", message: "Request angenommen: „Low Tide“ von Kairo Beach (für kalle)", params: null, corr: null },
    { id: 4, ts: now() - 95_000, level: "success", kind: "spotify.recovered", message: "Spotify-Verbindung wiederhergestellt", params: null, corr: null },
    { id: 3, ts: now() - 180_000, level: "warn", kind: "spotify.offline", message: "Spotify nicht erreichbar – automatische Prüfung läuft, Anmeldung bleibt erhalten", params: null, corr: null },
    { id: 2, ts: now() - 400_000, level: "success", kind: "twitch.connected", message: "Twitch-Chat verbunden (beispielkanal)", params: null, corr: null },
    { id: 1, ts: now() - 600_000, level: "info", kind: "requests.opened", message: "Requests geöffnet", params: null, corr: null },
  ];
  let blocks: BlockEntry[] = [];
  let isPlaying = true;
  let progressBase = 72_000;
  let fetchedAt = now();
  const listeners = new Set<(s: AppSnapshot) => void>();

  const snapshot = (): AppSnapshot => {
    const signedIn = scenario !== "signedout" && scenario !== "onboarding" && scenario !== "reauth";
    const link: AppSnapshot["spotify"]["link"] =
      scenario === "offline" ? { state: "offline", since_ms: now() - 95_000, next_retry_ms: now() + 17_000 }
      : scenario === "ratelimit" ? { state: "rate_limited", until_ms: now() + 25_000 }
      : signedIn ? { state: "online" } : { state: "unknown" };
    const noDevice = scenario === "nodevice";
    const device = { id: "d1", name: "Streaming-PC", kind: "Computer", is_active: true, is_restricted: false, volume_percent: 64 };
    const current = queue.find((r) => r.status === "playing")?.track ?? TRACKS[0];
    return {
      app_version: "0.1.0 (Vorschau)",
      spotify: {
        auth: scenario === "reauth" ? { state: "reauth_required", reason: "invalid_grant: Refresh token revoked" } : signedIn ? { state: "signed_in", scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing", authorized_at_ms: now() - 12 * 86_400_000 } : { state: "signed_out" },
        link,
        device: noDevice ? { state: "no_active_device" } : signedIn ? { state: "active", device } : { state: "unknown" },
        playback: !signedIn ? { state: "unknown" } : noDevice ? { state: "idle", fetched_at_ms: now() } : {
          state: "active", is_playing: isPlaying, track: current, item_type: "track", progress_ms: progressBase, device, shuffle: false, repeat: "off",
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
  };
}
