//! Kanalpunkte: von ON AIR verwaltete Belohnung und Abwicklung der Einlösungen.
//!
//! Grundsätze
//! - Gewünschter Zustand (aus Einstellungen und Annahme-Gate) und bestätigter
//!   Twitch-Zustand werden getrennt geführt; die UI zeigt beide.
//! - Die Abwicklung einer Einlösung (FULFILLED/CANCELED) wird aus dem dauerhaft
//!   gespeicherten Request-Zustand abgeleitet. Lokales Speichern und Twitch-Aufruf sind
//!   keine gemeinsame Transaktion – nach einer Unterbrechung wird daher einfach erneut
//!   abgeleitet und abgeglichen (idempotent: bereits abgewickelte Einlösungen werden per
//!   Abfrage bestätigt, nicht doppelt gebucht).
//! - Erfüllt wird erst nach beobachtetem Wiedergabebeginn; storniert (= Punkte erstattet)
//!   bei Ablehnung. „Erstattet“ zeigt die UI erst nach bestätigter Twitch-Antwort.
//! - Nach dem Start bleibt die Belohnung pausiert, bis offene Einlösungen abgeglichen sind.

use super::helix::{Helix, RedemptionInfo, RedemptionUpdate, RewardInfo};
use super::service::TwitchState;
use crate::activity::ActivityLog;
use crate::auth::AuthStatus;
use crate::backoff::Backoff;
use crate::clock::SharedClock;
use crate::error::{ApiError, ErrorInfo};
use crate::events::{EventBus, Topic};
use crate::queue::service::QueueService;
use crate::queue::{RedemptionStatus, RequestStatus, Requester, SongRequest};
use crate::settings::{self as cfg, ChannelPointsSettings, Role, SharedSettings};
use crate::storage::Db;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::{mpsc, watch, Notify};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct RewardState {
    pub reward_id: Option<String>,
    /// Zuletzt von Twitch bestätigter Zustand.
    pub confirmed_enabled: Option<bool>,
    pub confirmed_paused: Option<bool>,
    /// Zuletzt erfolgreich übertragene Konfiguration (Titel, Kosten …) als JSON.
    pub applied_config: Option<String>,
    pub confirmed_at_ms: Option<i64>,
}

