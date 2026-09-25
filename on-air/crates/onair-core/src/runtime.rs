//! Orchestrierung. Die Runtime wird genau einmal pro Prozess erzeugt (die
//! Desktop-Hülle erzwingt zusätzlich eine Einzelinstanz). Fensterwechsel oder
//! Neuladen der UI starten keine weiteren Worker.

use crate::acceptance::{self, Acceptance, Block};
use crate::activity::{Activity, ActivityLog};
use crate::plan::{PlanConfig, PlanStatus};
use crate::queue::rules::Rejection;
use crate::queue::service::SharedPlan;
use crate::twitch::helix::Helix;
use crate::twitch::rewards::{ChannelPointsDeps, ChannelPointsService, ChannelPointsStatus};
use crate::auth::loopback::LoginError;
use crate::auth::TokenManager;
use crate::clock::SharedClock;
use crate::error::ApiError;
use crate::events::{AppEvent, EventBus, Topic};
use crate::http::SharedTransport;
use crate::model::{Device, PlaybackView, Track};
use crate::overlay::{self, ControlAction, ControlHandler, NowPlaying, OverlayData, OverlayServer, QueueItem};
use crate::queue::service::QueueService;
use crate::queue::store::{BlockEntry, HistoryEntry, QueueStore};
use crate::queue::{RequestStatus, Requester, SongRequest, Source, SubmitOutcome};
use crate::secrets::SecretStore;
use crate::settings::{self as cfg, Profile, Settings, SharedSettings};
use crate::spotify::auth::{ClientIdFn, SpotifyTokenEndpoint};
use crate::spotify::client::UserProfile;
use crate::spotify::service::{LinkState, PollConfig, SpotifyService, SpotifyState, SyncCmd};
use crate::spotify::SpotifyClient;
use crate::storage::Db;
use crate::twitch::auth::{DeviceCode, TwitchTokenEndpoint};
use crate::twitch::service::{TwitchCmd, TwitchDeps, TwitchService, TwitchState};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock, Weak};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::task::JoinHandle;

#[derive(Debug, Clone)]
pub struct Endpoints {
    pub spotify_accounts: String,
    pub spotify_api: String,
    pub twitch_id: String,
    pub twitch_helix: String,
    pub twitch_ws: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            spotify_accounts: crate::spotify::auth::ACCOUNTS_BASE.into(),
            spotify_api: crate::spotify::client::API_BASE.into(),
            twitch_id: crate::twitch::ID_BASE.into(),
            twitch_helix: crate::twitch::HELIX_BASE.into(),
            twitch_ws: crate::twitch::EVENTSUB_WS.into(),
        }
    }
}

pub struct RuntimeConfig {
    pub db: Db,
    pub data_dir: Option<PathBuf>,
    pub secrets: Arc<dyn SecretStore>,
    pub http: SharedTransport,
    pub clock: SharedClock,
    pub endpoints: Endpoints,
    pub start_overlay: bool,
    pub app_version: String,
}

pub const SPOTIFY_SECRET_KEY: &str = "spotify.tokens";
pub const TWITCH_SECRET_KEY: &str = "twitch.tokens";
pub const CONTROL_SECRET_KEY: &str = "overlay.control_token";

#[derive(Debug, Clone, Serialize)]
pub struct OverlayInfo {
    pub port: u16,
    pub running: bool,
    pub error: Option<String>,
    pub clients: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppSnapshot {
    pub app_version: String,
    pub spotify: SpotifyState,
    pub spotify_profile: Option<UserProfile>,
    pub spotify_redirect_uri: String,
    pub twitch: TwitchState,
    pub twitch_device_code: Option<DeviceCode>,
    pub queue: Vec<SongRequest>,
    pub recent: Vec<SongRequest>,
    pub activity: Vec<Activity>,
    pub settings: Settings,
    pub overlay: OverlayInfo,
    pub session: HashMap<String, i64>,
    pub session_started_ms: i64,
    pub server_time_ms: i64,
    pub acceptance: Acceptance,
    pub plan: PlanStatus,
    pub plan_config: PlanConfig,
    pub channel_points: ChannelPointsStatus,
    pub update_pause: bool,
}

pub struct Runtime {
    pub db: Db,
    pub settings: SharedSettings,
    pub bus: EventBus,
    pub activity: ActivityLog,
    pub clock: SharedClock,
    http: SharedTransport,
    endpoints: Endpoints,
    secrets: Arc<dyn SecretStore>,
    data_dir: Option<PathBuf>,
    app_version: String,
    pub spotify_tokens: Arc<TokenManager>,
    pub spotify: Arc<SpotifyClient>,
    pub spotify_state: watch::Receiver<SpotifyState>,
    pub spotify_cmd: mpsc::UnboundedSender<SyncCmd>,
    pub twitch_tokens: Arc<TokenManager>,
    pub twitch_state: watch::Receiver<TwitchState>,
    pub twitch_cmd: mpsc::UnboundedSender<TwitchCmd>,
    pub queue: Arc<QueueService>,
    pub plan: SharedPlan,
    pub channel_points: Arc<ChannelPointsService>,
    cp_status: watch::Receiver<ChannelPointsStatus>,
    helix: Helix,
    update_pause: AtomicBool,
    last_acceptance: Mutex<Option<Acceptance>>,
    poll_tx: watch::Sender<PollConfig>,
    overlay_tx: watch::Sender<OverlayData>,
    overlay: tokio::sync::Mutex<Option<OverlayServer>>,
    overlay_error: Mutex<Option<String>>,
    control_token: String,
    tasks: Mutex<Vec<JoinHandle<()>>>,
    spotify_login_cancel: Mutex<Option<oneshot::Sender<()>>>,
    twitch_login_cancel: Mutex<Option<oneshot::Sender<()>>>,
    twitch_device_code: Mutex<Option<DeviceCode>>,
    spotify_profile: Mutex<Option<UserProfile>>,
    ui_visible: AtomicBool,
    start_overlay: bool,
    self_ref: Mutex<Weak<Runtime>>,
}

fn random_token() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    (0..40).map(|_| format!("{:x}", rng.random_range(0..16u8))).collect()
}

