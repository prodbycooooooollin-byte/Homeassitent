//! Spotify Web API Client.
//!
//! - HTTP 401 → koordinierter Refresh über den [`TokenManager`], genau eine Wiederholung.
//! - HTTP 429 → `Retry-After` wird global respektiert; bis dahin verlassen keine
//!   Anfragen die App (keine Anfrageflut).
//! - Schreibende Operationen werden bei unklarem Ausgang nicht wiederholt.
//! - Ergebnisse einer beendeten Sitzung (Abmelden) werden verworfen.

use super::parse;
use crate::auth::TokenManager;
use crate::clock::SharedClock;
use crate::error::ApiError;
use crate::http::{HttpRequest, HttpResponse, Method, SharedTransport};
use crate::model::{Device, Playback, Track};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Semaphore;

pub const API_BASE: &str = "https://api.spotify.com/v1";
/// Sperren ab dieser Länge werden als Kontingent-Erschöpfung angezeigt.
pub const QUOTA_THRESHOLD_MS: u64 = 10 * 60 * 1000;
/// Spotify begrenzt `limit` bei /search im Development Mode auf 10 (Stand Feb. 2026).
pub const SEARCH_LIMIT: u32 = 10;

#[derive(Debug, Clone, Copy)]
struct Gate {
    until_ms: i64,
    quota: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ClientStats {
    pub requests: u64,
    pub rate_limited: u64,
    pub unauthorized: u64,
    pub server_errors: u64,
    pub network_errors: u64,
}

pub struct SpotifyClient {
    http: SharedTransport,
    tokens: Arc<TokenManager>,
    clock: SharedClock,
    api_base: String,
    gate: Mutex<Option<Gate>>,
    concurrency: Semaphore,
    requests: AtomicU64,
    rate_limited: AtomicU64,
    unauthorized: AtomicU64,
    server_errors: AtomicU64,
    network_errors: AtomicU64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserProfile {
    pub id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueSnapshot {
    pub currently_playing: Option<Track>,
    pub uris: Vec<String>,
}

impl SpotifyClient {
    pub fn new(http: SharedTransport, tokens: Arc<TokenManager>, clock: SharedClock, api_base: &str) -> Arc<Self> {
        Arc::new(Self {
            http,
            tokens,
            clock,
            api_base: api_base.trim_end_matches('/').to_string(),
            gate: Mutex::new(None),
            concurrency: Semaphore::new(4),
            requests: AtomicU64::new(0),
            rate_limited: AtomicU64::new(0),
            unauthorized: AtomicU64::new(0),
            server_errors: AtomicU64::new(0),
            network_errors: AtomicU64::new(0),
        })
    }

    pub fn tokens(&self) -> &Arc<TokenManager> {
        &self.tokens
    }

    pub fn stats(&self) -> ClientStats {
        ClientStats {
            requests: self.requests.load(Ordering::Relaxed),
            rate_limited: self.rate_limited.load(Ordering::Relaxed),
            unauthorized: self.unauthorized.load(Ordering::Relaxed),
            server_errors: self.server_errors.load(Ordering::Relaxed),
            network_errors: self.network_errors.load(Ordering::Relaxed),
        }
    }

    /// Aktive Rate-Limit-Pause (für Status und Scheduler).
    pub fn suspended_for_ms(&self) -> Option<(u64, bool)> {
        let now = self.clock.now_ms();
        let g = self.gate.lock().unwrap();
        g.and_then(|g| (g.until_ms > now).then(|| ((g.until_ms - now) as u64, g.quota)))
    }

    fn check_gate(&self) -> Result<(), ApiError> {
        if let Some((ms, quota)) = self.suspended_for_ms() {
            return Err(if quota {
                ApiError::QuotaExhausted { retry_after_ms: ms }
            } else {
                ApiError::RateLimited { retry_after_ms: ms }
            });
        }
        Ok(())
    }

    fn set_gate(&self, retry_after_ms: u64) -> ApiError {
        let quota = retry_after_ms >= QUOTA_THRESHOLD_MS;
        let until = self.clock.now_ms() + retry_after_ms as i64;
        let mut g = self.gate.lock().unwrap();
        let merged = match *g {
            Some(old) if old.until_ms > until => old,
            _ => Gate { until_ms: until, quota },
        };
        *g = Some(merged);
        self.rate_limited.fetch_add(1, Ordering::Relaxed);
        if quota {
            ApiError::QuotaExhausted { retry_after_ms }
        } else {
            ApiError::RateLimited { retry_after_ms }
        }
    }

    async fn send_once(&self, req: &HttpRequest, token: &crate::auth::AccessToken) -> Result<HttpResponse, ApiError> {
        self.check_gate()?;
        let _permit = self.concurrency.acquire().await.map_err(|_| ApiError::SessionEnded)?;
        self.requests.fetch_add(1, Ordering::Relaxed);
        let resp = self.http.send(req.clone().bearer(&token.token)).await.map_err(|e| {
            self.network_errors.fetch_add(1, Ordering::Relaxed);
            super::auth::transport_error(e)
        })?;
        if !self.tokens.is_current(token.epoch) {
            return Err(ApiError::SessionEnded);
        }
        Ok(resp)
    }

    /// Eine API-Anfrage inkl. koordiniertem 401-Handling (max. eine Wiederholung).
    async fn call(&self, req: HttpRequest) -> Result<HttpResponse, ApiError> {
        let token = self.tokens.access_token().await?;
        let mut resp = self.send_once(&req, &token).await?;
        if resp.status == 401 {
            self.unauthorized.fetch_add(1, Ordering::Relaxed);
            // Ein 401 wurde vom Server abgelehnt, nicht ausgeführt – eine Wiederholung ist sicher.
            let fresh = self.tokens.on_unauthorized(&token).await?;
            resp = self.send_once(&req, &fresh).await?;
            if resp.status == 401 {
                self.unauthorized.fetch_add(1, Ordering::Relaxed);
                return Err(ApiError::Unauthorized);
            }
        }
        self.classify(resp)
    }

    fn classify(&self, resp: HttpResponse) -> Result<HttpResponse, ApiError> {
        let s = resp.status;
        if (200..300).contains(&s) {
            return Ok(resp);
        }
        let v = resp.json_body().unwrap_or_default();
        let message = v["error"]["message"]
            .as_str()
            .or(v["error"].as_str())
            .unwrap_or("")
            .to_string();
        let reason = v["error"]["reason"].as_str().map(str::to_string);
        Err(match s {
            429 => {
                // Ohne Header vorsichtig 30 s pausieren.
                self.set_gate(super::auth::retry_after_ms(&resp).unwrap_or(30_000))
            }
            403 if reason.as_deref() == Some("PREMIUM_REQUIRED") => ApiError::PremiumRequired,
            403 => {
                let lower = message.to_lowercase();
                let reason = reason.or_else(|| {
                    (lower.contains("not registered") || lower.contains("not been added"))
                        .then(|| "user_not_registered".to_string())
                });
                ApiError::Forbidden { reason, message }
            }
            404 if reason.as_deref() == Some("NO_ACTIVE_DEVICE") || message.to_lowercase().contains("no active device") => {
                ApiError::NoActiveDevice
            }
            404 => ApiError::NotFound,
            400 => ApiError::BadRequest { message },
            s if s >= 500 => {
                self.server_errors.fetch_add(1, Ordering::Relaxed);
                ApiError::Server { status: s }
            }
            s => ApiError::BadRequest { message: format!("HTTP {s} {message}") },
        })
    }

    /// Lesende Anfrage mit begrenzten Wiederholungen bei Netz-/Serverfehlern.
    async fn get(&self, path: &str) -> Result<HttpResponse, ApiError> {
        let req = HttpRequest::new(Method::Get, format!("{}{}", self.api_base, path));
        let mut delay = Duration::from_millis(400);
        let mut attempt = 0;
        loop {
            match self.call(req.clone()).await {
                Err(e @ (ApiError::Network { .. } | ApiError::Server { .. })) if attempt < 2 => {
                    tracing::debug!(target: "spotify", code = e.code(), attempt, "Lesezugriff wird wiederholt");
                    attempt += 1;
                    tokio::time::sleep(delay).await;
                    delay *= 3;
                }
                other => return other,
            }
        }
    }

    /// Schreibende Anfrage: nur wiederholen, wenn sie nachweislich nicht gesendet wurde.
    async fn write(&self, method: Method, path: &str) -> Result<(), ApiError> {
        let req = HttpRequest::new(method, format!("{}{}", self.api_base, path));
        match self.call(req.clone()).await {
            Err(ApiError::Network { possibly_delivered: false, .. }) => {
                tokio::time::sleep(Duration::from_millis(500)).await;
                self.call(req).await.map(|_| ())
            }
            other => other.map(|_| ()),
        }
    }

    pub async fn me(&self) -> Result<UserProfile, ApiError> {
        let r = self.get("/me").await?;
        let v = r.json_body().unwrap_or_default();
        Ok(UserProfile {
            id: v["id"].as_str().unwrap_or("").to_string(),
            display_name: v["display_name"].as_str().map(str::to_string),
        })
    }

    /// `None` bei HTTP 204: angemeldet, aber keine aktive Wiedergabesitzung.
    pub async fn playback(&self) -> Result<Option<Playback>, ApiError> {
        let r = self.get("/me/player?additional_types=episode").await?;
        let fetched = self.clock.now_ms();
        if r.status == 204 || r.body.is_empty() {
            return Ok(None);
        }
        let v = r.json_body().ok_or(ApiError::Decode { message: "Wiedergabestatus".into() })?;
        Ok(Some(parse::parse_playback(&v, fetched)))
    }

    pub async fn devices(&self) -> Result<Vec<Device>, ApiError> {
        let r = self.get("/me/player/devices").await?;
        let v = r.json_body().unwrap_or_default();
        Ok(v["devices"].as_array().map(|a| a.iter().filter_map(parse::parse_device).collect()).unwrap_or_default())
    }

    pub async fn queue(&self) -> Result<QueueSnapshot, ApiError> {
        let r = self.get("/me/player/queue").await?;
        let v = r.json_body().unwrap_or_default();
        Ok(QueueSnapshot {
            currently_playing: parse::parse_track(&v["currently_playing"]),
            uris: v["queue"]
                .as_array()
                .map(|a| a.iter().filter_map(|x| x["uri"].as_str().map(str::to_string)).collect())
                .unwrap_or_default(),
        })
    }

    pub async fn search_tracks(&self, query: &str, limit: u32) -> Result<Vec<Track>, ApiError> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(vec![]);
        }
        let limit = limit.clamp(1, SEARCH_LIMIT);
        let r = self
            .get(&format!("/search?type=track&limit={limit}&q={}", urlencoding::encode(q)))
            .await?;
        let v = r.json_body().unwrap_or_default();
        Ok(v["tracks"]["items"].as_array().map(|a| a.iter().filter_map(parse::parse_track).collect()).unwrap_or_default())
    }

