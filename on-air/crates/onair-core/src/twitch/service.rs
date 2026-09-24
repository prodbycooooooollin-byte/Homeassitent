//! Twitch-Dienst: genau eine EventSub-Verbindung, Chatbefehle, gedrosselte Antworten.

use super::auth::{self, Identity};
use super::commands::{self, CommandKind, Cooldowns, VoteSkip};
use super::eventsub::{ChatEvent, EventSubProtocol, WsAction};
use super::helix::Helix;
use crate::activity::ActivityLog;
use crate::auth::{AuthStatus, TokenManager};
use crate::backoff::Backoff;
use crate::clock::SharedClock;
use crate::error::{ApiError, ErrorInfo};
use crate::events::{EventBus, Topic};
use crate::http::SharedTransport;
use crate::model::PlaybackView;
use crate::queue::service::{ChatNotifier, QueueService};
use crate::queue::{Requester, Source};
use crate::settings::{self as cfg, Role, SharedSettings};
use crate::spotify::service::{SpotifyState, SyncCmd};
use crate::spotify::SpotifyClient;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::json;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum TwitchLink {
    Disabled,
    Connecting,
    Connected,
    Reconnecting { attempt: u32, next_retry_ms: i64 },
    /// Fehlende Berechtigung o. ä. – keine automatische Wiederholungsschleife.
    Blocked { code: String },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TwitchState {
    pub auth: AuthStatus,
    pub link: TwitchLink,
    pub identity: Option<Identity>,
    pub last_error: Option<ErrorInfo>,
    pub connected_since_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy)]
pub enum TwitchCmd {
    /// Gezielte Wiederherstellung: aktuelle Verbindung verwerfen und sofort neu verbinden.
    Recover,
}

enum Disconnect {
    Transient(String),
    Auth(String),
    Blocked(String),
    Recover,
    Stop,
}

pub struct TwitchDeps {
    pub http: SharedTransport,
    pub tokens: Arc<TokenManager>,
    pub client_id: crate::spotify::auth::ClientIdFn,
    pub id_base: String,
    pub helix_base: String,
    pub ws_url: String,
    pub queue: Arc<QueueService>,
    pub spotify: Arc<SpotifyClient>,
    pub spotify_state: watch::Receiver<SpotifyState>,
    pub spotify_cmd: mpsc::UnboundedSender<SyncCmd>,
    pub settings: SharedSettings,
    pub activity: ActivityLog,
    pub bus: EventBus,
    pub clock: SharedClock,
    /// Belohnung, deren Einlösungen abonniert werden sollen (`None` = keine).
    pub cp_reward: watch::Receiver<Option<String>>,
    /// Weiterleitung von Einlösungen an den Kanalpunkte-Dienst.
    pub redemptions_tx: mpsc::UnboundedSender<(bool, super::helix::RedemptionInfo)>,
}

struct Shared {
    deps: TwitchDeps,
    helix: Helix,
    state_tx: watch::Sender<TwitchState>,
    identity: Mutex<Option<Identity>>,
    cooldowns: Mutex<Cooldowns>,
    voteskip: Mutex<VoteSkip>,
    chat_tx: mpsc::Sender<(String, Option<String>)>,
    sent_ids: Mutex<VecDeque<String>>,
}

pub struct TwitchHandle {
    pub state: watch::Receiver<TwitchState>,
    pub cmd: mpsc::UnboundedSender<TwitchCmd>,
    notifier: Arc<dyn ChatNotifier>,
}

impl TwitchHandle {
    pub fn notifier(&self) -> Arc<dyn ChatNotifier> {
        self.notifier.clone()
    }
}

struct Notifier(mpsc::Sender<(String, Option<String>)>);

impl ChatNotifier for Notifier {
    fn notify(&self, text: String, reply_to: Option<String>) {
        // Volle Queue = Nachricht verwerfen statt Chat zu fluten.
        let _ = self.0.try_send((text, reply_to));
    }
}

pub struct TwitchService {
    shared: Arc<Shared>,
    cmd_rx: mpsc::UnboundedReceiver<TwitchCmd>,
    chat_rx: Option<mpsc::Receiver<(String, Option<String>)>>,
}

