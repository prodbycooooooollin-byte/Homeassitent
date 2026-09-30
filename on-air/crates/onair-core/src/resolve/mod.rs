//! Universal Request: Musiklinks verschiedener Anbieter erkennen, Metadaten lesen und den
//! passenden Spotify-Titel finden. Abgespielt wird immer über das Spotify-Konto des Streamers;
//! andere Anbieter liefern nur Metadaten (kein Download, keine Wiedergabe).

pub mod link;
pub mod matching;
pub mod providers;

use crate::clock::SharedClock;
use crate::error::ApiError;
use crate::http::SharedTransport;
use crate::model::Track;
use crate::secrets::SecretStore;
use crate::settings::{self as cfg, SharedSettings};
use crate::spotify::SpotifyClient;
pub use link::{CollectionKind, CollectionRef, Input, SourceProvider, TrackRef};
use matching::{Decision, Prefs, SourceMeta};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Ablageschlüssel der Anbieter-Zugangsdaten im Betriebssystem-Tresor (nie in SQLite/Exports).
pub const SECRET_YOUTUBE: &str = "provider.youtube.api_key";
pub const SECRET_APPLE: &str = "provider.apple_music.developer_token";
pub const SECRET_SOUNDCLOUD: &str = "provider.soundcloud.client";

/// Ein Titel beim Quellanbieter (normalisierte Metadaten).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceItem {
    pub provider: SourceProvider,
    /// Kennung beim Anbieter (Video-ID, Song-ID, SoundCloud-Pfad/ID, Spotify-ID).
    pub id: String,
    pub url: Option<String>,
    pub title: String,
    /// Interpreten, soweit belastbar bekannt (leer = unbekannt).
    pub artists: Vec<String>,
    /// Kanal bzw. Uploader – ausdrücklich nicht automatisch der Interpret.
    pub uploader: Option<String>,
    pub duration_ms: Option<u64>,
    pub isrc: Option<String>,
    pub image_url: Option<String>,
    /// `false`: privat, gelöscht, regional gesperrt oder nicht abspielbar.
    pub available: bool,
    #[serde(default)]
    pub explicit: Option<bool>,
    /// Bei Spotify-Quellen: der Titel selbst.
    #[serde(default)]
    pub spotify: Option<Track>,
}