impl Runtime {
    pub async fn start(cfg: RuntimeConfig) -> Arc<Self> {
        let settings = Settings::load(&cfg.db).sanitized();
        let settings: SharedSettings = Arc::new(RwLock::new(settings));
        let bus = EventBus::new();
        let activity = ActivityLog::new(cfg.db.clone(), bus.clone(), cfg.clock.clone());

        let s1 = settings.clone();
        let spotify_client_id: ClientIdFn = Arc::new(move || cfg::read(&s1).spotify.client_id.trim().to_string());
        let spotify_tokens = TokenManager::load(
            SPOTIFY_SECRET_KEY,
            Arc::new(SpotifyTokenEndpoint {
                http: cfg.http.clone(),
                client_id: spotify_client_id,
                accounts_base: cfg.endpoints.spotify_accounts.clone(),
            }),
            cfg.secrets.clone(),
            cfg.clock.clone(),
        );
        let spotify = SpotifyClient::new(cfg.http.clone(), spotify_tokens.clone(), cfg.clock.clone(), &cfg.endpoints.spotify_api);
        let plan_cfg: PlanConfig = cfg.db.get_setting(PlanConfig::KEY).and_then(|r| serde_json::from_str(&r).ok()).unwrap_or_default();
        let plan = Arc::new(RwLock::new(plan_cfg));
        let poll_cfg = PollConfig { playing_ms: cfg::read(&settings).spotify.poll_playing_ms, ..Default::default() };
        let (poll_tx, poll_rx) = watch::channel(poll_cfg);
        let (sp_service, sp_handle) = SpotifyService::new(spotify.clone(), cfg.clock.clone(), poll_rx);

        let queue = QueueService::new(
            QueueStore::new(cfg.db.clone()),
            spotify.clone(),
            sp_handle.state.clone(),
            settings.clone(),
            activity.clone(),
            bus.clone(),
            cfg.clock.clone(),
            plan.clone(),
        );

        let s2 = settings.clone();
        let twitch_client_id: ClientIdFn = Arc::new(move || cfg::read(&s2).twitch.client_id.trim().to_string());
        let twitch_tokens = TokenManager::load(
            TWITCH_SECRET_KEY,
            Arc::new(TwitchTokenEndpoint {
                http: cfg.http.clone(),
                client_id: twitch_client_id.clone(),
                id_base: cfg.endpoints.twitch_id.clone(),
            }),
            cfg.secrets.clone(),
            cfg.clock.clone(),
        );
        let (reward_tx, reward_rx) = watch::channel(None);
        let (redemptions_tx, redemptions_rx) = mpsc::unbounded_channel();
        let (tw_service, tw_handle) = TwitchService::new(TwitchDeps {
            cp_reward: reward_rx,
            redemptions_tx,
            http: cfg.http.clone(),
            tokens: twitch_tokens.clone(),
            client_id: twitch_client_id.clone(),
            id_base: cfg.endpoints.twitch_id.clone(),
            helix_base: cfg.endpoints.twitch_helix.clone(),
            ws_url: cfg.endpoints.twitch_ws.clone(),
            queue: queue.clone(),
            spotify: spotify.clone(),
            spotify_state: sp_handle.state.clone(),
            spotify_cmd: sp_handle.cmd.clone(),
            settings: settings.clone(),
            activity: activity.clone(),
            bus: bus.clone(),
            clock: cfg.clock.clone(),
        });
        queue.set_notifier(tw_handle.notifier());

        let helix = Helix {
            http: cfg.http.clone(),
            tokens: twitch_tokens.clone(),
            client_id: twitch_client_id,
            base: cfg.endpoints.twitch_helix.clone(),
        };
        let (channel_points, cp_status) = ChannelPointsService::new(
            ChannelPointsDeps {
                helix: Helix { http: helix.http.clone(), tokens: helix.tokens.clone(), client_id: helix.client_id.clone(), base: helix.base.clone() },
                queue: queue.clone(),
                settings: settings.clone(),
                twitch_state: tw_handle.state.clone(),
                activity: activity.clone(),
                bus: bus.clone(),
                clock: cfg.clock.clone(),
                db: cfg.db.clone(),
            },
            reward_tx,
        );

        let control_token = match cfg.secrets.load(CONTROL_SECRET_KEY) {
            Ok(Some(t)) if t.len() >= 32 => t,
            _ => {
                let t = random_token();
                let _ = cfg.secrets.save(CONTROL_SECRET_KEY, &t);
                t
            }
        };
        let (overlay_tx, _) = watch::channel(OverlayData::empty(cfg::read(&settings).overlay.clone()));

        let rt = Arc::new(Self {
            db: cfg.db.clone(),
            settings,
            bus,
            activity,
            clock: cfg.clock.clone(),
            http: cfg.http.clone(),
            endpoints: cfg.endpoints.clone(),
            secrets: cfg.secrets.clone(),
            data_dir: cfg.data_dir.clone(),
            app_version: cfg.app_version.clone(),
            spotify_tokens,
            spotify,
            spotify_state: sp_handle.state.clone(),
            spotify_cmd: sp_handle.cmd.clone(),
            twitch_tokens,
            twitch_state: tw_handle.state.clone(),
            twitch_cmd: tw_handle.cmd.clone(),
            queue,
            plan,
            channel_points,
            cp_status,
            helix,
            update_pause: AtomicBool::new(false),
            last_acceptance: Mutex::new(None),
            poll_tx,
            overlay_tx,
            overlay: tokio::sync::Mutex::new(None),
            overlay_error: Mutex::new(None),
            control_token,
            tasks: Mutex::new(vec![]),
            spotify_login_cancel: Mutex::new(None),
            twitch_login_cancel: Mutex::new(None),
            twitch_device_code: Mutex::new(None),
            spotify_profile: Mutex::new(None),
            ui_visible: AtomicBool::new(true),
            start_overlay: cfg.start_overlay,
            self_ref: Mutex::new(Weak::new()),
        });
        *rt.self_ref.lock().unwrap() = Arc::downgrade(&rt);

        // Annahme-Gate: getrennte Sperrgründe, gemeinsam ausgewertet.
        let weak = Arc::downgrade(&rt);
        rt.queue.set_gate(Arc::new(move |source| {
            let Some(rt) = weak.upgrade() else { return Err(Rejection::Technical { detail: "beendet".into() }) };
            let a = rt.acceptance();
            let gate = match source {
                Source::ChannelPoints => &a.channel_points,
                _ => &a.chat,
            };
            // „Abgleich läuft“ hält nur die Belohnung auf Twitch pausiert; bereits
            // getätigte (verpasste) Einlösungen werden regulär verarbeitet.
            match gate.blocks.iter().find(|b| !matches!(b, Block::Reconciling)) {
                None => Ok(()),
                Some(b) => Err(block_to_rejection(b)),
            }
        }));
        let weak = Arc::downgrade(&rt);
        rt.channel_points.set_desired_paused(Arc::new(move || {
            weak.upgrade().map(|rt| !rt.acceptance_without_cp_state().channel_points.open).unwrap_or(true)
        }));

        // Absturzreste auflösen, bevor Worker starten.
        rt.queue.recover_after_start().await;
        let _ = rt.db.prune(rt.clock.now_ms());

        let mut tasks = vec![
            tokio::spawn(sp_service.run()),
            tokio::spawn(tw_service.run()),
            tokio::spawn(observe_spotify(Arc::downgrade(&rt))),
            tokio::spawn(overlay_feeder(Arc::downgrade(&rt))),
            tokio::spawn(rt.channel_points.clone().run(redemptions_rx)),
            tokio::spawn(acceptance_watcher(Arc::downgrade(&rt))),
        ];
        let weak = Arc::downgrade(&rt);
        let clock = rt.clock.clone();
        tasks.push(tokio::spawn(crate::wake::watch(clock, move |gap_ms| {
            if let Some(rt) = weak.upgrade() {
                rt.activity.info(
                    "system.wake",
                    format!("System war {} s pausiert – Verbindungen werden geprüft", gap_ms / 1000),
                    json!({ "gap_s": gap_ms / 1000 }),
                );
                rt.recover_all();
            }
        })));
        let weak = Arc::downgrade(&rt);
        tasks.push(tokio::spawn(async move {
            let mut iv = tokio::time::interval(Duration::from_secs(6 * 3600));
            iv.tick().await;
            loop {
                iv.tick().await;
                let Some(rt) = weak.upgrade() else { return };
                let _ = rt.db.prune(rt.clock.now_ms());
            }
        }));
        *rt.tasks.lock().unwrap() = tasks;

        if rt.start_overlay {
            rt.restart_overlay().await;
        }
        if matches!(rt.spotify_tokens.status(), crate::auth::AuthStatus::SignedIn { .. }) {
            rt.refresh_profile_later();
        }
        rt
    }

