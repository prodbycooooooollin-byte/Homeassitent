//! Anbieter-Adapter. Jeder Adapter liest nur dokumentierte, öffentliche Metadaten:
//!
//! | Anbieter | ohne Zugangsdaten | mit Zugangsdaten |
//! |---|---|---|
//! | YouTube / YouTube Music | oEmbed: Titel, Kanal | Data API v3: + Laufzeit, Status, Playlists |
//! | Apple Music | iTunes Search/Lookup API: Titel, Interpret, Laufzeit, Alben | Apple Music API: + ISRC, Playlists |
//! | SoundCloud | oEmbed: Titel, Uploader | API (Client Credentials): + Laufzeit, ISRC, Sets |
//!
//! Abgerufen werden ausschließlich fest eingetragene Endpunkte; aus Nutzerlinks stammen nur
//! geprüfte Kennungen, die URL-kodiert eingesetzt werden.

use super::link::{self, CollectionKind, CollectionRef, Input, SourceProvider, TrackRef};
use super::{CollectionPage, ResolveError, Resolver, SourceItem, SECRET_APPLE, SECRET_SOUNDCLOUD, SECRET_YOUTUBE};
use crate::error::ApiError;
use crate::http::{HttpRequest, HttpResponse, Method};
use serde_json::Value;

pub const YT_API: &str = "https://www.googleapis.com/youtube/v3";
pub const YT_OEMBED: &str = "https://www.youtube.com/oembed";
pub const APPLE_API: &str = "https://api.music.apple.com/v1";
pub const ITUNES_LOOKUP: &str = "https://itunes.apple.com/lookup";
pub const SC_API: &str = "https://api.soundcloud.com";
pub const SC_TOKEN: &str = "https://secure.soundcloud.com/oauth/token";
pub const SC_OEMBED: &str = "https://soundcloud.com/oembed";

/// Seitengröße beim Laden von Sammlungen (Anzeige blättert darin lokal).
pub const PAGE: u32 = 50;