impl SourceItem {
    /// Anzeige „Interpret – Titel“ (Uploader nur als Zusatz, nie als Interpret).
    pub fn display(&self) -> String {
        if let Some(t) = &self.spotify {
            return format!("{} – {}", t.artist_line(), t.title);
        }
        match self.artists.first() {
            Some(a) => format!("{a} – {}", self.title),
            None => self.title.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchMethod {
    /// Direkter Spotify-Link.
    SpotifyLink,
    /// Über die Aufnahmekennung (ISRC).
    Isrc,
    /// Über Titel, Interpret, Version und Laufzeit.
    Metadata,
    /// Freitextsuche.
    Search,
    /// Vom Zuschauer bzw. Streamer ausgewählt.
    UserChoice,
}

/// Herkunft eines Requests: ursprüngliche Quelle und wie der Spotify-Titel gefunden wurde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Origin {
    pub provider: Option<SourceProvider>,
    pub url: Option<String>,
    pub title: Option<String>,
    pub artists: Vec<String>,
    pub duration_ms: Option<u64>,
    pub isrc: Option<String>,
    pub method: MatchMethod,
    /// Titel stammt aus dieser Playlist bzw. diesem Album.
    #[serde(default)]
    pub collection: Option<String>,
    /// Zusätzlich angebotene Playlist (YouTube-Link mit Video und Playlist).
    #[serde(default)]
    pub playlist_hint: Option<String>,
}

impl Origin {
    fn search() -> Self {
        Self { provider: None, url: None, title: None, artists: vec![], duration_ms: None, isrc: None, method: MatchMethod::Search, collection: None, playlist_hint: None }
    }
    fn from_item(item: &SourceItem, method: MatchMethod) -> Self {
        Self {
            provider: Some(item.provider),
            url: item.url.clone(),
            title: Some(item.title.clone()),
            artists: item.artists.clone(),
            duration_ms: item.duration_ms,
            isrc: item.isrc.clone(),
            method,
            collection: None,
            playlist_hint: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectionInfo {
    #[serde(rename = "ref")]
    pub r: CollectionRef,
    pub name: Option<String>,
    pub url: String,
    pub image_url: Option<String>,
    pub total: Option<u32>,
}

/// Eine geladene Seite einer Sammlung. `cursor` = Position dieser Seite, `next` = nächste.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectionPage {
    pub items: Vec<SourceItem>,
    pub cursor: Option<String>,
    pub next: Option<String>,
    pub total: Option<u32>,
}

/// Konkreter Fehlerstatus – jeder Zustand hat eine eigene, verständliche Meldung.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ResolveError {
    /// Freitext ohne Treffer bzw. Link-Ziel existiert nicht.
    NotFound,
    /// Quelle erkannt, aber keine passende Spotify-Version.
    NoSpotifyMatch { title: String },
    /// Privat, entfernt, regional gesperrt oder für den API-Zugang nicht lesbar.
    NotAccessible { provider: SourceProvider },
    /// Inhaltstyp nicht unterstützt (Künstlerseite, Podcast, unbekannter Dienst …).
    Unsupported { what: String },
    /// Für diesen Inhalt fehlen Zugangsdaten des Anbieters.
    SetupRequired { provider: SourceProvider },
    /// Vom Streamer ausgeschaltet.
    Disabled { provider: SourceProvider },
    ProviderUnavailable { provider: SourceProvider },
    RateLimited { provider: SourceProvider },
    /// Mix, Konzert oder Zusammenstellung statt eines einzelnen Songs.
    NotASong,
    /// Spotify gerade nicht erreichbar bzw. nicht verbunden (Request wird später geprüft).
    SpotifyOffline,
}

impl ResolveError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::NoSpotifyMatch { .. } => "no_spotify_match",
            Self::NotAccessible { .. } => "source_not_accessible",
            Self::Unsupported { .. } => "unsupported_content",
            Self::SetupRequired { .. } => "provider_setup_required",
            Self::Disabled { .. } => "provider_disabled",
            Self::ProviderUnavailable { .. } => "provider_unavailable",
            Self::RateLimited { .. } => "provider_rate_limited",
            Self::NotASong => "not_a_song",
            Self::SpotifyOffline => "spotify_offline",
        }
    }

    /// Kurze deutsche Beschreibung für Chat und App.
    pub fn text(&self) -> String {
        match self {
            Self::NotFound => "kein passender Song gefunden".into(),
            Self::NoSpotifyMatch { .. } => {
                "diesen Song gibt es so nicht auf Spotify – schick Titel und Interpret oder einen Spotify-Link".into()
            }
            Self::NotAccessible { provider } => format!("der {}-Inhalt ist privat, entfernt oder nicht zugänglich", provider.label()),
            Self::Unsupported { what } => match what.as_str() {
                "episode" | "show" => "Podcasts werden nicht unterstützt".into(),
                "artist" | "channel" | "profile" | "user" => "bitte einen Song- oder Playlist-Link statt einer Profilseite".into(),
                "mix" => "automatische YouTube-Mixe lassen sich nicht auslesen – bitte den Songlink".into(),
                w if w.starts_with("host:") => "dieser Musikdienst wird nicht unterstützt (Spotify, YouTube, Apple Music, SoundCloud)".into(),
                _ => "dieser Link wird nicht unterstützt".into(),
            },
            Self::SetupRequired { provider } => format!("{}-Playlists sind beim Streamer noch nicht eingerichtet – bitte einen Songlink", provider.label()),
            Self::Disabled { provider } => format!("{}-Links sind beim Streamer ausgeschaltet", provider.label()),
            Self::ProviderUnavailable { provider } => format!("{} ist gerade nicht erreichbar – versuch es gleich nochmal", provider.label()),
            Self::RateLimited { provider } => format!("{}-Abfragen sind gerade ausgelastet – versuch es gleich nochmal", provider.label()),
            Self::NotASong => "das ist kein einzelner Song (Mix, Konzert oder Zusammenstellung)".into(),
            Self::SpotifyOffline => "Spotify ist gerade nicht erreichbar".into(),
        }
    }
}

