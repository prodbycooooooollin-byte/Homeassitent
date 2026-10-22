use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Spotify,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Track {
    pub provider: Provider,
    pub id: String,
    pub uri: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub image_url: Option<String>,
    pub duration_ms: u64,
    pub explicit: bool,
    /// Link zur Provider-Seite (Attribution gemäß Provider-Vorgaben).
    pub external_url: Option<String>,
}

impl Track {
    pub fn artist_line(&self) -> String {
        self.artists.join(", ")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Device {
    /// Geräte-IDs sind nicht dauerhaft stabil und werden bei Bedarf neu ermittelt.
    pub id: Option<String>,
    pub name: String,
    pub kind: String,
    pub is_active: bool,
    pub is_restricted: bool,
    pub volume_percent: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Actions {
    pub can_skip_next: bool,
    pub can_skip_prev: bool,
    pub can_pause: bool,
    pub can_resume: bool,
}

/// Podcast-Episode (Spotify liefert dafür kein Track-Objekt).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EpisodeInfo {
    pub title: String,
    pub show: Option<String>,
    pub image_url: Option<String>,
    pub duration_ms: u64,
    pub external_url: Option<String>,
}

/// Bestätigter Wiedergabezustand aus einer Spotify-Antwort.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Playback {
    pub is_playing: bool,
    pub track: Option<Track>,
    /// Nur bei `item_type == "episode"`.
    #[serde(default)]
    pub episode: Option<EpisodeInfo>,
    /// z. B. „ad“, „episode“, „unknown“, wenn kein Track-Objekt geliefert wird.
    pub item_type: Option<String>,
    pub progress_ms: u64,
    pub device: Option<Device>,
    pub shuffle: bool,
    pub repeat: String,
    pub actions: Actions,
    /// Zeitpunkt der bestätigten Antwort (lokale Wanduhr) – Grundlage der Interpolation.
    pub fetched_at_ms: i64,
    /// Wiedergabekontext (Playlist, Album, Künstler), falls Spotify ihn liefert.
    #[serde(default)]
    pub context: Option<PlaybackContext>,
}

/// Woraus gerade gespielt wird – z. B. für den Chatbefehl `!playlist`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlaybackContext {
    /// `playlist` | `album` | `artist` | `show` | …
    pub kind: String,
    pub uri: String,
    pub url: Option<String>,
}

impl PlaybackContext {
    /// Öffentlicher Link; aus der URI abgeleitet, falls Spotify keinen liefert.
    pub fn link(&self) -> Option<String> {
        if let Some(u) = self.url.as_ref().filter(|u| u.starts_with("https://open.spotify.com/")) {
            return Some(u.clone());
        }
        let mut parts = self.uri.split(':');
        match (parts.next(), parts.next(), parts.next()) {
            (Some("spotify"), Some(kind), Some(id)) if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric()) => {
                Some(format!("https://open.spotify.com/{kind}/{id}"))
            }
            _ => None,
        }
    }

    /// Spotify-ID aus der URI (nur alphanumerisch).
    pub fn id(&self) -> Option<&str> {
        self.uri.rsplit(':').next().filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric()))
    }
}

/// Anzeigezustand der Wiedergabe. „Nichts läuft“ ist ein legitimer Zustand, kein Logout.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum PlaybackView {
    /// Noch keine bestätigte Antwort.
    Unknown,
    /// Angemeldet, aber kein aktives Gerät bzw. keine Wiedergabesitzung (HTTP 204).
    Idle { fetched_at_ms: i64 },
    Active(Playback),
}