fn enc(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

async fn send(r: &Resolver, req: HttpRequest, p: SourceProvider) -> Result<HttpResponse, ResolveError> {
    r.d.http
        .send(req.header("Accept", "application/json"))
        .await
        .map_err(|_| ResolveError::ProviderUnavailable { provider: p })
}

/// Einheitliche Statusauswertung; spezielle Fälle behandeln die Adapter vorher.
fn status_err(resp: &HttpResponse, p: SourceProvider) -> ResolveError {
    match resp.status {
        429 => ResolveError::RateLimited { provider: p },
        401 => ResolveError::SetupRequired { provider: p },
        403 | 404 | 410 => ResolveError::NotAccessible { provider: p },
        400 => ResolveError::NotFound,
        _ => ResolveError::ProviderUnavailable { provider: p },
    }
}

/// ISO-8601-Dauer (`PT1H2M3S`) in Millisekunden.
pub fn iso_duration_ms(s: &str) -> Option<u64> {
    let rest = s.strip_prefix('P')?;
    let (days, time) = match rest.split_once('T') {
        Some((d, t)) => (d, t),
        None => (rest, ""),
    };
    let mut total = 0u64;
    let mut num = String::new();
    for c in days.chars() {
        if c.is_ascii_digit() {
            num.push(c);
        } else if c == 'D' {
            total += num.parse::<u64>().ok()? * 86_400;
            num.clear();
        } else {
            return None;
        }
    }
    for c in time.chars() {
        if c.is_ascii_digit() || c == '.' {
            num.push(c);
            continue;
        }
        let v: f64 = num.parse().ok()?;
        num.clear();
        total += match c {
            'H' => (v * 3600.0) as u64,
            'M' => (v * 60.0) as u64,
            'S' => v as u64,
            _ => return None,
        };
    }
    (total > 0).then_some(total * 1000)
}

fn item(provider: SourceProvider, id: String, url: Option<String>, title: &str) -> SourceItem {
    SourceItem {
        provider,
        id,
        url,
        title: title.trim().to_string(),
        artists: vec![],
        uploader: None,
        duration_ms: None,
        isrc: None,
        image_url: None,
        available: true,
        explicit: None,
        spotify: None,
    }
}

// ---------------------------------------------------------------------------
// Kurzlinks
// ---------------------------------------------------------------------------

/// Folgt einem Kurzlink Schritt für Schritt; jedes Ziel muss wieder ein bekannter Anbieter sein.
pub async fn expand_short_link(r: &Resolver, provider: SourceProvider, url: &str) -> Result<Input, ResolveError> {
    let mut current = url.to_string();
    for _ in 0..5 {
        let resp = send(r, HttpRequest::new(Method::Get, current.clone()).no_redirects(), provider).await?;
        if !(300..400).contains(&resp.status) {
            return Err(if resp.status == 404 { ResolveError::NotAccessible { provider } } else { ResolveError::Unsupported { what: "link".into() } });
        }
        let Some(loc) = resp.header("location") else { return Err(ResolveError::Unsupported { what: "link".into() }) };
        let target = url::Url::parse(&current).and_then(|base| base.join(loc)).map(|u| u.to_string()).map_err(|_| ResolveError::Unsupported { what: "link".into() })?;
        match link::parse_redirect_target(&target) {
            Input::ShortLink { url, .. } => current = url,
            Input::Text(_) => return Err(ResolveError::Unsupported { what: "link".into() }),
            other => return Ok(other),
        }
    }
    Err(ResolveError::Unsupported { what: "link".into() })
}

// ---------------------------------------------------------------------------
// Einzeltitel
// ---------------------------------------------------------------------------

pub async fn track_meta(r: &Resolver, t: &TrackRef) -> Result<SourceItem, ResolveError> {
    match t {
        TrackRef::Spotify { .. } => Err(ResolveError::Unsupported { what: "link".into() }),
        TrackRef::Youtube { video } => youtube_video(r, video).await,
        TrackRef::AppleMusic { storefront, id } => apple_song(r, storefront, id).await,
        TrackRef::Soundcloud { path } => soundcloud_track(r, path).await,
    }
}

fn youtube_api_error(resp: &HttpResponse) -> ResolveError {
    let p = SourceProvider::Youtube;
    let v = resp.json_body().unwrap_or_default();
    let reason = v["error"]["errors"][0]["reason"].as_str().unwrap_or("");
    match (resp.status, reason) {
        (_, "quotaExceeded" | "dailyLimitExceeded" | "rateLimitExceeded" | "userRateLimitExceeded") => ResolveError::RateLimited { provider: p },
        (400, "keyInvalid" | "badRequest") if v["error"]["message"].as_str().unwrap_or("").to_lowercase().contains("api key") => ResolveError::SetupRequired { provider: p },
        (400, "keyInvalid") => ResolveError::SetupRequired { provider: p },
        (403, "accessNotConfigured" | "forbidden" | "ipRefererBlocked" | "keyExpired") => ResolveError::SetupRequired { provider: p },
        (404, _) => ResolveError::NotAccessible { provider: p },
        _ => status_err(resp, p),
    }
}

async fn youtube_video(r: &Resolver, id: &str) -> Result<SourceItem, ResolveError> {
    let p = SourceProvider::Youtube;
    let url = format!("https://www.youtube.com/watch?v={id}");
    if let Some(key) = r.secret(SECRET_YOUTUBE) {
        let req = HttpRequest::new(Method::Get, format!("{YT_API}/videos?part=snippet,contentDetails,status&id={}&key={}", enc(id), enc(&key)));
        let resp = send(r, req, p).await?;
        if resp.status != 200 {
            return Err(youtube_api_error(&resp));
        }
        let v = resp.json_body().unwrap_or_default();
        let Some(x) = v["items"].as_array().and_then(|a| a.first()) else {
            // Leere Liste: privat, gelöscht oder nicht vorhanden.
            return Err(ResolveError::NotAccessible { provider: p });
        };
        let mut it = item(p, id.into(), Some(url), x["snippet"]["title"].as_str().unwrap_or(""));
        it.uploader = x["snippet"]["channelTitle"].as_str().map(str::to_string);
        it.duration_ms = x["contentDetails"]["duration"].as_str().and_then(iso_duration_ms);
        it.image_url = x["snippet"]["thumbnails"]["high"]["url"].as_str().map(str::to_string);
        it.available = x["status"]["privacyStatus"].as_str() != Some("private");
        topic_artist(&mut it);
        return Ok(it);
    }
    let req = HttpRequest::new(Method::Get, format!("{YT_OEMBED}?format=json&url={}", enc(&url)));
    let resp = send(r, req, p).await?;
    if resp.status != 200 {
        return Err(status_err(&resp, p).not_setup());
    }
    let v = resp.json_body().ok_or(ResolveError::ProviderUnavailable { provider: p })?;
    let mut it = item(p, id.into(), Some(url), v["title"].as_str().unwrap_or(""));
    it.uploader = v["author_name"].as_str().map(str::to_string);
    it.image_url = v["thumbnail_url"].as_str().map(str::to_string);
    topic_artist(&mut it);
    Ok(it)
}

/// Automatisch erzeugte „X - Topic“-Kanäle stehen für den Interpreten X.
fn topic_artist(it: &mut SourceItem) {
    if let Some(a) = it.uploader.as_deref().and_then(|u| u.strip_suffix(" - Topic")).map(str::trim).filter(|a| !a.is_empty()) {
        it.artists = vec![a.to_string()];
    }
}

impl ResolveError {
    /// Öffentliche Endpunkte ohne Schlüssel: 401 heißt dort „nicht zugänglich“, nicht „Einrichtung“.
    fn not_setup(self) -> Self {
        match self {
            ResolveError::SetupRequired { provider } => ResolveError::NotAccessible { provider },
            e => e,
        }
    }
}

fn apple_artwork(v: &Value) -> Option<String> {
    v["artwork"]["url"].as_str().map(|u| u.replace("{w}", "300").replace("{h}", "300"))
}

fn apple_api_item(x: &Value, sf: &str) -> SourceItem {
    let a = &x["attributes"];
    let id = x["id"].as_str().unwrap_or("").to_string();
    let mut it = item(SourceProvider::AppleMusic, id.clone(), a["url"].as_str().map(str::to_string).or(Some(format!("https://music.apple.com/{sf}/song/{id}"))), a["name"].as_str().unwrap_or(""));
    it.artists = a["artistName"].as_str().map(|s| vec![s.to_string()]).unwrap_or_default();
    it.duration_ms = a["durationInMillis"].as_u64();
    it.isrc = a["isrc"].as_str().map(str::to_string);
    it.image_url = apple_artwork(a);
    it.explicit = match a["contentRating"].as_str() {
        Some("explicit") => Some(true),
        Some("clean") => Some(false),
        _ => None,
    };
    // Ohne Abspielparameter ist der Titel im Katalog dieses Landes nicht verfügbar.
    it.available = !a["playParams"].is_null() || a["url"].is_string();
    it
}

fn itunes_item(x: &Value, sf: &str) -> SourceItem {
    let id = x["trackId"].as_u64().map(|i| i.to_string()).unwrap_or_default();
    let mut it = item(SourceProvider::AppleMusic, id.clone(), x["trackViewUrl"].as_str().map(|u| u.split('&').next().unwrap_or(u).to_string()).or(Some(format!("https://music.apple.com/{sf}/song/{id}"))), x["trackName"].as_str().unwrap_or(""));
    it.artists = x["artistName"].as_str().map(|s| vec![s.to_string()]).unwrap_or_default();
    it.duration_ms = x["trackTimeMillis"].as_u64();
    it.image_url = x["artworkUrl100"].as_str().map(|u| u.replace("100x100", "300x300"));
    it.explicit = match x["trackExplicitness"].as_str() {
        Some("explicit") => Some(true),
        Some("cleaned") => Some(false),
        _ => None,
    };
    it
}

async fn apple_song(r: &Resolver, sf: &str, id: &str) -> Result<SourceItem, ResolveError> {
    let p = SourceProvider::AppleMusic;
    if let Some(token) = r.secret(SECRET_APPLE) {
        let req = HttpRequest::new(Method::Get, format!("{APPLE_API}/catalog/{}/songs/{}", enc(sf), enc(id))).bearer(&token);
        let resp = send(r, req, p).await?;
        match resp.status {
            200 => {
                let v = resp.json_body().unwrap_or_default();
                return match v["data"].as_array().and_then(|a| a.first()) {
                    Some(x) => Ok(apple_api_item(x, sf)),
                    None => Err(ResolveError::NotAccessible { provider: p }),
                };
            }
            404 => return Err(ResolveError::NotAccessible { provider: p }),
            429 => return Err(ResolveError::RateLimited { provider: p }),
            // Token abgelaufen/ungültig: öffentliche Lookup-API als Rückfall.
            401 | 403 => tracing::info!(target: "resolve", "Apple-Music-Token abgelehnt – nutze Lookup"),
            _ => return Err(ResolveError::ProviderUnavailable { provider: p }),
        }
    }
    let req = HttpRequest::new(Method::Get, format!("{ITUNES_LOOKUP}?id={}&country={}&entity=song", enc(id), enc(sf)));
    let resp = send(r, req, p).await?;
    if resp.status != 200 {
        // Die Lookup-API drosselt mit 403.
        return Err(if resp.status == 403 { ResolveError::RateLimited { provider: p } } else { status_err(&resp, p).not_setup() });
    }
    let v = resp.json_body().unwrap_or_default();
    v["results"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["wrapperType"] == "track" && x["trackId"].as_u64().map(|i| i.to_string()).as_deref() == Some(id)))
        .map(|x| itunes_item(x, sf))
        .ok_or(ResolveError::NotAccessible { provider: p })
}