/// Ergebnis der Auflösung.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Resolution {
    /// Eindeutig: geht direkt in die normale Request-Prüfung.
    Track { track: Track, origin: Origin },
    /// Mehrere plausible Spotify-Versionen → „Spotify-Version bestätigen“.
    Versions { origin: Origin, options: Vec<Track> },
    /// Playlist/Album → „Playlist-Titel wählen“.
    Collection { collection: CollectionInfo, page: CollectionPage },
    Failed { error: ResolveError },
}

impl Resolution {
    fn fail(e: ResolveError) -> Self {
        Resolution::Failed { error: e }
    }
}

/// Fähigkeiten eines Anbieters mit den aktuell hinterlegten Zugangsdaten.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatus {
    pub provider: SourceProvider,
    pub enabled: bool,
    /// Zugangsdaten hinterlegt (Inhalt wird nie ausgegeben).
    pub configured: bool,
    /// `full` (inkl. Laufzeit/ISRC), `basic` (Titel/Kanal), `none`.
    pub tracks: &'static str,
    pub playlists: bool,
    pub albums: bool,
}

pub struct ResolverDeps {
    pub http: SharedTransport,
    pub spotify: Arc<SpotifyClient>,
    pub secrets: Arc<dyn SecretStore>,
    pub settings: SharedSettings,
    pub clock: SharedClock,
}

/// Kurzzeit-Cache für Metadaten und Sammlungsseiten (keine Suchergebnisse).
const CACHE_MS: i64 = 10 * 60_000;
const CACHE_MAX: usize = 300;

pub struct Resolver {
    pub(crate) d: ResolverDeps,
    items: Mutex<HashMap<String, (i64, SourceItem)>>,
    pages: Mutex<HashMap<String, (i64, CollectionPage, Option<String>, Option<String>)>>,
    pub(crate) sc_token: tokio::sync::Mutex<Option<(String, i64)>>,
}

pub(crate) fn spotify_err(e: &ApiError) -> ResolveError {
    match e {
        ApiError::RateLimited { .. } | ApiError::QuotaExhausted { .. } | ApiError::Suspended { .. } => {
            ResolveError::RateLimited { provider: SourceProvider::Spotify }
        }
        ApiError::NotFound | ApiError::BadRequest { .. } => ResolveError::NotFound,
        ApiError::Forbidden { .. } => ResolveError::NotAccessible { provider: SourceProvider::Spotify },
        _ => ResolveError::SpotifyOffline,
    }
}

impl Resolver {
    pub fn new(d: ResolverDeps) -> Arc<Self> {
        Arc::new(Self { d, items: Mutex::new(HashMap::new()), pages: Mutex::new(HashMap::new()), sc_token: tokio::sync::Mutex::new(None) })
    }

    fn now(&self) -> i64 {
        self.d.clock.now_ms()
    }

    pub(crate) fn secret(&self, key: &str) -> Option<String> {
        self.d.secrets.load(key).ok().flatten().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    }

    fn enabled(&self, p: SourceProvider) -> bool {
        let s = cfg::read(&self.d.settings).sources.clone();
        match p {
            SourceProvider::Spotify => true,
            SourceProvider::Youtube => s.youtube,
            SourceProvider::AppleMusic => s.apple_music,
            SourceProvider::Soundcloud => s.soundcloud,
        }
    }

