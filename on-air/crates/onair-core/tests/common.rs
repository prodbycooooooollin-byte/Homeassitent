//! Kontrollierte Fake-Provider für die Abnahmetests (simuliert, keine echten Dienste).
#![allow(dead_code)]

use onair_core::auth::{TokenManager, TokenSet};
use onair_core::clock::{Clock, SharedClock};
use onair_core::http::{FakeTransport, HttpRequest, HttpResponse, Method, TransportError};
use onair_core::secrets::MemorySecretStore;
use onair_core::spotify::auth::SpotifyTokenEndpoint;
use onair_core::spotify::SpotifyClient;
use serde_json::{json, Value};
use std::collections::HashSet;
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
        }
    }
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
                    let mut body = json!({"access_token": t, "expires_in": 3600, "scope": "user-read-playback-state user-modify-playback-state user-read-currently-playing"});
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
                    "item": self.current.as_deref().map(track_json).unwrap_or(Value::Null),
                    "actions": {"disallows": {}}
                })))
            }
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
                let n = q.bytes().fold(7u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32)) % 100_000;
                Ok(HttpResponse::json(200, json!({"tracks": {"items": [track_json(&tid(n)), track_json(&tid(n + 1))]}})))
            }
            (Method::Get, r) if r.starts_with("/tracks/") => Ok(HttpResponse::json(200, track_json(&r[8..]))),
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

/// Fake-Twitch: Token-Validierung, EventSub-Abo, Kanalpunkte-Belohnungen und -Einlösungen.
#[derive(Default)]
pub struct FakeTwitch {
    pub rewards: Vec<(String, Value, bool)>, // (id, reward, manageable)
    pub redemptions: Vec<(String, String, String, String, String)>, // (id, reward_id, user_id, input, status)
    pub creates: u32,
    pub reward_patches: u32,
    pub redemption_patches: Vec<(String, String)>,
    pub fail_patch: bool,
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
}

impl Harness {
    pub fn new() -> Self {
        let fake = Arc::new(Mutex::new(FakeSpotify::default()));
        let twitch = Arc::new(Mutex::new(FakeTwitch::new()));
        let f2 = fake.clone();
        let t2 = twitch.clone();
        let transport = FakeTransport::new(move |r| {
            if r.url.starts_with("http://fake-helix") || r.url.starts_with("http://fake-twitch-id") {
                t2.lock().unwrap().handle(r)
            } else {
                f2.lock().unwrap().handle(r)
            }
        });
        Self { twitch, fake, transport, secrets: Arc::new(MemorySecretStore::default()), clock: TokioClock::new() }
    }

    pub fn tokens(&self, key: &str, expires_in_ms: i64) -> Arc<TokenManager> {
        let now = self.clock.now_ms();
        let set = TokenSet {
            access_token: "at-0".into(),
            refresh_token: Some("rt-0".into()),
            expires_at_ms: now + expires_in_ms,
            scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing".into(),
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