/// Zugangstoken per Client-Credentials-Verfahren (zwischengespeichert bis kurz vor Ablauf).
async fn soundcloud_token(r: &Resolver, force: bool) -> Result<Option<String>, ResolveError> {
    let p = SourceProvider::Soundcloud;
    let Some(creds) = r.secret(SECRET_SOUNDCLOUD) else { return Ok(None) };
    let mut guard = r.sc_token.lock().await;
    let now = r.d.clock.now_ms();
    if !force {
        if let Some((t, _)) = guard.as_ref().filter(|(_, exp)| *exp > now + 30_000) {
            return Ok(Some(t.clone()));
        }
    }
    let (id, secret) = creds.split_once(':').ok_or(ResolveError::SetupRequired { provider: p })?;
    use base64::Engine;
    let basic = base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", id.trim(), secret.trim()));
    let req = HttpRequest::new(Method::Post, SC_TOKEN).header("Authorization", format!("Basic {basic}")).form(vec![("grant_type", "client_credentials".into())]);
    let resp = send(r, req, p).await?;
    match resp.status {
        200 => {
            let v = resp.json_body().unwrap_or_default();
            let t = v["access_token"].as_str().ok_or(ResolveError::ProviderUnavailable { provider: p })?.to_string();
            let exp = now + v["expires_in"].as_i64().unwrap_or(3600) * 1000;
            *guard = Some((t.clone(), exp));
            Ok(Some(t))
        }
        400 | 401 | 403 => Err(ResolveError::SetupRequired { provider: p }),
        429 => Err(ResolveError::RateLimited { provider: p }),
        _ => Err(ResolveError::ProviderUnavailable { provider: p }),
    }
}

