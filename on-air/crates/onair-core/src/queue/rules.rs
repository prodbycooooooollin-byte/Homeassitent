//! Request-Regeln: Rollen, Sperrlisten, Explicit-Filter, Länge, Limits, Cooldowns.

use crate::model::Track;
use crate::settings::{RequestRules, Role};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum Rejection {
    Closed,
    RoleTooLow { needed: Role },
    UserBlocked,
    TrackBlocked,
    ArtistBlocked { artist: String },
    Explicit,
    TooLong { max_s: u32 },
    QueueFull { max: u32 },
    UserLimit { limit: u32 },
    UserCooldown { remaining_s: u32 },
    GlobalCooldown { remaining_s: u32 },
    Duplicate,
    NotFound,
    InvalidLink,
    NotPlayable,
}

impl Rejection {
    pub fn code(&self) -> &'static str {
        match self {
            Rejection::Closed => "closed",
            Rejection::RoleTooLow { .. } => "role_too_low",
            Rejection::UserBlocked => "user_blocked",
            Rejection::TrackBlocked => "track_blocked",
            Rejection::ArtistBlocked { .. } => "artist_blocked",
            Rejection::Explicit => "explicit",
            Rejection::TooLong { .. } => "too_long",
            Rejection::QueueFull { .. } => "queue_full",
            Rejection::UserLimit { .. } => "user_limit",
            Rejection::UserCooldown { .. } => "user_cooldown",
            Rejection::GlobalCooldown { .. } => "global_cooldown",
            Rejection::Duplicate => "duplicate",
            Rejection::NotFound => "not_found",
            Rejection::InvalidLink => "invalid_link",
            Rejection::NotPlayable => "not_playable",
        }
    }

    /// Kurzer deutscher Text für Chatantworten.
    pub fn text(&self) -> String {
        match self {
            Rejection::Closed => "Requests sind geschlossen".into(),
            Rejection::RoleTooLow { .. } => "dafür fehlt dir die Berechtigung".into(),
            Rejection::UserBlocked => "du kannst gerade keine Songs wünschen".into(),
            Rejection::TrackBlocked => "dieser Song ist gesperrt".into(),
            Rejection::ArtistBlocked { artist } => format!("{artist} ist gesperrt"),
            Rejection::Explicit => "explizite Songs sind deaktiviert".into(),
            Rejection::TooLong { max_s } => format!("maximal {}:{:02} Minuten", max_s / 60, max_s % 60),
            Rejection::QueueFull { .. } => "die Warteschlange ist voll".into(),
            Rejection::UserLimit { limit } => format!("du hast schon {limit} offene Requests"),
            Rejection::UserCooldown { remaining_s } => format!("bitte warte noch {remaining_s} s"),
            Rejection::GlobalCooldown { remaining_s } => format!("nächster Request in {remaining_s} s möglich"),
            Rejection::Duplicate => "der Song ist schon in der Warteschlange".into(),
            Rejection::NotFound => "kein passender Song gefunden".into(),
            Rejection::InvalidLink => "nur Spotify-Track-Links oder Suchbegriffe".into(),
            Rejection::NotPlayable => "dieser Song kann nicht abgespielt werden".into(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Blocklist {
    pub users: Vec<String>,
    pub tracks: Vec<String>,
    pub artists: Vec<String>,
}

/// Kennzahlen aus der Datenbank, die für die Prüfung gebraucht werden.
#[derive(Debug, Clone, Default)]
pub struct QueueStats {
    pub pending_total: u32,
    pub pending_for_user: u32,
    pub last_by_user_ms: Option<i64>,
    pub last_global_ms: Option<i64>,
    pub track_pending: bool,
}

/// Regeln, die unabhängig vom konkreten Track gelten (vor der Suche prüfbar).
pub fn check_requester(
    rules: &RequestRules,
    block: &Blocklist,
    requester_id: &str,
    requester_name: &str,
    role: crate::settings::Role,
    stats: &QueueStats,
    now_ms: i64,
) -> Result<(), Rejection> {
    let privileged = rules.privileged_bypass && role >= Role::Moderator;
    if !rules.open && role != Role::Broadcaster {
        return Err(Rejection::Closed);
    }
    if role < rules.min_role {
        return Err(Rejection::RoleTooLow { needed: rules.min_role });
    }
    let lname = requester_name.to_lowercase();
    if block.users.iter().any(|u| u == requester_id || u.to_lowercase() == lname) {
        return Err(Rejection::UserBlocked);
    }
    if privileged {
        return Ok(());
    }
    if stats.pending_total >= rules.max_queue {
        return Err(Rejection::QueueFull { max: rules.max_queue });
    }
    if rules.per_user_limit > 0 && stats.pending_for_user >= rules.per_user_limit {
        return Err(Rejection::UserLimit { limit: rules.per_user_limit });
    }
    if let Some(last) = stats.last_by_user_ms {
        let rem = rules.user_cooldown_s as i64 * 1000 - (now_ms - last);
        if rem > 0 {
            return Err(Rejection::UserCooldown { remaining_s: ((rem + 999) / 1000) as u32 });
        }
    }
    if let Some(last) = stats.last_global_ms {
        let rem = rules.global_cooldown_s as i64 * 1000 - (now_ms - last);
        if rem > 0 {
            return Err(Rejection::GlobalCooldown { remaining_s: ((rem + 999) / 1000) as u32 });
        }
    }
    Ok(())
}

/// Inhaltliche Regeln für einen konkreten Track.
pub fn check_track(rules: &RequestRules, block: &Blocklist, track: &Track, role: Role, stats: &QueueStats) -> Result<(), Rejection> {
    let privileged = rules.privileged_bypass && role >= Role::Moderator;
    if block.tracks.iter().any(|t| t == &track.id || t == &track.uri) {
        return Err(Rejection::TrackBlocked);
    }
    for a in &track.artists {
        let la = a.to_lowercase();
        if block.artists.iter().any(|b| b.to_lowercase() == la) {
            return Err(Rejection::ArtistBlocked { artist: a.clone() });
        }
    }
    if rules.block_explicit && track.explicit {
        return Err(Rejection::Explicit);
    }
    if privileged {
        return Ok(());
    }
    if track.duration_ms > rules.max_duration_s as u64 * 1000 {
        return Err(Rejection::TooLong { max_s: rules.max_duration_s });
    }
    if !rules.allow_duplicates && stats.track_pending {
        return Err(Rejection::Duplicate);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Provider;

    fn track(explicit: bool, dur_s: u64) -> Track {
        Track {
            provider: Provider::Spotify,
            id: "abc".into(),
            uri: "spotify:track:abc".into(),
            title: "T".into(),
            artists: vec!["Band".into()],
            album: None,
            image_url: None,
            duration_ms: dur_s * 1000,
            explicit,
            external_url: None,
        }
    }

    fn open_rules() -> RequestRules {
        RequestRules { open: true, ..Default::default() }
    }

    #[test]
    fn closed_blocks_viewers_not_broadcaster() {
        let r = RequestRules::default();
        let s = QueueStats::default();
        assert_eq!(check_requester(&r, &Blocklist::default(), "1", "a", Role::Everyone, &s, 0), Err(Rejection::Closed));
        assert!(check_requester(&r, &Blocklist::default(), "1", "a", Role::Broadcaster, &s, 0).is_ok());
    }

    #[test]
    fn cooldown_and_limits() {
        let r = RequestRules { user_cooldown_s: 60, per_user_limit: 1, ..open_rules() };
        let s = QueueStats { last_by_user_ms: Some(10_000), ..Default::default() };
        assert_eq!(
            check_requester(&r, &Blocklist::default(), "1", "a", Role::Everyone, &s, 40_000),
            Err(Rejection::UserCooldown { remaining_s: 30 })
        );
        let s = QueueStats { pending_for_user: 1, ..Default::default() };
        assert_eq!(
            check_requester(&r, &Blocklist::default(), "1", "a", Role::Everyone, &s, 0),
            Err(Rejection::UserLimit { limit: 1 })
        );
        assert!(check_requester(&r, &Blocklist::default(), "1", "a", Role::Moderator, &s, 0).is_ok());
    }

    #[test]
    fn content_rules() {
        let r = RequestRules { block_explicit: true, max_duration_s: 300, ..open_rules() };
        let b = Blocklist { artists: vec!["band".into()], ..Default::default() };
        let s = QueueStats::default();
        assert!(matches!(check_track(&r, &b, &track(false, 100), Role::Everyone, &s), Err(Rejection::ArtistBlocked { .. })));
        let b = Blocklist::default();
        assert_eq!(check_track(&r, &b, &track(true, 100), Role::Everyone, &s), Err(Rejection::Explicit));
        assert_eq!(check_track(&r, &b, &track(false, 400), Role::Everyone, &s), Err(Rejection::TooLong { max_s: 300 }));
        let dup = QueueStats { track_pending: true, ..Default::default() };
        assert_eq!(check_track(&r, &b, &track(false, 100), Role::Everyone, &dup), Err(Rejection::Duplicate));
        let r2 = RequestRules { allow_duplicates: true, ..r };
        assert!(check_track(&r2, &b, &track(false, 100), Role::Everyone, &dup).is_ok());
    }
}
