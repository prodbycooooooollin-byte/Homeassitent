//! EventSub-WebSocket-Protokoll als reiner Zustandsautomat (ohne IO testbar).
//!
//! - `session_welcome`: Bei einer frischen Verbindung Abo anlegen (innerhalb von 10 s).
//!   Nach einem `session_reconnect` bleiben Abos erhalten – dann NICHT neu abonnieren.
//! - `session_keepalive` / jede Nachricht: Watchdog zurücksetzen. Bleibt länger als
//!   `keepalive_timeout_seconds` jede Nachricht aus, gilt die Verbindung als verloren.
//! - `session_reconnect`: mit `reconnect_url` neu verbinden, alte Verbindung erst nach
//!   Welcome auf der neuen schließen.
//! - `notification`: anhand `metadata.message_id` dedupliziert.
//! - `revocation`: Abo widerrufen (z. B. `authorization_revoked`).

use serde_json::Value;
use std::collections::{HashSet, VecDeque};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatEvent {
    pub message_id: String,
    pub broadcaster_id: String,
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
    pub text: String,
    pub badges: Vec<String>,
    /// Kanalpunkte-Einlösung mit Nachricht (für eine spätere Ausbaustufe).
    pub reward_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WsAction {
    /// Frische Session: Abo anlegen.
    Subscribe { session_id: String, keepalive_s: u64 },
    /// Session nach Reconnect übernommen: Abos bestehen weiter.
    Resumed { session_id: String, keepalive_s: u64 },
    Reconnect { url: String },
    Chat(ChatEvent),
    Revoked { status: String, sub_type: String },
    Keepalive,
    Ignored,
}

/// Merkt sich zuletzt gesehene Message-IDs (begrenzter Speicher).
pub struct Dedupe {
    set: HashSet<String>,
    order: VecDeque<String>,
    cap: usize,
}

impl Dedupe {
    pub fn new(cap: usize) -> Self {
        Self { set: HashSet::new(), order: VecDeque::new(), cap }
    }
    /// `true`, wenn die ID neu ist.
    pub fn insert(&mut self, id: &str) -> bool {
        if self.set.contains(id) {
            return false;
        }
        self.set.insert(id.to_string());
        self.order.push_back(id.to_string());
        while self.order.len() > self.cap {
            if let Some(old) = self.order.pop_front() {
                self.set.remove(&old);
            }
        }
        true
    }
}

pub struct EventSubProtocol {
    pub dedupe: Dedupe,
    /// Die nächste Welcome-Nachricht gehört zu einer Reconnect-Verbindung.
    pub expecting_reconnect_welcome: bool,
    pub session_id: Option<String>,
    pub keepalive_s: u64,
}

impl Default for EventSubProtocol {
    fn default() -> Self {
        Self::new()
    }
}

impl EventSubProtocol {
    pub fn new() -> Self {
        Self { dedupe: Dedupe::new(1000), expecting_reconnect_welcome: false, session_id: None, keepalive_s: 10 }
    }

    /// Frische Verbindung (nach Verbindungsverlust): Abos müssen neu angelegt werden.
    pub fn reset_for_fresh_connection(&mut self) {
        self.expecting_reconnect_welcome = false;
        self.session_id = None;
    }

    pub fn handle(&mut self, text: &str) -> WsAction {
        let Ok(v) = serde_json::from_str::<Value>(text) else { return WsAction::Ignored };
        let mtype = v["metadata"]["message_type"].as_str().unwrap_or("");
        match mtype {
            "session_welcome" => {
                let s = &v["payload"]["session"];
                let id = s["id"].as_str().unwrap_or("").to_string();
                let ka = s["keepalive_timeout_seconds"].as_u64().unwrap_or(10);
                self.session_id = Some(id.clone());
                self.keepalive_s = ka;
                if std::mem::take(&mut self.expecting_reconnect_welcome) {
                    WsAction::Resumed { session_id: id, keepalive_s: ka }
                } else {
                    WsAction::Subscribe { session_id: id, keepalive_s: ka }
                }
            }
            "session_keepalive" => WsAction::Keepalive,
            "session_reconnect" => {
                let url = v["payload"]["session"]["reconnect_url"].as_str().unwrap_or("").to_string();
                if url.starts_with("wss://") {
                    self.expecting_reconnect_welcome = true;
                    WsAction::Reconnect { url }
                } else {
                    WsAction::Ignored
                }
            }
            "revocation" => {
                let sub = &v["payload"]["subscription"];
                WsAction::Revoked {
                    status: sub["status"].as_str().unwrap_or("").into(),
                    sub_type: sub["type"].as_str().unwrap_or("").into(),
                }
            }
            "notification" => {
                let mid = v["metadata"]["message_id"].as_str().unwrap_or("");
                if mid.is_empty() || !self.dedupe.insert(mid) {
                    return WsAction::Ignored;
                }
                if v["metadata"]["subscription_type"].as_str() != Some("channel.chat.message") {
                    return WsAction::Ignored;
                }
                let e = &v["payload"]["event"];
                WsAction::Chat(ChatEvent {
                    // Die Delivery-ID dient als Event-ID für die dauerhafte Deduplizierung.
                    message_id: e["message_id"].as_str().unwrap_or("").into(),
                    broadcaster_id: e["broadcaster_user_id"].as_str().unwrap_or("").into(),
                    user_id: e["chatter_user_id"].as_str().unwrap_or("").into(),
                    user_login: e["chatter_user_login"].as_str().unwrap_or("").into(),
                    user_name: e["chatter_user_name"].as_str().unwrap_or("").into(),
                    text: e["message"]["text"].as_str().unwrap_or("").into(),
                    badges: e["badges"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|b| b["set_id"].as_str().map(str::to_string)).collect())
                        .unwrap_or_default(),
                    reward_id: e["channel_points_custom_reward_id"].as_str().map(str::to_string),
                })
            }
            _ => WsAction::Ignored,
        }
    }
}