/// Authentifizierter GET auf die SoundCloud-API; bei 401 einmal neues Token.
async fn soundcloud_get(r: &Resolver, url: String) -> Result<Option<HttpResponse>, ResolveError> {
    let p = SourceProvider::Soundcloud;
    let Some(mut token) = soundcloud_token(r, false).await? else { return Ok(None) };
    for attempt in 0..2 {
        let resp = send(r, HttpRequest::new(Method::Get, url.clone()).header("Authorization", format!("OAuth {token}")), p).await?;
        if resp.status == 401 && attempt == 0 {
            token = soundcloud_token(r, true).await?.ok_or(ResolveError::SetupRequired { provider: p })?;
            continue;
        }
        return Ok(Some(resp));
    }
    Err(ResolveError::SetupRequired { provider: p })
}

fn soundcloud_item(x: &Value) -> SourceItem {
    let id = x["id"].as_u64().map(|i| i.to_string()).unwrap_or_default();
    let mut it = item(SourceProvider::Soundcloud, id, x["permalink_url"].as_str().map(str::to_string), x["title"].as_str().unwrap_or(""));
    it.uploader = x["user"]["username"].as_str().map(str::to_string);
    it.duration_ms = x["duration"].as_u64().filter(|d| *d > 0);
    it.image_url = x["artwork_url"].as_str().map(str::to_string);
    let meta = &x["publisher_metadata"];
    if let Some(a) = meta["artist"].as_str().filter(|a| !a.trim().is_empty()) {
        it.artists = vec![a.trim().to_string()];
    }
    it.isrc = meta["isrc"].as_str().map(str::to_string).filter(|i| !i.is_empty());
    it.explicit = meta["explicit"].as_bool();
    it.available = x["access"].as_str() != Some("blocked") && !x["title"].is_null();
    it
}

