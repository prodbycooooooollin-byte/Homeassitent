pub mod auth;
pub mod commands;
pub mod eventsub;
pub mod helix;
pub mod rewards;
pub mod service;

/// Minimal nötige Scopes: Chat lesen (EventSub `channel.chat.message`) und schreiben.
pub const SCOPES: &[&str] = &["user:read:chat", "user:write:chat"];
/// Zusätzlich für Kanalpunkte: Belohnung anlegen/pausieren, Einlösungen lesen und abwickeln.
pub const CHANNEL_POINTS_SCOPE: &str = "channel:manage:redemptions";

/// Angeforderte Scopes; Kanalpunkte nur, wenn die Funktion genutzt wird.
pub fn scopes(with_channel_points: bool) -> String {
    let mut s: Vec<&str> = SCOPES.to_vec();
    if with_channel_points {
        s.push(CHANNEL_POINTS_SCOPE);
    }
    s.join(" ")
}
pub const ID_BASE: &str = "https://id.twitch.tv";
pub const HELIX_BASE: &str = "https://api.twitch.tv/helix";
pub const EVENTSUB_WS: &str = "wss://eventsub.wss.twitch.tv/ws";