    pub fn provider_status(&self) -> Vec<ProviderStatus> {
        let yt = self.secret(SECRET_YOUTUBE).is_some();
        let ap = self.secret(SECRET_APPLE).is_some();
        let sc = self.secret(SECRET_SOUNDCLOUD).is_some();
        vec![
            ProviderStatus { provider: SourceProvider::Spotify, enabled: true, configured: true, tracks: "full", playlists: true, albums: true },
            ProviderStatus { provider: SourceProvider::Youtube, enabled: self.enabled(SourceProvider::Youtube), configured: yt, tracks: if yt { "full" } else { "basic" }, playlists: yt, albums: false },
            ProviderStatus { provider: SourceProvider::AppleMusic, enabled: self.enabled(SourceProvider::AppleMusic), configured: ap, tracks: "full", playlists: ap, albums: true },
            ProviderStatus { provider: SourceProvider::Soundcloud, enabled: self.enabled(SourceProvider::Soundcloud), configured: sc, tracks: if sc { "full" } else { "basic" }, playlists: sc, albums: false },
        ]
    }

    /// Zugangsdaten eines Anbieters speichern (`None`/leer = entfernen).
    pub fn set_credential(&self, provider: SourceProvider, value: Option<&str>) -> Result<(), String> {
        let key = match provider {
            SourceProvider::Youtube => SECRET_YOUTUBE,
            SourceProvider::AppleMusic => SECRET_APPLE,
            SourceProvider::Soundcloud => SECRET_SOUNDCLOUD,
            SourceProvider::Spotify => return Err("Spotify nutzt die normale Anmeldung".into()),
        };
        self.items.lock().unwrap().clear();
        self.pages.lock().unwrap().clear();
        match value.map(str::trim).filter(|v| !v.is_empty()) {
            None => self.d.secrets.delete(key),
            Some(v) => {
                if provider == SourceProvider::Soundcloud {
                    // Erwartet „client_id:client_secret“.
                    let (id, sec) = v.split_once(':').ok_or("Format: client_id:client_secret")?;
                    if id.trim().is_empty() || sec.trim().is_empty() {
                        return Err("Format: client_id:client_secret".into());
                    }
                }
                if v.len() > 4096 || v.chars().any(char::is_control) {
                    return Err("ungültiger Wert".into());
                }
                self.d.secrets.save(key, v)
            }
        }
    }

    fn prefs(&self) -> Prefs {
        let s = cfg::read(&self.d.settings);
        Prefs { prefer_clean: s.requests.block_explicit, max_options: s.sources.max_options as usize }
    }

    /// Eingabe (Link oder Freitext) auflösen.
    pub async fn resolve(&self, input: &str) -> Resolution {
        let mut parsed = link::parse(input);
        // Kurzlinks: Ziel ermitteln und erneut prüfen (höchstens eine Ebene Kurzlink).
        if let Input::ShortLink { provider, url } = &parsed {
            if !self.enabled(*provider) {
                return Resolution::fail(ResolveError::Disabled { provider: *provider });
            }
            parsed = match providers::expand_short_link(self, *provider, url).await {
                Ok(next @ (Input::Track(_) | Input::TrackInCollection(..) | Input::Collection(_) | Input::Unsupported { .. })) => next,
                Ok(_) => Input::Unsupported { provider: Some(*provider), what: "link".into() },
                Err(e) => return Resolution::fail(e),
            };
        }
        match parsed {
            Input::Text(q) => self.resolve_text(&q).await,
            Input::Track(r) => self.resolve_track(&r, None).await,
            Input::TrackInCollection(r, c) => {
                let hint = self.enabled(c.provider).then(|| c.url());
                self.resolve_track(&r, hint).await
            }
            Input::Collection(c) => self.open_collection(&c).await,
            Input::Unsupported { what, .. } => Resolution::fail(ResolveError::Unsupported { what }),
            Input::ShortLink { .. } => Resolution::fail(ResolveError::Unsupported { what: "link".into() }),
        }
    }