impl RewardState {
    pub const KEY: &'static str = "reward.v1";
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChannelPointsStatus {
    pub configured: bool,
    pub scope_ok: bool,
    pub reward_id: Option<String>,
    pub desired_enabled: bool,
    pub desired_paused: bool,
    pub confirmed_enabled: Option<bool>,
    pub confirmed_paused: Option<bool>,
    pub in_sync: bool,
    pub last_error: Option<ErrorInfo>,
    /// Offene Einlösungen nach dem Start abgeglichen.
    pub reconciled: bool,
    /// Einlösungen, deren Abwicklung noch aussteht bzw. eine Entscheidung braucht.
    pub open: usize,
    pub needs_review: usize,
}

/// Technischer Sperrgrund für das Annahme-Gate (z. B. fehlende Berechtigung).
pub fn technical_reason(st: &ChannelPointsStatus) -> Option<String> {
    if !st.configured {
        return None;
    }
    if !st.scope_ok {
        return Some("missing_scope".into());
    }
    match &st.last_error {
        Some(e) if st.reward_id.is_none() => Some(e.code.clone()),
        _ if st.reward_id.is_none() => Some("reward_missing".into()),
        _ => None,
    }
}

pub struct ChannelPointsDeps {
    pub helix: Helix,
    pub queue: Arc<QueueService>,
    pub settings: SharedSettings,
    pub twitch_state: watch::Receiver<TwitchState>,
    pub activity: ActivityLog,
    pub bus: EventBus,
    pub clock: SharedClock,
    pub db: Db,
}

pub struct ChannelPointsService {
    d: ChannelPointsDeps,
    state: Mutex<RewardState>,
    last_error: Mutex<Option<ErrorInfo>>,
    reconciled: AtomicBool,
    kick: Notify,
    reward_tx: watch::Sender<Option<String>>,
    status_tx: watch::Sender<ChannelPointsStatus>,
    /// Soll die Belohnung pausiert sein? (vom Annahme-Gate der Runtime)
    desired_paused: OnceLock<Arc<dyn Fn() -> bool + Send + Sync>>,
    sync_lock: tokio::sync::Mutex<()>,
}

fn reward_body(c: &ChannelPointsSettings, enabled: bool, paused: bool) -> serde_json::Value {
    json!({
        "title": c.title,
        "cost": c.cost,
        "prompt": c.prompt,
        "is_enabled": enabled,
        "is_paused": paused,
        "is_user_input_required": true,
        "should_redemptions_skip_request_queue": false,
        "is_global_cooldown_enabled": c.global_cooldown_s > 0,
        "global_cooldown_seconds": c.global_cooldown_s.max(1),
        "is_max_per_stream_enabled": c.max_per_stream > 0,
        "max_per_stream": c.max_per_stream.max(1),
        "is_max_per_user_per_stream_enabled": c.max_per_user_per_stream > 0,
        "max_per_user_per_stream": c.max_per_user_per_stream.max(1),
    })
}

fn config_key(c: &ChannelPointsSettings) -> String {
    serde_json::to_string(&(c.title.as_str(), c.cost, c.prompt.as_str(), c.global_cooldown_s, c.max_per_stream, c.max_per_user_per_stream)).unwrap_or_default()
}

/// Gewünschte Abwicklung aus dem Request-Zustand.
pub fn derive_target(r: &SongRequest) -> Option<RedemptionStatus> {
    let red = r.redemption.as_ref()?;
    if let Some(t) = red.target {
        return Some(t);
    }
    match r.status {
        RequestStatus::Playing => Some(RedemptionStatus::Fulfilled),
        RequestStatus::Completed if r.observed_at.is_some() => Some(RedemptionStatus::Fulfilled),
        // Wiedergabe nie beobachtet oder manuell abgeschlossen → Entscheidung nötig.
        RequestStatus::Completed => Some(RedemptionStatus::Review),
        RequestStatus::Rejected | RequestStatus::Failed => Some(RedemptionStatus::Canceled),
        _ => None,
    }
}

impl ChannelPointsService {
    /// `reward_tx`: meldet dem Twitch-Dienst, welche Belohnung abonniert werden soll.
    pub fn new(d: ChannelPointsDeps, reward_tx: watch::Sender<Option<String>>) -> (Arc<Self>, watch::Receiver<ChannelPointsStatus>) {
        let state: RewardState = d.db.get_setting(RewardState::KEY).and_then(|r| serde_json::from_str(&r).ok()).unwrap_or_default();
        let configured = cfg::read(&d.settings).channel_points.enabled;
        let (status_tx, status_rx) = watch::channel(ChannelPointsStatus {
            configured,
            scope_ok: false,
            reward_id: state.reward_id.clone(),
            desired_enabled: configured,
            desired_paused: true,
            confirmed_enabled: state.confirmed_enabled,
            confirmed_paused: state.confirmed_paused,
            in_sync: false,
            last_error: None,
            reconciled: false,
            open: 0,
            needs_review: 0,
        });
        let svc = Arc::new(Self {
            d,
            state: Mutex::new(state),
            last_error: Mutex::new(None),
            reconciled: AtomicBool::new(false),
            kick: Notify::new(),
            reward_tx,
            status_tx,
            desired_paused: OnceLock::new(),
            sync_lock: tokio::sync::Mutex::new(()),
        });
        (svc, status_rx)
    }

    pub fn set_desired_paused(&self, f: Arc<dyn Fn() -> bool + Send + Sync>) {
        let _ = self.desired_paused.set(f);
    }

    pub fn kick(&self) {
        self.kick.notify_one();
    }

    pub fn is_reconciled(&self) -> bool {
        self.reconciled.load(Ordering::SeqCst)
    }

    pub fn status(&self) -> ChannelPointsStatus {
        self.status_tx.borrow().clone()
    }

    fn now(&self) -> i64 {
        self.d.clock.now_ms()
    }

    fn save_state(&self) {
        let st = self.state.lock().unwrap().clone();
        if let Ok(raw) = serde_json::to_string(&st) {
            let _ = self.d.db.set_setting(RewardState::KEY, &raw);
        }
    }

    fn identity(&self) -> Option<(String, bool)> {
        let tw = self.d.twitch_state.borrow();
        if !matches!(tw.auth, AuthStatus::SignedIn { .. }) {
            return None;
        }
        tw.identity
            .as_ref()
            .map(|i| (i.user_id.clone(), i.scopes.iter().any(|s| s == super::CHANNEL_POINTS_SCOPE)))
    }