async fn soundcloud_track(r: &Resolver, path: &str) -> Result<SourceItem, ResolveError> {
    let p = SourceProvider::Soundcloud;
    let url = format!("https://soundcloud.com{path}");
    if let Some(resp) = soundcloud_get(r, format!("{SC_API}/resolve?url={}", enc(&url))).await? {
        if resp.status != 200 {
            return Err(status_err(&resp, p));
        }
        let v = resp.json_body().unwrap_or_default();
        if v["kind"] != "track" {
            return Err(ResolveError::Unsupported { what: v["kind"].as_str().unwrap_or("link").to_string() });
        }
        return Ok(soundcloud_item(&v));
    }
    let req = HttpRequest::new(Method::Get, format!("{SC_OEMBED}?format=json&url={}", enc(&url)));
    let resp = send(r, req, p).await?;
    if resp.status != 200 {
        return Err(status_err(&resp, p).not_setup());
    }
    let v = resp.json_body().ok_or(ResolveError::ProviderUnavailable { provider: p })?;
    let author = v["author_name"].as_str().unwrap_or("").to_string();
    // oEmbed-Titel lauten „Titel by Uploader“.
    let raw = v["title"].as_str().unwrap_or("");
    let title = raw.strip_suffix(&format!(" by {author}")).unwrap_or(raw);
    let mut it = item(p, path.to_string(), Some(url), title);
    it.uploader = (!author.is_empty()).then_some(author);
    it.image_url = v["thumbnail_url"].as_str().map(str::to_string);
    Ok(it)
}

// ---------------------------------------------------------------------------
// Sammlungen (Playlist/Album)
// ---------------------------------------------------------------------------

fn offset(cursor: Option<&str>) -> u32 {
    cursor.and_then(|c| c.parse().ok()).unwrap_or(0)
}

fn local_page(all: Vec<SourceItem>, cursor: Option<&str>) -> CollectionPage {
    let start = offset(cursor) as usize;
    let total = all.len() as u32;
    let end = (start + PAGE as usize).min(all.len());
    let items = if start < all.len() { all[start..end].to_vec() } else { vec![] };
    CollectionPage { items, cursor: cursor.map(str::to_string), next: (end < all.len()).then(|| end.to_string()), total: Some(total) }
}