impl TwitchService {
    pub fn new(deps: TwitchDeps) -> (Self, TwitchHandle) {
        let helix = Helix {
            http: deps.http.clone(),
            tokens: deps.tokens.clone(),
            client_id: deps.client_id.clone(),
            base: deps.helix_base.clone(),
        };
        let (state_tx, state_rx) = watch::channel(TwitchState {
            auth: deps.tokens.status(),
            link: TwitchLink::Disabled,
            identity: None,
            last_error: None,
            connected_since_ms: None,
        });
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let (chat_tx, chat_rx) = mpsc::channel(5);
        let shared = Arc::new(Shared {
            deps,
            helix,
            state_tx,
            identity: Mutex::new(None),
            cooldowns: Mutex::new(Cooldowns::default()),
            voteskip: Mutex::new(VoteSkip::default()),
            chat_tx: chat_tx.clone(),
            sent_ids: Mutex::new(VecDeque::new()),
        });
        let handle = TwitchHandle { state: state_rx, cmd: cmd_tx, notifier: Arc::new(Notifier(chat_tx)) };
        (Self { shared, cmd_rx, chat_rx: Some(chat_rx) }, handle)
    }

    pub async fn run(mut self) {
        let chat_rx = self.chat_rx.take().expect("chat rx");
        let sender = tokio::spawn(chat_sender(self.shared.clone(), chat_rx));
        self.main_loop().await;
        sender.abort();
    }

    async fn main_loop(&mut self) {
        let sh = self.shared.clone();
        let mut auth_rx = sh.deps.tokens.subscribe();
        let mut backoff = Backoff::new(Duration::from_secs(2), Duration::from_secs(120));
        let mut proto = EventSubProtocol::new();
        loop {
            let auth = sh.deps.tokens.status();
            sh.update(|s| s.auth = auth.clone());
            if !matches!(auth, AuthStatus::SignedIn { .. }) {
                sh.update(|s| {
                    s.link = TwitchLink::Disabled;
                    s.connected_since_ms = None;
                });
                tokio::select! {
                    r = auth_rx.changed() => if r.is_err() { return },
                    c = self.cmd_rx.recv() => if c.is_none() { return },
                }
                continue;
            }
            sh.update(|s| s.link = TwitchLink::Connecting);
            let outcome = match sh.ensure_identity(true).await {
                Ok(identity) => self.session(&mut proto, &identity, &mut backoff).await,
                Err(ApiError::ReauthRequired { reason }) => Disconnect::Auth(reason),
                Err(ApiError::NotSignedIn) | Err(ApiError::SessionEnded) => continue,
                Err(e @ (ApiError::Forbidden { .. } | ApiError::Config { .. })) => Disconnect::Blocked(e.code().into()),
                Err(e) => Disconnect::Transient(e.to_string()),
            };
            let now = sh.deps.clock.now_ms();
            sh.update(|s| s.connected_since_ms = None);
            match outcome {
                Disconnect::Stop => return,
                Disconnect::Recover => {
                    backoff.reset();
                    continue;
                }
                Disconnect::Auth(reason) => {
                    sh.deps.activity.warn("twitch.reauth", "Twitch-Anmeldung abgelaufen – bitte erneut verbinden", json!({ "reason": reason }));
                    // Status kommt über den TokenManager; warten auf Änderung.
                    tokio::select! {
                        r = auth_rx.changed() => if r.is_err() { return },
                        c = self.cmd_rx.recv() => if c.is_none() { return },
                    }
                }
                Disconnect::Blocked(code) => {
                    sh.update(|s| s.link = TwitchLink::Blocked { code: code.clone() });
                    sh.deps.activity.error("twitch.blocked", "Twitch-Verbindung nicht möglich – Berechtigungen prüfen", json!({ "code": code }));
                    tokio::select! {
                        r = auth_rx.changed() => if r.is_err() { return },
                        c = self.cmd_rx.recv() => if c.is_none() { return },
                    }
                }
                Disconnect::Transient(msg) => {
                    let delay = backoff.next_delay();
                    let attempt = backoff.attempt();
                    let info = ErrorInfo { code: "network".into(), details: msg, at_ms: now };
                    sh.update(|s| {
                        s.link = TwitchLink::Reconnecting { attempt, next_retry_ms: now + delay.as_millis() as i64 };
                        s.last_error = Some(info);
                    });
                    tokio::select! {
                        _ = tokio::time::sleep(delay) => {},
                        r = auth_rx.changed() => if r.is_err() { return },
                        c = self.cmd_rx.recv() => match c { None => return, Some(TwitchCmd::Recover) => backoff.reset() },
                    }
                }
            }
        }
    }

