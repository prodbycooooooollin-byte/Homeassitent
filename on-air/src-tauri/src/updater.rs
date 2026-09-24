//! Integrierter Updater auf Basis des offiziellen Tauri-Updater-Plugins.
//!
//! - Öffentlicher Schlüssel und Endpunkt werden beim Release-Build eingebettet
//!   (`ONAIR_UPDATER_PUBKEY`, optional `ONAIR_UPDATER_ENDPOINT`). Ohne Schlüssel ist der
//!   Updater als „nicht eingerichtet“ gekennzeichnet – kein dekorativer Button.
//! - Das Plugin prüft die Signatur beim Download; installiert wird nur ein vollständig
//!   geladenes, geprüftes Paket.
//! - Installation nur auf ausdrücklichen Klick. Vorher wird die Annahme pausiert, die
//!   Kanalpunkte-Belohnung pausiert und der Zustand gesichert.

use onair_core::runtime::{Runtime, UpdatePrep};
use onair_core::update_state::{classify_error, Refused, Stage, UpdateState};
use serde::Serialize;
use std::sync::{Arc, Mutex};
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

pub struct UpdateManager {
    state: Mutex<UpdateState>,
    update: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
    last_check_ms: Mutex<Option<i64>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub state: UpdateState,
    pub last_check_ms: Option<i64>,
    pub endpoint: String,
    pub configured: bool,
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
        let initial = if pubkey().is_some() { UpdateState::Unchecked } else { UpdateState::NotConfigured };
        Arc::new(Self { state: Mutex::new(initial), update: Mutex::new(None), bytes: Mutex::new(None), last_check_ms: Mutex::new(None) })
    }

    pub fn info(&self, app: &AppHandle) -> UpdateInfo {
        UpdateInfo {
            current_version: app.package_info().version.to_string(),
            state: self.state.lock().unwrap().clone(),
            last_check_ms: *self.last_check_ms.lock().unwrap(),
            endpoint: endpoint().to_string(),
            configured: pubkey().is_some(),
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
        let result = async {
            let key = pubkey().ok_or("kein Schlüssel")?;
            let url = endpoint().parse().map_err(|e| format!("{e}"))?;
            let updater = app.updater_builder().pubkey(key).endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
            updater.check().await.map_err(|e| e.to_string())
        }
        .await;
        *self.last_check_ms.lock().unwrap() = Some(now_ms());
        match result {
            Ok(Some(u)) => {
                let s = UpdateState::Available { version: u.version.clone(), notes: u.body.clone(), date: u.date.map(|d| d.to_string()) };
                *self.update.lock().unwrap() = Some(u);
                *self.bytes.lock().unwrap() = None;
                self.set(app, s);
            }
            Ok(None) => self.set(app, UpdateState::UpToDate { checked_at_ms: now_ms() }),
            Err(e) => {
                tracing::warn!(target: "updater", error = %e, "Update-Prüfung fehlgeschlagen");
                self.set(app, UpdateState::Failed { stage: Stage::Check, code: classify_error(Stage::Check, &e), message: e, version: None });
            }
        }
        Ok(self.info(app))
    }

    /// Lädt und prüft das Paket im Hintergrund; installiert nicht.
    pub async fn download(self: &Arc<Self>, app: &AppHandle) -> Result<(), String> {
        let version = self
            .begin(app, |s| s.can_download(), |v| UpdateState::Downloading { version: v, received: 0, total: None })
            .map_err(|e| e.to_string())?;
        let Some(update) = self.update.lock().unwrap().clone() else {
            self.set(app, UpdateState::Failed { stage: Stage::Download, code: "missing_artifact".into(), message: "Keine Update-Information".into(), version: None });
            return Err("Keine Update-Information".into());
        };
        let me = self.clone();
        let app2 = app.clone();
        let v2 = version.clone();
        let mut received: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let res = update
            .download(
                move |chunk, total| {
                    received += chunk as u64;
                    if last_emit.elapsed().as_millis() > 150 {
                        last_emit = std::time::Instant::now();
                        me.set(&app2, UpdateState::Downloading { version: v2.clone(), received, total });
                    }
                },
                || {},
            )
            .await;
        match res {
            Ok(bytes) => {
                // Signatur wurde vom Plugin beim Download geprüft.
                *self.bytes.lock().unwrap() = Some(bytes);
                self.set(app, UpdateState::Ready { version, notes: update.body.clone() });
                Ok(())
            }
            Err(e) => {
                let msg = e.to_string();
                *self.bytes.lock().unwrap() = None;
                self.set(app, UpdateState::Failed { stage: Stage::Download, code: classify_error(Stage::Download, &msg), message: msg.clone(), version: Some(version) });
                Err(msg)
            }
        }
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
        let (update, bytes) = (self.update.lock().unwrap().clone(), self.bytes.lock().unwrap().clone());
        let (Some(update), Some(bytes)) = (update, bytes) else {
            self.set(app, UpdateState::Failed { stage: Stage::Install, code: "not_ready".into(), message: "Paket fehlt".into(), version: Some(version) });
            return Err("Paket fehlt".into());
        };
        // Worker laufen weiter, falls die Installation scheitert; der Zustand ist gesichert
        // (Transaktionen + WAL-Checkpoint), die Annahme pausiert.
        let prep = rt.prepare_for_update().await;
        tracing::info!(target: "updater", ?prep, version = %version, "Update wird installiert");
        crate::QUITTING.store(true, std::sync::atomic::Ordering::SeqCst);
        // Unter Windows startet `install` den Installer und beendet den Prozess.
        match update.install(bytes) {
            Ok(()) => {
                app.restart();
            }
            Err(e) => {
                let msg = e.to_string();
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