/// Liefert (Seite, Name, Cover).
pub async fn collection_page(r: &Resolver, c: &CollectionRef, cursor: Option<&str>) -> Result<(CollectionPage, Option<String>, Option<String>), ResolveError> {
    match c.provider {
        SourceProvider::Spotify => spotify_collection(r, c, cursor).await,
        SourceProvider::Youtube => youtube_playlist(r, &c.id, cursor).await,
        SourceProvider::AppleMusic => apple_collection(r, c, cursor).await,
        SourceProvider::Soundcloud => soundcloud_set(r, c.path.as_deref().unwrap_or(&c.id), cursor).await,
    }
}

async fn spotify_collection(r: &Resolver, c: &CollectionRef, cursor: Option<&str>) -> Result<(CollectionPage, Option<String>, Option<String>), ResolveError> {
    let p = SourceProvider::Spotify;
    let off = offset(cursor);
    let map = |e: ApiError| match e {
        // Development Mode: fremde Playlists sind für die App nicht lesbar.
        ApiError::Forbidden { .. } | ApiError::NotFound => ResolveError::NotAccessible { provider: p },
        e => super::spotify_err(&e),
    };
    let (page, name) = match c.kind {
        CollectionKind::Album => {
            let pg = r.d.spotify.album_page(&c.id, off, PAGE).await.map_err(map)?;
            let n = pg.name.clone();
            (pg, n)
        }
        CollectionKind::Playlist => {
            let pg = r.d.spotify.playlist_page(&c.id, off, PAGE).await.map_err(map)?;
            let n = if off == 0 { r.d.spotify.playlist_info(&c.id).await.ok().map(|(n, _)| n) } else { None };
            (pg, n)
        }
    };
    let image = page.image_url.clone();
    let items = page
        .items
        .into_iter()
        .enumerate()
        .map(|(i, t)| match t {
            Some(t) => {
                let mut it = item(p, t.id.clone(), Some(format!("https://open.spotify.com/track/{}", t.id)), &t.title);
                it.artists = t.artists.clone();
                it.duration_ms = Some(t.duration_ms).filter(|d| *d > 0);
                it.image_url = t.image_url.clone();
                it.explicit = Some(t.explicit);
                it.spotify = Some(t);
                it
            }
            None => {
                let mut it = item(p, format!("unavailable-{}", off as usize + i), None, "Nicht verfügbarer Eintrag");
                it.available = false;
                it
            }
        })
        .collect();
    Ok((CollectionPage { items, cursor: cursor.map(str::to_string), next: page.next_offset.map(|n| n.to_string()), total: page.total }, name, image))
}