    /// Beendet alle Worker (App-Ende). Pausiert vorher die Kanalpunkte-Belohnung (best effort).
    pub async fn shutdown(&self) {
        self.update_pause.store(true, Ordering::SeqCst);
        if cfg::read(&self.settings).channel_points.enabled {
            let _ = self.channel_points.pause_before_exit(Duration::from_secs(4)).await;
        }
        for t in self.tasks.lock().unwrap().drain(..) {
            t.abort();
        }
        if let Some(mut s) = self.overlay.lock().await.take() {
            s.stop();
        }
    }

    fn arc(&self) -> Option<Arc<Runtime>> {
        self.self_ref.lock().unwrap().upgrade()
    }

    /// Gezielte Wiederherstellung nach Standby oder „Verbindung prüfen“.
    pub fn recover_all(&self) {
        let _ = self.spotify_cmd.send(SyncCmd::Recover);
        let _ = self.twitch_cmd.send(TwitchCmd::Recover);
    }

    pub fn set_ui_visible(&self, visible: bool) {
        self.ui_visible.store(visible, Ordering::Relaxed);
        self.update_poll_config();
    }

    fn update_poll_config(&self) {
        let clients = self.overlay.try_lock().ok().and_then(|o| o.as_ref().map(|s| s.connected_clients())).unwrap_or(0);
        let pending = !self.queue.store.by_status(RequestStatus::Accepted).is_empty()
            || !self.queue.store.by_status(RequestStatus::HandedOff).is_empty();
        let low = !self.ui_visible.load(Ordering::Relaxed) && clients == 0 && !pending;
        let playing = cfg::read(&self.settings).spotify.poll_playing_ms;
        self.poll_tx.send_if_modified(|p| {
            let n = PollConfig { playing_ms: playing, low_demand: low, ..*p };
            if *p != n {
                *p = n;
                true
            } else {
                false
            }
        });
    }

    // ------------------------------------------------------------------
    // Snapshot für die UI
    // ------------------------------------------------------------------

