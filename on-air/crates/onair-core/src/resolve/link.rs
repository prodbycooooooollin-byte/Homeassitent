//! Erkennt Musiklinks der unterstützten Anbieter – rein lokal, ohne Netzzugriff.
//!
//! Sicherheitsgrundsatz: ON AIR ruft nie eine vom Nutzer angegebene URL direkt ab. Aus
//! einem erkannten Link werden nur Kennungen (IDs, Pfade) übernommen; abgefragt werden
//! ausschließlich fest eingetragene Anbieter-Endpunkte. Einzige Ausnahme sind Kurzlinks
//! bekannter Anbieter-Hosts, deren Weiterleitungsziel erneut hier geprüft wird.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceProvider {
    Spotify,
    Youtube,
    AppleMusic,
    Soundcloud,
}

impl SourceProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Spotify => "spotify",
            Self::Youtube => "youtube",
            Self::AppleMusic => "apple_music",
            Self::Soundcloud => "soundcloud",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Spotify => "Spotify",
            Self::Youtube => "YouTube",
            Self::AppleMusic => "Apple Music",
            Self::Soundcloud => "SoundCloud",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "spotify" => Self::Spotify,
            "youtube" => Self::Youtube,
            "apple_music" => Self::AppleMusic,
            "soundcloud" => Self::Soundcloud,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CollectionKind {
    Playlist,
    Album,
}

/// Eine Titelsammlung (Playlist oder Album), aus der ein einzelner Song gewählt wird.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectionRef {
    pub provider: SourceProvider,
    pub kind: CollectionKind,
    pub id: String,
    /// Apple Music: Storefront (Ländercode) des Links.
    #[serde(default)]
    pub storefront: Option<String>,
    /// SoundCloud: kanonischer Pfad (`/nutzer/sets/name`).
    #[serde(default)]
    pub path: Option<String>,
}

impl CollectionRef {
    /// Öffentlicher Link (für Anzeige und Chat).
    pub fn url(&self) -> String {
        match (self.provider, self.kind) {
            (SourceProvider::Spotify, CollectionKind::Playlist) => format!("https://open.spotify.com/playlist/{}", self.id),
            (SourceProvider::Spotify, CollectionKind::Album) => format!("https://open.spotify.com/album/{}", self.id),
            (SourceProvider::Youtube, _) => format!("https://www.youtube.com/playlist?list={}", self.id),
            (SourceProvider::AppleMusic, CollectionKind::Album) => {
                format!("https://music.apple.com/{}/album/{}", self.storefront.as_deref().unwrap_or("us"), self.id)
            }
            (SourceProvider::AppleMusic, CollectionKind::Playlist) => {
                format!("https://music.apple.com/{}/playlist/{}", self.storefront.as_deref().unwrap_or("us"), self.id)
            }
            (SourceProvider::Soundcloud, _) => format!("https://soundcloud.com{}", self.path.as_deref().unwrap_or("")),
        }
    }
}

/// Einzelner Titel beim Quellanbieter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrackRef {
    Spotify { id: String },
    Youtube { video: String },
    AppleMusic { storefront: String, id: String },
    /// Kanonischer Pfad `/nutzer/titel` (ggf. mit geheimem Freigabe-Token `/s-…`).
    Soundcloud { path: String },
}