async fn youtube_playlist(r: &Resolver, id: &str, cursor: Option<&str>) -> Result<(CollectionPage, Option<String>, Option<String>), ResolveError> {
    let p = SourceProvider::Youtube;
    let Some(key) = r.secret(SECRET_YOUTUBE) else { return Err(ResolveError::SetupRequired { provider: p }) };
    let (mut name, mut image) = (None, None);
    if cursor.is_none() {
        let resp = send(r, HttpRequest::new(Method::Get, format!("{YT_API}/playlists?part=snippet&id={}&key={}", enc(id), enc(&key))), p).await?;
        if resp.status != 200 {
            return Err(youtube_api_error(&resp));
        }
        let v = resp.json_body().unwrap_or_default();
        let Some(x) = v["items"].as_array().and_then(|a| a.first()) else { return Err(ResolveError::NotAccessible { provider: p }) };
        name = x["snippet"]["title"].as_str().map(str::to_string);
        image = x["snippet"]["thumbnails"]["high"]["url"].as_str().map(str::to_string);
    }
    let mut url = format!("{YT_API}/playlistItems?part=snippet,status&maxResults={PAGE}&playlistId={}&key={}", enc(id), enc(&key));
    if let Some(c) = cursor {
        url.push_str(&format!("&pageToken={}", enc(c)));
    }
    let resp = send(r, HttpRequest::new(Method::Get, url), p).await?;
    if resp.status != 200 {
        return Err(youtube_api_error(&resp));
    }
    let v = resp.json_body().unwrap_or_default();
    let mut items: Vec<SourceItem> = v["items"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    let s = &x["snippet"];
                    let vid = s["resourceId"]["videoId"].as_str()?.to_string();
                    let title = s["title"].as_str().unwrap_or("");
                    let mut it = item(p, vid.clone(), Some(format!("https://www.youtube.com/watch?v={vid}")), title);
                    it.uploader = s["videoOwnerChannelTitle"].as_str().map(str::to_string);
                    it.image_url = s["thumbnails"]["default"]["url"].as_str().map(str::to_string);
                    let privacy = x["status"]["privacyStatus"].as_str().unwrap_or("public");
                    it.available = !matches!(privacy, "private" | "privacyStatusUnspecified") && title != "Deleted video" && title != "Private video";
                    topic_artist(&mut it);
                    Some(it)
                })
                .collect()
        })
        .unwrap_or_default();
    // Laufzeiten der Seite in einer Abfrage nachladen (optional – Fehler sind unkritisch).
    let ids: Vec<&str> = items.iter().filter(|i| i.available).map(|i| i.id.as_str()).collect();
    if !ids.is_empty() {
        let url = format!("{YT_API}/videos?part=contentDetails&id={}&key={}", enc(&ids.join(",")), enc(&key));
        if let Ok(resp) = send(r, HttpRequest::new(Method::Get, url), p).await {
            if resp.status == 200 {
                let v = resp.json_body().unwrap_or_default();
                for x in v["items"].as_array().cloned().unwrap_or_default() {
                    if let (Some(id), Some(d)) = (x["id"].as_str(), x["contentDetails"]["duration"].as_str().and_then(iso_duration_ms)) {
                        if let Some(it) = items.iter_mut().find(|i| i.id == id) {
                            it.duration_ms = Some(d);
                        }
                    }
                }
            }
        }
    }
    let total = v["pageInfo"]["totalResults"].as_u64().map(|t| t as u32);
    let next = v["nextPageToken"].as_str().map(str::to_string);
    Ok((CollectionPage { items, cursor: cursor.map(str::to_string), next, total }, name, image))
}

async fn apple_collection(r: &Resolver, c: &CollectionRef, cursor: Option<&str>) -> Result<(CollectionPage, Option<String>, Option<String>), ResolveError> {
    let p = SourceProvider::AppleMusic;
    let sf = c.storefront.clone().unwrap_or_else(|| "us".into());
    let token = r.secret(SECRET_APPLE);
    match (c.kind, token) {
        (CollectionKind::Playlist, None) => Err(ResolveError::SetupRequired { provider: p }),
        (CollectionKind::Playlist, Some(token)) => {
            let (mut name, mut image) = (None, None);
            if cursor.is_none() {
                let resp = send(r, HttpRequest::new(Method::Get, format!("{APPLE_API}/catalog/{}/playlists/{}", enc(&sf), enc(&c.id))).bearer(&token), p).await?;
                if resp.status != 200 {
                    return Err(status_err(&resp, p));
                }
                let v = resp.json_body().unwrap_or_default();
                let a = &v["data"][0]["attributes"];
                name = a["name"].as_str().map(str::to_string);
                image = apple_artwork(a);
            }
            let off = offset(cursor);
            let resp = send(r, HttpRequest::new(Method::Get, format!("{APPLE_API}/catalog/{}/playlists/{}/tracks?limit=100&offset={off}", enc(&sf), enc(&c.id))).bearer(&token), p).await?;
            if resp.status != 200 {
                return Err(status_err(&resp, p));
            }
            let v = resp.json_body().unwrap_or_default();
            let items: Vec<SourceItem> = v["data"].as_array().map(|a| a.iter().map(|x| apple_api_item(x, &sf)).collect()).unwrap_or_default();
            let next = v["next"].is_string().then(|| (off + items.len() as u32).to_string());
            let total = v["meta"]["total"].as_u64().map(|t| t as u32);
            Ok((CollectionPage { items, cursor: cursor.map(str::to_string), next, total }, name, image))
        }
        (CollectionKind::Album, _) => {
            // Öffentliche Lookup-API genügt für Alben (bis 200 Titel).
            let req = HttpRequest::new(Method::Get, format!("{ITUNES_LOOKUP}?id={}&country={}&entity=song&limit=200", enc(&c.id), enc(&sf)));
            let resp = send(r, req, p).await?;
            if resp.status != 200 {
                return Err(if resp.status == 403 { ResolveError::RateLimited { provider: p } } else { status_err(&resp, p).not_setup() });
            }
            let v = resp.json_body().unwrap_or_default();
            let results = v["results"].as_array().cloned().unwrap_or_default();
            let Some(coll) = results.iter().find(|x| x["wrapperType"] == "collection") else { return Err(ResolveError::NotAccessible { provider: p }) };
            let name = coll["collectionName"].as_str().map(str::to_string);
            let image = coll["artworkUrl100"].as_str().map(|u| u.replace("100x100", "300x300"));
            let all: Vec<SourceItem> = results.iter().filter(|x| x["wrapperType"] == "track").map(|x| itunes_item(x, &sf)).collect();
            Ok((local_page(all, cursor), name, image))
        }
    }
}