    /// Eine vollständige Verbindung inkl. dokumentierter Reconnects.
    async fn session(&mut self, proto: &mut EventSubProtocol, identity: &Identity, backoff: &mut Backoff) -> Disconnect {
        let sh = self.shared.clone();
        proto.reset_for_fresh_connection();
        let url = format!("{}?keepalive_timeout_seconds=30", sh.deps.ws_url);
        let mut ws = match tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async(url.as_str())).await {
            Ok(Ok((ws, _))) => ws,
            Ok(Err(e)) => return Disconnect::Transient(format!("WebSocket: {e}")),
            Err(_) => return Disconnect::Transient("WebSocket: Zeitüberschreitung".into()),
        };
        // Bis zur Welcome-Nachricht kurzer Watchdog, danach keepalive + Puffer.
        let mut watchdog = Duration::from_secs(15);
        let mut last_validate = sh.deps.clock.now_ms();
        let mut auth_rx = sh.deps.tokens.subscribe();
        let mut reward_rx = sh.deps.cp_reward.clone();
        reward_rx.borrow_and_update();
        loop {
            let next = tokio::select! {
                r = reward_rx.changed() => {
                    // Andere Belohnung → frische Verbindung mit passenden Abos.
                    let _ = ws.close(None).await;
                    if r.is_err() { return Disconnect::Stop; }
                    return Disconnect::Recover;
                }
                m = tokio::time::timeout(watchdog, ws.next()) => m,
                c = self.cmd_rx.recv() => {
                    let _ = ws.close(None).await;
                    return match c { None => Disconnect::Stop, Some(TwitchCmd::Recover) => Disconnect::Recover };
                }
                r = auth_rx.changed() => {
                    let _ = ws.close(None).await;
                    if r.is_err() { return Disconnect::Stop; }
                    return Disconnect::Recover;
                }
            };
            let msg = match next {
                Err(_) => return Disconnect::Transient("Keepalive ausgeblieben".into()),
                Ok(None) => return Disconnect::Transient("Verbindung geschlossen".into()),
                Ok(Some(Err(e))) => return Disconnect::Transient(format!("WebSocket: {e}")),
                Ok(Some(Ok(m))) => m,
            };
            match msg {
                Message::Text(t) => match proto.handle(t.as_str()) {
                    WsAction::Subscribe { session_id, keepalive_s } => {
                        watchdog = Duration::from_secs(keepalive_s + 5);
                        match sh.helix.subscribe_chat(&session_id, &identity.user_id, &identity.user_id).await {
                            Ok(_) => {
                                sh.subscribe_redemptions(&session_id, identity).await;
                                backoff.reset();
                                let now = sh.deps.clock.now_ms();
                                sh.update(|s| {
                                    s.link = TwitchLink::Connected;
                                    s.last_error = None;
                                    s.connected_since_ms = Some(now);
                                });
                                sh.deps.activity.success("twitch.connected", format!("Twitch-Chat verbunden ({})", identity.login), json!({ "login": identity.login }));
                            }
                            Err(ApiError::ReauthRequired { reason }) => return Disconnect::Auth(reason),
                            Err(e @ ApiError::Forbidden { .. }) => return Disconnect::Blocked(e.code().into()),
                            Err(e) => return Disconnect::Transient(format!("Abo: {e}")),
                        }
                    }
                    WsAction::Reconnect { url } => {
                        // Dokumentierter Reconnect: neue Verbindung aufbauen, Welcome abwarten,
                        // erst dann die alte schließen. Abos bleiben erhalten.
                        match reconnect(&url, proto).await {
                            Ok((new_ws, ka)) => {
                                let _ = ws.close(None).await;
                                ws = new_ws;
                                watchdog = Duration::from_secs(ka + 5);
                                sh.deps.activity.info("twitch.reconnected", "Twitch-Verbindung planmäßig gewechselt", json!({}));
                            }
                            Err(e) => return Disconnect::Transient(format!("Reconnect: {e}")),
                        }
                    }
                    WsAction::Redemption { update, event } => {
                        let _ = sh.deps.redemptions_tx.send((update, event));
                    }
                    WsAction::Chat(ev) => {
                        let sh2 = sh.clone();
                        tokio::spawn(async move { sh2.handle_chat(ev).await });
                    }
                    WsAction::Revoked { status, sub_type } => {
                        tracing::warn!(target: "twitch", status, sub_type, "Abo widerrufen");
                        return if status == "authorization_revoked" {
                            sh.deps.tokens.sign_out();
                            Disconnect::Auth(status)
                        } else {
                            Disconnect::Blocked(format!("revoked_{status}"))
                        };
                    }
                    WsAction::Resumed { .. } | WsAction::Keepalive | WsAction::Ignored => {}
                },
                Message::Ping(d) => {
                    let _ = ws.send(Message::Pong(d)).await;
                }
                Message::Close(frame) => {
                    let code = frame.map(|f| u16::from(f.code)).unwrap_or(0);
                    return Disconnect::Transient(format!("vom Server geschlossen (Code {code})"));
                }
                _ => {}
            }
            // Twitch verlangt stündliche Token-Validierung.
            let now = sh.deps.clock.now_ms();
            if now - last_validate > 3_600_000 {
                last_validate = now;
                match sh.ensure_identity(false).await {
                    Err(ApiError::ReauthRequired { reason }) => return Disconnect::Auth(reason),
                    Err(e) => tracing::info!(target: "twitch", code = e.code(), "Validierung verschoben"),
                    Ok(_) => {}
                }
            }
        }
    }
}