impl TrackRef {
    pub fn provider(&self) -> SourceProvider {
        match self {
            Self::Spotify { .. } => SourceProvider::Spotify,
            Self::Youtube { .. } => SourceProvider::Youtube,
            Self::AppleMusic { .. } => SourceProvider::AppleMusic,
            Self::Soundcloud { .. } => SourceProvider::Soundcloud,
        }
    }
    pub fn url(&self) -> String {
        match self {
            Self::Spotify { id } => format!("https://open.spotify.com/track/{id}"),
            Self::Youtube { video } => format!("https://www.youtube.com/watch?v={video}"),
            Self::AppleMusic { storefront, id } => format!("https://music.apple.com/{storefront}/song/{id}"),
            Self::Soundcloud { path } => format!("https://soundcloud.com{path}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Input {
    /// Freitext („Künstler – Titel“).
    Text(String),
    Track(TrackRef),
    /// Einzeltitel mit zugehöriger Playlist (z. B. YouTube `watch?v=…&list=…`): standardmäßig
    /// wird der Titel aufgelöst, die Playlist-Auswahl wird zusätzlich angeboten.
    TrackInCollection(TrackRef, CollectionRef),
    Collection(CollectionRef),
    /// Kurzlink eines bekannten Anbieters – Ziel muss erst ermittelt werden.
    ShortLink { provider: SourceProvider, url: String },
    /// Erkannter Anbieter, aber Inhaltstyp nicht unterstützt (Künstlerseite, Podcast …).
    Unsupported { provider: Option<SourceProvider>, what: String },
}

fn is_id(s: &str, min: usize, max: usize, extra: &[char]) -> bool {
    (min..=max).contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphanumeric() || extra.contains(&c))
}

fn spotify_id(s: &str) -> bool {
    s.len() == 22 && s.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Findet die erste URL bzw. Spotify-URI in einer Eingabe (Links dürfen von Text umgeben sein).
fn find_link(input: &str) -> Option<&str> {
    input
        .split_whitespace()
        .map(|t| t.trim_matches(|c| matches!(c, '<' | '>' | '(' | ')' | '"' | '\'' | ',')))
        .find(|t| {
            let l = t.to_ascii_lowercase();
            l.starts_with("http://") || l.starts_with("https://") || l.starts_with("spotify:")
        })
}

/// Hostname ohne `www.`/`m.` in Kleinbuchstaben.
fn norm_host(h: &str) -> String {
    let h = h.to_ascii_lowercase();
    let h = h.strip_prefix("www.").unwrap_or(&h);
    h.strip_prefix("m.").unwrap_or(h).to_string()
}

pub fn parse(input: &str) -> Input {
    let raw = input.trim();
    let Some(link) = find_link(raw) else {
        return Input::Text(raw.chars().take(200).collect());
    };
    if let Some(rest) = link.strip_prefix("spotify:") {
        let parts: Vec<&str> = rest.split(':').collect();
        return match parts.as_slice() {
            ["track", id] if spotify_id(id) => Input::Track(TrackRef::Spotify { id: id.to_string() }),
            ["album", id] if spotify_id(id) => Input::Collection(CollectionRef { provider: SourceProvider::Spotify, kind: CollectionKind::Album, id: id.to_string(), storefront: None, path: None }),
            ["playlist", id] | ["user", _, "playlist", id] if spotify_id(id) => {
                Input::Collection(CollectionRef { provider: SourceProvider::Spotify, kind: CollectionKind::Playlist, id: id.to_string(), storefront: None, path: None })
            }
            [kind, ..] => Input::Unsupported { provider: Some(SourceProvider::Spotify), what: kind.to_string() },
            _ => Input::Unsupported { provider: Some(SourceProvider::Spotify), what: "link".into() },
        };
    }
    let Ok(u) = url::Url::parse(link) else {
        return Input::Unsupported { provider: None, what: "link".into() };
    };
    // Nur Web-Links ohne Zugangsdaten und ohne abweichenden Port.
    if !matches!(u.scheme(), "http" | "https") || !u.username().is_empty() || u.password().is_some() || u.port().is_some() {
        return Input::Unsupported { provider: None, what: "link".into() };
    }
    let Some(host) = u.host_str() else { return Input::Unsupported { provider: None, what: "link".into() } };
    let host = norm_host(host);
    parse_url(&host, &u)
}

/// Prüft ein Weiterleitungsziel eines Kurzlinks erneut gegen die Anbieterliste.
pub fn parse_redirect_target(target: &str) -> Input {
    match url::Url::parse(target) {
        Ok(u) if u.scheme() == "https" || u.scheme() == "http" => parse(target),
        _ => Input::Unsupported { provider: None, what: "link".into() },
    }
}

/// Ist der Host ein bekannter Kurzlink-Dienst? (Nur diese werden direkt abgerufen.)
pub fn short_link_provider(host: &str) -> Option<SourceProvider> {
    match norm_host(host).as_str() {
        "spotify.link" | "spoti.fi" => Some(SourceProvider::Spotify),
        "on.soundcloud.com" | "soundcloud.app.goo.gl" => Some(SourceProvider::Soundcloud),
        _ => None,
    }
}

fn parse_url(host: &str, u: &url::Url) -> Input {
    let segs: Vec<&str> = u.path_segments().map(|s| s.filter(|p| !p.is_empty()).collect()).unwrap_or_default();
    let query = |k: &str| u.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.to_string());
    if let Some(p) = short_link_provider(host) {
        return Input::ShortLink { provider: p, url: format!("https://{host}{}", u.path()) };
    }
    match host {
        "open.spotify.com" | "play.spotify.com" => {
            // `/intl-de/track/…`, `/embed/track/…`, `/user/x/playlist/…`
            let segs: Vec<&str> = segs.into_iter().filter(|s| !s.starts_with("intl-") && *s != "embed").collect();
            let pos = segs.iter().position(|s| matches!(*s, "track" | "album" | "playlist" | "episode" | "show" | "artist" | "user" | "collection"));
            let (kind, id) = match pos {
                Some(p) if segs[p] == "user" => match segs.get(p + 2) {
                    Some(&"playlist") => ("playlist", segs.get(p + 3).copied()),
                    _ => ("user", None),
                },
                Some(p) => (segs[p], segs.get(p + 1).copied()),
                None => ("link", None),
            };
            match (kind, id) {
                ("track", Some(id)) if spotify_id(id) => Input::Track(TrackRef::Spotify { id: id.into() }),
                ("album", Some(id)) if spotify_id(id) => Input::Collection(CollectionRef { provider: SourceProvider::Spotify, kind: CollectionKind::Album, id: id.into(), storefront: None, path: None }),
                ("playlist", Some(id)) if spotify_id(id) => Input::Collection(CollectionRef { provider: SourceProvider::Spotify, kind: CollectionKind::Playlist, id: id.into(), storefront: None, path: None }),
                (k, _) => Input::Unsupported { provider: Some(SourceProvider::Spotify), what: k.into() },
            }
        }
        "youtube.com" | "music.youtube.com" | "youtube-nocookie.com" | "youtu.be" => {
            let video_ok = |v: &str| is_id(v, 11, 11, &['-', '_']);
            // Automatisch erzeugte Mixe (RD…), „Später ansehen“ und Likes sind nicht auslesbar.
            let list = query("list").filter(|l| is_id(l, 2, 64, &['-', '_']));
            let readable_list = list.clone().filter(|l| !l.starts_with("RD") && l != "WL" && l != "LL" && l != "LM");
            let video = if host == "youtu.be" {
                segs.first().map(|s| s.to_string())
            } else {
                match segs.first().copied() {
                    Some("watch") => query("v"),
                    Some("shorts" | "live" | "embed" | "v") => segs.get(1).map(|s| s.to_string()),
                    _ => None,
                }
            }
            .filter(|v| video_ok(v));
            let coll = |id: String| CollectionRef { provider: SourceProvider::Youtube, kind: CollectionKind::Playlist, id, storefront: None, path: None };
            match (video, segs.first().copied()) {
                (Some(v), _) => match readable_list {
                    Some(l) => Input::TrackInCollection(TrackRef::Youtube { video: v }, coll(l)),
                    None => Input::Track(TrackRef::Youtube { video: v }),
                },
                (None, Some("playlist")) => match (readable_list, list) {
                    (Some(l), _) => Input::Collection(coll(l)),
                    (None, Some(_)) => Input::Unsupported { provider: Some(SourceProvider::Youtube), what: "mix".into() },
                    _ => Input::Unsupported { provider: Some(SourceProvider::Youtube), what: "link".into() },
                },
                (None, Some(s)) if s.starts_with('@') || matches!(s, "channel" | "c" | "user") => {
                    Input::Unsupported { provider: Some(SourceProvider::Youtube), what: "channel".into() }
                }
                _ => Input::Unsupported { provider: Some(SourceProvider::Youtube), what: "link".into() },
            }
        }
        "music.apple.com" | "geo.music.apple.com" | "itunes.apple.com" => {
            // /{storefront}/{album|song|playlist}/{slug?}/{id}
            let (sf, rest) = match segs.first() {
                Some(s) if s.len() == 2 && s.chars().all(|c| c.is_ascii_alphabetic()) => (s.to_ascii_lowercase(), &segs[1..]),
                _ => ("us".to_string(), &segs[..]),
            };
            let kind = rest.first().copied().unwrap_or("");
            let id = rest.last().copied().unwrap_or("");
            // iTunes-Links tragen die ID als `id123…`.
            let num = id.strip_prefix("id").unwrap_or(id);
            let song_param = query("i").filter(|i| is_id(i, 1, 20, &[]) && i.chars().all(|c| c.is_ascii_digit()));
            match kind {
                "album" if num.chars().all(|c| c.is_ascii_digit()) && !num.is_empty() => match song_param {
                    // Albumlink mit ausgewähltem Song (`?i=`) meint genau diesen Song.
                    Some(i) => Input::Track(TrackRef::AppleMusic { storefront: sf, id: i }),
                    None => Input::Collection(CollectionRef { provider: SourceProvider::AppleMusic, kind: CollectionKind::Album, id: num.into(), storefront: Some(sf), path: None }),
                },
                "song" if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) => Input::Track(TrackRef::AppleMusic { storefront: sf, id: num.into() }),
                "playlist" if id.starts_with("pl.") && is_id(&id[3..], 1, 64, &['-', '_']) => {
                    Input::Collection(CollectionRef { provider: SourceProvider::AppleMusic, kind: CollectionKind::Playlist, id: id.into(), storefront: Some(sf), path: None })
                }
                "" => Input::Unsupported { provider: Some(SourceProvider::AppleMusic), what: "link".into() },
                k => Input::Unsupported { provider: Some(SourceProvider::AppleMusic), what: k.into() },
            }
        }
        "soundcloud.com" => {
            let ok = |s: &str| is_id(s, 1, 100, &['-', '_']);
            match segs.as_slice() {
                [user, "sets", set, rest @ ..] if ok(user) && ok(set) && rest.len() <= 1 => {
                    let path = format!("/{user}/sets/{set}{}", rest.first().map(|t| format!("/{t}")).unwrap_or_default());
                    Input::Collection(CollectionRef { provider: SourceProvider::Soundcloud, kind: CollectionKind::Playlist, id: path.clone(), storefront: None, path: Some(path) })
                }
                [user, reserved, ..] if ok(user) && matches!(*reserved, "likes" | "reposts" | "tracks" | "albums" | "popular-tracks" | "followers" | "following" | "comments") => {
                    Input::Unsupported { provider: Some(SourceProvider::Soundcloud), what: "profile".into() }
                }
                [user, track] if ok(user) && ok(track) && !matches!(*user, "discover" | "search" | "stream" | "you" | "charts") => {
                    Input::Track(TrackRef::Soundcloud { path: format!("/{user}/{track}") })
                }
                // Geheimer Freigabelink: `/nutzer/titel/s-TOKEN`.
                [user, track, secret] if ok(user) && ok(track) && secret.starts_with("s-") && ok(secret) => {
                    Input::Track(TrackRef::Soundcloud { path: format!("/{user}/{track}/{secret}") })
                }
                [_] => Input::Unsupported { provider: Some(SourceProvider::Soundcloud), what: "profile".into() },
                _ => Input::Unsupported { provider: Some(SourceProvider::Soundcloud), what: "link".into() },
            }
        }
        other => Input::Unsupported { provider: None, what: format!("host:{}", other.chars().take(60).collect::<String>()) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SP: &str = "4uLU6hMCjMI75M1A2tKUQC";

    #[test]
    fn spotify_links_and_uris() {
        assert_eq!(parse(&format!("https://open.spotify.com/intl-de/track/{SP}?si=abc&utm_source=x")), Input::Track(TrackRef::Spotify { id: SP.into() }));
        assert_eq!(parse(&format!("spotify:track:{SP}")), Input::Track(TrackRef::Spotify { id: SP.into() }));
        assert!(matches!(parse(&format!("https://open.spotify.com/playlist/{SP}")), Input::Collection(CollectionRef { kind: CollectionKind::Playlist, .. })));
        assert!(matches!(parse(&format!("https://open.spotify.com/album/{SP}")), Input::Collection(CollectionRef { kind: CollectionKind::Album, .. })));
        assert!(matches!(parse(&format!("https://open.spotify.com/episode/{SP}")), Input::Unsupported { .. }));
        assert!(matches!(parse("https://spotify.link/AbCdEf"), Input::ShortLink { provider: SourceProvider::Spotify, .. }));
        assert!(matches!(parse(&format!("https://evil.example/track/{SP}")), Input::Unsupported { provider: None, .. }));
    }

    #[test]
    fn youtube_variants() {
        let v = TrackRef::Youtube { video: "dQw4w9WgXcQ".into() };
        assert_eq!(parse("https://youtu.be/dQw4w9WgXcQ?si=track"), Input::Track(v.clone()));
        assert_eq!(parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), Input::Track(v.clone()));
        assert_eq!(parse("https://m.youtube.com/shorts/dQw4w9WgXcQ"), Input::Track(v.clone()));
        assert_eq!(parse("https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share"), Input::Track(v.clone()));
        match parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123") {
            Input::TrackInCollection(t, c) => {
                assert_eq!(t, v);
                assert_eq!(c.id, "PLabc123");
            }
            o => panic!("{o:?}"),
        }
        // Automatischer Mix: nur das Video zählt.
        assert_eq!(parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ"), Input::Track(v));
        assert!(matches!(parse("https://www.youtube.com/playlist?list=PLabc123"), Input::Collection(_)));
        assert!(matches!(parse("https://www.youtube.com/@someone"), Input::Unsupported { .. }));
        assert!(matches!(parse("https://www.youtube.com/watch?v=short"), Input::Unsupported { .. }));
    }

    #[test]
    fn apple_music_selected_song_in_album() {
        assert_eq!(
            parse("https://music.apple.com/de/album/some-album/1440857781?i=1440857795&l=en"),
            Input::Track(TrackRef::AppleMusic { storefront: "de".into(), id: "1440857795".into() })
        );
        assert!(matches!(parse("https://music.apple.com/de/album/some-album/1440857781"), Input::Collection(CollectionRef { kind: CollectionKind::Album, .. })));
        assert_eq!(parse("https://music.apple.com/us/song/name/123"), Input::Track(TrackRef::AppleMusic { storefront: "us".into(), id: "123".into() }));
        assert!(matches!(parse("https://music.apple.com/de/playlist/chill/pl.u-abc123"), Input::Collection(CollectionRef { kind: CollectionKind::Playlist, .. })));
        assert!(matches!(parse("https://music.apple.com/de/artist/x/123"), Input::Unsupported { .. }));
    }

    #[test]
    fn soundcloud_variants() {
        assert_eq!(parse("https://soundcloud.com/artist-x/song-y?utm_source=clipboard"), Input::Track(TrackRef::Soundcloud { path: "/artist-x/song-y".into() }));
        assert_eq!(parse("https://m.soundcloud.com/artist-x/song-y"), Input::Track(TrackRef::Soundcloud { path: "/artist-x/song-y".into() }));
        assert!(matches!(parse("https://soundcloud.com/artist-x/sets/best-of"), Input::Collection(_)));
        assert!(matches!(parse("https://soundcloud.com/artist-x"), Input::Unsupported { .. }));
        assert!(matches!(parse("https://on.soundcloud.com/AbC12"), Input::ShortLink { provider: SourceProvider::Soundcloud, .. }));
    }

    #[test]
    fn text_and_unsafe_links() {
        assert_eq!(parse("  Daft Punk – One More Time "), Input::Text("Daft Punk – One More Time".into()));
        assert!(matches!(parse("https://user:pw@open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"), Input::Unsupported { .. }));
        assert!(matches!(parse("https://open.spotify.com:8443/track/4uLU6hMCjMI75M1A2tKUQC"), Input::Unsupported { .. }));
        assert!(matches!(parse("http://127.0.0.1/track"), Input::Unsupported { provider: None, .. }));
        // Link mitten im Text wird erkannt.
        assert_eq!(parse("bitte das hier https://youtu.be/dQw4w9WgXcQ danke"), Input::Track(TrackRef::Youtube { video: "dQw4w9WgXcQ".into() }));
    }
}
