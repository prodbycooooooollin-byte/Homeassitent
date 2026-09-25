//! Helix-Aufrufe: EventSub-Abos, Chatnachrichten, Kanalpunkte-Belohnungen und
//! -Einlösungen, Live-Status.

use crate::auth::TokenManager;
use crate::error::ApiError;
use crate::http::{HttpRequest, HttpResponse, Method, SharedTransport};
use crate::spotify::auth::transport_error;
use serde::Serialize;
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RewardInfo {
    pub id: String,
    pub title: String,
    pub cost: u64,
    pub prompt: String,
    pub is_enabled: bool,
    pub is_paused: bool,
    pub is_user_input_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedemptionInfo {
    pub id: String,
    pub reward_id: String,
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
    pub user_input: String,
    /// UNFULFILLED | FULFILLED | CANCELED
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RedemptionUpdate {
    Updated(String),
    /// Twitch kennt die Einlösung nicht (mehr) als offen – Zustand per Abfrage klären.
    NotOpen,
}

fn parse_reward(v: &Value) -> Option<RewardInfo> {
    Some(RewardInfo {
        id: v["id"].as_str()?.to_string(),
        title: v["title"].as_str().unwrap_or("").into(),
        cost: v["cost"].as_u64().unwrap_or(0),
        prompt: v["prompt"].as_str().unwrap_or("").into(),
        is_enabled: v["is_enabled"].as_bool().unwrap_or(false),
        is_paused: v["is_paused"].as_bool().unwrap_or(false),
        is_user_input_required: v["is_user_input_required"].as_bool().unwrap_or(false),
    })
}

pub fn parse_redemption(v: &Value) -> Option<RedemptionInfo> {
    Some(RedemptionInfo {
        id: v["id"].as_str()?.to_string(),
        reward_id: v["reward"]["id"].as_str().unwrap_or("").into(),
        user_id: v["user_id"].as_str().unwrap_or("").into(),
        user_login: v["user_login"].as_str().unwrap_or("").into(),
        user_name: v["user_name"].as_str().unwrap_or("").into(),
        user_input: v["user_input"].as_str().unwrap_or("").into(),
        status: v["status"].as_str().unwrap_or("").to_uppercase(),
    })
}

impl Helix {
    async fn call(&self, method: Method, path: &str, body: Option<Value>) -> Result<HttpResponse, ApiError> {
        let build = |token: &str| {
            let r = HttpRequest::new(method, format!("{}{}", self.base, path))
                .header("Client-Id", (self.client_id)())
                .bearer(token);
            match &body {
                Some(b) => r.json(b.clone()),
                None => r,
            }
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
            403 => {
                let lower = message.to_lowercase();
                let reason = if lower.contains("partner") || lower.contains("affiliate") {
                    "not_affiliate"
                } else {
                    "missing_scope_or_permission"
                };
                ApiError::Forbidden { reason: Some(reason.into()), message }
            }
            404 => ApiError::NotFound,
            429 => ApiError::RateLimited { retry_after_ms: 10_000 },
            s if s >= 500 => ApiError::Server { status: s },
            s => ApiError::BadRequest { message: format!("HTTP {s} {message}") },
        }
    }

    pub async fn subscribe(&self, kind: &str, condition: Value, session_id: &str) -> Result<SubscribeResult, ApiError> {
        let body = json!({
            "type": kind,
            "version": "1",
            "condition": condition,
            "transport": { "method": "websocket", "session_id": session_id }
        });
        let resp = self.call(Method::Post, "/eventsub/subscriptions", Some(body)).await?;
        match resp.status {
            200..=299 => Ok(SubscribeResult::Created),
            409 => Ok(SubscribeResult::AlreadyExists),
            _ => Err(Self::classify(&resp)),
        }
    }

    pub async fn subscribe_chat(&self, session_id: &str, broadcaster_id: &str, user_id: &str) -> Result<SubscribeResult, ApiError> {
        self.subscribe("channel.chat.message", json!({ "broadcaster_user_id": broadcaster_id, "user_id": user_id }), session_id).await
    }

    /// Sendet eine Chatnachricht; liefert die Message-ID (für das Ignorieren eigener Nachrichten).
    pub async fn send_chat(&self, broadcaster_id: &str, sender_id: &str, text: &str, reply_to: Option<&str>) -> Result<Option<String>, ApiError> {
        let mut body = json!({ "broadcaster_id": broadcaster_id, "sender_id": sender_id, "message": text });
        if let Some(r) = reply_to {
            body["reply_parent_message_id"] = json!(r);
        }
        let resp = self.call(Method::Post, "/chat/messages", Some(body)).await?;
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

    // ---------------- Kanalpunkte ----------------

    pub async fn create_reward(&self, broadcaster_id: &str, body: Value) -> Result<RewardInfo, ApiError> {
        let resp = self
            .call(Method::Post, &format!("/channel_points/custom_rewards?broadcaster_id={}", urlencoding::encode(broadcaster_id)), Some(body))
            .await?;
        if !(200..300).contains(&resp.status) {
            let e = Self::classify(&resp);
            let msg = resp.json_body().and_then(|v| v["message"].as_str().map(str::to_string)).unwrap_or_default();
            if resp.status == 400 && msg.to_uppercase().contains("DUPLICATE") {
                return Err(ApiError::BadRequest { message: "duplicate_title".into() });
            }
            return Err(e);
        }
        resp.json_body()
            .and_then(|v| parse_reward(&v["data"][0]))
            .ok_or(ApiError::Decode { message: "Reward".into() })
    }

    /// `Ok(None)` = Belohnung existiert nicht mehr (gelöscht) oder ist nicht verwaltbar.
    pub async fn update_reward(&self, broadcaster_id: &str, reward_id: &str, body: Value) -> Result<Option<RewardInfo>, ApiError> {
        let resp = self
            .call(
                Method::Patch,
                &format!(
                    "/channel_points/custom_rewards?broadcaster_id={}&id={}",
                    urlencoding::encode(broadcaster_id),
                    urlencoding::encode(reward_id)
                ),
                Some(body),
            )
            .await?;
        match resp.status {
            200..=299 => Ok(resp.json_body().and_then(|v| parse_reward(&v["data"][0]))),
            404 => Ok(None),
            _ => Err(Self::classify(&resp)),
        }
    }

    /// Nur Belohnungen, die diese Client-ID angelegt hat (nur diese sind verwaltbar).
    pub async fn manageable_rewards(&self, broadcaster_id: &str) -> Result<Vec<RewardInfo>, ApiError> {
        let resp = self
            .call(
                Method::Get,
                &format!("/channel_points/custom_rewards?broadcaster_id={}&only_manageable_rewards=true", urlencoding::encode(broadcaster_id)),
                None,
            )
            .await?;
        if !(200..300).contains(&resp.status) {
            return Err(Self::classify(&resp));
        }
        let v = resp.json_body().unwrap_or_default();
        Ok(v["data"].as_array().map(|a| a.iter().filter_map(parse_reward).collect()).unwrap_or_default())
    }

    /// Einlösungen einer Belohnung: nach Status (mit Seitenweiterschaltung) oder gezielt per ID.
    pub async fn redemptions(&self, broadcaster_id: &str, reward_id: &str, status: Option<&str>, ids: &[String]) -> Result<Vec<RedemptionInfo>, ApiError> {
        let mut out = vec![];
        let mut cursor: Option<String> = None;
        for _ in 0..10 {
            let mut path = format!(
                "/channel_points/custom_rewards/redemptions?broadcaster_id={}&reward_id={}",
                urlencoding::encode(broadcaster_id),
                urlencoding::encode(reward_id)
            );
            if let Some(s) = status {
                path.push_str(&format!("&status={s}&first=50"));
            }
            for id in ids.iter().take(50) {
                path.push_str(&format!("&id={}", urlencoding::encode(id)));
            }
            if let Some(c) = &cursor {
                path.push_str(&format!("&after={}", urlencoding::encode(c)));
            }
            let resp = self.call(Method::Get, &path, None).await?;
            if resp.status == 404 {
                return Ok(out);
            }
            if !(200..300).contains(&resp.status) {
                return Err(Self::classify(&resp));
            }
            let v = resp.json_body().unwrap_or_default();
            out.extend(v["data"].as_array().map(|a| a.iter().filter_map(parse_redemption).collect::<Vec<_>>()).unwrap_or_default());
            cursor = v["pagination"]["cursor"].as_str().map(str::to_string);
            if cursor.is_none() || !ids.is_empty() {
                break;
            }
        }
        Ok(out)
    }

    /// Setzt eine offene Einlösung auf FULFILLED oder CANCELED (CANCELED erstattet die Punkte).
    pub async fn update_redemption(&self, broadcaster_id: &str, reward_id: &str, redemption_id: &str, status: &str) -> Result<RedemptionUpdate, ApiError> {
        let resp = self
            .call(
                Method::Patch,
                &format!(
                    "/channel_points/custom_rewards/redemptions?broadcaster_id={}&reward_id={}&id={}",
                    urlencoding::encode(broadcaster_id),
                    urlencoding::encode(reward_id),
                    urlencoding::encode(redemption_id)
                ),
                Some(json!({ "status": status })),
            )
            .await?;
        match resp.status {
            200..=299 => {
                let v = resp.json_body().unwrap_or_default();
                Ok(RedemptionUpdate::Updated(v["data"][0]["status"].as_str().unwrap_or(status).to_uppercase()))
            }
            404 | 400 => Ok(RedemptionUpdate::NotOpen),
            _ => Err(Self::classify(&resp)),
        }
    }

    /// Live-Status des Kanals (Get Streams, ohne zusätzliche Berechtigung).
    pub async fn is_live(&self, user_id: &str) -> Result<bool, ApiError> {
        let resp = self.call(Method::Get, &format!("/streams?user_id={}", urlencoding::encode(user_id)), None).await?;
        if !(200..300).contains(&resp.status) {
            return Err(Self::classify(&resp));
        }
        let v = resp.json_body().unwrap_or_default();
        Ok(v["data"].as_array().map(|a| a.iter().any(|s| s["type"].as_str() == Some("live"))).unwrap_or(false))
    }
}