/// Delivery-ID einer Notification (für die dauerhafte Deduplizierung in SQLite).
pub fn delivery_id(text: &str) -> Option<String> {
    serde_json::from_str::<Value>(text).ok()?["metadata"]["message_id"].as_str().map(str::to_string)
}

#[cfg(test)]
pub mod fixtures {
    pub fn welcome(id: &str) -> String {
        format!(r#"{{"metadata":{{"message_id":"w-{id}","message_type":"session_welcome","message_timestamp":"2026-09-24T10:00:00Z"}},"payload":{{"session":{{"id":"{id}","status":"connected","keepalive_timeout_seconds":30,"reconnect_url":null}}}}}}"#)
    }
    pub fn chat(delivery: &str, text: &str) -> String {
        format!(r#"{{"metadata":{{"message_id":"{delivery}","message_type":"notification","subscription_type":"channel.chat.message","subscription_version":"1"}},"payload":{{"subscription":{{"type":"channel.chat.message"}},"event":{{"broadcaster_user_id":"100","chatter_user_id":"200","chatter_user_login":"viewer","chatter_user_name":"Viewer","message_id":"msg-{delivery}","message":{{"text":"{text}"}},"badges":[{{"set_id":"subscriber","id":"0","info":"1"}}]}}}}}}"#)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn welcome_then_duplicate_notification() {
        let mut p = EventSubProtocol::new();
        assert!(matches!(p.handle(&fixtures::welcome("s1")), WsAction::Subscribe { .. }));
        let n = fixtures::chat("d1", "!sr test");
        assert!(matches!(p.handle(&n), WsAction::Chat(_)));
        assert_eq!(p.handle(&n), WsAction::Ignored, "Doppelte Zustellung wird ignoriert");
    }

    #[test]
    fn reconnect_does_not_resubscribe() {
        let mut p = EventSubProtocol::new();
        p.handle(&fixtures::welcome("s1"));
        let rc = r#"{"metadata":{"message_id":"r1","message_type":"session_reconnect"},"payload":{"session":{"id":"s1","status":"reconnecting","reconnect_url":"wss://eventsub.wss.twitch.tv/ws?id=abc"}}}"#;
        assert!(matches!(p.handle(rc), WsAction::Reconnect { .. }));
        assert!(matches!(p.handle(&fixtures::welcome("s2")), WsAction::Resumed { .. }));
        // Nach vollständigem Verbindungsverlust wird wieder abonniert.
        p.reset_for_fresh_connection();
        assert!(matches!(p.handle(&fixtures::welcome("s3")), WsAction::Subscribe { .. }));
    }

    #[test]
    fn revocation_is_reported() {
        let mut p = EventSubProtocol::new();
        let m = r#"{"metadata":{"message_id":"x","message_type":"revocation"},"payload":{"subscription":{"type":"channel.chat.message","status":"authorization_revoked"}}}"#;
        assert_eq!(p.handle(m), WsAction::Revoked { status: "authorization_revoked".into(), sub_type: "channel.chat.message".into() });
    }
}