type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn reconnect(url: &str, proto: &mut EventSubProtocol) -> Result<(Ws, u64), String> {
    if !url.starts_with("wss://") {
        return Err("ungültige Reconnect-URL".into());
    }
    let (mut ws, _) = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async(url))
        .await
        .map_err(|_| "Zeitüberschreitung".to_string())?
        .map_err(|e| e.to_string())?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let m = tokio::time::timeout_at(deadline, ws.next()).await.map_err(|_| "kein Welcome".to_string())?;
        match m {
            Some(Ok(Message::Text(t))) => match proto.handle(t.as_str()) {
                WsAction::Resumed { keepalive_s, .. } => return Ok((ws, keepalive_s)),
                WsAction::Subscribe { .. } => return Err("unerwartete frische Session".into()),
                _ => {}
            },
            Some(Ok(_)) => {}
            Some(Err(e)) => return Err(e.to_string()),
            None => return Err("geschlossen".into()),
        }
    }
}

impl Shared {
    fn update(&self, f: impl FnOnce(&mut TwitchState)) {
        let changed = self.state_tx.send_if_modified(|s| {
            let before = s.clone();
            f(s);
            *s != before
        });
        if changed {
            self.deps.bus.changed(Topic::Twitch);
        }
    }

    /// Validiert das Token (Start und stündlich); erneuert bei 401 genau einmal.
    async fn ensure_identity(&self, _initial: bool) -> Result<Identity, ApiError> {
        let tok = self.deps.tokens.access_token().await?;
        let r = match auth::validate(&self.deps.http, &self.deps.id_base, &tok.token).await {
            Err(ApiError::Unauthorized) => {
                let fresh = self.deps.tokens.on_unauthorized(&tok).await?;
                auth::validate(&self.deps.http, &self.deps.id_base, &fresh.token).await
            }
            other => other,
        };
        match r {
            Ok(id) => {
                let missing: Vec<_> = super::SCOPES.iter().filter(|s| !id.scopes.iter().any(|x| x == *s)).collect();
                if !missing.is_empty() {
                    return Err(ApiError::Forbidden { reason: Some("missing_scope".into()), message: format!("{missing:?}") });
                }
                *self.identity.lock().unwrap() = Some(id.clone());
                self.update(|s| s.identity = Some(id.clone()));
                Ok(id)
            }
            Err(ApiError::Unauthorized) => Err(ApiError::ReauthRequired { reason: "Token ungültig".into() }),
            Err(e) => Err(e),
        }
    }

