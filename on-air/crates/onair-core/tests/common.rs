//! Kontrollierte Fake-Provider für die Abnahmetests (simuliert, keine echten Dienste).
#![allow(dead_code)]

use onair_core::auth::{TokenManager, TokenSet};
use onair_core::clock::{Clock, SharedClock};
use onair_core::http::{Body, FakeTransport, HttpRequest, HttpResponse, Method, TransportError};
use onair_core::secrets::MemorySecretStore;
use onair_core::spotify::auth::SpotifyTokenEndpoint;
use onair_core::spotify::SpotifyClient;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

pub const ACCOUNTS: &str = "http://fake-accounts";
pub const API: &str = "http://fake-api/v1";

/// Uhr, die der (in Tests pausierbaren) Tokio-Zeit folgt.
pub struct TokioClock {
    base: i64,
    start: tokio::time::Instant,
}
impl TokioClock {
    pub fn new() -> Arc<Self> {
        Arc::new(Self { base: 1_790_000_000_000, start: tokio::time::Instant::now() })
    }
}
impl Clock for TokioClock {
    fn now_ms(&self) -> i64 {
        self.base + self.start.elapsed().as_millis() as i64
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RefreshMode {
    Ok,
    OkWithoutNewRefreshToken,
    InvalidGrant,
    ServerError,
    Network,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AddMode {
    Ok,
    /// Spotify übernimmt den Titel, die Antwort geht aber verloren (Timeout).
    AppliedButTimeout,
    NotSent,
}

pub struct FakeSpotify {
    pub valid_tokens: HashSet<String>,
    pub token_n: u32,
    pub refresh_mode: RefreshMode,
    pub refresh_count: u32,
    pub offline: bool,
    pub fail_5xx: u32,
    pub rate_limit_s: Option<u64>,
    pub no_session: bool,
    pub device: String,
    pub current: Option<String>,
    pub is_playing: bool,
    pub progress_ms: u64,
    pub queue: Vec<String>,
    pub add_mode: AddMode,
    /// Wiedergabekontext (`{"type": "playlist", "uri": …}`), falls gesetzt.
    pub context: Option<Value>,
    /// Antwort auf GET /playlists/{id}: (Name, public).
    pub playlist: Option<(String, Option<bool>)>,
    /// Von der App angelegte Playlists: (ID, Name, public).
    pub created_playlists: Vec<(String, String, bool)>,
    /// Inhalt der Playlists (POST /playlists/{id}/items).
    pub playlist_items: HashMap<String, Vec<String>>,
    /// Track-Relinking simulieren: der laufende Titel kommt mit anderer ID und `linked_from`.
    pub relink: bool,
    /// Realistischer Suchkatalog: ist er gefüllt, liefert /search nur passende Einträge.
    pub catalog: Vec<Value>,
    /// Playlist-Inhalte zum Lesen (GET /playlists/{id}/items); fehlend = 403 (Development Mode).
    pub readable_playlists: HashMap<String, Vec<Value>>,
    /// Gezählte Suchanfragen.
    pub searches: Vec<String>,
}

impl Default for FakeSpotify {
    fn default() -> Self {
        let mut valid = HashSet::new();
        valid.insert("at-0".to_string());
        Self {
            valid_tokens: valid,
            token_n: 0,
            refresh_mode: RefreshMode::Ok,
            refresh_count: 0,
            offline: false,
            fail_5xx: 0,
            rate_limit_s: None,
            no_session: false,
            device: "Gaming-PC".into(),
            current: Some("t0000000000000000000000".into()),
            is_playing: true,
            progress_ms: 10_000,
            queue: vec![],
            add_mode: AddMode::Ok,
            context: None,
            playlist: None,
            created_playlists: vec![],
            playlist_items: HashMap::new(),
            relink: false,
            catalog: vec![],
            readable_playlists: HashMap::new(),
            searches: vec![],
        }
    }
}

/// Katalogeintrag für die Suche.
pub fn cat(id: &str, name: &str, artist: &str, dur_s: u64) -> Value {
    json!({
        "type": "track", "id": id, "uri": format!("spotify:track:{id}"), "name": name,
        "artists": [{"name": artist}], "album": {"name": "Album", "images": []},
        "duration_ms": dur_s * 1000, "explicit": false
    })
}

fn words(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty() && !matches!(*w, "track" | "artist")).map(str::to_string).collect()
}

pub fn track_json(id: &str) -> Value {
    json!({
        "type": "track", "id": id, "uri": format!("spotify:track:{id}"), "name": format!("Song {id}"),
        "artists": [{"name": format!("Artist {}", &id[..2])}], "album": {"name": "Album", "images": [{"url": "https://i.scdn.co/image/x", "width": 640}]},
        "duration_ms": 200_000, "explicit": false
    })
}

pub fn tid(n: u32) -> String {
    format!("t{:021}", n)
}

impl FakeSpotify {
    fn authorized(&self, req: &HttpRequest) -> bool {
        req.header_value("authorization")
            .and_then(|h| h.strip_prefix("Bearer "))
            .map(|t| self.valid_tokens.contains(t))
            .unwrap_or(false)
    }

    pub fn expire_all_tokens(&mut self) {
        self.valid_tokens.clear();
    }

    pub fn handle(&mut self, req: &HttpRequest) -> Result<HttpResponse, TransportError> {
        if self.offline {
            return Err(TransportError::Connect("dns error".into()));
        }
        let path = req.url.clone();
        if path.starts_with(ACCOUNTS) {
            self.refresh_count += 1;
            return match self.refresh_mode {
                RefreshMode::Ok | RefreshMode::OkWithoutNewRefreshToken => {
                    self.token_n += 1;
                    let t = format!("at-{}", self.token_n);
                    self.valid_tokens.insert(t.clone());
                    let mut body = json!({"access_token": t, "expires_in": 3600, "scope": "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-modify-private playlist-modify-public"});
                    if self.refresh_mode == RefreshMode::Ok {
                        body["refresh_token"] = json!(format!("rt-{}", self.token_n));
                    }
                    Ok(HttpResponse::json(200, body))
                }
                RefreshMode::InvalidGrant => Ok(HttpResponse::json(400, json!({"error": "invalid_grant", "error_description": "Refresh token revoked"}))),
                RefreshMode::ServerError => Ok(HttpResponse::json(503, json!({"error": "server_error"}))),
                RefreshMode::Network => Err(TransportError::Timeout("timeout".into())),
            };
        }
        if let Some(s) = self.rate_limit_s {
            return Ok(HttpResponse::new(429).with_header("Retry-After", &s.to_string()));
        }
        if self.fail_5xx > 0 {
            self.fail_5xx -= 1;
            return Ok(HttpResponse::json(503, json!({"error": {"status": 503, "message": "Service unavailable"}})));
        }
        if !self.authorized(req) {
            return Ok(HttpResponse::json(401, json!({"error": {"status": 401, "message": "The access token expired"}})));
        }
        let p = path.strip_prefix(API).unwrap_or(&path);
        let (route, _q) = p.split_once('?').unwrap_or((p, ""));
        match (req.method, route) {
            (Method::Get, "/me/player") => {
                if self.no_session {
                    return Ok(HttpResponse::new(204));
                }
                Ok(HttpResponse::json(200, json!({
                    "is_playing": self.is_playing, "progress_ms": self.progress_ms, "shuffle_state": false, "repeat_state": "off",
                    "currently_playing_type": "track",
                    "device": {"id": format!("dev-{}", self.device), "name": self.device, "type": "Computer", "is_active": true, "is_restricted": false, "volume_percent": 60},
                    "item": self.current.as_deref().map(|id| {
                        let mut t = track_json(id);
                        if self.relink {
                            let other = format!("x{}", &id[1..]);
                            t["linked_from"] = json!({"id": id, "uri": format!("spotify:track:{id}")});
                            t["id"] = json!(other);
                            t["uri"] = json!(format!("spotify:track:{other}"));
                        }
                        t
                    }).unwrap_or(Value::Null),
                    "context": self.context.clone().unwrap_or(Value::Null),
                    "actions": {"disallows": {}}
                })))
            }
            (Method::Post, "/me/playlists") => {
                let Body::Json(b) = &req.body else { return Ok(HttpResponse::new(400)) };
                let id = format!("pl{}", self.created_playlists.len() + 1);
                self.created_playlists.push((id.clone(), b["name"].as_str().unwrap_or("").into(), b["public"].as_bool().unwrap_or(true)));
                self.playlist_items.insert(id.clone(), vec![]);
                Ok(HttpResponse::json(201, json!({"id": id, "external_urls": {"spotify": format!("https://open.spotify.com/playlist/{id}")}})))
            }
            (Method::Post, r) if r.starts_with("/playlists/") && r.ends_with("/items") => {
                let id = r.trim_start_matches("/playlists/").trim_end_matches("/items").to_string();
                let Body::Json(b) = &req.body else { return Ok(HttpResponse::new(400)) };
                match self.playlist_items.get_mut(&id) {
                    Some(items) => {
                        items.extend(b["uris"].as_array().unwrap().iter().map(|u| u.as_str().unwrap().to_string()));
                        Ok(HttpResponse::json(201, json!({"snapshot_id": "s"})))
                    }
                    None => Ok(HttpResponse::json(404, json!({"error": {"status": 404, "message": "Resource not found"}}))),
                }
            }
            (Method::Get, r) if r.starts_with("/playlists/") && r.ends_with("/items") => {
                let id = r.trim_start_matches("/playlists/").trim_end_matches("/items");
                let q: HashMap<String, String> = url::Url::parse(&req.url).unwrap().query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();
                let off: usize = q.get("offset").and_then(|o| o.parse().ok()).unwrap_or(0);
                let lim: usize = q.get("limit").and_then(|o| o.parse().ok()).unwrap_or(50);
                match self.readable_playlists.get(id) {
                    Some(items) => {
                        let page: Vec<Value> = items.iter().skip(off).take(lim).map(|t| json!({"item": t})).collect();
                        let next = (off + lim < items.len()).then(|| format!("{API}/playlists/{id}/items?offset={}", off + lim));
                        Ok(HttpResponse::json(200, json!({"items": page, "total": items.len(), "next": next})))
                    }
                    None => Ok(HttpResponse::json(403, json!({"error": {"status": 403, "message": "Forbidden"}}))),
                }
            }
            (Method::Get, r) if r.starts_with("/playlists/") => match &self.playlist {
                Some((name, public)) => Ok(HttpResponse::json(200, json!({"name": name, "public": public}))),
                None => Ok(HttpResponse::json(404, json!({"error": {"status": 404, "message": "Not found"}}))),
            },
            (Method::Get, "/me/player/devices") => Ok(HttpResponse::json(200, json!({"devices": [
                {"id": format!("dev-{}", self.device), "name": self.device, "type": "Computer", "is_active": !self.no_session, "is_restricted": false, "volume_percent": 60}
            ]}))),
            (Method::Get, "/me/player/queue") => Ok(HttpResponse::json(200, json!({
                "currently_playing": self.current.as_deref().map(track_json).unwrap_or(Value::Null),
                "queue": self.queue.iter().map(|u| track_json(u.trim_start_matches("spotify:track:"))).collect::<Vec<_>>()
            }))),
            (Method::Post, "/me/player/queue") => {
                if self.no_session {
                    return Ok(HttpResponse::json(404, json!({"error": {"status": 404, "message": "Player command failed: No active device found", "reason": "NO_ACTIVE_DEVICE"}})));
                }
                let uri = url::Url::parse(&req.url).unwrap().query_pairs().find(|(k, _)| k == "uri").map(|(_, v)| v.to_string()).unwrap();
                match self.add_mode {
                    AddMode::Ok => {
                        self.queue.push(uri);
                        Ok(HttpResponse::new(200))
                    }
                    AddMode::AppliedButTimeout => {
                        self.queue.push(uri);
                        Err(TransportError::Timeout("operation timed out".into()))
                    }
                    AddMode::NotSent => Err(TransportError::Connect("connection refused".into())),
                }
            }
            (Method::Post, "/me/player/next") => {
                self.advance();
                Ok(HttpResponse::new(200))
            }
            (Method::Get, "/me") => Ok(HttpResponse::json(200, json!({"id": "me", "display_name": "Streamer"}))),
            (Method::Get, "/search") => {
                // Deterministischer Treffer je Suchbegriff.
                let q = url::Url::parse(&req.url).unwrap().query_pairs().find(|(k, _)| k == "q").map(|(_, v)| v.to_string()).unwrap_or_default();
                self.searches.push(q.clone());
                if !self.catalog.is_empty() {
                    // Treffer: alle Suchwörter kommen in Titel oder Interpret vor (ISRC exakt).
                    let hits: Vec<Value> = if let Some(isrc) = q.strip_prefix("isrc:") {
                        self.catalog.iter().filter(|t| t["isrc"].as_str() == Some(isrc)).cloned().collect()
                    } else {
                        let qw = words(&q);
                        self.catalog
                            .iter()
                            .filter(|t| {
                                let hay = words(&format!("{} {}", t["name"].as_str().unwrap_or(""), t["artists"][0]["name"].as_str().unwrap_or("")));
                                qw.iter().filter(|w| !matches!(w.as_str(), "remix" | "live" | "acoustic")).all(|w| hay.contains(w))
                            })
                            .cloned()
                            .collect()
                    };
                    return Ok(HttpResponse::json(200, json!({"tracks": {"items": hits}})));
                }
                // Deterministischer Treffer je Suchbegriff; der erste trägt den gesuchten Titel.
                let n = q.bytes().fold(7u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32)) % 100_000;
                let mut first = track_json(&tid(n));
                first["name"] = json!(q);
                Ok(HttpResponse::json(200, json!({"tracks": {"items": [first, track_json(&tid(n + 1))]}})))
            }
            (Method::Get, r) if r.starts_with("/tracks/") => {
                let id = &r[8..];
                match self.catalog.iter().find(|t| t["id"] == id) {
                    Some(t) => Ok(HttpResponse::json(200, t.clone())),
                    None => Ok(HttpResponse::json(200, track_json(id))),
                }
            }
            _ => Ok(HttpResponse::json(404, json!({"error": {"status": 404, "message": "not found"}}))),
        }
    }

    /// Nächster Titel: zuerst aus der Queue, sonst ein Kontext-Titel.
    pub fn advance(&mut self) {
        self.progress_ms = 0;
        self.current = Some(if self.queue.is_empty() {
            tid(9_000 + self.token_n + self.progress_ms as u32)
        } else {
            self.queue.remove(0).trim_start_matches("spotify:track:").to_string()
        });
    }
}

/// Simulierte Metadaten-Anbieter (YouTube, Apple Music, SoundCloud, Kurzlinks).
#[derive(Default)]
pub struct FakeProviders {
    /// oEmbed: Video-ID → (Titel, Kanal). Fehlend = 404.
    pub yt_oembed: HashMap<String, (String, String)>,
    /// Private Videos (oEmbed 401).
    pub yt_private: HashSet<String>,
    /// YouTube Data API: Playlist-ID → (Name, [(Video-ID, Titel, Kanal)]).
    pub yt_playlists: HashMap<String, (String, Vec<(String, String, String)>)>,
    /// Anbieter nicht erreichbar (Verbindungsfehler).
    pub yt_down: bool,
    /// iTunes Lookup: ID → Ergebnisobjekt.
    pub itunes: HashMap<String, Value>,
    pub itunes_throttled: bool,
    /// SoundCloud oEmbed: Pfad → (Titel, Uploader).
    pub sc_oembed: HashMap<String, (String, String)>,
    /// Kurzlinks: URL → Weiterleitungsziel.
    pub short: HashMap<String, String>,
    pub calls: Vec<String>,
}

impl FakeProviders {
    pub fn handles(url: &str) -> bool {
        ["https://www.youtube.com/", "https://www.googleapis.com/", "https://itunes.apple.com/", "https://api.music.apple.com/", "https://api.soundcloud.com/", "https://secure.soundcloud.com/", "https://soundcloud.com/", "https://spotify.link/", "https://on.soundcloud.com/"]
            .iter()
            .any(|p| url.starts_with(p))
    }

