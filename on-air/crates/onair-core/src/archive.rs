//! Sammel-Playlist: Jeder angenommene Songwunsch landet einmal in einer Spotify-Playlist –
//! über die Zeit entsteht so ein Archiv aller Wünsche.
//!
//! Grundsätze
//! - Nur Wünsche ab dem Einschalten (bzw. ab `since_ms`), nur angenommene (nicht abgelehnte).
//! - Jeder Titel genau einmal (Tabelle `archive_tracks`), jeder Request genau einmal geprüft
//!   (`archive_requests`) – auch über Neustarts hinweg.
//! - ON AIR schreibt nur in selbst angelegte Playlists. Ist eine voll (Spotify: 10.000 Titel),
//!   wird automatisch „… · Teil 2“ angelegt; wurde sie gelöscht, wird sie neu angelegt.
//! - Titel werden in Blöcken bis 100 übertragen; Fehler werden angezeigt und später erneut versucht.

use crate::activity::ActivityLog;
use crate::auth::AuthStatus;
use crate::backoff::Backoff;
use crate::clock::SharedClock;
use crate::error::{ApiError, ErrorInfo};
use crate::events::{EventBus, Topic};
use crate::settings::{self as cfg, RequestPlaylistSettings, SharedSettings};
use crate::spotify::service::SpotifyState;
use crate::spotify::SpotifyClient;
use crate::storage::Db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{watch, Notify};

