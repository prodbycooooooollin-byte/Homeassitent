//! Eigene, dauerhaft gespeicherte Request-Warteschlange.
//!
//! Die lokale Queue bestimmt ausstehende Requests; Spotify bestimmt den tatsächlich
//! beobachteten Wiedergabezustand. Beide werden abgeglichen, nie gleichgesetzt.

pub mod rules;
pub mod service;
pub mod store;

use crate::model::Track;
use crate::settings::Role;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    /// Eingegangen, noch nicht geprüft (nur kurzzeitig; nach Absturz neu geprüft).
    Received,
    /// Prüfung ausstehend: Moderation oder Spotify gerade nicht erreichbar.
    PendingReview,
    /// Angenommen, wartet auf Übergabe an Spotify.
    Accepted,
    /// Übergabe läuft (vor dem Senden gespeichert – Write-Ahead).
    HandingOff,
    /// Spotify hat die Übergabe bestätigt.
    HandedOff,
    /// Wiedergabe beobachtet.
    Playing,
    Completed,
    Rejected,
    Failed,
    /// Ausgang einer Übergabe unklar – Abgleich oder Entscheidung nötig.
    Uncertain,
}

impl RequestStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Received => "received",
            Self::PendingReview => "pending_review",
            Self::Accepted => "accepted",
            Self::HandingOff => "handing_off",
            Self::HandedOff => "handed_off",
            Self::Playing => "playing",
            Self::Completed => "completed",
            Self::Rejected => "rejected",
            Self::Failed => "failed",
            Self::Uncertain => "uncertain",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "received" => Self::Received,
            "pending_review" => Self::PendingReview,
            "accepted" => Self::Accepted,
            "handing_off" => Self::HandingOff,
            "handed_off" => Self::HandedOff,
            "playing" => Self::Playing,
            "completed" => Self::Completed,
            "rejected" => Self::Rejected,
            "uncertain" => Self::Uncertain,
            _ => Self::Failed,
        }
    }

    /// Noch nicht gespielt – zählt für Limits und die Warteschlange.
    pub fn is_pending(self) -> bool {
        matches!(
            self,
            Self::Received | Self::PendingReview | Self::Accepted | Self::HandingOff | Self::HandedOff | Self::Uncertain
        )
    }

    /// Lokal umsortierbar (noch nicht an Spotify übergeben).
    pub fn is_movable(self) -> bool {
        matches!(self, Self::PendingReview | Self::Accepted)
    }

    pub fn is_final(self) -> bool {
        matches!(self, Self::Completed | Self::Rejected | Self::Failed)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PendingReason {
    Moderation,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Chat,
    App,
    ChannelPoints,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Source::Chat => "chat",
            Source::App => "app",
            Source::ChannelPoints => "channel_points",
        }
    }
    pub fn parse(s: &str) -> Self {
        match s {
            "chat" => Source::Chat,
            "channel_points" => Source::ChannelPoints,
            _ => Source::App,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Requester {
    pub id: String,
    pub name: String,
    pub role: Role,
}

impl Requester {
    pub fn streamer() -> Self {
        Self { id: "local:streamer".into(), name: "Du".into(), role: Role::Broadcaster }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SongRequest {
    pub id: String,
    pub track: Option<Track>,
    pub query: String,
    pub requester: Requester,
    pub source: Source,
    pub source_event: Option<String>,
    pub received_at: i64,
    pub status: RequestStatus,
    pub pending_reason: Option<PendingReason>,
    /// Ablehnungs-/Fehlergrund als Code (UI lokalisiert), z. B. `user_cooldown`.
    pub reason: Option<String>,
    pub reason_text: Option<String>,
    pub position: f64,
    pub priority: bool,
    pub updated_at: i64,
    pub handoff_at: Option<i64>,
    pub observed_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub chat_message_id: Option<String>,
    /// Nur bei Kanalpunkte-Requests.
    pub redemption: Option<Redemption>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RedemptionStatus {
    /// Auf Twitch offen – Punkte noch nicht verbucht/erstattet.
    Unfulfilled,
    /// Auf Twitch als erfüllt bestätigt.
    Fulfilled,
    /// Auf Twitch storniert (Punkte erstattet) – bestätigt.
    Canceled,
    /// Zuordnung unklar – Entscheidung nötig.
    Review,
    /// Twitch-Zustand widerspricht dem lokalen (z. B. extern storniert, Song schon übergeben).
    Conflict,
}

impl RedemptionStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unfulfilled => "unfulfilled",
            Self::Fulfilled => "fulfilled",
            Self::Canceled => "canceled",
            Self::Review => "review",
            Self::Conflict => "conflict",
        }
    }
    pub fn parse(s: &str) -> Self {
        match s {
            "fulfilled" => Self::Fulfilled,
            "canceled" => Self::Canceled,
            "review" => Self::Review,
            "conflict" => Self::Conflict,
            _ => Self::Unfulfilled,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Redemption {
    pub reward_id: String,
    pub redemption_id: String,
    pub status: RedemptionStatus,
    /// Vom Nutzer gewählte Abwicklung (bei Prüfung), noch nicht bestätigt.
    pub target: Option<RedemptionStatus>,
    pub last_error: Option<String>,
}

/// Ergebnis einer Request-Einreichung (Grundlage der Chatantwort).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum SubmitOutcome {
    Accepted { request: SongRequest, position: usize },
    PendingReview { request: SongRequest },
    PendingOffline { request: SongRequest },
    Rejected { code: String, text: String, request: Option<SongRequest> },
    /// Dieselbe Event-ID wurde bereits verarbeitet – keine zweite Antwort.
    Duplicate,
}
