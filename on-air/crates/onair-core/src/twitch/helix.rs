//! Helix-Aufrufe: EventSub-Abo anlegen und Chatnachrichten senden.

use crate::auth::TokenManager;
use crate::error::ApiError;
use crate::http::{HttpRequest, HttpResponse, Method, SharedTransport};
use crate::spotify::auth::transport_error;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct Helix {
    pub http: SharedTransport,
    pub tokens: Arc<TokenManager>,
    pub client_id: crate::spotify::auth::ClientIdFn,
    pub base: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubscribeResult {
    Created,
    /// 409: Abo existiert bereits für diese Session – kein Duplikat anlegen.
    AlreadyExists,
}

impl Helix {
    async fn call(&self, method: Method, path: &str, body: Value) -> Result<HttpResponse, ApiError> {
        let build = |token: &str| {
            HttpRequest::new(method, format!("{}{}", self.base, path))
                .header("Client-Id", (self.client_id)())
                .bearer(token)
                .json(body.clone())
        };
        let tok = self.tokens.access_token().await?;
        let mut resp = self.http.send(build(&tok.token)).await.map_err(transport_error)?;
        if resp.status == 401 {
            let fresh = self.tokens.on_unauthorized(&tok).await?;
            resp = self.http.send(build(&fresh.token)).await.map_err(transport_error)?;
        }
        // Abgemeldet während der Anfrage: Ergebnis verwerfen. (Ein erfolgreicher Refresh
        // behält die Epoche; nur Abmelden/Neuanmelden erhöht sie.)
        if !self.tokens.is_current(tok.epoch) {
            return Err(ApiError::SessionEnded);
        }
        Ok(resp)
    }

    fn classify(resp: &HttpResponse) -> ApiError {
        let v = resp.json_body().unwrap_or_default();
        let message = v["message"].as_str().unwrap_or("").to_string();
        match resp.status {
            401 => ApiError::Unauthorized,
            403 => ApiError::Forbidden { reason: Some("missing_scope_or_permission".into()), message },
            404 => ApiError::NotFound,
            429 => {
                // Twitch liefert `Ratelimit-Reset` (Unix-Sekunden); ohne Uhrvergleich vorsichtig 10 s.
                ApiError::RateLimited { retry_after_ms: 10_000 }
            }
            s if s >= 500 => ApiError::Server { status: s },
            s => ApiError::BadRequest { message: format!("HTTP {s} {message}") },
        }
    }

    pub async fn subscribe_chat(&self, session_id: &str, broadcaster_id: &str, user_id: &str) -> Result<SubscribeResult, ApiError> {
        let body = json!({
            "type": "channel.chat.message",
            "version": "1",
            "condition": { "broadcaster_user_id": broadcaster_id, "user_id": user_id },
            "transport": { "method": "websocket", "session_id": session_id }
        });
        let resp = self.call(Method::Post, "/eventsub/subscriptions", body).await?;
        match resp.status {
            200..=299 => Ok(SubscribeResult::Created),
            409 => Ok(SubscribeResult::AlreadyExists),
            _ => Err(Self::classify(&resp)),
        }
    }

    /// Sendet eine Chatnachricht; liefert die Message-ID (für das Ignorieren eigener Nachrichten).
    pub async fn send_chat(&self, broadcaster_id: &str, sender_id: &str, text: &str, reply_to: Option<&str>) -> Result<Option<String>, ApiError> {
        let mut body = json!({ "broadcaster_id": broadcaster_id, "sender_id": sender_id, "message": text });
        if let Some(r) = reply_to {
            body["reply_parent_message_id"] = json!(r);
        }
        let resp = self.call(Method::Post, "/chat/messages", body).await?;
        if !(200..300).contains(&resp.status) {
            return Err(Self::classify(&resp));
        }
        let v = resp.json_body().unwrap_or_default();
        let d = &v["data"][0];
        if d["is_sent"].as_bool() == Some(false) {
            let reason = d["drop_reason"]["message"].as_str().unwrap_or("verworfen").to_string();
            return Err(ApiError::BadRequest { message: format!("Nachricht nicht gesendet: {reason}") });
        }
        Ok(d["message_id"].as_str().map(str::to_string))
    }
}