    pub fn handle(&mut self, req: &HttpRequest) -> Result<HttpResponse, TransportError> {
        self.calls.push(req.url.clone());
        let u = url::Url::parse(&req.url).unwrap();
        let q: HashMap<String, String> = u.query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        if let Some(loc) = self.short.get(&req.url) {
            assert!(!req.follow_redirects, "Kurzlinks werden ohne automatische Weiterleitung abgerufen");
            return Ok(HttpResponse::new(302).with_header("Location", loc));
        }
        if (req.url.starts_with("https://www.youtube.com/oembed") || req.url.starts_with("https://www.googleapis.com/")) && self.yt_down {
            return Err(TransportError::Connect("connection refused".into()));
        }
        if req.url.starts_with("https://www.youtube.com/oembed") {
            let target = url::Url::parse(&q["url"]).unwrap();
            let v = target.query_pairs().find(|(k, _)| k == "v").map(|(_, v)| v.to_string()).unwrap_or_default();
            if self.yt_private.contains(&v) {
                return Ok(HttpResponse::new(401));
            }
            return match self.yt_oembed.get(&v) {
                Some((t, a)) => Ok(HttpResponse::json(200, json!({"title": t, "author_name": a, "thumbnail_url": "https://i.ytimg.com/x.jpg"}))),
                None => Ok(HttpResponse::new(404)),
            };
        }
        if req.url.starts_with("https://www.googleapis.com/youtube/v3/playlists") {
            return Ok(match self.yt_playlists.get(&q["id"]) {
                Some((name, _)) => HttpResponse::json(200, json!({"items": [{"snippet": {"title": name}}]})),
                None => HttpResponse::json(200, json!({"items": []})),
            });
        }
        if req.url.starts_with("https://www.googleapis.com/youtube/v3/playlistItems") {
            let Some((_, items)) = self.yt_playlists.get(&q["playlistId"]) else { return Ok(HttpResponse::json(404, json!({"error": {"errors": [{"reason": "playlistNotFound"}]}}))) };
            let start: usize = q.get("pageToken").and_then(|t| t.parse().ok()).unwrap_or(0);
            let page: Vec<Value> = items.iter().skip(start).take(50).map(|(v, t, c)| json!({"snippet": {"title": t, "videoOwnerChannelTitle": c, "resourceId": {"videoId": v}}, "status": {"privacyStatus": "public"}})).collect();
            let next = (start + 50 < items.len()).then(|| (start + 50).to_string());
            return Ok(HttpResponse::json(200, json!({"items": page, "nextPageToken": next, "pageInfo": {"totalResults": items.len()}})));
        }
        if req.url.starts_with("https://www.googleapis.com/youtube/v3/videos") {
            return Ok(HttpResponse::json(200, json!({"items": []})));
        }
        if req.url.starts_with("https://itunes.apple.com/lookup") {
            if self.itunes_throttled {
                return Ok(HttpResponse::new(403));
            }
            let res: Vec<Value> = self.itunes.get(&q["id"]).cloned().into_iter().collect();
            return Ok(HttpResponse::json(200, json!({"resultCount": res.len(), "results": res})));
        }
        if req.url.starts_with("https://soundcloud.com/oembed") {
            let target = url::Url::parse(&q["url"]).unwrap();
            return match self.sc_oembed.get(target.path()) {
                Some((t, a)) => Ok(HttpResponse::json(200, json!({"title": format!("{t} by {a}"), "author_name": a}))),
                None => Ok(HttpResponse::new(404)),
            };
        }
        Ok(HttpResponse::new(404))
    }
}

/// Fake-Twitch: Token-Validierung, EventSub-Abo, Kanalpunkte-Belohnungen und -Einlösungen.
#[derive(Default)]
pub struct FakeTwitch {
    pub rewards: Vec<(String, Value, bool)>, // (id, reward, manageable)
    pub redemptions: Vec<(String, String, String, String, String)>, // (id, reward_id, user_id, input, status)
    pub creates: u32,
    pub reward_patches: u32,
    pub redemption_patches: Vec<(String, String)>,
    /// Gesendete Chatnachrichten (POST /chat/messages).
    pub chat: Vec<String>,
    pub fail_patch: bool,
    /// GET …/redemptions schlägt dauerhaft fehl (403), z. B. fremde Client-ID.
    pub fail_redemption_list: bool,
    pub not_affiliate: bool,
    pub offline: bool,
    pub scopes: Vec<String>,
    n: u32,
}

impl FakeTwitch {
    pub fn new() -> Self {
        Self { scopes: vec!["user:read:chat".into(), "user:write:chat".into(), "channel:manage:redemptions".into()], ..Default::default() }
    }

