//! ON AIR Kernlogik.
//!
//! Die Crate ist bewusst frei von UI- und Tauri-Abhängigkeiten, damit alle
//! kritischen Integrationszustände mit Fake-Providern getestet werden können.
//!
//! Aufteilung:
//! - [`http`]: Transport-Abstraktion (echter `reqwest`-Client oder Test-Fake)
//! - [`auth`]: Token-Verwaltung (Single-Flight-Refresh, Sitzungs-Epoche), PKCE
//! - [`spotify`]: Web-API-Client mit Fehlerklassifikation und Synchronisations-Dienst
//! - [`twitch`]: Device-Code-Anmeldung, Helix, EventSub-WebSocket, Chatbefehle
//! - [`queue`]: persistente Request-Warteschlange mit Zustandsautomat und Übergabestrategie
//! - [`storage`]: SQLite mit versionierten Migrationen und Sicherung
//! - [`overlay`]: lokaler Overlay-Server (nur Loopback) für OBS Browser Sources
//! - [`runtime`]: Orchestrierung – genau ein Worker pro Integration

pub mod acceptance;
pub mod activity;
pub mod auth;
pub mod backoff;
pub mod clock;
pub mod diagnostics;
pub mod error;
pub mod events;
pub mod http;
pub mod model;
pub mod nowplaying_file;
pub mod overlay;
pub mod plan;
pub mod queue;
pub mod runtime;
pub mod secrets;
pub mod settings;
pub mod spotify;
pub mod storage;
pub mod twitch;
pub mod update_direct;
pub mod update_state;
pub mod wake;