    pub async fn snapshot(&self) -> AppSnapshot {
        let overlay = {
            let o = self.overlay.lock().await;
            OverlayInfo {
                port: o.as_ref().map(|s| s.port).unwrap_or(cfg::read(&self.settings).overlay.port),
                running: o.is_some(),
                error: self.overlay_error.lock().unwrap().clone(),
                clients: o.as_ref().map(|s| s.connected_clients()).unwrap_or(0),
            }
        };
        let settings = cfg::read(&self.settings).clone();
        AppSnapshot {
            app_version: self.app_version.clone(),
            spotify: self.spotify_state.borrow().clone(),
            spotify_profile: self.spotify_profile.lock().unwrap().clone(),
            spotify_redirect_uri: crate::spotify::redirect_uri(settings.spotify.redirect_port),
            twitch: self.twitch_state.borrow().clone(),
            twitch_device_code: self.twitch_device_code.lock().unwrap().clone(),
            queue: self.queue.store.pending(),
            recent: self.queue.store.recent_finished(30),
            activity: self.activity.recent(40),
            settings,
            overlay,
            session: self.queue.session_summary(),
            session_started_ms: self.queue.session_started_ms(),
            server_time_ms: self.clock.now_ms(),
            acceptance: self.acceptance(),
            plan: self.queue.plan_status(),
            plan_config: self.queue.plan_config(),
            channel_points: self.cp_status.borrow().clone(),
            update_pause: self.update_pause.load(Ordering::SeqCst),
        }
    }

    // ------------------------------------------------------------------
    // Spotify
    // ------------------------------------------------------------------

    pub async fn spotify_login(&self, open_browser: impl FnOnce(&str) -> Result<(), String>) -> Result<(), LoginError> {
        let (tx, rx) = oneshot::channel();
        if let Some(old) = self.spotify_login_cancel.lock().unwrap().replace(tx) {
            let _ = old.send(());
        }
        let s = cfg::read(&self.settings).spotify.clone();
        let login_cfg = crate::spotify::auth::LoginConfig {
            client_id: s.client_id,
            port: s.redirect_port,
            accounts_base: self.endpoints.spotify_accounts.clone(),
        };
        let res = crate::spotify::auth::login(&login_cfg, self.http.clone(), self.clock.now_ms(), open_browser, rx).await;
        self.spotify_login_cancel.lock().unwrap().take();
        match res {
            Ok(tokens) => {
                self.spotify_tokens.install(tokens).map_err(|m| LoginError::Other { message: format!("Speichern fehlgeschlagen: {m}") })?;
                self.activity.success("spotify.connected", "Spotify verbunden", json!({}));
                let _ = self.spotify_cmd.send(SyncCmd::Recover);
                self.refresh_profile_later();
                Ok(())
            }
            Err(e) => {
                if !matches!(e, LoginError::Cancelled) {
                    self.activity.warn("spotify.login_failed", format!("Spotify-Anmeldung fehlgeschlagen: {e}"), json!({}));
                }
                Err(e)
            }
        }
    }