    async fn resolve_text(&self, q: &str) -> Resolution {
        let q = q.trim();
        if q.is_empty() {
            return Resolution::fail(ResolveError::NotFound);
        }
        match self.d.spotify.search_tracks(q, crate::spotify::client::SEARCH_LIMIT).await {
            Ok(list) => match matching::decide_text(q, &list, self.prefs()) {
                Decision::Unique(t) => Resolution::Track { track: t, origin: Origin::search() },
                Decision::Choose(opts) if !opts.is_empty() => Resolution::Versions { origin: Origin::search(), options: opts },
                _ => Resolution::fail(ResolveError::NotFound),
            },
            Err(e) => Resolution::fail(spotify_err(&e)),
        }
    }

    async fn resolve_track(&self, r: &TrackRef, playlist_hint: Option<String>) -> Resolution {
        if !self.enabled(r.provider()) {
            return Resolution::fail(ResolveError::Disabled { provider: r.provider() });
        }
        if let TrackRef::Spotify { id } = r {
            return match self.d.spotify.track(id).await {
                Ok(t) => Resolution::Track {
                    origin: Origin { url: Some(r.url()), provider: Some(SourceProvider::Spotify), method: MatchMethod::SpotifyLink, title: Some(t.title.clone()), ..Origin::search() },
                    track: t,
                },
                Err(ApiError::NotFound | ApiError::BadRequest { .. }) => Resolution::fail(ResolveError::NotAccessible { provider: SourceProvider::Spotify }),
                Err(e) => Resolution::fail(spotify_err(&e)),
            };
        }
        let key = format!("{r:?}");
        let cached = self.items.lock().unwrap().get(&key).filter(|(at, _)| self.now() - at < CACHE_MS).map(|(_, i)| i.clone());
        let item = match cached {
            Some(i) => i,
            None => match providers::track_meta(self, r).await {
                Ok(i) => {
                    let mut c = self.items.lock().unwrap();
                    if c.len() > CACHE_MAX {
                        c.clear();
                    }
                    c.insert(key, (self.now(), i.clone()));
                    i
                }
                Err(e) => return Resolution::fail(e),
            },
        };
        let mut res = self.match_item(&item).await;
        if let Resolution::Track { origin, .. } | Resolution::Versions { origin, .. } = &mut res {
            origin.playlist_hint = playlist_hint;
        }
        res
    }

    /// Einen Quelltitel (Link, Playlist- oder Albumeintrag) einem Spotify-Titel zuordnen.
    pub async fn match_item(&self, item: &SourceItem) -> Resolution {
        if let Some(t) = &item.spotify {
            // Seiten aus Alben/Playlists enthalten verkürzte Objekte → vollständig laden.
            let full = match self.d.spotify.track(&t.id).await {
                Ok(full) => full,
                Err(ApiError::NotFound) => return Resolution::fail(ResolveError::NotAccessible { provider: SourceProvider::Spotify }),
                Err(e) if matches!(spotify_err(&e), ResolveError::SpotifyOffline | ResolveError::RateLimited { .. }) => return Resolution::fail(spotify_err(&e)),
                Err(_) => t.clone(),
            };
            return Resolution::Track { track: full, origin: Origin::from_item(item, MatchMethod::SpotifyLink) };
        }
        if !item.available {
            return Resolution::fail(ResolveError::NotAccessible { provider: item.provider });
        }
        if matching::looks_like_compilation(&item.title, item.duration_ms) {
            return Resolution::fail(ResolveError::NotASong);
        }
        let (artists, title) = if item.artists.is_empty() {
            matching::split_artist_title(&item.title, item.uploader.as_deref())
        } else {
            (item.artists.clone(), item.title.clone())
        };
        let meta = SourceMeta { title: title.clone(), artists: artists.clone(), duration_ms: item.duration_ms, isrc: item.isrc.clone(), clean: item.explicit == Some(false) };
        let prefs = self.prefs();
        let mut all: Vec<Track> = Vec::new();
        for q in matching::queries_for(&meta) {
            let is_isrc = q.starts_with("isrc:");
            let found = match self.d.spotify.search_tracks(&q, crate::spotify::client::SEARCH_LIMIT).await {
                Ok(l) => l,
                Err(e) => match spotify_err(&e) {
                    ResolveError::NotFound => vec![],
                    other => return Resolution::fail(other),
                },
            };
            if is_isrc && !found.is_empty() {
                // Gleiche Aufnahmekennung: nur noch der Interpret muss passen.
                if let Decision::Unique(t) = matching::decide_meta(&SourceMeta { duration_ms: None, ..meta.clone() }, &found, prefs) {
                    let mut o = Origin::from_item(item, MatchMethod::Isrc);
                    o.artists = artists.clone();
                    return Resolution::Track { track: t, origin: o };
                }
            }
            for t in found {
                if !all.iter().any(|x| x.id == t.id) {
                    all.push(t);
                }
            }
            // Die erste Metadaten-Suche liefert oft schon ein eindeutiges Ergebnis.
            if !is_isrc && matches!(matching::decide_meta(&meta, &all, prefs), Decision::Unique(_)) {
                break;
            }
        }
        let mut origin = Origin::from_item(item, MatchMethod::Metadata);
        origin.artists = artists;
        match matching::decide_meta(&meta, &all, prefs) {
            Decision::Unique(t) => Resolution::Track { track: t, origin },
            Decision::Choose(opts) if !opts.is_empty() => Resolution::Versions { origin, options: opts },
            _ => Resolution::fail(ResolveError::NoSpotifyMatch { title: item.display() }),
        }
    }