    fn desired(&self) -> (bool, bool, ChannelPointsSettings) {
        let c = cfg::read(&self.d.settings).channel_points.clone();
        let paused = self.desired_paused.get().map(|f| f()).unwrap_or(true) || !self.is_reconciled();
        (c.enabled, c.enabled && paused, c)
    }

    fn set_error(&self, e: Option<(&str, String)>) {
        *self.last_error.lock().unwrap() = e.map(|(code, details)| ErrorInfo { code: code.into(), details, at_ms: self.now() });
    }

    /// Aktueller technischer Sperrgrund, frisch berechnet (nicht aus dem letzten Snapshot).
    pub fn technical_now(&self) -> Option<String> {
        technical_reason(&self.compute_status())
    }

    fn compute_status(&self) -> ChannelPointsStatus {
        let (enabled, paused, _) = self.desired();
        let st = self.state.lock().unwrap().clone();
        let scope_ok = self.identity().map(|(_, s)| s).unwrap_or(false);
        let open = self.d.queue.store.open_redemptions();
        let needs_review = open
            .iter()
            .filter(|r| matches!(r.redemption.as_ref().map(|x| x.status), Some(RedemptionStatus::Review | RedemptionStatus::Conflict)))
            .count();
        let in_sync = match st.reward_id {
            None => !enabled,
            Some(_) => st.confirmed_enabled == Some(enabled) && (!enabled || st.confirmed_paused == Some(paused)),
        };
        ChannelPointsStatus {
            configured: enabled,
            scope_ok,
            reward_id: st.reward_id.clone(),
            desired_enabled: enabled,
            desired_paused: paused,
            confirmed_enabled: st.confirmed_enabled,
            confirmed_paused: st.confirmed_paused,
            in_sync,
            last_error: self.last_error.lock().unwrap().clone(),
            reconciled: self.is_reconciled(),
            open: open.len(),
            needs_review,
        }
    }

    fn publish(&self) {
        let status = self.compute_status();
        let scope_ok = status.scope_ok;
        let st = self.state.lock().unwrap().clone();
        let changed = self.status_tx.send_if_modified(|s| {
            if *s != status {
                *s = status;
                true
            } else {
                false
            }
        });
        // Abo nur mit Berechtigung und bekannter Belohnung.
        let sub = if scope_ok { st.reward_id.clone() } else { None };
        self.reward_tx.send_if_modified(|r| {
            if *r != sub {
                *r = sub;
                true
            } else {
                false
            }
        });
        if changed {
            self.d.bus.changed(Topic::Twitch);
        }
    }

    /// Hauptschleife: Belohnung synchronisieren, Rückstände abgleichen, Einlösungen abwickeln.
    pub async fn run(self: Arc<Self>, mut redemptions: mpsc::UnboundedReceiver<(bool, RedemptionInfo)>) {
        let mut tw = self.d.twitch_state.clone();
        let mut backoff = Backoff::new(Duration::from_secs(5), Duration::from_secs(300));
        let mut next = Duration::from_millis(200);
        loop {
            tokio::select! {
                _ = tokio::time::sleep(next) => {}
                _ = self.kick.notified() => {}
                r = tw.changed() => { if r.is_err() { return; } }
                ev = redemptions.recv() => match ev {
                    None => return,
                    Some((update, e)) => {
                        if update { self.on_update(e).await } else { self.on_add(e).await }
                        next = Duration::from_millis(50);
                        continue;
                    }
                },
            }
            let ok = self.tick().await;
            self.publish();
            next = if ok {
                backoff.reset();
                Duration::from_secs(30)
            } else {
                backoff.next_delay()
            };
        }
    }

    /// Ein Durchgang. `false` bei einem Fehler, der eine spätere Wiederholung erfordert.
    pub async fn tick(&self) -> bool {
        let _g = self.sync_lock.lock().await;
        let Some((broadcaster, scope_ok)) = self.identity() else {
            return true;
        };
        let (enabled, _, _) = self.desired();
        let has_reward = self.state.lock().unwrap().reward_id.is_some();
        if !scope_ok {
            if enabled || has_reward {
                self.set_error(Some(("missing_scope", "Twitch-Berechtigung channel:manage:redemptions fehlt".into())));
            }
            return true;
        }
        let mut ok = self.sync_reward(&broadcaster).await;
        if ok && self.state.lock().unwrap().reward_id.is_some() && !self.is_reconciled() {
            ok = self.reconcile(&broadcaster).await;
            if ok {
                self.reconciled.store(true, Ordering::SeqCst);
                // Nach dem Abgleich darf die Belohnung wieder freigegeben werden.
                ok = self.sync_reward(&broadcaster).await;
            }
        }
        if !has_reward && !enabled {
            // Nie eingerichtet: nichts abzugleichen.
            self.reconciled.store(true, Ordering::SeqCst);
        }
        ok & self.settle(&broadcaster).await
    }

