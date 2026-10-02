//! Integrierter Updater auf Basis des offiziellen Tauri-Updater-Plugins.
//!
//! - Öffentlicher Schlüssel und Endpunkt werden beim Release-Build eingebettet
//!   (`ONAIR_UPDATER_PUBKEY`, optional `ONAIR_UPDATER_ENDPOINT`). Ohne Schlüssel ist der
//!   Updater als „nicht eingerichtet“ gekennzeichnet – kein dekorativer Button.
//! - Das Plugin prüft die Signatur beim Download; installiert wird nur ein vollständig
//!   geladenes, geprüftes Paket.
//! - Automatisch (Standard, abschaltbar): im Hintergrund prüfen, laden und in einem
//!   sicheren Moment installieren – nie während eines erkannten Livestreams, einer
//!   Streamplanung oder einer ungeklärten Übergabe, immer mit 30-s-Countdown, der sich mit
//!   „Nicht jetzt“ für diese Sitzung abbrechen lässt (Regeln: `update_state::decide_auto_install`).
//! - Vor jeder Installation wird die Annahme pausiert, die Kanalpunkte-Belohnung pausiert
//!   und der Zustand gesichert.

use onair_core::runtime::{Runtime, UpdatePrep};
use onair_core::settings as cfg;
use onair_core::update_direct::{self, DirectRelease};
use onair_core::update_state::{
    classify_error, decide_auto_install, AutoDecision, AutoInputs, AutoWait, Refused, Stage, UpdateState, AUTO_COUNTDOWN_MS, CHECK_INTERVAL_MS,
    RETRY_INTERVAL_MS,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Stabiler Update-Kanal: eine feste GitHub-Release-Adresse, die nur von
/// Stable-Releases aktualisiert wird (siehe `.github/workflows/on-air-release.yml`).
pub const DEFAULT_ENDPOINT: &str = "https://github.com/prodbycooooooollin-byte/Homeassitent/releases/download/on-air-stable/latest.json";

pub fn pubkey() -> Option<&'static str> {
    option_env!("ONAIR_UPDATER_PUBKEY").map(str::trim).filter(|k| !k.is_empty())
}

pub fn endpoint() -> &'static str {
    option_env!("ONAIR_UPDATER_ENDPOINT").filter(|e| !e.trim().is_empty()).unwrap_or(DEFAULT_ENDPOINT)
}

/// Wie Updates geprüft werden.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Tauri-Updater mit eigener Signatur (öffentlicher Schlüssel eingebettet).
    Signature,
    /// Ohne eigenen Schlüssel: HTTPS von den GitHub-Releases + Herkunft + SHA-256
    /// (siehe `onair_core::update_direct`). Funktioniert ohne jede Einrichtung.
    Checksum,
    /// Entwicklungsbuild: keine Updates.
    Off,
}

pub fn mode() -> Mode {
    if pubkey().is_some() {
        Mode::Signature
    } else if !cfg!(debug_assertions) || option_env!("ONAIR_UPDATER_ENDPOINT").is_some() {
        Mode::Checksum
    } else {
        Mode::Off
    }
}

/// Gefundenes Update: (Version, Notizen, Datum).
type Found = (String, Option<String>, Option<String>);

pub struct UpdateManager {
    state: Mutex<UpdateState>,
    update: Mutex<Option<Update>>,
    /// Direkter Pfad (ohne eigenen Schlüssel): gefundenes Release.
    direct: Mutex<Option<DirectRelease>>,
    bytes: Mutex<Option<Vec<u8>>>,
    last_check_ms: Mutex<Option<i64>>,
    auto: Mutex<AutoStatus>,
    /// „Nicht jetzt“: automatische Installation für diese App-Sitzung ausgesetzt.
    postponed: AtomicBool,
}