    async fn open_collection(&self, c: &CollectionRef) -> Resolution {
        if !self.enabled(c.provider) {
            return Resolution::fail(ResolveError::Disabled { provider: c.provider });
        }
        match self.page(c, None).await {
            Ok((info, page)) => Resolution::Collection { collection: info, page },
            Err(e) => Resolution::fail(e),
        }
    }

    /// Eine Seite einer Sammlung laden (`cursor` = Wert aus `CollectionPage::next`).
    pub async fn page(&self, c: &CollectionRef, cursor: Option<&str>) -> Result<(CollectionInfo, CollectionPage), ResolveError> {
        let key = format!("{c:?}|{}", cursor.unwrap_or(""));
        let hit = self.pages.lock().unwrap().get(&key).filter(|(at, ..)| self.now() - at < CACHE_MS).cloned();
        if let Some((_, page, name, image)) = hit {
            return Ok((CollectionInfo { r: c.clone(), name, url: c.url(), image_url: image, total: page.total }, page));
        }
        let (page, name, image) = providers::collection_page(self, c, cursor).await?;
        let mut m = self.pages.lock().unwrap();
        if m.len() > CACHE_MAX {
            m.clear();
        }
        m.insert(key, (self.now(), page.clone(), name.clone(), image.clone()));
        Ok((CollectionInfo { r: c.clone(), name, url: c.url(), image_url: image, total: page.total }, page))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_have_distinct_codes_and_texts() {
        let all = [
            ResolveError::NotFound,
            ResolveError::NoSpotifyMatch { title: "x".into() },
            ResolveError::NotAccessible { provider: SourceProvider::Youtube },
            ResolveError::Unsupported { what: "episode".into() },
            ResolveError::SetupRequired { provider: SourceProvider::AppleMusic },
            ResolveError::Disabled { provider: SourceProvider::Soundcloud },
            ResolveError::ProviderUnavailable { provider: SourceProvider::Youtube },
            ResolveError::RateLimited { provider: SourceProvider::Youtube },
            ResolveError::NotASong,
            ResolveError::SpotifyOffline,
        ];
        let codes: std::collections::HashSet<_> = all.iter().map(|e| e.code()).collect();
        assert_eq!(codes.len(), all.len());
        let texts: std::collections::HashSet<_> = all.iter().map(|e| e.text()).collect();
        assert_eq!(texts.len(), all.len());
    }
}
