//! Zustandsmodell des integrierten Updaters (ohne Tauri-Abhängigkeit, testbar).
//!
//! Regeln:
//! - Eine fehlgeschlagene Prüfung ist nicht „aktuell“.
//! - Es läuft höchstens ein Vorgang gleichzeitig (Mehrfachklicks werden abgewiesen).
//! - Installiert wird nur aus „Update bereit“ (vollständig geladen und signaturgeprüft).
//! - „Später“ setzt nur zurück auf „Update verfügbar/bereit“ – kein versteckter Timer.
//! - Automatische Installation nur in einem sicheren Moment (siehe [`decide_auto_install`])
//!   und immer mit sichtbarem Countdown, den man abbrechen kann.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum UpdateState {
    /// Build ohne Update-Schlüssel/Endpunkt (z. B. Entwicklungsbuild).
    NotConfigured,
    Unchecked,
    Checking,
    UpToDate { checked_at_ms: i64 },
    Available { version: String, notes: Option<String>, date: Option<String> },
    Downloading { version: String, received: u64, total: Option<u64> },
    Ready { version: String, notes: Option<String> },
    Installing { version: String },
    Failed { stage: Stage, code: String, message: String, version: Option<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Check,
    Download,
    Install,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum Refused {
    #[error("Updates sind in diesem Build nicht eingerichtet")]
    NotConfigured,
    #[error("Es läuft bereits ein Update-Vorgang")]
    Busy,
    #[error("Kein Update verfügbar")]
    NothingToDo,
    #[error("Das Update ist noch nicht vollständig geladen")]
    NotReady,
}

impl UpdateState {
    pub fn is_busy(&self) -> bool {
        matches!(self, Self::Checking | Self::Downloading { .. } | Self::Installing { .. })
    }

    pub fn can_check(&self) -> Result<(), Refused> {
        match self {
            Self::NotConfigured => Err(Refused::NotConfigured),
            s if s.is_busy() => Err(Refused::Busy),
            _ => Ok(()),
        }
    }

    pub fn can_download(&self) -> Result<String, Refused> {
        match self {
            Self::NotConfigured => Err(Refused::NotConfigured),
            s if s.is_busy() => Err(Refused::Busy),
            Self::Available { version, .. } => Ok(version.clone()),
            Self::Failed { stage: Stage::Download | Stage::Install, version: Some(v), .. } => Ok(v.clone()),
            _ => Err(Refused::NothingToDo),
        }
    }

    pub fn can_install(&self) -> Result<String, Refused> {
        match self {
            Self::NotConfigured => Err(Refused::NotConfigured),
            s if s.is_busy() => Err(Refused::Busy),
            Self::Ready { version, .. } => Ok(version.clone()),
            _ => Err(Refused::NotReady),
        }
    }
}

/// Fehlercode für die UI aus einer Fehlermeldung des Updaters.
pub fn classify_error(stage: Stage, msg: &str) -> String {
    let m = msg.to_lowercase();
    let code = if m.contains("signature") || m.contains("minisign") || m.contains("signed version") {
        "invalid_signature"
    } else if m.contains("404") || m.contains("not found") || m.contains("release not found") || m.contains("target") && m.contains("not found") {
        "missing_artifact"
    } else if m.contains("dns") || m.contains("connect") || m.contains("network") || m.contains("timed out") || m.contains("timeout") || m.contains("reqwest") || m.contains("error sending request") {
        "offline"
    } else if m.contains("json") || m.contains("serializ") || m.contains("semver") {
        "invalid_manifest"
    } else {
        match stage {
            Stage::Check => "check_failed",
            Stage::Download => "download_failed",
            Stage::Install => "install_failed",
        }
    };
    code.to_string()
}

// ---------------- Automatische Updates ----------------

/// Nach dem App-Start: in diesem Fenster darf ein fertiges Update auch bei laufender
/// Musik installiert werden (Neustart dauert Sekunden, Spotify spielt unabhängig weiter).
pub const STARTUP_WINDOW_MS: i64 = 5 * 60_000;
/// Später im Betrieb: so lange muss Spotify ruhen, bevor automatisch installiert wird.
pub const IDLE_BEFORE_INSTALL_MS: i64 = 10 * 60_000;
/// Sichtbarer Countdown vor einer automatischen Installation.
pub const AUTO_COUNTDOWN_MS: i64 = 30_000;
/// Regelmäßige Prüfung im Hintergrund.
pub const CHECK_INTERVAL_MS: i64 = 4 * 3_600_000;
/// Erneuter Versuch nach fehlgeschlagener Prüfung bzw. fehlgeschlagenem Download.
pub const RETRY_INTERVAL_MS: i64 = 30 * 60_000;

/// Momentaufnahme für die Entscheidung „jetzt automatisch installieren?“.
#[derive(Debug, Clone, Default)]
pub struct AutoInputs {
    pub auto_enabled: bool,
    /// Für diese App-Sitzung mit „Nicht jetzt“ verschoben.
    pub postponed: bool,
    /// Twitch-Live-Status; `None` = unbekannt (nicht verbunden / nicht abrufbar).
    pub live: Option<bool>,
    pub plan_active: bool,
    /// Eine Übergabe an Spotify läuft oder ist ungeklärt – nicht mittendrin neu starten.
    pub handoff_busy: bool,
    pub spotify_playing: bool,
    /// Zeitpunkt, zu dem zuletzt Wiedergabe beobachtet wurde.
    pub last_playing_ms: Option<i64>,
    pub app_started_ms: i64,
    pub now_ms: i64,
}

/// Warum (noch) nicht automatisch installiert wird – für die Anzeige.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AutoWait {
    Disabled,
    Postponed,
    Live,
    Plan,
    Handoff,
    Playing,
    RecentlyPlaying,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AutoDecision {
    Install,
    Wait(AutoWait),
}

/// Sicherer Moment für eine automatische Installation?
///
/// Nie während eines erkannten Livestreams, einer laufenden Streamplanung oder einer
/// ungeklärten Übergabe. Direkt nach dem Start sofort; später erst, wenn Spotify
/// mindestens [`IDLE_BEFORE_INSTALL_MS`] ruht.
pub fn decide_auto_install(i: &AutoInputs) -> AutoDecision {
    use AutoDecision::*;
    if !i.auto_enabled {
        return Wait(AutoWait::Disabled);
    }
    if i.postponed {
        return Wait(AutoWait::Postponed);
    }
    if i.live == Some(true) {
        return Wait(AutoWait::Live);
    }
    if i.plan_active {
        return Wait(AutoWait::Plan);
    }
    if i.handoff_busy {
        return Wait(AutoWait::Handoff);
    }
    if i.now_ms - i.app_started_ms <= STARTUP_WINDOW_MS {
        return Install;
    }
    if i.spotify_playing {
        return Wait(AutoWait::Playing);
    }
    match i.last_playing_ms {
        Some(t) if i.now_ms - t < IDLE_BEFORE_INSTALL_MS => Wait(AutoWait::RecentlyPlaying),
        _ => Install,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_check_is_not_up_to_date() {
        let s = UpdateState::Failed { stage: Stage::Check, code: "offline".into(), message: "dns".into(), version: None };
        assert_ne!(s, UpdateState::UpToDate { checked_at_ms: 0 });
        assert!(s.can_check().is_ok());
        assert_eq!(s.can_install(), Err(Refused::NotReady));
    }

    #[test]
    fn only_one_operation_at_a_time() {
        let s = UpdateState::Downloading { version: "1.0.0".into(), received: 10, total: Some(100) };
        assert_eq!(s.can_check(), Err(Refused::Busy));
        assert_eq!(s.can_download(), Err(Refused::Busy));
        assert_eq!(s.can_install(), Err(Refused::Busy));
    }

    #[test]
    fn install_only_when_ready() {
        let a = UpdateState::Available { version: "1.0.1".into(), notes: None, date: None };
        assert_eq!(a.can_install(), Err(Refused::NotReady));
        assert_eq!(a.can_download(), Ok("1.0.1".into()));
        let r = UpdateState::Ready { version: "1.0.1".into(), notes: None };
        assert_eq!(r.can_install(), Ok("1.0.1".into()));
        // Abgebrochener Download → erneut herunterladen möglich, Installation nicht.
        let f = UpdateState::Failed { stage: Stage::Download, code: "download_failed".into(), message: String::new(), version: Some("1.0.1".into()) };
        assert_eq!(f.can_download(), Ok("1.0.1".into()));
        assert_eq!(f.can_install(), Err(Refused::NotReady));
        assert_eq!(UpdateState::NotConfigured.can_check(), Err(Refused::NotConfigured));
    }

    #[test]
    fn error_classification() {
        assert_eq!(classify_error(Stage::Download, "the signature verification failed (minisign)"), "invalid_signature");
        assert_eq!(classify_error(Stage::Check, "error sending request: dns error"), "offline");
        assert_eq!(classify_error(Stage::Check, "Could not fetch a valid release JSON from the remote: 404 Not Found"), "missing_artifact");
        assert_eq!(classify_error(Stage::Check, "expected value at line 1 (json)"), "invalid_manifest");
        assert_eq!(classify_error(Stage::Install, "boom"), "install_failed");
    }

    fn base() -> AutoInputs {
        AutoInputs { auto_enabled: true, app_started_ms: 0, now_ms: 60 * 60_000, ..Default::default() }
    }

    #[test]
    fn auto_install_never_during_live_plan_or_handoff() {
        let mut i = base();
        assert_eq!(decide_auto_install(&i), AutoDecision::Install);
        i.live = Some(true);
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Live));
        // Auch direkt nach dem Start nicht, wenn live.
        i.now_ms = 1_000;
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Live));
        let mut i = base();
        i.plan_active = true;
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Plan));
        let mut i = base();
        i.handoff_busy = true;
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Handoff));
    }

    #[test]
    fn auto_install_respects_setting_and_postpone() {
        let mut i = base();
        i.auto_enabled = false;
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Disabled));
        let mut i = base();
        i.postponed = true;
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Postponed));
    }

    #[test]
    fn auto_install_waits_for_quiet_playback_after_startup() {
        // Direkt nach dem Start: Musik läuft → trotzdem installieren (kurzer Neustart).
        let mut i = base();
        i.now_ms = 2 * 60_000;
        i.spotify_playing = true;
        assert_eq!(decide_auto_install(&i), AutoDecision::Install);
        // Später: Musik läuft → warten.
        i.now_ms = 60 * 60_000;
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::Playing));
        // Gerade erst gestoppt → noch warten; nach 10 min Ruhe → installieren.
        i.spotify_playing = false;
        i.last_playing_ms = Some(i.now_ms - 3 * 60_000);
        assert_eq!(decide_auto_install(&i), AutoDecision::Wait(AutoWait::RecentlyPlaying));
        i.last_playing_ms = Some(i.now_ms - IDLE_BEFORE_INSTALL_MS);
        assert_eq!(decide_auto_install(&i), AutoDecision::Install);
        // Live-Status unbekannt blockiert nicht allein (Twitch ist optional).
        i.live = None;
        assert_eq!(decide_auto_install(&i), AutoDecision::Install);
    }
}