    pub fn add_redemption(&mut self, id: &str, reward_id: &str, user: &str, input: &str) {
        self.redemptions.push((id.into(), reward_id.into(), user.into(), input.into(), "UNFULFILLED".into()));
    }

    pub fn redemption_status(&self, id: &str) -> Option<String> {
        self.redemptions.iter().find(|r| r.0 == id).map(|r| r.4.clone())
    }

    fn red_json(r: &(String, String, String, String, String)) -> Value {
        json!({"id": r.0, "reward": {"id": r.1}, "user_id": r.2, "user_login": format!("u{}", r.2), "user_name": format!("User{}", r.2), "user_input": r.3, "status": r.4})
    }

    pub fn handle(&mut self, req: &HttpRequest) -> Result<HttpResponse, TransportError> {
        if self.offline {
            return Err(TransportError::Connect("offline".into()));
        }
        let u = url::Url::parse(&req.url).unwrap();
        let q: Vec<(String, String)> = u.query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        let get = |k: &str| q.iter().find(|(a, _)| a == k).map(|(_, v)| v.clone());
        let ids: Vec<String> = q.iter().filter(|(k, _)| k == "id").map(|(_, v)| v.clone()).collect();
        let body = match &req.body {
            onair_core::http::Body::Json(v) => v.clone(),
            _ => Value::Null,
        };
        let path = u.path().to_string();
        match (req.method, path.as_str()) {
            (Method::Get, "/oauth2/validate") => Ok(HttpResponse::json(200, json!({"client_id": "c", "login": "streamer", "user_id": "100", "scopes": self.scopes, "expires_in": 3600}))),
            (Method::Post, "/eventsub/subscriptions") => Ok(HttpResponse::json(202, json!({"data": []}))),
            (Method::Post, "/chat/messages") => {
                self.chat.push(body["message"].as_str().unwrap_or("").to_string());
                Ok(HttpResponse::json(200, json!({"data": [{"message_id": format!("m{}", self.chat.len()), "is_sent": true}]})))
            }
            (Method::Get, "/streams") => Ok(HttpResponse::json(200, json!({"data": []}))),
            (Method::Post, "/channel_points/custom_rewards") => {
                if self.not_affiliate {
                    return Ok(HttpResponse::json(403, json!({"message": "The broadcaster must be a partner or affiliate"})));
                }
                let title = body["title"].as_str().unwrap_or("").to_string();
                if self.rewards.iter().any(|(_, r, _)| r["title"].as_str().map(|t| t.eq_ignore_ascii_case(&title)).unwrap_or(false)) {
                    return Ok(HttpResponse::json(400, json!({"message": "CREATE_CUSTOM_REWARD_DUPLICATE_REWARD"})));
                }
                self.n += 1;
                self.creates += 1;
                let id = format!("rw-{}", self.n);
                let mut r = body.clone();
                r["id"] = json!(id);
                self.rewards.push((id, r.clone(), true));
                Ok(HttpResponse::json(200, json!({"data": [r]})))
            }
            (Method::Patch, "/channel_points/custom_rewards") => {
                if self.fail_patch {
                    return Ok(HttpResponse::json(503, json!({"message": "unavailable"})));
                }
                self.reward_patches += 1;
                let id = get("id").unwrap_or_default();
                match self.rewards.iter_mut().find(|(i, _, m)| *i == id && *m) {
                    None => Ok(HttpResponse::json(404, json!({"message": "not found"}))),
                    Some((_, r, _)) => {
                        if let Some(o) = body.as_object() {
                            for (k, v) in o {
                                r[k] = v.clone();
                            }
                        }
                        Ok(HttpResponse::json(200, json!({"data": [r.clone()]})))
                    }
                }
            }
            (Method::Get, "/channel_points/custom_rewards") => {
                let list: Vec<Value> = self.rewards.iter().filter(|(_, _, m)| *m).map(|(_, r, _)| r.clone()).collect();
                Ok(HttpResponse::json(200, json!({"data": list})))
            }
            (Method::Get, "/channel_points/custom_rewards/redemptions") if self.fail_redemption_list => {
                Ok(HttpResponse::json(403, json!({"message": "The ID in header Client-Id must match the client ID used to create the custom reward."})))
            }
            (Method::Get, "/channel_points/custom_rewards/redemptions") => {
                let reward = get("reward_id").unwrap_or_default();
                let status = get("status");
                let list: Vec<Value> = self
                    .redemptions
                    .iter()
                    .filter(|r| r.1 == reward)
                    .filter(|r| ids.is_empty() || ids.contains(&r.0))
                    .filter(|r| status.as_ref().map(|s| &r.4 == s).unwrap_or(true))
                    .map(Self::red_json)
                    .collect();
                Ok(HttpResponse::json(200, json!({"data": list, "pagination": {}})))
            }
            (Method::Patch, "/channel_points/custom_rewards/redemptions") => {
                if self.fail_patch {
                    return Ok(HttpResponse::json(503, json!({"message": "unavailable"})));
                }
                let id = ids.first().cloned().unwrap_or_default();
                let target = body["status"].as_str().unwrap_or("").to_string();
                self.redemption_patches.push((id.clone(), target.clone()));
                match self.redemptions.iter_mut().find(|r| r.0 == id && r.4 == "UNFULFILLED") {
                    None => Ok(HttpResponse::json(404, json!({"message": "no redemptions found"}))),
                    Some(r) => {
                        r.4 = target.clone();
                        Ok(HttpResponse::json(200, json!({"data": [{"id": id, "status": target}]})))
                    }
                }
            }
            _ => Ok(HttpResponse::json(404, json!({"message": "not found"}))),
        }
    }
}

pub struct Harness {
    pub twitch: Arc<Mutex<FakeTwitch>>,
    pub fake: Arc<Mutex<FakeSpotify>>,
    pub transport: Arc<FakeTransport>,
    pub secrets: Arc<MemorySecretStore>,
    pub clock: SharedClock,
    pub providers: Arc<Mutex<FakeProviders>>,
}

impl Harness {
    pub fn new() -> Self {
        let fake = Arc::new(Mutex::new(FakeSpotify::default()));
        let twitch = Arc::new(Mutex::new(FakeTwitch::new()));
        let providers = Arc::new(Mutex::new(FakeProviders::default()));
        let f2 = fake.clone();
        let t2 = twitch.clone();
        let p2 = providers.clone();
        let transport = FakeTransport::new(move |r| {
            if r.url.starts_with("http://fake-helix") || r.url.starts_with("http://fake-twitch-id") {
                t2.lock().unwrap().handle(r)
            } else if FakeProviders::handles(&r.url) {
                p2.lock().unwrap().handle(r)
            } else {
                f2.lock().unwrap().handle(r)
            }
        });
        Self { twitch, fake, transport, secrets: Arc::new(MemorySecretStore::default()), clock: TokioClock::new(), providers }
    }

