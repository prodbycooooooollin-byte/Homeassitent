//! Spotify Authorization Code mit PKCE (öffentlicher Client ohne Secret).

use crate::auth::loopback::{LoginError, LoopbackListener};
use crate::auth::{pkce, TokenEndpoint, TokenResponse, TokenSet};
use crate::error::ApiError;
use crate::http::{HttpRequest, HttpResponse, Method, SharedTransport};
use async_trait::async_trait;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::sync::oneshot;

pub const ACCOUNTS_BASE: &str = "https://accounts.spotify.com";

/// Liefert die aktuell konfigurierte Client-ID (änderbar ohne Neustart der Dienste).
pub type ClientIdFn = std::sync::Arc<dyn Fn() -> String + Send + Sync>;

pub struct SpotifyTokenEndpoint {
    pub http: SharedTransport,
    pub client_id: ClientIdFn,
    pub accounts_base: String,
}

pub(crate) fn parse_token_response(resp: &HttpResponse) -> Result<TokenResponse, ApiError> {
    let v = resp.json_body().ok_or(ApiError::Decode { message: "Token-Antwort ohne JSON".into() })?;
    let access_token = v["access_token"]
        .as_str()
        .ok_or(ApiError::Decode { message: "access_token fehlt".into() })?
        .to_string();
    Ok(TokenResponse {
        access_token,
        refresh_token: v["refresh_token"].as_str().map(str::to_string),
        expires_in_s: v["expires_in"].as_u64().unwrap_or(3600),
        scope: v["scope"].as_str().map(str::to_string),
    })
}

/// Fehler des Token-Endpunkts. Nur `invalid_grant` gilt als bestätigte Ungültigkeit.
pub(crate) fn classify_token_error(resp: &HttpResponse) -> ApiError {
    let v = resp.json_body().unwrap_or_default();
    let err = v["error"].as_str().unwrap_or("");
    let desc = v["error_description"].as_str().unwrap_or("").to_string();
    match (resp.status, err) {
        (400, "invalid_grant") => ApiError::ReauthRequired {
            reason: if desc.is_empty() { "invalid_grant".into() } else { format!("invalid_grant: {desc}") },
        },
        (400 | 401, "invalid_client") => ApiError::Config { message: format!("Client-ID ungültig: {desc}") },
        (429, _) => ApiError::RateLimited { retry_after_ms: retry_after_ms(resp).unwrap_or(30_000) },
        (s, _) if s >= 500 => ApiError::Server { status: s },
        (s, e) => ApiError::BadRequest { message: format!("HTTP {s} {e} {desc}").trim().to_string() },
    }
}

pub(crate) fn retry_after_ms(resp: &HttpResponse) -> Option<u64> {
    resp.header("retry-after").and_then(|v| v.trim().parse::<u64>().ok()).map(|s| s * 1000)
}

pub(crate) fn transport_error(e: crate::http::TransportError) -> ApiError {
    ApiError::Network { possibly_delivered: e.possibly_delivered(), message: e.to_string() }
}

#[async_trait]
impl TokenEndpoint for SpotifyTokenEndpoint {
    async fn refresh(&self, refresh_token: &str) -> Result<TokenResponse, ApiError> {
        let req = HttpRequest::new(Method::Post, format!("{}/api/token", self.accounts_base)).form(vec![
            ("grant_type", "refresh_token".into()),
            ("refresh_token", refresh_token.to_string()),
            ("client_id", (self.client_id)()),
        ]);
        let resp = self.http.send(req).await.map_err(transport_error)?;
        if resp.status == 200 {
            parse_token_response(&resp)
        } else {
            Err(classify_token_error(&resp))
        }
    }
}

pub struct LoginConfig {
    pub client_id: String,
    pub port: u16,
    pub accounts_base: String,
}

/// Vollständiger Anmeldeablauf: Listener binden, Systembrowser öffnen,
/// Redirect prüfen, Code gegen Tokens tauschen.
pub async fn login(
    cfg: &LoginConfig,
    http: SharedTransport,
    now_ms: i64,
    open_browser: impl FnOnce(&str) -> Result<(), String>,
    cancel: oneshot::Receiver<()>,
) -> Result<TokenSet, LoginError> {
    if cfg.client_id.trim().is_empty() {
        return Err(LoginError::Other { message: "Keine Spotify Client-ID hinterlegt".into() });
    }
    let listener = LoopbackListener::bind(
        SocketAddr::from((Ipv4Addr::LOCALHOST, cfg.port)),
        super::REDIRECT_PATH,
    )
    .await?;
    let pair = pkce::generate();
    let state = pkce::random_state();
    let redirect = super::redirect_uri(cfg.port);
    let mut url = url::Url::parse(&format!("{}/authorize", cfg.accounts_base)).expect("url");
    url.query_pairs_mut()
        .append_pair("client_id", cfg.client_id.trim())
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect)
        .append_pair("code_challenge_method", "S256")
        .append_pair("code_challenge", &pair.challenge)
        .append_pair("state", &state)
        .append_pair("scope", &super::SCOPES.join(" "));
    open_browser(url.as_str()).map_err(|m| LoginError::Other { message: m })?;

    let code = listener.wait_for_code(&state, Duration::from_secs(300), cancel).await?;

    let req = HttpRequest::new(Method::Post, format!("{}/api/token", cfg.accounts_base)).form(vec![
        ("grant_type", "authorization_code".into()),
        ("code", code),
        ("redirect_uri", redirect),
        ("client_id", cfg.client_id.trim().to_string()),
        ("code_verifier", pair.verifier),
    ]);
    let resp = http.send(req).await.map_err(|e| LoginError::Exchange { message: e.to_string() })?;
    if resp.status != 200 {
        let e = classify_token_error(&resp);
        return Err(LoginError::Exchange { message: e.to_string() });
    }
    let t = parse_token_response(&resp).map_err(|e| LoginError::Exchange { message: e.to_string() })?;
    Ok(TokenSet {
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at_ms: now_ms + (t.expires_in_s as i64) * 1000,
        scope: t.scope.unwrap_or_default(),
        authorized_at_ms: now_ms,
    })
}