    pub fn cancel_spotify_login(&self) {
        if let Some(tx) = self.spotify_login_cancel.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    fn refresh_profile_later(&self) {
        let Some(rt) = self.arc() else { return };
        tokio::spawn(async move {
            if let Ok(p) = rt.spotify.me().await {
                *rt.spotify_profile.lock().unwrap() = Some(p);
                rt.bus.changed(Topic::Spotify);
            }
        });
    }

    /// Abmelden: laufende Vorgänge verwerfen ihre Ergebnisse (Epoche); Queue bleibt erhalten.
    pub fn spotify_logout(&self) {
        self.cancel_spotify_login();
        self.spotify_tokens.sign_out();
        *self.spotify_profile.lock().unwrap() = None;
        self.activity.info("spotify.signed_out", "Von Spotify abgemeldet – Warteschlange bleibt erhalten", json!({}));
        self.bus.changed(Topic::Spotify);
    }

    fn device_id(&self) -> Option<String> {
        match &self.spotify_state.borrow().device {
            crate::spotify::service::DeviceState::Active { device } => device.id.clone(),
            _ => None,
        }
    }

    pub async fn transport(&self, action: &str) -> Result<(), ApiError> {
        let d = self.device_id();
        let r = match action {
            "next" => self.spotify.skip_next(d.as_deref()).await,
            "previous" => self.spotify.skip_previous(d.as_deref()).await,
            "pause" => self.spotify.pause(d.as_deref()).await,
            "resume" => self.spotify.resume(d.as_deref()).await,
            _ => Err(ApiError::BadRequest { message: "unbekannte Aktion".into() }),
        };
        let _ = self.spotify_cmd.send(SyncCmd::Poke);
        r
    }

    pub async fn devices(&self) -> Result<Vec<Device>, ApiError> {
        self.spotify.devices().await
    }

    /// Nur auf ausdrückliche Auswahl in der UI – nie automatisch.
    pub async fn transfer_playback(&self, device_id: &str) -> Result<(), ApiError> {
        let r = self.spotify.transfer(device_id, true).await;
        let _ = self.spotify_cmd.send(SyncCmd::Poke);
        r
    }

    pub async fn search(&self, q: &str) -> Result<Vec<Track>, ApiError> {
        if let Some(id) = crate::spotify::parse_track_link(q) {
            return self.spotify.track(&id).await.map(|t| vec![t]);
        }
        self.spotify.search_tracks(q, crate::spotify::client::SEARCH_LIMIT).await
    }

    pub async fn add_request(&self, track: Track) -> SubmitOutcome {
        self.queue.submit_track(track, Requester::streamer(), Source::App).await
    }

    // ------------------------------------------------------------------
    // Twitch
    // ------------------------------------------------------------------

    pub async fn twitch_login_start(&self) -> Result<DeviceCode, ApiError> {
        let s = cfg::read(&self.settings).clone();
        let client_id = s.twitch.client_id.trim().to_string();
        // Kanalpunkte-Berechtigung nur anfordern, wenn die Funktion genutzt wird.
        let with_cp = s.channel_points.enabled
            || self.twitch_state.borrow().identity.as_ref().map(|i| i.scopes.iter().any(|x| x == crate::twitch::CHANNEL_POINTS_SCOPE)).unwrap_or(false);
        let scopes = crate::twitch::scopes(with_cp);
        let dc = crate::twitch::auth::start_device_flow(&self.http, &self.endpoints.twitch_id, &client_id, &scopes).await?;
        *self.twitch_device_code.lock().unwrap() = Some(dc.clone());
        let (tx, rx) = oneshot::channel();
        if let Some(old) = self.twitch_login_cancel.lock().unwrap().replace(tx) {
            let _ = old.send(());
        }
        let Some(rt) = self.arc() else { return Ok(dc) };
        let dc2 = dc.clone();
        tokio::spawn(async move {
            let clock = rt.clock.clone();
            let res = crate::twitch::auth::poll_device_flow(&rt.http, &rt.endpoints.twitch_id, &client_id, &dc2, move || clock.now_ms(), rx).await;
            *rt.twitch_device_code.lock().unwrap() = None;
            match res {
                Ok(tokens) => {
                    if rt.twitch_tokens.install(tokens).is_ok() {
                        rt.activity.success("twitch.signed_in", "Twitch verbunden", json!({}));
                    }
                }
                Err(ApiError::SessionEnded) => {}
                Err(e) => rt.activity.warn("twitch.login_failed", format!("Twitch-Anmeldung nicht abgeschlossen: {e}"), json!({})),
            }
            rt.bus.changed(Topic::Twitch);
        });
        self.bus.changed(Topic::Twitch);
        Ok(dc)
    }

    pub fn twitch_login_cancel(&self) {
        if let Some(tx) = self.twitch_login_cancel.lock().unwrap().take() {
            let _ = tx.send(());
        }
        *self.twitch_device_code.lock().unwrap() = None;
        self.bus.changed(Topic::Twitch);
    }

    pub fn twitch_logout(&self) {
        self.twitch_login_cancel();
        self.twitch_tokens.sign_out();
        self.activity.info("twitch.signed_out", "Von Twitch abgemeldet", json!({}));
    }

    // ------------------------------------------------------------------
    // Annahme-Gate, Streamplanung, Kanalpunkte, Update-Pause
    // ------------------------------------------------------------------

    fn acceptance_inputs(&self, with_cp_state: bool) -> acceptance::Inputs {
        let s = cfg::read(&self.settings).clone();
        let sp_signed = matches!(self.spotify_state.borrow().auth, crate::auth::AuthStatus::SignedIn { .. });
        let tw = self.twitch_state.borrow().clone();
        acceptance::Inputs {
            manual_open: s.requests.open,
            chat_enabled: s.requests.chat_enabled,
            cp_enabled: s.channel_points.enabled,
            update_pause: self.update_pause.load(Ordering::SeqCst),
            spotify_signed_in: sp_signed,
            twitch_chat_connected: matches!(tw.link, crate::twitch::service::TwitchLink::Connected),
            cp_technical: if with_cp_state { self.channel_points.technical_now() } else { None },
            cp_reconciling: with_cp_state && s.channel_points.enabled && !self.channel_points.is_reconciled(),
        }
    }

    /// Wirksamer Annahmestatus mit allen Sperrgründen.
    pub fn acceptance(&self) -> Acceptance {
        acceptance::compute(&self.acceptance_inputs(true), &self.queue.plan_status())
    }

    /// Ohne den Zustand der Belohnung selbst (verhindert Zirkelbezug bei der Synchronisation).
    fn acceptance_without_cp_state(&self) -> Acceptance {
        acceptance::compute(&self.acceptance_inputs(false), &self.queue.plan_status())
    }

    fn save_plan(&self, p: PlanConfig) -> Result<(), String> {
        let raw = serde_json::to_string(&p).map_err(|e| e.to_string())?;
        self.db.set_setting(PlanConfig::KEY, &raw)?;
        *self.plan.write().unwrap_or_else(|x| x.into_inner()) = p;
        self.bus.changed(Topic::Queue);
        self.channel_points.kick();
        Ok(())
    }

    /// Planung starten/ändern mit festem Endzeitpunkt (Unix-ms).
    pub fn plan_set_end(&self, end_at_ms: i64, buffer_ms: Option<i64>) -> Result<(), String> {
        let now = self.clock.now_ms();
        if end_at_ms <= now {
            return Err("Die Endzeit liegt in der Vergangenheit.".into());
        }
        if end_at_ms - now > 24 * 3_600_000 {
            return Err("Maximal 24 Stunden im Voraus.".into());
        }
        let mut p = self.queue.plan_config();
        let was_active = p.is_active();
        p.enabled = true;
        p.end_at_ms = Some(end_at_ms);
        if let Some(b) = buffer_ms {
            p.buffer_ms = b.clamp(0, 30 * 60_000);
        }
        self.save_plan(p)?;
        self.activity.info(
            if was_active { "plan.changed" } else { "plan.started" },
            format!("Streamplanung: noch {} Minuten", (end_at_ms - now + 30_000) / 60_000),
            json!({ "end_at_ms": end_at_ms }),
        );
        Ok(())
    }

    pub fn plan_extend(&self, minutes: i64) -> Result<(), String> {
        let p = self.queue.plan_config();
        let now = self.clock.now_ms();
        let base = p.end_at_ms.filter(|_| p.enabled).unwrap_or(now).max(now);
        self.plan_set_end(base + minutes * 60_000, None)
    }

    pub fn plan_set_buffer(&self, buffer_ms: i64) -> Result<(), String> {
        let mut p = self.queue.plan_config();
        p.buffer_ms = buffer_ms.clamp(0, 30 * 60_000);
        self.save_plan(p)
    }

    pub fn plan_stop(&self) -> Result<(), String> {
        let mut p = self.queue.plan_config();
        if !p.enabled {
            return Ok(());
        }
        p.enabled = false;
        self.save_plan(p)?;
        self.activity.info("plan.stopped", "Streamplanung beendet", json!({}));
        Ok(())
    }

    /// Entscheidung zu einer Kanalpunkte-Einlösung (Prüfung/Konflikt).
    pub fn redemption_decide(&self, request_id: &str, fulfill: bool) -> Result<(), String> {
        self.channel_points.decide(request_id, fulfill)
    }

    /// Live-Status laut Twitch (`None` = unbekannt).
    /// Zustand für die Entscheidung über automatische Updates (ohne Netzwerkzugriff):
    /// (Streamplanung aktiv, Übergabe läuft/ungeklärt, Spotify spielt gerade).
    pub fn update_safety(&self) -> (bool, bool, bool) {
        use crate::queue::RequestStatus;
        let plan_active = self.queue.plan_status().active;
        let handoff_busy = self.queue.store.pending().iter().any(|r| matches!(r.status, RequestStatus::HandingOff | RequestStatus::Uncertain));
        let playing = matches!(&self.spotify_state.borrow().playback, crate::model::PlaybackView::Active(p) if p.is_playing);
        (plan_active, handoff_busy, playing)
    }

    pub async fn twitch_is_live(&self) -> Option<bool> {
        let id = self.twitch_state.borrow().identity.clone()?;
        tokio::time::timeout(Duration::from_secs(5), self.helix.is_live(&id.user_id)).await.ok()?.ok()
    }

    /// Vor einer Update-Installation: Annahme pausieren, Belohnung pausieren, laufende
    /// Übergaben abwarten, Datenbank sichern. Liefert einen ehrlichen Bericht.
    pub async fn prepare_for_update(&self) -> UpdatePrep {
        self.update_pause.store(true, Ordering::SeqCst);
        self.bus.changed(Topic::Queue);
        self.activity.info("update.preparing", "Update wird vorbereitet – neue Requests sind kurz pausiert", json!({}));
        let reward_paused = if cfg::read(&self.settings).channel_points.enabled {
            Some(self.channel_points.pause_before_exit(Duration::from_secs(6)).await)
        } else {
            None
        };
        let idle = tokio::time::timeout(Duration::from_secs(10), self.queue.quiesce()).await.is_ok();
        let db_ok = self.db.checkpoint().is_ok();
        UpdatePrep { reward_paused, queue_idle: idle, db_saved: db_ok }
    }

    /// Update abgebrochen: Pause wieder aufheben.
    pub fn cancel_update_pause(&self) {
        if self.update_pause.swap(false, Ordering::SeqCst) {
            self.bus.changed(Topic::Queue);
            self.channel_points.kick();
        }
    }


    // ------------------------------------------------------------------
    // Einstellungen, Profile, Sperrlisten, Verlauf
    // ------------------------------------------------------------------

    pub async fn update_settings(&self, new: Settings) -> Result<Settings, String> {
        let new = new.sanitized();
        let old = cfg::read(&self.settings).clone();
        new.save(&self.db)?;
        *self.settings.write().unwrap_or_else(|p| p.into_inner()) = new.clone();
        if old.spotify.client_id.trim() != new.spotify.client_id.trim() && !old.spotify.client_id.trim().is_empty() {
            // Tokens gehören zur alten Client-ID.
            self.spotify_logout();
        }
        if old.twitch.client_id.trim() != new.twitch.client_id.trim() && !old.twitch.client_id.trim().is_empty() {
            self.twitch_logout();
        }
        if old.requests.open != new.requests.open {
            self.activity.info(
                if new.requests.open { "requests.opened" } else { "requests.closed" },
                if new.requests.open { "Requests geöffnet" } else { "Requests pausiert" },
                json!({}),
            );
        }
        if old.overlay.port != new.overlay.port && self.start_overlay {
            self.restart_overlay().await;
        }
        self.update_poll_config();
        self.bus.changed(Topic::Settings);
        self.bus.changed(Topic::Overlay);
        if let Some(rt) = self.arc() {
            tokio::spawn(async move { rt.queue.maybe_handoff().await });
        }
        Ok(new)
    }

    pub async fn set_requests_open(&self, open: bool) -> Result<(), String> {
        let mut s = cfg::read(&self.settings).clone();
        s.requests.open = open;
        self.update_settings(s).await.map(|_| ())
    }

    /// Export ohne Credentials (Tokens liegen ohnehin nur im Secret Store).
    pub fn export_settings(&self) -> String {
        let s = cfg::read(&self.settings).clone();
        serde_json::to_string_pretty(&json!({ "format": "onair.settings", "version": 1, "settings": s })).unwrap_or_default()
    }

    pub async fn import_settings(&self, raw: &str) -> Result<Settings, String> {
        let v: serde_json::Value = serde_json::from_str(raw).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
        if v["format"] != "onair.settings" {
            return Err("Keine ON AIR-Einstellungsdatei".into());
        }
        let mut s: Settings = serde_json::from_value(v["settings"].clone()).map_err(|e| format!("Ungültige Einstellungen: {e}"))?;
        // Kontobezogene Werte des aktuellen Systems beibehalten.
        let cur = cfg::read(&self.settings).clone();
        s.spotify.client_id = cur.spotify.client_id;
        s.twitch.client_id = cur.twitch.client_id;
        s.onboarding_done = cur.onboarding_done;
        self.update_settings(s).await
    }

    pub async fn save_profile(&self, name: &str) -> Result<(), String> {
        let mut s = cfg::read(&self.settings).clone();
        let id = uuid::Uuid::new_v4().to_string();
        s.profiles.push(Profile { id: id.clone(), name: name.trim().chars().take(40).collect(), rules: s.requests.clone(), overlay: s.overlay.clone() });
        s.active_profile = Some(id);
        self.update_settings(s).await.map(|_| ())
    }

    pub async fn apply_profile(&self, id: &str) -> Result<(), String> {
        let mut s = cfg::read(&self.settings).clone();
        let p = s.profiles.iter().find(|p| p.id == id).cloned().ok_or("Profil nicht gefunden")?;
        let port = s.overlay.port;
        s.requests = p.rules;
        s.overlay = p.overlay;
        s.overlay.port = port; // OBS-URLs bleiben stabil.
        s.requests.open = cfg::read(&self.settings).requests.open; // manuelle Pause ist kein Profilwert
        s.active_profile = Some(p.id);
        self.activity.info("profile.applied", format!("Profil „{}“ aktiv", p.name), json!({ "name": p.name }));
        self.update_settings(s).await.map(|_| ())
    }

    pub async fn update_profile_from_current(&self, id: &str) -> Result<(), String> {
        let mut s = cfg::read(&self.settings).clone();
        let (rules, overlay) = (s.requests.clone(), s.overlay.clone());
        let p = s.profiles.iter_mut().find(|p| p.id == id).ok_or("Profil nicht gefunden")?;
        p.rules = rules;
        p.overlay = overlay;
        self.update_settings(s).await.map(|_| ())
    }

    pub async fn delete_profile(&self, id: &str) -> Result<(), String> {
        let mut s = cfg::read(&self.settings).clone();
        s.profiles.retain(|p| p.id != id);
        if s.active_profile.as_deref() == Some(id) {
            s.active_profile = None;
        }
        self.update_settings(s).await.map(|_| ())
    }

    pub fn blocklist(&self) -> Vec<BlockEntry> {
        self.queue.store.blocklist_entries()
    }

    pub fn add_block(&self, kind: &str, value: &str, label: &str) -> Result<(), String> {
        self.queue.store.add_block(kind, value.trim(), label.trim(), self.clock.now_ms())?;
        self.activity.info("blocklist.added", format!("Gesperrt: {label}"), json!({ "kind": kind }));
        self.bus.changed(Topic::Queue);
        Ok(())
    }

    pub fn remove_block(&self, kind: &str, value: &str) -> Result<(), String> {
        self.queue.store.remove_block(kind, value)?;
        self.bus.changed(Topic::Queue);
        Ok(())
    }

    pub fn history(&self, search: &str, limit: u32) -> Vec<HistoryEntry> {
        self.queue.store.history(search, limit.min(500))
    }

    pub fn control_token(&self) -> &str {
        &self.control_token
    }

    pub fn data_dir(&self) -> Option<&PathBuf> {
        self.data_dir.as_ref()
    }

    pub fn secrets(&self) -> &Arc<dyn SecretStore> {
        &self.secrets
    }

    // ------------------------------------------------------------------
    // Overlay
    // ------------------------------------------------------------------

    pub async fn restart_overlay(&self) {
        let mut guard = self.overlay.lock().await;
        if let Some(mut s) = guard.take() {
            s.stop();
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let port = cfg::read(&self.settings).overlay.port;
        let handler: Arc<dyn ControlHandler> = Arc::new(Control(self.self_ref.lock().unwrap().clone()));
        match overlay::start(port, self.overlay_tx.subscribe(), self.control_token.clone(), handler).await {
            Ok(s) => {
                *guard = Some(s);
                *self.overlay_error.lock().unwrap() = None;
            }
            Err(e) => {
                self.activity.error("overlay.failed", format!("Overlay-Server konnte nicht starten: {e}"), json!({ "port": port }));
                *self.overlay_error.lock().unwrap() = Some(e);
            }
        }
        drop(guard);
        self.bus.changed(Topic::Overlay);
    }

    fn build_overlay_data(&self) -> OverlayData {
        let st = self.spotify_state.borrow().clone();
        let settings = cfg::read(&self.settings).clone();
        let pending = self.queue.store.pending();
        let queue: Vec<QueueItem> = pending
            .iter()
            .filter(|r| !matches!(r.status, RequestStatus::Playing | RequestStatus::PendingReview | RequestStatus::Uncertain))
            .filter_map(|r| {
                r.track.as_ref().map(|t| QueueItem {
                    title: t.title.clone(),
                    artists: t.artists.clone(),
                    requester: r.requester.name.clone(),
                    image_url: t.image_url.clone(),
                })
            })
            .take(10)
            .collect();
        let mut data = OverlayData::empty(settings.overlay.clone());
        data.queue = queue;
        if !st.is_online() {
            return data;
        }
        match &st.playback {
            PlaybackView::Active(p) => {
                if let Some(t) = &p.track {
                    let requester = pending
                        .iter()
                        .find(|r| r.status == RequestStatus::Playing && r.track.as_ref().map(|x| &x.uri) == Some(&t.uri))
                        .map(|r| r.requester.name.clone());
                    data.status = "live";
                    data.now = Some(NowPlaying {
                        title: t.title.clone(),
                        artists: t.artists.clone(),
                        album: t.album.clone(),
                        image_url: t.image_url.clone(),
                        duration_ms: t.duration_ms,
                        progress_ms: p.progress_ms,
                        is_playing: p.is_playing,
                        fetched_at_ms: p.fetched_at_ms,
                        requester,
                    });
                } else {
                    data.status = "idle";
                }
            }
            PlaybackView::Idle { .. } => data.status = "idle",
            PlaybackView::Unknown => {}
        }
        data
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdatePrep {
    /// `None` = Kanalpunkte nicht aktiv; `Some(false)` = Pause auf Twitch nicht bestätigt.
    pub reward_paused: Option<bool>,
    pub queue_idle: bool,
    pub db_saved: bool,
}

pub(crate) fn block_to_rejection(b: &Block) -> Rejection {
    match b {
        Block::ManualPause => Rejection::Closed,
        Block::SourceDisabled => Rejection::SourceDisabled,
        Block::StreamEnded => Rejection::StreamEnded,
        Block::BudgetExhausted { .. } => Rejection::BudgetExhausted,
        Block::PlanUncertain { .. } => Rejection::PlanUncertain,
        Block::UpdatePause | Block::Reconciling => Rejection::UpdatePause,
        Block::Technical { detail } => Rejection::Technical { detail: detail.clone() },
    }
}

/// Beobachtet den wirksamen Annahmestatus (z. B. Zeitbudget läuft ab) und
/// synchronisiert Twitch sowie die UI bei Änderungen.
async fn acceptance_watcher(weak: Weak<Runtime>) {
    let mut iv = tokio::time::interval(Duration::from_secs(5));
    loop {
        iv.tick().await;
        let Some(rt) = weak.upgrade() else { return };
        let a = rt.acceptance();
        let prev = rt.last_acceptance.lock().unwrap().replace(a.clone());
        let Some(prev) = prev else { continue };
        if prev != a {
            if a.paused_by_plan && !prev.paused_by_plan {
                rt.activity.warn("plan.auto_paused", "Requests automatisch pausiert: Zeitbudget bis Streamende ausgeschöpft", json!({}));
            } else if !a.paused_by_plan && prev.paused_by_plan && a.any_open {
                rt.activity.info("plan.auto_resumed", "Zeitplanung erlaubt wieder neue Requests", json!({}));
            }
            rt.channel_points.kick();
            rt.bus.changed(Topic::Queue);
        }
    }
}

struct Control(Weak<Runtime>);

impl ControlHandler for Control {
    fn handle(&self, action: ControlAction) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
        let weak = self.0.clone();
        Box::pin(async move {
            let rt = weak.upgrade().ok_or("beendet")?;
            match action {
                ControlAction::Skip => rt.transport("next").await.map_err(|e| e.code().to_string()),
                ControlAction::OpenRequests => rt.set_requests_open(true).await,
                ControlAction::CloseRequests => rt.set_requests_open(false).await,
            }
        })
    }
}

/// Beobachtet Spotify-Zustände: Queue-Abgleich, Aktivitätsmeldungen bei Statuswechseln.
async fn observe_spotify(weak: Weak<Runtime>) {
    let Some(mut rx) = weak.upgrade().map(|rt| rt.spotify_state.clone()) else { return };
    let mut last_link = LinkState::Unknown;
    let mut last_seq = 0;
    let mut had_trouble = false;
    loop {
        if rx.changed().await.is_err() {
            return;
        }
        let st = rx.borrow_and_update().clone();
        let Some(rt) = weak.upgrade() else { return };
        rt.bus.changed(Topic::Spotify);
        let kind = |l: &LinkState| std::mem::discriminant(l);
        if kind(&st.link) != kind(&last_link) {
            match &st.link {
                LinkState::Online if had_trouble => {
                    had_trouble = false;
                    rt.activity.success("spotify.recovered", "Spotify-Verbindung wiederhergestellt", json!({}));
                }
                LinkState::Offline { .. } => {
                    had_trouble = true;
                    rt.activity.warn("spotify.offline", "Spotify nicht erreichbar – automatische Prüfung läuft, Anmeldung bleibt erhalten", json!({}));
                }
                LinkState::Degraded { .. } => had_trouble = true,
                LinkState::RateLimited { .. } => {
                    had_trouble = true;
                    rt.activity.warn("spotify.rate_limited", "Spotify drosselt Anfragen – ON AIR pausiert wie vorgegeben", json!({}));
                }
                LinkState::QuotaExhausted { .. } => {
                    had_trouble = true;
                    rt.activity.error("spotify.quota", "Spotify-API-Kontingent erschöpft – Abfragen ausgesetzt", json!({}));
                }
                LinkState::Blocked { code } => {
                    had_trouble = true;
                    rt.activity.error("spotify.blocked", "Spotify verweigert den Zugriff – Diagnose öffnen", json!({ "code": code }));
                }
                _ => {}
            }
            last_link = st.link.clone();
        }
        if st.seq != last_seq {
            last_seq = st.seq;
            rt.queue.on_spotify_state(&st).await;
        }
    }
}

/// Speist Overlay, Now-Playing-Datei und Polling-Bedarf aus einer Quelle.
async fn overlay_feeder(weak: Weak<Runtime>) {
    let Some(mut events) = weak.upgrade().map(|rt| rt.bus.subscribe()) else { return };
    let mut iv = tokio::time::interval(Duration::from_secs(30));
    let mut last_file = String::new();
    loop {
        tokio::select! {
            ev = events.recv() => match ev {
                Ok(AppEvent::Changed { .. }) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Ok(AppEvent::Activity(_)) => continue,
                Err(_) => return,
            },
            _ = iv.tick() => {}
        }
        let Some(rt) = weak.upgrade() else { return };
        let data = rt.build_overlay_data();
        rt.overlay_tx.send_if_modified(|d| {
            if *d != data {
                *d = data.clone();
                true
            } else {
                false
            }
        });
        rt.update_poll_config();
        let np = cfg::read(&rt.settings).nowplaying_file.clone();
        if np.enabled && !np.path.trim().is_empty() {
            let text = match &data.now {
                Some(n) if data.status == "live" => crate::nowplaying_file::render(&np.template, &n.title, &n.artists.join(", "), n.requester.as_deref()),
                _ => String::new(),
            };
            if text != last_file {
                let path = PathBuf::from(np.path.trim());
                match tokio::task::spawn_blocking(move || crate::nowplaying_file::write_atomic(&path, &text).map(|_| text)).await {
                    Ok(Ok(t)) => last_file = t,
                    Ok(Err(e)) => tracing::warn!(target: "overlay", error = %e, "Now-Playing-Datei nicht schreibbar"),
                    Err(_) => {}
                }
            }
        }
    }
}
