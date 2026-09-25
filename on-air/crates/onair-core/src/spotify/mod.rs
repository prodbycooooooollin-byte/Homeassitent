pub mod auth;
pub mod client;
pub mod parse;
pub mod service;

pub use client::SpotifyClient;

/// Scopes: nur, was die Kernfunktionen benötigen.
pub const SCOPES: &[&str] = &[
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
];

pub const DEFAULT_REDIRECT_PORT: u16 = 43821;
pub const REDIRECT_PATH: &str = "/callback";

/// Spotify verlangt für Loopback-Redirects die explizite IP (kein `localhost`).
pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}{REDIRECT_PATH}")
}

/// Extrahiert eine Track-ID aus `https://open.spotify.com/(intl-xx/)track/<id>?…`
/// oder `spotify:track:<id>`.
pub fn parse_track_link(input: &str) -> Option<String> {
    let s = input.trim();
    let id = if let Some(rest) = s.strip_prefix("spotify:track:") {
        rest.to_string()
    } else {
        let u = url::Url::parse(s).ok()?;
        if u.host_str()? != "open.spotify.com" {
            return None;
        }
        let segs: Vec<_> = u.path_segments()?.filter(|p| !p.is_empty()).collect();
        let pos = segs.iter().position(|p| *p == "track")?;
        segs.get(pos + 1)?.to_string()
    };
    if id.len() == 22 && id.chars().all(|c| c.is_ascii_alphanumeric()) {
        Some(id)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_links() {
        let id = "4uLU6hMCjMI75M1A2tKUQC";
        assert_eq!(parse_track_link(&format!("https://open.spotify.com/track/{id}?si=abc")).as_deref(), Some(id));
        assert_eq!(parse_track_link(&format!("https://open.spotify.com/intl-de/track/{id}")).as_deref(), Some(id));
        assert_eq!(parse_track_link(&format!("spotify:track:{id}")).as_deref(), Some(id));
        assert_eq!(parse_track_link("https://evil.example/track/4uLU6hMCjMI75M1A2tKUQC"), None);
        assert_eq!(parse_track_link("https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC"), None);
        assert_eq!(parse_track_link("never gonna give you up"), None);
    }
}