    fn reply(&self, text: String, reply_to: Option<String>) {
        if text.trim().is_empty() || !cfg::read(&self.deps.settings).commands.reply_in_chat {
            return;
        }
        let _ = self.chat_tx.try_send((commands::sanitize_chat(&text), reply_to));
    }

    /// Einlösungen der verwalteten Belohnung abonnieren (nur mit passender Berechtigung).
    async fn subscribe_redemptions(&self, session_id: &str, identity: &Identity) {
        let Some(reward_id) = self.deps.cp_reward.borrow().clone() else { return };
        if !identity.scopes.iter().any(|s| s == super::CHANNEL_POINTS_SCOPE) {
            return;
        }
        for kind in ["channel.channel_points_custom_reward_redemption.add", "channel.channel_points_custom_reward_redemption.update"] {
            let cond = json!({ "broadcaster_user_id": identity.user_id, "reward_id": reward_id });
            if let Err(e) = self.helix.subscribe(kind, cond, session_id).await {
                tracing::warn!(target: "twitch", code = e.code(), kind, "Kanalpunkte-Abo fehlgeschlagen");
                self.deps.activity.warn("channel_points.subscribe_failed", "Kanalpunkte-Einlösungen konnten nicht abonniert werden", json!({ "code": e.code() }));
            }
        }
    }

    async fn handle_chat(self: Arc<Self>, ev: ChatEvent) {
        if self.sent_ids.lock().unwrap().contains(&ev.message_id) {
            return;
        }
        // Chatnachrichten zu Kanalpunkte-Einlösungen werden ausschließlich über die
        // Einlösung verarbeitet (sonst doppelter Wunsch).
        if ev.reward_id.is_some() {
            return;
        }
        let settings = cfg::read(&self.deps.settings).commands.clone();
        let Some((kind, args)) = commands::parse(&ev.text, &settings) else { return };
        let is_broadcaster = ev.user_id == ev.broadcaster_id;
        let role = commands::role_from_badges(&ev.badges, is_broadcaster);
        let c = kind.cfg(&settings);
        if role < c.min_role {
            if !settings.replies.no_permission.is_empty() {
                self.reply(commands::fill(&settings.replies.no_permission, &[("user", ev.user_name.clone())]), Some(ev.message_id.clone()));
            }
            return;
        }
        let now = self.deps.clock.now_ms();
        if self.cooldowns.lock().unwrap().check(kind, &ev.user_id, role, c.cooldown_s, now).is_err() {
            return; // Still ignorieren – Cooldown-Hinweise würden den Chat fluten.
        }
        let requester = Requester { id: format!("twitch:{}", ev.user_id), name: ev.user_name.clone(), role };
        let replies = settings.replies.clone();
        match kind {
            CommandKind::Sr => {
                if args.is_empty() {
                    return;
                }
                let outcome = self
                    .deps
                    .queue
                    .submit_query(&args, requester, Source::Chat, Some(&format!("chat:{}", ev.message_id)), Some(&ev.message_id))
                    .await;
                if let Some(text) = commands::reply_for_outcome(&replies, &outcome) {
                    self.reply(text, Some(ev.message_id));
                }
            }
            CommandKind::Song => {
                let st = self.deps.spotify_state.borrow().clone();
                let text = match (&st.playback, st.is_online()) {
                    (PlaybackView::Active(p), true) if p.track.is_some() => {
                        let t = p.track.as_ref().unwrap();
                        commands::fill(&replies.song, &[("title", t.title.clone()), ("artist", t.artist_line()), ("user", ev.user_name.clone())])
                    }
                    _ => replies.nothing_playing.clone(),
                };
                self.reply(text, Some(ev.message_id));
            }
            CommandKind::Queue => {
                let items: Vec<String> = self
                    .deps
                    .queue
                    .store
                    .pending()
                    .into_iter()
                    .filter(|r| r.status != crate::queue::RequestStatus::Playing)
                    .filter_map(|r| r.track.map(|t| format!("{} – {} ({})", t.title, t.artist_line(), r.requester.name)))
                    .take(3)
                    .collect();
                let text = if items.is_empty() {
                    replies.queue_empty.clone()
                } else {
                    commands::fill(&replies.queue, &[("list", items.join(" · "))])
                };
                self.reply(text, Some(ev.message_id));
            }
            CommandKind::Remove => {
                let text = match self.deps.queue.remove_own(&requester.id) {
                    Some(r) => commands::fill(
                        &replies.removed,
                        &[("user", ev.user_name.clone()), ("title", r.track.map(|t| t.title).unwrap_or(r.query))],
                    ),
                    None => commands::fill(&replies.nothing_to_remove, &[("user", ev.user_name.clone())]),
                };
                self.reply(text, Some(ev.message_id));
            }
            CommandKind::Skip => {
                if self.skip().await {
                    self.deps.activity.info("chat.skip", format!("Skip durch {}", ev.user_name), json!({ "user": ev.user_name }));
                    self.reply(replies.skipped.clone(), None);
                }
            }
            CommandKind::VoteSkip => {
                let st = self.deps.spotify_state.borrow().clone();
                let Some(uri) = (match &st.playback {
                    PlaybackView::Active(p) => p.track.as_ref().map(|t| t.uri.clone()),
                    _ => None,
                }) else {
                    return;
                };
                let needed = settings.voteskip_needed;
                let (votes, reached) = self.voteskip.lock().unwrap().vote(&uri, &ev.user_id, needed);
                if reached {
                    if self.skip().await {
                        self.deps.activity.info("chat.voteskip", "Skip per Abstimmung", json!({ "votes": votes }));
                        self.reply(replies.skipped.clone(), None);
                    }
                } else {
                    self.reply(
                        commands::fill(&replies.voteskip_progress, &[("votes", votes.to_string()), ("needed", needed.to_string())]),
                        None,
                    );
                }
            }
        }
    }