    pub fn tokens(&self, key: &str, expires_in_ms: i64) -> Arc<TokenManager> {
        let now = self.clock.now_ms();
        let set = TokenSet {
            access_token: "at-0".into(),
            refresh_token: Some("rt-0".into()),
            expires_at_ms: now + expires_in_ms,
            scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-modify-private playlist-modify-public".into(),
            authorized_at_ms: now,
        };
        onair_core::secrets::SecretStore::save(&*self.secrets, key, &serde_json::to_string(&set).unwrap()).unwrap();
        TokenManager::load(
            key,
            Arc::new(SpotifyTokenEndpoint { http: self.transport.clone(), client_id: Arc::new(|| "client".to_string()), accounts_base: ACCOUNTS.into() }),
            self.secrets.clone(),
            self.clock.clone(),
        )
    }

    /// Twitch-Anmeldung wie nach einem erfolgreichen Geräte-Code-Ablauf.
    pub fn twitch_tokens(&self) {
        let now = self.clock.now_ms();
        let set = TokenSet {
            access_token: "tw-0".into(),
            refresh_token: Some("tr-0".into()),
            expires_at_ms: now + 3_600_000,
            scope: "user:read:chat user:write:chat channel:manage:redemptions".into(),
            authorized_at_ms: now,
        };
        onair_core::secrets::SecretStore::save(&*self.secrets, onair_core::runtime::TWITCH_SECRET_KEY, &serde_json::to_string(&set).unwrap()).unwrap();
    }

    pub fn client(&self, tokens: Arc<TokenManager>) -> Arc<SpotifyClient> {
        SpotifyClient::new(self.transport.clone(), tokens, self.clock.clone(), API)
    }

    pub fn count(&self, method: Method, route: &str) -> usize {
        self.transport.count(|r| r.method == method && r.url.split('?').next().unwrap_or("").ends_with(route))
    }
}
