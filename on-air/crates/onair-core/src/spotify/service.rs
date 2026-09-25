//! Genau ein Synchronisations-Worker für Spotify. UI, Tray und OBS lesen alle aus
//! demselben `watch`-Kanal; Widgets stellen keine eigenen Spotify-Abfragen.
//!
//! Authentifizierung, Erreichbarkeit und Wiedergabegerät werden getrennt modelliert:
//! Man kann angemeldet sein, obwohl gerade kein Gerät aktiv ist.

use super::SpotifyClient;
use crate::auth::AuthStatus;
use crate::backoff::{Backoff, BreakerState, CircuitBreaker};
use crate::clock::SharedClock;
use crate::error::{ApiError, ErrorInfo};
use crate::model::{Device, PlaybackView};
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, watch};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum LinkState {
    /// Noch keine Abfrage erfolgt.
    Unknown,
    Online,
    /// Einzelne Fehlschläge – automatische Wiederholung läuft.
    Degraded { failures: u32, next_retry_ms: i64 },
    /// Längerer Ausfall – langsame Prüfungen, Zugangsdaten bleiben erhalten.
    Offline { since_ms: i64, next_retry_ms: i64 },
    RateLimited { until_ms: i64 },
    QuotaExhausted { until_ms: i64 },
    /// 403: Berechtigung/Kontovoraussetzung/App-Zugang – kein Reconnect-Spam.
    Blocked { code: String },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DeviceState {
    Unknown,
    NoActiveDevice,
    Active { device: Device },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SpotifyState {
    pub auth: AuthStatus,
    pub link: LinkState,
    pub device: DeviceState,
    pub playback: PlaybackView,
    pub last_ok_ms: Option<i64>,
    pub last_error: Option<ErrorInfo>,
    pub breaker: BreakerState,
    /// Monoton steigend pro bestätigter Antwort – Konsumenten erkennen neue Daten.
    pub seq: u64,
}

impl SpotifyState {
    pub fn initial(auth: AuthStatus) -> Self {
        Self {
            auth,
            link: LinkState::Unknown,
            device: DeviceState::Unknown,
            playback: PlaybackView::Unknown,
            last_ok_ms: None,
            last_error: None,
            breaker: BreakerState::Closed,
            seq: 0,
        }
    }

    pub fn is_online(&self) -> bool {
        matches!(self.link, LinkState::Online) && matches!(self.auth, AuthStatus::SignedIn { .. })
    }
}

#[derive(Debug, Clone, Copy)]
pub enum SyncCmd {
    /// Sofort neu abfragen (z. B. nach Skip).
    Poke,
    /// Gezielte Wiederherstellung: Breaker in Half-Open, Backoff zurücksetzen, sofort prüfen.
    Recover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PollConfig {
    pub playing_ms: u64,
    pub paused_ms: u64,
    pub idle_ms: u64,
    /// Niemand schaut zu (UI verborgen, keine Overlay-Clients, keine offene Übergabe).
    pub low_demand: bool,
}

impl Default for PollConfig {
    fn default() -> Self {
        Self { playing_ms: 3_000, paused_ms: 8_000, idle_ms: 15_000, low_demand: false }
    }
}

pub struct SpotifyService {
    client: Arc<SpotifyClient>,
    clock: SharedClock,
    state_tx: watch::Sender<SpotifyState>,
    cmd_rx: mpsc::UnboundedReceiver<SyncCmd>,
    poll_rx: watch::Receiver<PollConfig>,
    breaker: CircuitBreaker,
    backoff: Backoff,
    offline_since: Option<i64>,
}

pub struct SpotifyHandle {
    pub state: watch::Receiver<SpotifyState>,
    pub cmd: mpsc::UnboundedSender<SyncCmd>,
}

impl SpotifyService {
    pub fn new(
        client: Arc<SpotifyClient>,
        clock: SharedClock,
        poll_rx: watch::Receiver<PollConfig>,
    ) -> (Self, SpotifyHandle) {
        let (state_tx, state_rx) = watch::channel(SpotifyState::initial(client.tokens().status()));
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let svc = Self {
            client,
            clock,
            state_tx,
            cmd_rx,
            poll_rx,
            breaker: CircuitBreaker::new(4, Duration::from_secs(30)),
            backoff: Backoff::new(Duration::from_secs(2), Duration::from_secs(120)),
            offline_since: None,
        };
        (svc, SpotifyHandle { state: state_rx, cmd: cmd_tx })
    }

    fn update(&self, f: impl FnOnce(&mut SpotifyState)) {
        self.state_tx.send_if_modified(|s| {
            let before = s.clone();
            f(s);
            *s != before
        });
    }

    /// Hauptschleife. Endet, wenn alle Command-Sender verworfen wurden.
    pub async fn run(mut self) {
        let mut auth_rx = self.client.tokens().subscribe();
        loop {
            let auth = self.client.tokens().status();
            self.update(|s| s.auth = auth.clone());
            let delay = if matches!(auth, AuthStatus::SignedIn { .. }) {
                self.tick().await
            } else {
                self.update(|s| {
                    s.link = LinkState::Unknown;
                    s.device = DeviceState::Unknown;
                    s.playback = PlaybackView::Unknown;
                });
                Duration::from_secs(3600)
            };
            tokio::select! {
                _ = tokio::time::sleep(delay) => {}
                changed = auth_rx.changed() => { if changed.is_err() { return; } }
                cmd = self.cmd_rx.recv() => match cmd {
                    None => return,
                    Some(SyncCmd::Poke) => {}
                    Some(SyncCmd::Recover) => {
                        self.breaker.force_half_open();
                        self.backoff.reset();
                    }
                },
                r = self.poll_rx.changed() => { if r.is_err() { return; } }
            }
        }
    }

    /// Eine Abfrage; liefert die Wartezeit bis zur nächsten.
    async fn tick(&mut self) -> Duration {
        let now = self.clock.now_ms();
        if let Some((ms, quota)) = self.client.suspended_for_ms() {
            let until = now + ms as i64;
            self.update(|s| {
                s.link = if quota { LinkState::QuotaExhausted { until_ms: until } } else { LinkState::RateLimited { until_ms: until } }
            });
            return Duration::from_millis(ms + 250);
        }
        if !self.breaker.allow(now) {
            let rem = self.breaker.remaining_ms(now).max(1_000) as u64;
            self.update(|s| s.breaker = BreakerState::Open);
            return Duration::from_millis(rem);
        }

        let result = self.client.playback().await;
        let now = self.clock.now_ms();
        match result {
            Ok(pb) => {
                self.breaker.on_success();
                self.backoff.reset();
                self.offline_since = None;
                let cfg = *self.poll_rx.borrow();
                let delay = next_poll_delay(&pb, &cfg);
                self.update(|s| {
                    s.link = LinkState::Online;
                    s.breaker = BreakerState::Closed;
                    s.last_ok_ms = Some(now);
                    s.last_error = None;
                    s.seq += 1;
                    match pb {
                        Some(p) => {
                            s.device = match &p.device {
                                Some(d) => DeviceState::Active { device: d.clone() },
                                None => DeviceState::NoActiveDevice,
                            };
                            s.playback = PlaybackView::Active(p);
                        }
                        None => {
                            s.device = DeviceState::NoActiveDevice;
                            s.playback = PlaybackView::Idle { fetched_at_ms: now };
                        }
                    }
                });
                delay
            }
            Err(ApiError::SessionEnded) => Duration::from_millis(100),
            Err(ApiError::NotSignedIn) | Err(ApiError::ReauthRequired { .. }) => {
                // Zustand kommt über den Auth-Kanal; Queue und Einstellungen bleiben erhalten.
                Duration::from_secs(3600)
            }
            Err(e @ (ApiError::RateLimited { .. } | ApiError::QuotaExhausted { .. })) => {
                let (ms, quota) = match e {
                    ApiError::QuotaExhausted { retry_after_ms } => (retry_after_ms, true),
                    ApiError::RateLimited { retry_after_ms } => (retry_after_ms, false),
                    _ => unreachable!(),
                };
                let until = now + ms as i64;
                let info = ErrorInfo::from_api(&e, now);
                self.update(|s| {
                    s.link = if quota { LinkState::QuotaExhausted { until_ms: until } } else { LinkState::RateLimited { until_ms: until } };
                    s.last_error = Some(info);
                });
                Duration::from_millis(ms + 250)
            }
            Err(e @ (ApiError::Forbidden { .. } | ApiError::PremiumRequired | ApiError::Config { .. })) => {
                let info = ErrorInfo::from_api(&e, now);
                self.update(|s| {
                    s.link = LinkState::Blocked { code: e.code().into() };
                    s.last_error = Some(info);
                });
                // Nur noch selten prüfen – oder sofort nach „Verbindung prüfen“.
                Duration::from_secs(600)
            }
            Err(e) => {
                self.breaker.on_failure(now);
                let delay = self.backoff.next_delay();
                let failures = self.breaker.consecutive_failures();
                let since = *self.offline_since.get_or_insert(now);
                let next = now + delay.as_millis() as i64;
                let breaker = self.breaker.state(now);
                let info = ErrorInfo::from_api(&e, now);
                tracing::warn!(target: "spotify", code = e.code(), failures, "Abfrage fehlgeschlagen");
                self.update(|s| {
                    s.link = if failures >= 4 {
                        LinkState::Offline { since_ms: since, next_retry_ms: next }
                    } else {
                        LinkState::Degraded { failures, next_retry_ms: next }
                    };
                    s.breaker = breaker;
                    s.last_error = Some(info);
                });
                delay
            }
        }
    }
}

/// Adaptives Polling: kurz vor Titelende gezielt nachfragen, bei Pause/Leerlauf seltener.
pub fn next_poll_delay(pb: &Option<crate::model::Playback>, cfg: &PollConfig) -> Duration {
    let factor = if cfg.low_demand { 2 } else { 1 };
    let ms = match pb {
        None => cfg.idle_ms,
        Some(p) if !p.is_playing => cfg.paused_ms,
        Some(p) => {
            let remaining = p.track.as_ref().map(|t| t.duration_ms.saturating_sub(p.progress_ms));
            match remaining {
                Some(r) if r + 400 < cfg.playing_ms * factor => (r + 400).max(1_000) / factor,
                _ => cfg.playing_ms,
            }
        }
    };
    Duration::from_millis(ms * factor)
}