    async fn sync_reward(&self, broadcaster: &str) -> bool {
        for _ in 0..3 {
            let (enabled, paused, c) = self.desired();
            let st = self.state.lock().unwrap().clone();
            match st.reward_id.clone() {
                None if !enabled => return true,
                None => {
                    // Absturz zwischen Anlegen und Speichern: vorhandene eigene Belohnung übernehmen.
                    let existing = match self.d.helix.manageable_rewards(broadcaster).await {
                        Ok(list) => list.into_iter().find(|r| r.title.eq_ignore_ascii_case(&c.title)),
                        Err(e) => return self.fail(&e),
                    };
                    let info = match existing {
                        Some(r) => r,
                        None => match self.d.helix.create_reward(broadcaster, reward_body(&c, true, paused)).await {
                            Ok(r) => {
                                self.d.activity.success("channel_points.created", format!("Kanalpunkte-Belohnung „{}“ angelegt", r.title), json!({}));
                                r
                            }
                            Err(ApiError::BadRequest { message }) if message == "duplicate_title" => {
                                self.set_error(Some(("reward_title_taken", format!("Eine Belohnung „{}“ existiert bereits und wurde nicht von ON AIR angelegt.", c.title))));
                                return true;
                            }
                            Err(e) => return self.fail(&e),
                        },
                    };
                    self.confirm(&info, None);
                    self.set_error(None);
                    continue; // Konfiguration angleichen
                }
                Some(id) => {
                    let key = config_key(&c);
                    let in_sync = st.confirmed_enabled == Some(enabled)
                        && (!enabled || st.confirmed_paused == Some(paused))
                        && (!enabled || st.applied_config.as_deref() == Some(key.as_str()));
                    if in_sync {
                        return true;
                    }
                    // Beim Ausschalten nur deaktivieren, nicht löschen.
                    let body = if enabled { reward_body(&c, true, paused) } else { json!({ "is_enabled": false }) };
                    match self.d.helix.update_reward(broadcaster, &id, body).await {
                        Ok(Some(info)) => {
                            let was = (st.confirmed_enabled, st.confirmed_paused);
                            self.confirm(&info, if enabled { Some(key) } else { st.applied_config });
                            self.set_error(None);
                            if was != (Some(info.is_enabled), Some(info.is_paused)) {
                                let text = if !info.is_enabled {
                                    "Kanalpunkte-Belohnung auf Twitch deaktiviert"
                                } else if info.is_paused {
                                    "Kanalpunkte-Belohnung auf Twitch pausiert"
                                } else {
                                    "Kanalpunkte-Belohnung auf Twitch aktiv"
                                };
                                self.d.activity.info("channel_points.synced", text, json!({ "enabled": info.is_enabled, "paused": info.is_paused }));
                            }
                        }
                        Ok(None) => {
                            // Extern gelöscht: Verwaltung beenden, ggf. neu anlegen.
                            self.d.activity.warn("channel_points.reward_gone", "Die Kanalpunkte-Belohnung existiert auf Twitch nicht mehr", json!({}));
                            let mut s = self.state.lock().unwrap();
                            *s = RewardState::default();
                            drop(s);
                            self.save_state();
                        }
                        Err(e) => return self.fail(&e),
                    }
                }
            }
        }
        true
    }

    fn confirm(&self, info: &RewardInfo, applied: Option<String>) {
        let now = self.now();
        let mut s = self.state.lock().unwrap();
        s.reward_id = Some(info.id.clone());
        s.confirmed_enabled = Some(info.is_enabled);
        s.confirmed_paused = Some(info.is_paused);
        if applied.is_some() {
            s.applied_config = applied;
        }
        s.confirmed_at_ms = Some(now);
        drop(s);
        self.save_state();
    }