/// Anzeige der Automatik: worauf gewartet wird bzw. wann installiert wird.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct AutoStatus {
    pub enabled: bool,
    pub waiting: Option<AutoWait>,
    /// Gesetzt, solange der Countdown vor einer automatischen Installation läuft.
    pub install_at_ms: Option<i64>,
    pub postponed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub state: UpdateState,
    pub last_check_ms: Option<i64>,
    pub endpoint: String,
    pub configured: bool,
    pub mode: Mode,
    pub auto: AutoStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct Preflight {
    /// `None` = Live-Status unbekannt (dann entscheidet der Nutzer ohne Hinweis).
    pub live: Option<bool>,
    pub pending_requests: usize,
    pub open_redemptions: usize,
    pub plan_active: bool,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

impl UpdateManager {
    pub fn new() -> Arc<Self> {
        let initial = if mode() == Mode::Off { UpdateState::NotConfigured } else { UpdateState::Unchecked };
        Arc::new(Self {
            state: Mutex::new(initial),
            update: Mutex::new(None),
            direct: Mutex::new(None),
            bytes: Mutex::new(None),
            last_check_ms: Mutex::new(None),
            auto: Mutex::new(AutoStatus::default()),
            postponed: AtomicBool::new(false),
        })
    }

    pub fn info(&self, app: &AppHandle) -> UpdateInfo {
        UpdateInfo {
            current_version: app.package_info().version.to_string(),
            state: self.state.lock().unwrap().clone(),
            last_check_ms: *self.last_check_ms.lock().unwrap(),
            endpoint: endpoint().to_string(),
            configured: mode() != Mode::Off,
            mode: mode(),
            auto: self.auto.lock().unwrap().clone(),
        }
    }

    fn set_auto(&self, app: &AppHandle, a: AutoStatus) {
        let changed = {
            let mut cur = self.auto.lock().unwrap();
            let changed = *cur != a;
            *cur = a;
            changed
        };
        if changed {
            let _ = app.emit("onair://update", self.info(app));
        }
    }

    /// „Nicht jetzt“: laufenden Countdown abbrechen, bis zum nächsten App-Start nicht
    /// automatisch installieren. Manuelle Installation bleibt jederzeit möglich.
    pub fn postpone(&self, app: &AppHandle) {
        self.postponed.store(true, Ordering::SeqCst);
        let mut a = self.auto.lock().unwrap().clone();
        a.install_at_ms = None;
        a.postponed = true;
        a.waiting = Some(AutoWait::Postponed);
        self.set_auto(app, a);
    }

    /// Hintergrund-Automatik: prüfen → laden → im sicheren Moment mit Countdown installieren.
    /// Läuft für die gesamte App-Lebensdauer; ohne eingebetteten Schlüssel sofort beendet.
    pub async fn run_auto(self: Arc<Self>, app: AppHandle, rt: Arc<Runtime>) {
        if mode() == Mode::Off {
            return;
        }
        let started = now_ms();
        tokio::time::sleep(Duration::from_secs(20)).await;
        let mut next_check = 0i64;
        let mut next_download = 0i64;
        let mut last_playing: Option<i64> = None;
        // (Zeitpunkt der letzten Abfrage, Ergebnis); `None` = noch nie bzw. neu abfragen.
        let mut live_cache: (Option<i64>, Option<bool>) = (None, None);
        loop {
            let now = now_ms();
            let s = cfg::read(&rt.settings).updates.clone();
            let (plan_active, handoff_busy, playing) = rt.update_safety();
            if playing {
                last_playing = Some(now);
            }
            let state = self.state.lock().unwrap().clone();

            // 1. Prüfen (Automatik schließt die Hintergrundprüfung ein).
            let may_check = matches!(state, UpdateState::Unchecked | UpdateState::UpToDate { .. } | UpdateState::Failed { stage: Stage::Check, .. });
            if (s.check_on_start || s.auto_install) && may_check && now >= next_check {
                let _ = self.check(&app).await;
                let failed = matches!(*self.state.lock().unwrap(), UpdateState::Failed { .. });
                next_check = now_ms() + if failed { RETRY_INTERVAL_MS } else { CHECK_INTERVAL_MS };
                continue;
            }

            // 2. Laden (nur mit Automatik; höchstens ein Download, Wiederholung nach Pause).
            let may_download = matches!(state, UpdateState::Available { .. } | UpdateState::Failed { stage: Stage::Download, version: Some(_), .. });
            if s.auto_install && may_download && now >= next_download {
                if self.download(&app).await.is_err() {
                    next_download = now_ms() + RETRY_INTERVAL_MS;
                }
                continue;
            }

            // 3. Installieren – nur aus „bereit“ und nur im sicheren Moment.
            let mut auto = AutoStatus { enabled: s.auto_install, postponed: self.postponed.load(Ordering::SeqCst), ..Default::default() };
            if s.auto_install && matches!(state, UpdateState::Ready { .. }) {
                let mut inputs = AutoInputs {
                    auto_enabled: true,
                    postponed: auto.postponed,
                    live: None,
                    plan_active,
                    handoff_busy,
                    spotify_playing: playing,
                    last_playing_ms: last_playing,
                    app_started_ms: started,
                    now_ms: now,
                };
                let mut decision = decide_auto_install(&inputs);
                if decision == AutoDecision::Install {
                    // Live-Status nur abfragen, wenn alles andere passt (höchstens alle 2 min).
                    if live_cache.0.is_none_or(|t| now - t > 120_000) {
                        live_cache = (Some(now), rt.twitch_is_live().await);
                    }
                    inputs.live = live_cache.1;
                    decision = decide_auto_install(&inputs);
                }
                let prev_at = self.auto.lock().unwrap().install_at_ms;
                match decision {
                    AutoDecision::Install => {
                        let at = prev_at.unwrap_or(now + AUTO_COUNTDOWN_MS);
                        auto.install_at_ms = Some(at);
                        self.set_auto(&app, auto.clone());
                        if now >= at {
                            tracing::info!(target: "updater", "Automatische Installation");
                            if self.install(&app, rt.clone()).await.is_err() {
                                // Kein Dauerversuch: bis zum nächsten Start nur noch manuell.
                                self.postponed.store(true, Ordering::SeqCst);
                                auto.install_at_ms = None;
                                auto.postponed = true;
                                auto.waiting = Some(AutoWait::Postponed);
                                self.set_auto(&app, auto);
                            }
                        }
                    }
                    AutoDecision::Wait(w) => {
                        if w == AutoWait::Live {
                            live_cache.0 = None; // bei Streamende zügig neu prüfen
                        }
                        auto.waiting = Some(w);
                        self.set_auto(&app, auto);
                    }
                }
            } else {
                self.set_auto(&app, auto);
            }
            let countdown = self.auto.lock().unwrap().install_at_ms.is_some();
            tokio::time::sleep(Duration::from_secs(if countdown { 1 } else { 15 })).await;
        }
    }

    fn set(&self, app: &AppHandle, s: UpdateState) {
        *self.state.lock().unwrap() = s;
        let _ = app.emit("onair://update", self.info(app));
    }

    /// Atomar: Zustand prüfen und in einen Arbeitszustand wechseln (keine Parallelvorgänge).
    fn begin(&self, app: &AppHandle, check: impl FnOnce(&UpdateState) -> Result<String, Refused>, next: impl FnOnce(String) -> UpdateState) -> Result<String, Refused> {
        let mut st = self.state.lock().unwrap();
        let v = check(&st)?;
        *st = next(v.clone());
        drop(st);
        let _ = app.emit("onair://update", self.info(app));
        Ok(v)
    }

    pub async fn check(&self, app: &AppHandle) -> Result<UpdateInfo, String> {
        self.begin(app, |s| s.can_check().map(|_| String::new()), |_| UpdateState::Checking).map_err(|e| e.to_string())?;
        let result: Result<Option<Found>, String> = match mode() {
            Mode::Signature => async {
                let key = pubkey().ok_or("kein Schlüssel")?;
                let url = endpoint().parse().map_err(|e| format!("{e}"))?;
                let updater = app.updater_builder().pubkey(key).endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
                let found = updater.check().await.map_err(|e| e.to_string())?;
                Ok(found.map(|u| {
                    let v = (u.version.clone(), u.body.clone(), u.date.map(|d| d.to_string()));
                    *self.update.lock().unwrap() = Some(u);
                    v
                }))
            }
            .await,
            Mode::Checksum => {
                let current = app.package_info().version.to_string();
                update_direct::fetch_manifest(&http_client(), endpoint(), &current).await.map(|found| {
                    found.map(|r| {
                        let v = (r.version.clone(), r.notes.clone(), r.date.clone());
                        *self.direct.lock().unwrap() = Some(r);
                        v
                    })
                })
            }
            Mode::Off => Err("nicht eingerichtet".into()),
        };
        *self.last_check_ms.lock().unwrap() = Some(now_ms());
        match result {
            Ok(Some((version, notes, date))) => {
                *self.bytes.lock().unwrap() = None;
                self.set(app, UpdateState::Available { version, notes, date });
            }
            Ok(None) => self.set(app, UpdateState::UpToDate { checked_at_ms: now_ms() }),
            Err(e) => {
                tracing::warn!(target: "updater", error = %e, "Update-Prüfung fehlgeschlagen");
                self.set(app, UpdateState::Failed { stage: Stage::Check, code: classify_error(Stage::Check, &e), message: e, version: None });
            }
        }
        Ok(self.info(app))
    }

    fn notes(&self) -> Option<String> {
        match mode() {
            Mode::Signature => self.update.lock().unwrap().as_ref().and_then(|u| u.body.clone()),
            _ => self.direct.lock().unwrap().as_ref().and_then(|r| r.notes.clone()),
        }
    }

    /// Lädt und prüft das Paket im Hintergrund; installiert nicht.
    pub async fn download(self: &Arc<Self>, app: &AppHandle) -> Result<(), String> {
        let version = self
            .begin(app, |s| s.can_download(), |v| UpdateState::Downloading { version: v, received: 0, total: None })
            .map_err(|e| e.to_string())?;
        let me = self.clone();
        let app2 = app.clone();
        let v2 = version.clone();
        let mut last_emit = std::time::Instant::now();
        let mut on_progress = move |received: u64, total: Option<u64>| {
            if last_emit.elapsed().as_millis() > 150 {
                last_emit = std::time::Instant::now();
                me.set(&app2, UpdateState::Downloading { version: v2.clone(), received, total });
            }
        };
        let res: Result<Vec<u8>, String> = match mode() {
            Mode::Signature => {
                let Some(update) = self.update.lock().unwrap().clone() else {
                    return self.fail_missing(app);
                };
                let mut received: u64 = 0;
                // Signatur wird vom Plugin beim Download geprüft.
                update
                    .download(
                        move |chunk, total| {
                            received += chunk as u64;
                            on_progress(received, total);
                        },
                        || {},
                    )
                    .await
                    .map_err(|e| e.to_string())
            }
            _ => {
                let Some(rel) = self.direct.lock().unwrap().clone() else {
                    return self.fail_missing(app);
                };
                // Größe, SHA-256 und Herkunft werden vor der Rückgabe geprüft.
                update_direct::download(&http_client(), &rel, on_progress).await
            }
        };
        match res {
            Ok(bytes) => {
                *self.bytes.lock().unwrap() = Some(bytes);
                self.set(app, UpdateState::Ready { version, notes: self.notes() });
                Ok(())
            }
            Err(msg) => {
                *self.bytes.lock().unwrap() = None;
                self.set(app, UpdateState::Failed { stage: Stage::Download, code: classify_error(Stage::Download, &msg), message: msg.clone(), version: Some(version) });
                Err(msg)
            }
        }
    }

    fn fail_missing(&self, app: &AppHandle) -> Result<(), String> {
        self.set(app, UpdateState::Failed { stage: Stage::Download, code: "missing_artifact".into(), message: "Keine Update-Information".into(), version: None });
        Err("Keine Update-Information".into())
    }

    pub async fn preflight(&self, rt: &Runtime) -> Preflight {
        let snap = rt.snapshot().await;
        Preflight {
            live: rt.twitch_is_live().await,
            pending_requests: snap.queue.iter().filter(|r| r.status.is_pending()).count(),
            open_redemptions: snap.channel_points.open,
            plan_active: snap.plan.active,
        }
    }

    /// Bewusste Installation: Zustand sichern, Annahme pausieren, dann Installer starten.
    /// Das Plugin beendet die App; der Installer startet sie danach neu.
    pub async fn install(&self, app: &AppHandle, rt: Arc<Runtime>) -> Result<UpdatePrep, String> {
        let version = self.begin(app, |s| s.can_install(), |v| UpdateState::Installing { version: v }).map_err(|e| e.to_string())?;
        let Some(bytes) = self.bytes.lock().unwrap().clone() else {
            self.set(app, UpdateState::Failed { stage: Stage::Install, code: "not_ready".into(), message: "Paket fehlt".into(), version: Some(version) });
            return Err("Paket fehlt".into());
        };
        let update = self.update.lock().unwrap().clone();
        // Worker laufen weiter, falls die Installation scheitert; der Zustand ist gesichert
        // (Transaktionen + WAL-Checkpoint), die Annahme pausiert.
        let prep = rt.prepare_for_update().await;
        tracing::info!(target: "updater", ?prep, version = %version, "Update wird installiert");
        crate::QUITTING.store(true, std::sync::atomic::Ordering::SeqCst);
        let result = match (mode(), update) {
            // Unter Windows startet `install` den Installer und beendet den Prozess.
            (Mode::Signature, Some(update)) => update.install(bytes).map_err(|e| e.to_string()),
            (Mode::Signature, None) => Err("Paket fehlt".into()),
            _ => launch_installer(&version, &bytes),
        };
        match result {
            Ok(()) => {
                // Der Installer ersetzt die Dateien, sobald ON AIR beendet ist, und startet es neu.
                app.exit(0);
                Ok(prep)
            }
            Err(msg) => {
                // Installation gescheitert: App läuft weiter, Pause aufheben.
                crate::QUITTING.store(false, std::sync::atomic::Ordering::SeqCst);
                rt.cancel_update_pause();
                self.set(app, UpdateState::Failed { stage: Stage::Install, code: classify_error(Stage::Install, &msg), message: msg.clone(), version: Some(version) });
                Err(msg)
            }
        }
    }

    /// „Später“: nichts installieren, keinen Timer starten.
    pub fn later(&self, app: &AppHandle) {
        let s = self.state.lock().unwrap().clone();
        if let UpdateState::Failed { .. } = s {
            let next = match self.update.lock().unwrap().as_ref() {
                Some(u) if self.bytes.lock().unwrap().is_some() => UpdateState::Ready { version: u.version.clone(), notes: u.body.clone() },
                Some(u) => UpdateState::Available { version: u.version.clone(), notes: u.body.clone(), date: None },
                None => UpdateState::Unchecked,
            };
            self.set(app, next);
        }
    }
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("ON-AIR/", env!("CARGO_PKG_VERSION"), " (updater)"))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default()
}

/// Direkter Pfad: geprüftes Paket als Datei ablegen und den NSIS-Installer passiv starten –
/// dieselben Argumente wie der Tauri-Updater (`/P /UPDATE /R`: passiv, Update, danach neu starten).
fn launch_installer(version: &str, bytes: &[u8]) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("install_failed: automatische Installation gibt es nur unter Windows".into());
    }
    let safe: String = version.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-').collect();
    let dir = std::env::temp_dir().join("ON-AIR-Update");
    std::fs::create_dir_all(&dir).map_err(|e| format!("install_failed: {e}"))?;
    let path = dir.join(format!("ON-AIR_{safe}_x64-setup.exe"));
    std::fs::write(&path, bytes).map_err(|e| format!("install_failed: {e}"))?;
    std::process::Command::new(&path).args(["/P", "/UPDATE", "/R"]).spawn().map_err(|e| format!("install_failed: {e}"))?;
    Ok(())
}