/// Spotify begrenzt Playlists auf 10.000 Titel.
pub const PLAYLIST_LIMIT: usize = 10_000;
const BATCH: usize = 100;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ArchivePlaylist {
    pub id: String,
    pub url: String,
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ArchiveState {
    /// Älteste zuerst; die letzte ist die aktuelle.
    pub playlists: Vec<ArchivePlaylist>,
    /// Wünsche ab diesem Zeitpunkt werden übernommen (gesetzt beim ersten Einschalten).
    pub since_ms: Option<i64>,
}

impl ArchiveState {
    pub const KEY: &'static str = "archive.v1";
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ArchiveStatus {
    pub enabled: bool,
    /// Spotify-Anmeldung enthält die Playlist-Rechte.
    pub scope_ok: bool,
    pub playlists: Vec<ArchivePlaylist>,
    pub total: usize,
    /// Wünsche, die noch übertragen werden müssen.
    pub pending: usize,
    pub last_added_ms: Option<i64>,
    pub last_error: Option<ErrorInfo>,
}

pub struct ArchiveDeps {
    pub db: Db,
    pub spotify: Arc<SpotifyClient>,
    pub spotify_state: watch::Receiver<SpotifyState>,
    pub settings: SharedSettings,
    pub activity: ActivityLog,
    pub bus: EventBus,
    pub clock: SharedClock,
}

pub struct ArchiveService {
    d: ArchiveDeps,
    state: Mutex<ArchiveState>,
    last_error: Mutex<Option<ErrorInfo>>,
    last_added_ms: Mutex<Option<i64>>,
    pending: Mutex<usize>,
    kick: Notify,
    lock: tokio::sync::Mutex<()>,
}

/// Anzeigename der n-ten Playlist (1-basiert).
pub fn part_name(base: &str, n: usize, english: bool) -> String {
    match (n, english) {
        (0 | 1, _) => base.to_string(),
        (_, true) => format!("{base} · Part {n}"),
        _ => format!("{base} · Teil {n}"),
    }
}

fn has_playlist_scope(auth: &AuthStatus) -> bool {
    match auth {
        AuthStatus::SignedIn { scope, .. } => crate::spotify::PLAYLIST_SCOPES.iter().all(|s| scope.split_whitespace().any(|x| x == *s)),
        _ => false,
    }
}

impl ArchiveService {
    pub fn new(d: ArchiveDeps) -> Arc<Self> {
        let state: ArchiveState = d.db.get_setting(ArchiveState::KEY).and_then(|r| serde_json::from_str(&r).ok()).unwrap_or_default();
        Arc::new(Self {
            d,
            state: Mutex::new(state),
            last_error: Mutex::new(None),
            last_added_ms: Mutex::new(None),
            pending: Mutex::new(0),
            kick: Notify::new(),
            lock: tokio::sync::Mutex::new(()),
        })
    }

    pub fn kick(&self) {
        self.kick.notify_one();
    }

    fn now(&self) -> i64 {
        self.d.clock.now_ms()
    }

    fn save(&self) {
        let st = self.state.lock().unwrap().clone();
        if let Ok(raw) = serde_json::to_string(&st) {
            let _ = self.d.db.set_setting(ArchiveState::KEY, &raw);
        }
    }

    pub fn status(&self) -> ArchiveStatus {
        let s = cfg::read(&self.d.settings).request_playlist.clone();
        let st = self.state.lock().unwrap().clone();
        let total = self.d.db.conn().query_row("SELECT COUNT(*) FROM archive_tracks", [], |r| r.get::<_, i64>(0)).unwrap_or(0) as usize;
        ArchiveStatus {
            enabled: s.enabled,
            scope_ok: has_playlist_scope(&self.d.spotify_state.borrow().auth),
            playlists: st.playlists,
            total,
            pending: *self.pending.lock().unwrap(),
            last_added_ms: *self.last_added_ms.lock().unwrap(),
            last_error: self.last_error.lock().unwrap().clone(),
        }
    }

    fn set_error(&self, e: Option<(&str, String)>) {
        let new = e.map(|(code, details)| ErrorInfo { code: code.into(), details, at_ms: self.now() });
        let mut g = self.last_error.lock().unwrap();
        if g.as_ref().map(|x| (&x.code, &x.details)) != new.as_ref().map(|x| (&x.code, &x.details)) {
            *g = new;
            drop(g);
            self.d.bus.changed(Topic::Settings);
        }
    }

    pub async fn run(self: Arc<Self>) {
        let mut backoff = Backoff::new(Duration::from_secs(30), Duration::from_secs(900));
        let mut next = Duration::from_secs(3);
        loop {
            tokio::select! {
                _ = tokio::time::sleep(next) => {}
                _ = self.kick.notified() => {}
            }
            next = match self.tick().await {
                Ok(()) => {
                    backoff.reset();
                    Duration::from_secs(15)
                }
                Err(()) => backoff.next_delay(),
            };
        }
    }

    /// Ein Durchgang: neue Wünsche erfassen, offene übertragen. `Err` = später erneut.
    pub async fn tick(&self) -> Result<(), ()> {
        let _g = self.lock.lock().await;
        let s = cfg::read(&self.d.settings).request_playlist.clone();
        if !s.enabled {
            return Ok(());
        }
        {
            let mut st = self.state.lock().unwrap();
            if st.since_ms.is_none() {
                st.since_ms = Some(self.now());
                drop(st);
                self.save();
            }
        }
        let (online, scope_ok) = {
            let sp = self.d.spotify_state.borrow();
            (sp.is_online(), has_playlist_scope(&sp.auth))
        };
        self.collect(&s);
        if !scope_ok {
            self.set_error(Some(("missing_scope", "Spotify-Anmeldung ohne Playlist-Rechte – bitte Spotify neu verbinden".into())));
            return Ok(());
        }
        if !online {
            return Ok(());
        }
        loop {
            let batch = self.pending_batch();
            if batch.is_empty() {
                self.set_error(None);
                return Ok(());
            }
            self.push(&s, &batch).await?;
        }
    }

    /// Neue, angenommene Wünsche als offen vormerken (bzw. als Duplikat abhaken).
    fn collect(&self, s: &RequestPlaylistSettings) {
        let since = self.state.lock().unwrap().since_ms.unwrap_or(i64::MAX);
        let now = self.now();
        let conn = self.d.db.conn();
        let rows: Vec<(String, String)> = conn
            .prepare(
                "SELECT r.id, r.track_uri FROM requests r
                 WHERE r.track_uri LIKE 'spotify:track:%'
                   AND r.status IN ('accepted','handing_off','handed_off','playing','completed')
                   AND r.received_at >= ?1 AND (?2 OR r.source != 'app')
                   AND NOT EXISTS (SELECT 1 FROM archive_requests a WHERE a.request_id = r.id)
                 ORDER BY r.received_at LIMIT 1000",
            )
            .and_then(|mut st| st.query_map(params![since, s.include_app], |r| Ok((r.get(0)?, r.get(1)?)))?.collect())
            .unwrap_or_default();
        for (id, uri) in rows {
            let known: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM archive_tracks WHERE track_uri = ?1)", params![uri], |r| r.get(0)).unwrap_or(false);
            let state = if known { "duplicate" } else { "pending" };
            let _ = conn.execute(
                "INSERT OR IGNORE INTO archive_requests(request_id, track_uri, state, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![id, uri, state, now],
            );
        }
        let n: i64 = conn.query_row("SELECT COUNT(DISTINCT track_uri) FROM archive_requests WHERE state = 'pending'", [], |r| r.get(0)).unwrap_or(0);
        *self.pending.lock().unwrap() = n as usize;
    }

    /// Nächste bis zu 100 verschiedene, noch nicht enthaltene Titel.
    fn pending_batch(&self) -> Vec<String> {
        let conn = self.d.db.conn();
        // Inzwischen enthaltene Titel (doppelt gewünscht) abhaken.
        let _ = conn.execute(
            "UPDATE archive_requests SET state = 'duplicate' WHERE state = 'pending' AND track_uri IN (SELECT track_uri FROM archive_tracks)",
            [],
        );
        conn.prepare("SELECT track_uri FROM archive_requests WHERE state = 'pending' GROUP BY track_uri ORDER BY MIN(created_at), MIN(rowid) LIMIT ?1")
            .and_then(|mut st| st.query_map(params![BATCH as i64], |r| r.get(0))?.collect())
            .unwrap_or_default()
    }

    /// Aktuelle Playlist mit Platz für `n` Titel – legt bei Bedarf eine (weitere) an.
    async fn target(&self, s: &RequestPlaylistSettings, n: usize, force_new: bool) -> Result<ArchivePlaylist, ApiError> {
        let (current, parts) = {
            let st = self.state.lock().unwrap();
            (st.playlists.last().cloned(), st.playlists.len())
        };
        if let Some(p) = current.filter(|p| !force_new && p.count + n <= PLAYLIST_LIMIT) {
            return Ok(p);
        }
        let number = parts + 1;
        let english = cfg::read(&self.d.settings).language == "en";
        let name = part_name(&s.name, number, english);
        let (id, url) = self.d.spotify.create_playlist(&name, s.public, "Alle Songwünsche aus dem Stream – automatisch gesammelt von ON AIR.").await?;
        let p = ArchivePlaylist { id, url, name: name.clone(), count: 0 };
        self.state.lock().unwrap().playlists.push(p.clone());
        self.save();
        self.d.activity.success("archive.created", format!("Sammel-Playlist „{name}“ auf Spotify angelegt"), json!({ "name": name }));
        self.d.bus.changed(Topic::Settings);
        Ok(p)
    }

    async fn push(&self, s: &RequestPlaylistSettings, uris: &[String]) -> Result<(), ()> {
        let mut force_new = false;
        for attempt in 0..2 {
            let p = match self.target(s, uris.len(), force_new).await {
                Ok(p) => p,
                Err(e) => return self.fail(&e),
            };
            match self.d.spotify.add_playlist_items(&p.id, uris).await {
                Ok(()) => {
                    self.mark_added(&p.id, uris);
                    return Ok(());
                }
                // Playlist gelöscht oder nicht mehr beschreibbar → neue anlegen (einmal).
                Err(ApiError::NotFound) if attempt == 0 => {
                    self.d.activity.warn("archive.gone", format!("Sammel-Playlist „{}“ nicht mehr gefunden – lege eine neue an", p.name), json!({}));
                    force_new = true;
                }
                // Zustand der Playlist unbekannt (z. B. von Hand gefüllt) → voll behandeln.
                Err(ApiError::BadRequest { message }) if attempt == 0 && message.to_lowercase().contains("limit") => {
                    force_new = true;
                }
                Err(e @ ApiError::Network { possibly_delivered: true, .. }) => {
                    // Evtl. angekommen: nicht erneut senden (sonst doppelt), als erledigt verbuchen.
                    tracing::info!(target: "archive", code = e.code(), "Ausgang unklar – nicht wiederholt");
                    self.mark_added(&p.id, uris);
                    return Ok(());
                }
                Err(e) => return self.fail(&e),
            }
        }
        Err(())
    }

    fn mark_added(&self, playlist_id: &str, uris: &[String]) {
        let now = self.now();
        {
            let mut c = self.d.db.conn();
            if let Ok(tx) = c.transaction() {
                for u in uris {
                    let _ = tx.execute("INSERT OR IGNORE INTO archive_tracks(track_uri, playlist_id, added_at) VALUES (?1, ?2, ?3)", params![u, playlist_id, now]);
                    let _ = tx.execute("UPDATE archive_requests SET state = 'added' WHERE state = 'pending' AND track_uri = ?1", params![u]);
                }
                let _ = tx.commit();
            };
        }
        let name = {
            let mut st = self.state.lock().unwrap();
            let p = st.playlists.iter_mut().find(|p| p.id == playlist_id);
            p.map(|p| {
                p.count += uris.len();
                p.name.clone()
            })
            .unwrap_or_default()
        };
        self.save();
        *self.last_added_ms.lock().unwrap() = Some(now);
        {
            let mut n = self.pending.lock().unwrap();
            *n = n.saturating_sub(uris.len());
        }
        self.set_error(None);
        let text = if uris.len() == 1 { format!("Songwunsch zur Playlist „{name}“ hinzugefügt") } else { format!("{} Songwünsche zur Playlist „{name}“ hinzugefügt", uris.len()) };
        self.d.activity.info("archive.added", text, json!({ "count": uris.len() }));
        self.d.bus.changed(Topic::Settings);
    }

    fn fail(&self, e: &ApiError) -> Result<(), ()> {
        let code = match e {
            ApiError::Forbidden { .. } => "forbidden",
            other => other.code(),
        };
        tracing::warn!(target: "archive", code, "Sammel-Playlist: Übertragung fehlgeschlagen");
        self.set_error(Some((code, e.to_string())));
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_names() {
        assert_eq!(part_name("Wünsche", 1, false), "Wünsche");
        assert_eq!(part_name("Wünsche", 3, false), "Wünsche · Teil 3");
        assert_eq!(part_name("Requests", 2, true), "Requests · Part 2");
    }

    #[test]
    fn scope_detection() {
        let with = AuthStatus::SignedIn { scope: "user-read-playback-state playlist-modify-private playlist-modify-public".into(), authorized_at_ms: 0 };
        let without = AuthStatus::SignedIn { scope: "user-read-playback-state".into(), authorized_at_ms: 0 };
        assert!(has_playlist_scope(&with));
        assert!(!has_playlist_scope(&without));
    }
}