    fn fail(&self, e: &ApiError) -> bool {
        let code = match e {
            ApiError::Forbidden { reason: Some(r), .. } => r.clone(),
            _ => e.code().to_string(),
        };
        tracing::warn!(target: "channel_points", code, "Twitch-Synchronisation fehlgeschlagen");
        self.set_error(Some((&code, e.to_string())));
        false
    }

    /// Nach Start/Unterbrechung: verpasste Einlösungen übernehmen, extern geänderte Zustände übernehmen.
    async fn reconcile(&self, broadcaster: &str) -> bool {
        let Some(reward_id) = self.state.lock().unwrap().reward_id.clone() else { return true };
        let open = match self.d.helix.redemptions(broadcaster, &reward_id, Some("UNFULFILLED"), &[]).await {
            Ok(l) => l,
            Err(e) => return self.fail(&e),
        };
        let mut missed = 0;
        for r in &open {
            if self.d.queue.store.by_redemption(&r.id).is_none() {
                missed += 1;
                self.on_add(r.clone()).await;
            }
        }
        // Lokal offene Einlösungen, die Twitch nicht mehr als offen führt → Zustand erfragen.
        let local: Vec<SongRequest> = self
            .d
            .queue
            .store
            .open_redemptions()
            .into_iter()
            .filter(|r| r.redemption.as_ref().map(|x| x.reward_id == reward_id && x.status == RedemptionStatus::Unfulfilled).unwrap_or(false))
            .filter(|r| !open.iter().any(|o| Some(&o.id) == r.redemption.as_ref().map(|x| &x.redemption_id)))
            .collect();
        for chunk in local.chunks(50) {
            let ids: Vec<String> = chunk.iter().filter_map(|r| r.redemption.as_ref().map(|x| x.redemption_id.clone())).collect();
            match self.d.helix.redemptions(broadcaster, &reward_id, None, &ids).await {
                Ok(found) => {
                    for f in found {
                        self.apply_external(&f.id, &f.status);
                    }
                }
                Err(e) => return self.fail(&e),
            }
        }
        if missed > 0 {
            self.d.activity.info("channel_points.recovered", format!("{missed} verpasste Kanalpunkte-Einlösung(en) übernommen"), json!({ "count": missed }));
        }
        true
    }

    /// Abwicklung ableiten und bei Twitch durchführen.
    async fn settle(&self, broadcaster: &str) -> bool {
        let mut ok = true;
        for r in self.d.queue.store.open_redemptions() {
            let Some(red) = r.redemption.clone() else { continue };
            let Some(target) = derive_target(&r) else { continue };
            if red.status == RedemptionStatus::Conflict {
                continue;
            }
            if target == RedemptionStatus::Review {
                if red.status != RedemptionStatus::Review {
                    let _ = self.d.queue.store.set_redemption(&r.id, RedemptionStatus::Review, None, None, self.now());
                    self.d.activity.warn(
                        "channel_points.review",
                        format!("Kanalpunkte-Wunsch von {}: Wiedergabe nicht sicher zugeordnet – bitte prüfen", r.requester.name),
                        json!({ "id": r.id }),
                    );
                    self.d.bus.changed(Topic::Queue);
                }
                continue;
            }
            let status = if target == RedemptionStatus::Fulfilled { "FULFILLED" } else { "CANCELED" };
            match self.d.helix.update_redemption(broadcaster, &red.reward_id, &red.redemption_id, status).await {
                Ok(RedemptionUpdate::Updated(s)) => {
                    self.apply_external(&red.redemption_id, &s);
                    if target == RedemptionStatus::Canceled {
                        self.d.activity.info("channel_points.refunded", format!("Kanalpunkte an {} erstattet", r.requester.name), json!({ "user": r.requester.name }));
                    }
                }
                Ok(RedemptionUpdate::NotOpen) => {
                    // Schon abgewickelt (z. B. vor einem Absturz oder manuell): tatsächlichen Zustand erfragen.
                    match self.d.helix.redemptions(broadcaster, &red.reward_id, None, std::slice::from_ref(&red.redemption_id)).await {
                        Ok(found) => match found.first() {
                            Some(f) => self.apply_external(&f.id, &f.status),
                            None => {
                                let _ = self.d.queue.store.set_redemption(&r.id, RedemptionStatus::Conflict, red.target, Some("Einlösung auf Twitch nicht gefunden"), self.now());
                            }
                        },
                        Err(e) => ok &= self.fail(&e),
                    }
                }
                Err(e) => {
                    let _ = self.d.queue.store.set_redemption(&r.id, red.status, red.target, Some(&e.to_string()), self.now());
                    ok &= self.fail(&e);
                }
            }
            self.d.bus.changed(Topic::Queue);
        }
        ok
    }