async fn soundcloud_set(r: &Resolver, path: &str, cursor: Option<&str>) -> Result<(CollectionPage, Option<String>, Option<String>), ResolveError> {
    let p = SourceProvider::Soundcloud;
    let url = format!("https://soundcloud.com{path}");
    let Some(resp) = soundcloud_get(r, format!("{SC_API}/resolve?url={}", enc(&url))).await? else {
        return Err(ResolveError::SetupRequired { provider: p });
    };
    if resp.status != 200 {
        return Err(status_err(&resp, p));
    }
    let v = resp.json_body().unwrap_or_default();
    if v["kind"] != "playlist" {
        return Err(ResolveError::Unsupported { what: "link".into() });
    }
    let raw = v["tracks"].as_array().cloned().unwrap_or_default();
    // Nur die angezeigte Seite vollständig nachladen (SoundCloud liefert hintere Einträge verkürzt).
    let start = offset(cursor) as usize;
    let end = (start + PAGE as usize).min(raw.len());
    let window = if start < raw.len() { &raw[start..end] } else { &[][..] };
    let missing: Vec<String> = window.iter().filter(|x| x["title"].is_null()).filter_map(|x| x["id"].as_u64().map(|i| i.to_string())).collect();
    let mut full: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    if !missing.is_empty() {
        if let Some(resp) = soundcloud_get(r, format!("{SC_API}/tracks?ids={}", enc(&missing.join(",")))).await? {
            if resp.status == 200 {
                for x in resp.json_body().and_then(|v| v.as_array().cloned()).unwrap_or_default() {
                    if let Some(id) = x["id"].as_u64() {
                        full.insert(id.to_string(), x);
                    }
                }
            }
        }
    }
    let mut all: Vec<SourceItem> = Vec::with_capacity(raw.len());
    for (i, x) in raw.iter().enumerate() {
        let id = x["id"].as_u64().map(|i| i.to_string()).unwrap_or_default();
        let src = full.get(&id).unwrap_or(x);
        let mut it = soundcloud_item(src);
        if src["title"].is_null() {
            // Außerhalb der angezeigten Seite: nur als Platzhalter (nicht durchsuchbar).
            it.title = format!("Titel {}", i + 1);
            it.available = false;
        }
        all.push(it);
    }
    let name = v["title"].as_str().map(str::to_string);
    let image = v["artwork_url"].as_str().map(str::to_string);
    Ok((local_page(all, cursor), name, image))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_durations() {
        assert_eq!(iso_duration_ms("PT3M20S"), Some(200_000));
        assert_eq!(iso_duration_ms("PT1H2M3S"), Some(3_723_000));
        assert_eq!(iso_duration_ms("PT45S"), Some(45_000));
        assert_eq!(iso_duration_ms("P0D"), None);
        assert_eq!(iso_duration_ms("garbage"), None);
    }
}