    async fn skip(&self) -> bool {
        let device = match &self.deps.spotify_state.borrow().device {
            crate::spotify::service::DeviceState::Active { device } => device.id.clone(),
            _ => None,
        };
        match self.deps.spotify.skip_next(device.as_deref()).await {
            Ok(()) => {
                let _ = self.deps.spotify_cmd.send(SyncCmd::Poke);
                true
            }
            Err(e) => {
                tracing::info!(target: "twitch", code = e.code(), "Skip nicht möglich");
                false
            }
        }
    }
}

/// Einziger Sender für Chatnachrichten: Mindestabstand, Längenbegrenzung, kein Stau.
async fn chat_sender(sh: Arc<Shared>, mut rx: mpsc::Receiver<(String, Option<String>)>) {
    let mut last = tokio::time::Instant::now() - Duration::from_secs(60);
    while let Some((text, reply_to)) = rx.recv().await {
        let min = Duration::from_millis(cfg::read(&sh.deps.settings).commands.min_reply_interval_ms);
        let wait = (last + min).saturating_duration_since(tokio::time::Instant::now());
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
        let Some(id) = sh.identity.lock().unwrap().clone() else { continue };
        match sh.helix.send_chat(&id.user_id, &id.user_id, &text, reply_to.as_deref()).await {
            Ok(Some(mid)) => {
                let mut s = sh.sent_ids.lock().unwrap();
                s.push_back(mid);
                if s.len() > 200 {
                    s.pop_front();
                }
            }
            Ok(None) => {}
            Err(e) => tracing::info!(target: "twitch", code = e.code(), "Chatantwort nicht gesendet"),
        }
        last = tokio::time::Instant::now();
    }
}

/// Test-/Integrationshilfe: Chatereignis direkt verarbeiten (ohne WebSocket).
pub async fn handle_chat_for_test(handle_shared: &TwitchService, ev: ChatEvent) {
    handle_shared.shared.clone().handle_chat(ev).await
}

impl TwitchService {
    /// Setzt eine Identität (Tests ohne Validate-Endpunkt).
    pub fn set_identity_for_test(&self, id: Identity) {
        *self.shared.identity.lock().unwrap() = Some(id);
    }
    /// Startet nur den Chat-Sender (Tests ohne WebSocket).
    pub fn spawn_chat_sender_for_test(&mut self) {
        if let Some(rx) = self.chat_rx.take() {
            tokio::spawn(chat_sender(self.shared.clone(), rx));
        }
    }
    pub fn role_for_test(badges: &[String]) -> Role {
        commands::role_from_badges(badges, false)
    }
}