    /// Übernimmt einen von Twitch gemeldeten/erfragten Status.
    fn apply_external(&self, redemption_id: &str, status: &str) {
        let Some(r) = self.d.queue.store.by_redemption(redemption_id) else { return };
        let Some(red) = r.redemption.clone() else { return };
        let now = self.now();
        let actual = match status {
            "FULFILLED" => RedemptionStatus::Fulfilled,
            "CANCELED" => RedemptionStatus::Canceled,
            _ => return,
        };
        let wanted = derive_target(&r);
        match actual {
            RedemptionStatus::Canceled if r.status.is_movable() || r.status == RequestStatus::Received => {
                // Extern storniert, Song noch lokal → aus der Warteschlange nehmen.
                let _ = self.d.queue.reject_manual(&r.id, "canceled_on_twitch");
                let _ = self.d.queue.store.set_redemption(&r.id, RedemptionStatus::Canceled, None, None, now);
            }
            RedemptionStatus::Canceled if wanted != Some(RedemptionStatus::Canceled) && !r.status.is_final() => {
                let _ = self.d.queue.store.set_redemption(&r.id, RedemptionStatus::Conflict, red.target, Some("Auf Twitch storniert, Song aber schon an Spotify übergeben"), now);
                self.d.activity.warn("channel_points.conflict", format!("Einlösung von {} wurde auf Twitch storniert, der Song ist aber schon übergeben", r.requester.name), json!({ "id": r.id }));
            }
            _ => {
                let _ = self.d.queue.store.set_redemption(&r.id, actual, None, None, now);
            }
        }
        self.d.bus.changed(Topic::Queue);
    }

    pub async fn on_add(&self, e: RedemptionInfo) {
        let ours = self.state.lock().unwrap().reward_id.clone();
        if ours.as_deref() != Some(e.reward_id.as_str()) {
            return;
        }
        let requester = Requester { id: format!("twitch:{}", e.user_id), name: e.user_name.clone(), role: Role::Everyone };
        let outcome = self.d.queue.submit_redemption(&e.user_input, requester, &e.reward_id, &e.id).await;
        if !matches!(outcome, crate::queue::SubmitOutcome::Duplicate) {
            self.d.activity.info("channel_points.redeemed", format!("Kanalpunkte-Wunsch von {}", e.user_name), json!({ "user": e.user_name }));
        }
        self.publish();
        self.kick();
    }

    pub async fn on_update(&self, e: RedemptionInfo) {
        self.apply_external(&e.id, &e.status);
        self.publish();
    }

    /// Entscheidung bei Prüfung/Konflikt: erfüllen oder erstatten.
    pub fn decide(&self, request_id: &str, fulfill: bool) -> Result<(), String> {
        let r = self.d.queue.store.get(request_id).ok_or("Request nicht gefunden")?;
        let red = r.redemption.ok_or("Kein Kanalpunkte-Request")?;
        if matches!(red.status, RedemptionStatus::Fulfilled | RedemptionStatus::Canceled) {
            return Err("Bereits abgewickelt".into());
        }
        let target = if fulfill { RedemptionStatus::Fulfilled } else { RedemptionStatus::Canceled };
        self.d.queue.store.set_redemption(request_id, RedemptionStatus::Unfulfilled, Some(target), None, self.now())?;
        self.d.bus.changed(Topic::Queue);
        self.kick();
        Ok(())
    }

    /// Vor Update/Beenden: Belohnung pausieren. Liefert, ob Twitch dies bestätigt hat.
    pub async fn pause_before_exit(&self, timeout: Duration) -> bool {
        let fut = async {
            let Some((b, true)) = self.identity() else { return !cfg::read(&self.d.settings).channel_points.enabled };
            let _ = self.sync_reward(&b).await;
            let st = self.state.lock().unwrap().clone();
            st.reward_id.is_none() || st.confirmed_paused == Some(true) || st.confirmed_enabled == Some(false)
        };
        tokio::time::timeout(timeout, fut).await.unwrap_or(false)
    }
}