    pub async fn track(&self, id: &str) -> Result<Track, ApiError> {
        if !id.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(ApiError::BadRequest { message: "ungültige Track-ID".into() });
        }
        let r = self.get(&format!("/tracks/{id}")).await?;
        let v = r.json_body().unwrap_or_default();
        parse::parse_track(&v).ok_or(ApiError::Decode { message: "Track".into() })
    }

    fn device_q(device_id: Option<&str>, first: bool) -> String {
        match device_id {
            Some(d) => format!("{}device_id={}", if first { "?" } else { "&" }, urlencoding::encode(d)),
            None => String::new(),
        }
    }

    /// Hängt ein Element an die Spotify-Wiedergabequeue an. Kein idempotenter
    /// Vorgang: Der Aufrufer muss unklare Ausgänge abgleichen, nicht wiederholen.
    pub async fn add_to_queue(&self, uri: &str, device_id: Option<&str>) -> Result<(), ApiError> {
        let path = format!("/me/player/queue?uri={}{}", urlencoding::encode(uri), Self::device_q(device_id, false));
        self.write(Method::Post, &path).await
    }

    pub async fn skip_next(&self, device_id: Option<&str>) -> Result<(), ApiError> {
        self.write(Method::Post, &format!("/me/player/next{}", Self::device_q(device_id, true))).await
    }

    pub async fn skip_previous(&self, device_id: Option<&str>) -> Result<(), ApiError> {
        self.write(Method::Post, &format!("/me/player/previous{}", Self::device_q(device_id, true))).await
    }

    pub async fn pause(&self, device_id: Option<&str>) -> Result<(), ApiError> {
        self.write(Method::Put, &format!("/me/player/pause{}", Self::device_q(device_id, true))).await
    }

    pub async fn resume(&self, device_id: Option<&str>) -> Result<(), ApiError> {
        self.write(Method::Put, &format!("/me/player/play{}", Self::device_q(device_id, true))).await
    }

    /// Nur auf ausdrücklichen Wunsch des Nutzers: Wiedergabe auf ein Gerät übertragen.
    pub async fn transfer(&self, device_id: &str, play: bool) -> Result<(), ApiError> {
        let req = HttpRequest::new(Method::Put, format!("{}/me/player", self.api_base))
            .json(serde_json::json!({ "device_ids": [device_id], "play": play }));
        self.call(req).await.map(|_| ())
    }
}
