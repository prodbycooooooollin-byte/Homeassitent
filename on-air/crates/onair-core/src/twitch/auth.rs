//! Twitch-Anmeldung per Device Code Grant Flow (öffentlicher Client, kein Secret).
//! Twitch unterstützt für öffentliche Clients kein PKCE; der DCF ist der dokumentierte
//! Weg für Geräte/Desktop-Apps. Refresh Tokens öffentlicher Clients sind einmalig
//! verwendbar und laufen nach 30 Tagen ab – jeder Refresh liefert einen neuen.

use crate::auth::{TokenEndpoint, TokenResponse, TokenSet};
use crate::error::ApiError;
use crate::http::{HttpRequest, HttpResponse, Method, SharedTransport};
use crate::spotify::auth::{retry_after_ms, transport_error};
use async_trait::async_trait;
use serde::Serialize;
use std::time::Duration;

pub struct TwitchTokenEndpoint {
    pub http: SharedTransport,
    pub client_id: crate::spotify::auth::ClientIdFn,
    pub id_base: String,
}

fn parse_tokens(resp: &HttpResponse) -> Result<TokenResponse, ApiError> {
    let v = resp.json_body().ok_or(ApiError::Decode { message: "Token-Antwort".into() })?;
    Ok(TokenResponse {
        access_token: v["access_token"].as_str().ok_or(ApiError::Decode { message: "access_token".into() })?.into(),
        refresh_token: v["refresh_token"].as_str().map(str::to_string),
        expires_in_s: v["expires_in"].as_u64().unwrap_or(3600),
        scope: v["scope"].as_array().map(|a| a.iter().filter_map(|s| s.as_str()).collect::<Vec<_>>().join(" ")),
    })
}

fn classify(resp: &HttpResponse) -> ApiError {
    let v = resp.json_body().unwrap_or_default();
    let msg = v["message"].as_str().unwrap_or("").to_string();
    match resp.status {
        400 | 401 if msg.to_lowercase().contains("invalid refresh token") || msg.to_lowercase().contains("invalid_grant") => {
            ApiError::ReauthRequired { reason: msg }
        }
        429 => ApiError::RateLimited { retry_after_ms: retry_after_ms(resp).unwrap_or(10_000) },
        s if s >= 500 => ApiError::Server { status: s },
        s => ApiError::BadRequest { message: format!("HTTP {s} {msg}") },
    }
}

#[async_trait]
impl TokenEndpoint for TwitchTokenEndpoint {
    async fn refresh(&self, refresh_token: &str) -> Result<TokenResponse, ApiError> {
        let req = HttpRequest::new(Method::Post, format!("{}/oauth2/token", self.id_base)).form(vec![
            ("grant_type", "refresh_token".into()),
            ("refresh_token", refresh_token.to_string()),
            ("client_id", (self.client_id)()),
        ]);
        let resp = self.http.send(req).await.map_err(transport_error)?;
        if resp.status == 200 {
            parse_tokens(&resp)
        } else {
            Err(classify(&resp))
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceCode {
    #[serde(skip)]
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in_s: u64,
    pub interval_s: u64,
}

pub async fn start_device_flow(http: &SharedTransport, id_base: &str, client_id: &str) -> Result<DeviceCode, ApiError> {
    if client_id.trim().is_empty() {
        return Err(ApiError::Config { message: "Keine Twitch Client-ID hinterlegt".into() });
    }
    let req = HttpRequest::new(Method::Post, format!("{id_base}/oauth2/device"))
        .form(vec![("client_id", client_id.trim().to_string()), ("scopes", super::SCOPES.join(" "))]);
    let resp = http.send(req).await.map_err(transport_error)?;
    if resp.status != 200 {
        return Err(classify(&resp));
    }
    let v = resp.json_body().unwrap_or_default();
    Ok(DeviceCode {
        device_code: v["device_code"].as_str().unwrap_or("").into(),
        user_code: v["user_code"].as_str().unwrap_or("").into(),
        verification_uri: v["verification_uri"].as_str().unwrap_or("https://www.twitch.tv/activate").into(),
        expires_in_s: v["expires_in"].as_u64().unwrap_or(1800),
        interval_s: v["interval"].as_u64().unwrap_or(5).max(1),
    })
}

/// Fragt im vorgegebenen Intervall, bis der Nutzer bestätigt, ablehnt oder der Code abläuft.
pub async fn poll_device_flow(
    http: &SharedTransport,
    id_base: &str,
    client_id: &str,
    dc: &DeviceCode,
    now_ms: impl Fn() -> i64,
    mut cancelled: tokio::sync::oneshot::Receiver<()>,
) -> Result<TokenSet, ApiError> {
    let deadline = now_ms() + dc.expires_in_s as i64 * 1000;
    let mut interval = Duration::from_secs(dc.interval_s);
    loop {
        tokio::select! {
            _ = tokio::time::sleep(interval) => {}
            _ = &mut cancelled => return Err(ApiError::SessionEnded),
        }
        if now_ms() > deadline {
            return Err(ApiError::Config { message: "Code abgelaufen – bitte erneut starten".into() });
        }
        let req = HttpRequest::new(Method::Post, format!("{id_base}/oauth2/token")).form(vec![
            ("client_id", client_id.trim().to_string()),
            ("scopes", super::SCOPES.join(" ")),
            ("device_code", dc.device_code.clone()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code".into()),
        ]);
        let resp = match http.send(req).await {
            Ok(r) => r,
            Err(_) => continue, // Netzfehler: weiter warten
        };
        if resp.status == 200 {
            let t = parse_tokens(&resp)?;
            let now = now_ms();
            return Ok(TokenSet {
                access_token: t.access_token,
                refresh_token: t.refresh_token,
                expires_at_ms: now + t.expires_in_s as i64 * 1000,
                scope: t.scope.unwrap_or_default(),
                authorized_at_ms: now,
            });
        }
        let msg = resp.json_body().and_then(|v| v["message"].as_str().map(str::to_string)).unwrap_or_default();
        match msg.as_str() {
            "authorization_pending" => {}
            "slow_down" => interval += Duration::from_secs(5),
            "access_denied" => return Err(ApiError::Forbidden { reason: Some("access_denied".into()), message: "Zugriff abgelehnt".into() }),
            _ if resp.status >= 500 => {}
            _ => return Err(ApiError::BadRequest { message: msg }),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Identity {
    pub user_id: String,
    pub login: String,
    pub scopes: Vec<String>,
}

/// `GET /oauth2/validate` – Twitch verlangt Validierung beim Start und stündlich.
pub async fn validate(http: &SharedTransport, id_base: &str, access_token: &str) -> Result<Identity, ApiError> {
    let req = HttpRequest::new(Method::Get, format!("{id_base}/oauth2/validate"))
        .header("Authorization", format!("OAuth {access_token}"));
    let resp = http.send(req).await.map_err(transport_error)?;
    match resp.status {
        200 => {
            let v = resp.json_body().unwrap_or_default();
            Ok(Identity {
                user_id: v["user_id"].as_str().unwrap_or("").into(),
                login: v["login"].as_str().unwrap_or("").into(),
                scopes: v["scopes"].as_array().map(|a| a.iter().filter_map(|s| s.as_str().map(str::to_string)).collect()).unwrap_or_default(),
            })
        }
        401 => Err(ApiError::Unauthorized),
        _ => Err(classify(&resp)),
    }
}
