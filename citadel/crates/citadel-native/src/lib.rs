//! Native Funktionen für CITADEL (ohne Tauri-Abhängigkeit, damit sie separat testbar sind).
//!
//! - [`guard`]: Pfadkanonisierung, Schutz vor Pfadausbrüchen, erlaubte Dateien
//! - [`vdf`]: minimaler Parser für Valve-KeyValues (libraryfolders.vdf, appmanifest_*.acf)
//! - [`steam`]: Steam-Bibliotheken und Deadlock-Installationen finden
//! - [`fsops`]: Lesen mit Prüfsumme, Anwenden mit Backup + Journal + atomarem Ersetzen + Rücklesen, Wiederherstellen
//! - [`process`]: läuft Deadlock?
//! - [`hardware`]: Hardware-Snapshot (Windows-Schnittstellen; sonst „nicht ermittelbar“)
//! - [`store`]: einfache lokale Dokumentablage (Profile, Messungen) mit atomarem Schreiben

pub mod fsops;
pub mod guard;
pub mod hardware;
pub mod process;
pub mod steam;
pub mod store;
pub mod vdf;

pub const DEADLOCK_APP_ID: u32 = 1422450;

#[derive(Debug, thiserror::Error)]
pub enum NativeError {
    #[error("Pfad nicht erlaubt: {0}")]
    Path(String),
    #[error("Dateikonflikt: {0}")]
    Conflict(String),
    #[error("Deadlock läuft – Änderungen werden erst nach dem Beenden geschrieben")]
    GameRunning,
    #[error("E/A-Fehler: {0}")]
    Io(String),
    #[error("Ungültige Eingabe: {0}")]
    Invalid(String),
    #[error("Teilfehler, Änderungen zurückgerollt: {0}")]
    RolledBack(String),
}

impl From<std::io::Error> for NativeError {
    fn from(e: std::io::Error) -> Self {
        NativeError::Io(e.to_string())
    }
}

impl NativeError {
    pub fn code(&self) -> &'static str {
        match self {
            NativeError::Path(_) => "path",
            NativeError::Conflict(_) => "conflict",
            NativeError::GameRunning => "game-running",
            NativeError::Io(_) => "io",
            NativeError::Invalid(_) => "invalid",
            NativeError::RolledBack(_) => "rolled-back",
        }
    }
}

pub type Result<T> = std::result::Result<T, NativeError>;

pub fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(data))
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
