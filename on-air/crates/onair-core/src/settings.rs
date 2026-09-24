//! Einstellungen und Stream-Profile. Enthalten keine Secrets und sind daher
//! gefahrlos exportierbar.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Everyone,
    Subscriber,
    Vip,
    Moderator,
    Broadcaster,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    /// Beim ersten Schließen nachfragen und erklären.
    Ask,
    Tray,
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcceptMode {
    Auto,
    Moderation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct RequestRules {
    /// `false` = manuell pausiert („Requests pausieren“). Überlagert alle Quellen.
    pub open: bool,
    /// Kostenlose Requests per Chatbefehl annehmen.
    pub chat_enabled: bool,
    pub mode: AcceptMode,
    pub min_role: Role,
    pub max_queue: u32,
    pub per_user_limit: u32,
    pub user_cooldown_s: u32,
    pub global_cooldown_s: u32,
    pub max_duration_s: u32,
    pub block_explicit: bool,
    pub allow_duplicates: bool,
    pub fair_order: bool,
    /// Moderatoren und Broadcaster umgehen Limits und Cooldowns.
    pub privileged_bypass: bool,
    /// Wie viele Requests gleichzeitig in Spotifys Queue liegen dürfen (1–5).
    pub handoff_ahead: u32,
}

impl Default for RequestRules {
    fn default() -> Self {
        Self {
            open: false,
            chat_enabled: true,
            mode: AcceptMode::Auto,
            min_role: Role::Everyone,
            max_queue: 25,
            per_user_limit: 2,
            user_cooldown_s: 120,
            global_cooldown_s: 0,
            max_duration_s: 600,
            block_explicit: false,
            allow_duplicates: false,
            fair_order: true,
            privileged_bypass: true,
            handoff_ahead: 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CommandCfg {
    pub enabled: bool,
    pub name: String,
    pub aliases: Vec<String>,
    pub min_role: Role,
    pub cooldown_s: u32,
}

impl CommandCfg {
    fn new(name: &str, min_role: Role, cooldown_s: u32) -> Self {
        Self { enabled: true, name: name.into(), aliases: vec![], min_role, cooldown_s }
    }
}

impl Default for CommandCfg {
    fn default() -> Self {
        Self::new("", Role::Everyone, 0)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Replies {
    pub accepted: String,
    pub pending_review: String,
    pub pending_offline: String,
    pub rejected: String,
    pub not_found: String,
    pub closed: String,
    pub song: String,
    pub nothing_playing: String,
    pub queue: String,
    pub queue_empty: String,
    pub removed: String,
    pub nothing_to_remove: String,
    pub skipped: String,
    pub voteskip_progress: String,
    pub no_permission: String,
}

impl Default for Replies {
    fn default() -> Self {
        Self {
            accepted: "@{user} „{title}“ von {artist} ist auf Platz {position}.".into(),
            pending_review: "@{user} „{title}“ wartet auf Freigabe.".into(),
            pending_offline: "@{user} Request gespeichert – er wird geprüft, sobald Spotify wieder erreichbar ist.".into(),
            rejected: "@{user} Request nicht angenommen: {reason}".into(),
            not_found: "@{user} Dazu habe ich keinen Song gefunden.".into(),
            closed: "@{user} Songrequests sind gerade geschlossen.".into(),
            song: "Läuft gerade: {title} – {artist}".into(),
            nothing_playing: "Gerade läuft nichts.".into(),
            queue: "Als Nächstes: {list}".into(),
            queue_empty: "Die Warteschlange ist leer.".into(),
            removed: "@{user} „{title}“ wurde entfernt.".into(),
            nothing_to_remove: "@{user} Du hast keinen offenen Request.".into(),
            skipped: "Übersprungen.".into(),
            voteskip_progress: "Skip-Abstimmung: {votes}/{needed}".into(),
            no_permission: "".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CommandSettings {
    pub prefix: String,
    pub reply_in_chat: bool,
    pub sr: CommandCfg,
    pub song: CommandCfg,
    pub queue: CommandCfg,
    pub remove: CommandCfg,
    pub skip: CommandCfg,
    pub voteskip: CommandCfg,
    pub voteskip_needed: u32,
    pub replies: Replies,
    /// Max. eine Chatnachricht pro Intervall (ms); darüber hinaus wird verworfen.
    pub min_reply_interval_ms: u64,
}

impl Default for CommandSettings {
    fn default() -> Self {
        Self {
            prefix: "!".into(),
            reply_in_chat: true,
            sr: CommandCfg { aliases: vec!["songrequest".into()], ..CommandCfg::new("sr", Role::Everyone, 0) },
            song: CommandCfg::new("song", Role::Everyone, 10),
            queue: CommandCfg::new("queue", Role::Everyone, 15),
            remove: CommandCfg { aliases: vec!["wrongsong".into()], ..CommandCfg::new("remove", Role::Everyone, 0) },
            skip: CommandCfg::new("skip", Role::Moderator, 3),
            voteskip: CommandCfg::new("voteskip", Role::Everyone, 0),
            voteskip_needed: 5,
            replies: Replies::default(),
            min_reply_interval_ms: 1_200,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WidgetStyle {
    pub font_family: String,
    pub font_scale: f32,
    pub text_color: String,
    pub secondary_color: String,
    pub accent_color: String,
    pub background_color: String,
    pub background_opacity: f32,
    pub radius: u32,
    pub width: u32,
    pub show_cover: bool,
    pub show_progress: bool,
    pub show_requester: bool,
    pub hide_when_paused: bool,
    pub animate: bool,
    pub queue_count: u32,
}

impl WidgetStyle {
    pub fn preset(name: &str) -> Self {
        let base = Self {
            font_family: "Inter, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif".into(),
            font_scale: 1.0,
            text_color: "#F4F4F5".into(),
            secondary_color: "#B4B7BD".into(),
            accent_color: "#7FD6B5".into(),
            background_color: "#101114".into(),
            background_opacity: 0.0,
            radius: 14,
            width: 520,
            show_cover: true,
            show_progress: false,
            show_requester: true,
            hide_when_paused: false,
            animate: true,
            queue_count: 3,
        };
        match name {
            "glass" => Self { background_opacity: 0.55, show_progress: true, ..base },
            "queue" => Self { background_opacity: 0.7, width: 420, queue_count: 4, ..base },
            _ => base,
        }
    }
}

impl Default for WidgetStyle {
    fn default() -> Self {
        Self::preset("minimal")
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct OverlaySettings {
    pub port: u16,
    /// Nach dieser Frist ohne bestätigte Daten blendet das Widget aus.
    pub stale_after_s: u32,
    pub minimal: WidgetStyle,
    pub glass: WidgetStyle,
    pub queue: WidgetStyle,
    /// Schreibende Steuer-Endpunkte (z. B. Stream Deck) – standardmäßig aus.
    pub control_enabled: bool,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            port: 43822,
            stale_after_s: 20,
            minimal: WidgetStyle::preset("minimal"),
            glass: WidgetStyle::preset("glass"),
            queue: WidgetStyle::preset("queue"),
            control_enabled: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct NowPlayingFile {
    pub enabled: bool,
    pub path: String,
    pub template: String,
}

impl Default for NowPlayingFile {
    fn default() -> Self {
        Self { enabled: false, path: String::new(), template: "{artist} – {title}".into() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpotifySettings {
    pub client_id: String,
    pub redirect_port: u16,
    pub poll_playing_ms: u64,
}

impl Default for SpotifySettings {
    fn default() -> Self {
        Self { client_id: String::new(), redirect_port: crate::spotify::DEFAULT_REDIRECT_PORT, poll_playing_ms: 3_000 }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct TwitchSettings {
    pub client_id: String,
    pub enabled: bool,
}

/// Songrequests über eine von ON AIR verwaltete Twitch-Kanalpunkte-Belohnung.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ChannelPointsSettings {
    pub enabled: bool,
    /// Titel der Belohnung (Twitch: max. 45 Zeichen, pro Kanal eindeutig).
    pub title: String,
    pub cost: u32,
    /// Beschreibung/Eingabehinweis (Twitch: max. 200 Zeichen).
    pub prompt: String,
    pub global_cooldown_s: u32,
    /// 0 = kein Limit.
    pub max_per_stream: u32,
    pub max_per_user_per_stream: u32,
    pub mode: AcceptMode,
}

impl Default for ChannelPointsSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            title: "Song wünschen".into(),
            cost: 500,
            prompt: "Spotify-Link oder Titel und Interpret eingeben".into(),
            global_cooldown_s: 0,
            max_per_stream: 0,
            max_per_user_per_stream: 0,
            mode: AcceptMode::Auto,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct UpdateSettings {
    /// Beim App-Start im Hintergrund nach Updates suchen (nie automatisch installieren).
    pub check_on_start: bool,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self { check_on_start: true }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub rules: RequestRules,
    pub overlay: OverlaySettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub language: String,
    pub theme: Theme,
    pub reduced_motion: bool,
    pub close_behavior: CloseBehavior,
    pub onboarding_done: bool,
    pub spotify: SpotifySettings,
    pub twitch: TwitchSettings,
    pub requests: RequestRules,
    pub commands: CommandSettings,
    pub overlay: OverlaySettings,
    pub nowplaying_file: NowPlayingFile,
    pub profiles: Vec<Profile>,
    pub active_profile: Option<String>,
    /// Optionaler globaler Hotkey für „Song überspringen“ (z. B. `Ctrl+Alt+N`); leer = aus.
    pub hotkey_skip: String,
    /// Kompaktfenster immer im Vordergrund.
    pub compact_on_top: bool,
    pub channel_points: ChannelPointsSettings,
    pub updates: UpdateSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "de".into(),
            theme: Theme::Dark,
            reduced_motion: false,
            close_behavior: CloseBehavior::Ask,
            onboarding_done: false,
            spotify: SpotifySettings::default(),
            twitch: TwitchSettings::default(),
            requests: RequestRules::default(),
            commands: CommandSettings::default(),
            overlay: OverlaySettings::default(),
            nowplaying_file: NowPlayingFile::default(),
            profiles: vec![],
            active_profile: None,
            hotkey_skip: String::new(),
            compact_on_top: true,
            channel_points: ChannelPointsSettings::default(),
            updates: UpdateSettings::default(),
        }
    }
}

impl Settings {
    pub const KEY: &'static str = "settings.v1";

    pub fn load(db: &crate::storage::Db) -> Self {
        db.get_setting(Self::KEY)
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, db: &crate::storage::Db) -> Result<(), String> {
        let raw = serde_json::to_string(self).map_err(|e| e.to_string())?;
        db.set_setting(Self::KEY, &raw)
    }

    /// Bereinigt ungültige Werte (z. B. aus importierten Dateien).
    pub fn sanitized(mut self) -> Self {
        let r = &mut self.requests;
        r.handoff_ahead = r.handoff_ahead.clamp(1, 5);
        r.max_queue = r.max_queue.clamp(1, 500);
        r.max_duration_s = r.max_duration_s.clamp(30, 7200);
        self.spotify.poll_playing_ms = self.spotify.poll_playing_ms.clamp(1_500, 30_000);
        self.overlay.stale_after_s = self.overlay.stale_after_s.clamp(5, 600);
        if self.overlay.port < 1024 {
            self.overlay.port = OverlaySettings::default().port;
        }
        self.commands.voteskip_needed = self.commands.voteskip_needed.max(1);
        self.commands.min_reply_interval_ms = self.commands.min_reply_interval_ms.max(500);
        let cp = &mut self.channel_points;
        cp.title = cp.title.trim().chars().take(45).collect();
        if cp.title.is_empty() {
            cp.title = ChannelPointsSettings::default().title;
        }
        cp.prompt = cp.prompt.trim().chars().take(200).collect();
        cp.cost = cp.cost.clamp(1, 1_000_000);
        cp.global_cooldown_s = cp.global_cooldown_s.min(7 * 86_400);
        if self.commands.prefix.trim().is_empty() {
            self.commands.prefix = "!".into();
        }
        self
    }
}

pub type SharedSettings = std::sync::Arc<std::sync::RwLock<Settings>>;

pub fn read(s: &SharedSettings) -> std::sync::RwLockReadGuard<'_, Settings> {
    s.read().unwrap_or_else(|p| p.into_inner())
}
