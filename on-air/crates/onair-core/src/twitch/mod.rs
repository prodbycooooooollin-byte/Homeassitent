pub mod auth;
pub mod commands;
pub mod eventsub;
pub mod helix;
pub mod service;

/// Minimal nötige Scopes: Chat lesen (EventSub `channel.chat.message`) und schreiben.
pub const SCOPES: &[&str] = &["user:read:chat", "user:write:chat"];
pub const ID_BASE: &str = "https://id.twitch.tv";
pub const HELIX_BASE: &str = "https://api.twitch.tv/helix";
pub const EVENTSUB_WS: &str = "wss://eventsub.wss.twitch.tv/ws";
