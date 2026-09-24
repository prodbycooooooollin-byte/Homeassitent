//! Request-Verarbeitung: Einreichung, Moderation, Übergabestrategie, Beobachtung
//! und Abgleich mit Spotify.
//!
//! Übergabestrategie (sparsam): Es liegen höchstens `handoff_ahead` Requests
//! gleichzeitig in Spotifys Queue (Standard 1). Alles andere bleibt lokal und damit
//! umsortierbar. Spotify erlaubt über die Web API weder Entfernen noch Umordnen
//! bereits eingereihter Elemente.
//!
//! Schreibende Übergaben werden vor dem Senden als `HandingOff` gespeichert. Bei
//! unklarem Ausgang (Timeout, 5xx, Absturz) wird abgeglichen statt wiederholt.

use super::rules::{self, Rejection};
use super::store::QueueStore;
use super::{PendingReason, RequestStatus, Requester, SongRequest, Source, SubmitOutcome};
use crate::activity::ActivityLog;
use crate::clock::SharedClock;
use crate::error::ApiError;
use crate::events::{EventBus, Topic};
use crate::model::{PlaybackView, Track};
use crate::settings::{self as cfg, AcceptMode, SharedSettings};
use crate::spotify::service::SpotifyState;
use crate::spotify::{parse_track_link, SpotifyClient};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::watch;

/// Rückkanal für Chatantworten zu Requests, die verzögert entschieden werden.
pub trait ChatNotifier: Send + Sync + 'static {
    fn notify(&self, text: String, reply_to: Option<String>);
}

pub struct QueueService {
    pub store: QueueStore,
    spotify: Arc<SpotifyClient>,
    sp_state: watch::Receiver<SpotifyState>,
    settings: SharedSettings,
    activity: ActivityLog,
    bus: EventBus,
    clock: SharedClock,
    handoff_lock: tokio::sync::Mutex<()>,
    decide_lock: tokio::sync::Mutex<()>,
    last_track_uri: Mutex<Option<String>>,
    notifier: OnceLock<Arc<dyn ChatNotifier>>,
    session_started_ms: i64,
}

enum Resolve {
    Found(Track),
    Offline,
    Rejected(Rejection),
}

impl QueueService {
    pub fn new(
        store: QueueStore,
        spotify: Arc<SpotifyClient>,
        sp_state: watch::Receiver<SpotifyState>,
        settings: SharedSettings,
        activity: ActivityLog,
        bus: EventBus,
        clock: SharedClock,
    ) -> Arc<Self> {
        let now = clock.now_ms();
        Arc::new(Self {
            store,
            spotify,
            sp_state,
            settings,
            activity,
            bus,
            clock,
            handoff_lock: tokio::sync::Mutex::new(()),
            decide_lock: tokio::sync::Mutex::new(()),
            last_track_uri: Mutex::new(None),
            notifier: OnceLock::new(),
            session_started_ms: now,
        })
    }

    pub fn set_notifier(&self, n: Arc<dyn ChatNotifier>) {
        let _ = self.notifier.set(n);
    }

    pub fn session_started_ms(&self) -> i64 {
        self.session_started_ms
    }

    fn now(&self) -> i64 {
        self.clock.now_ms()
    }

    fn changed(&self) {
        self.bus.changed(Topic::Queue);
    }

    fn spotify_online(&self) -> bool {
        self.sp_state.borrow().is_online()
    }

    // ------------------------------------------------------------------
    // Einreichung
    // ------------------------------------------------------------------

    /// Request per Suchbegriff oder Spotify-Link (Chat oder App).
    pub async fn submit_query(
        &self,
        query: &str,
        requester: Requester,
        source: Source,
        event_id: Option<&str>,
        chat_message_id: Option<&str>,
    ) -> SubmitOutcome {
        let now = self.now();
        let req = SongRequest {
            id: uuid::Uuid::new_v4().to_string(),
            track: None,
            query: query.trim().chars().take(200).collect(),
            requester,
            source,
            source_event: event_id.map(str::to_string),
            received_at: now,
            status: RequestStatus::Received,
            pending_reason: None,
            reason: None,
            reason_text: None,
            position: 0.0,
            priority: false,
            updated_at: now,
            handoff_at: None,
            observed_at: None,
            finished_at: None,
            chat_message_id: chat_message_id.map(str::to_string),
        };
        // Ereignis-Deduplizierung und Anlage in einer Transaktion.
        match self.store.insert_with_event(&req, "twitch", now) {
            Ok(true) => {}
            Ok(false) => return SubmitOutcome::Duplicate,
            Err(e) => {
                tracing::error!(target: "queue", error = %e, "Request konnte nicht gespeichert werden");
                return SubmitOutcome::Rejected { code: "storage".into(), text: "interner Fehler".into(), request: None };
            }
        }

        // Vorprüfung ohne API-Aufruf (Cooldown, Rolle, Limits).
        if let Err(r) = self.check_requester(&req) {
            return self.reject(&req, r);
        }
        let resolved = self.resolve(&req.query).await;
        self.decide(req, resolved).await
    }

    /// Request für einen bereits ausgewählten Track (Suchergebnis in der App, Verlauf).
    pub async fn submit_track(&self, track: Track, requester: Requester, source: Source) -> SubmitOutcome {
        let now = self.now();
        let req = SongRequest {
            id: uuid::Uuid::new_v4().to_string(),
            query: track.uri.clone(),
            track: None,
            requester,
            source,
            source_event: None,
            received_at: now,
            status: RequestStatus::Received,
            pending_reason: None,
            reason: None,
            reason_text: None,
            position: 0.0,
            priority: false,
            updated_at: now,
            handoff_at: None,
            observed_at: None,
            finished_at: None,
            chat_message_id: None,
        };
        if let Err(e) = self.store.insert(&req) {
            return SubmitOutcome::Rejected { code: "storage".into(), text: e, request: None };
        }
        if let Err(r) = self.check_requester(&req) {
            return self.reject(&req, r);
        }
        self.decide(req, Resolve::Found(track)).await
    }

    fn check_requester(&self, req: &SongRequest) -> Result<(), Rejection> {
        let rules = cfg::read(&self.settings).requests.clone();
        let stats = self.store.stats(&req.requester.id, None, &req.id);
        rules::check_requester(
            &rules,
            &self.store.blocklist(),
            &req.requester.id,
            &req.requester.name,
            req.requester.role,
            &stats,
            req.received_at,
        )
    }

    async fn resolve(&self, query: &str) -> Resolve {
        let q = query.trim();
        if q.is_empty() {
            return Resolve::Rejected(Rejection::NotFound);
        }
        let link = parse_track_link(q);
        if link.is_none() && (q.starts_with("http://") || q.starts_with("https://") || q.starts_with("spotify:")) {
            return Resolve::Rejected(Rejection::InvalidLink);
        }
        if !self.spotify_online() {
            return Resolve::Offline;
        }
        let res = match &link {
            Some(id) => self.spotify.track(id).await.map(|t| vec![t]),
            None => self.spotify.search_tracks(q, 5).await,
        };
        match res {
            Ok(list) if list.is_empty() => Resolve::Rejected(Rejection::NotFound),
            Ok(mut list) => {
                // Bei Suche: den ersten Treffer, der die Inhaltsregeln erfüllt.
                if link.is_none() {
                    let rules = cfg::read(&self.settings).requests.clone();
                    let block = self.store.blocklist();
                    let stats = rules::QueueStats::default();
                    if let Some(pos) = list.iter().position(|t| {
                        rules::check_track(&rules, &block, t, crate::settings::Role::Everyone, &stats).is_ok()
                    }) {
                        return Resolve::Found(list.swap_remove(pos));
                    }
                }
                Resolve::Found(list.swap_remove(0))
            }
            Err(ApiError::NotFound) | Err(ApiError::BadRequest { .. }) => Resolve::Rejected(Rejection::NotFound),
            Err(e) if e.is_transient() || matches!(e, ApiError::SessionEnded | ApiError::NotSignedIn | ApiError::ReauthRequired { .. } | ApiError::Unauthorized) => {
                Resolve::Offline
            }
            Err(_) => Resolve::Offline,
        }
    }

    /// Endgültige Prüfung unter Sperre (verhindert, dass parallele Requests Limits umgehen).
    async fn decide(&self, req: SongRequest, resolved: Resolve) -> SubmitOutcome {
        let _g = self.decide_lock.lock().await;
        let now = self.now();
        let from = RequestStatus::parse(
            self.store.get(&req.id).map(|r| r.status.as_str()).unwrap_or("received"),
        );
        let track = match resolved {
            Resolve::Rejected(r) => return self.reject(&req, r),
            Resolve::Offline => {
                let _ = self.store.transition(&req.id, &[from], RequestStatus::PendingReview, now, None);
                let _ = self.set_pending_reason(&req.id, PendingReason::Offline);
                self.activity.warn(
                    "request.pending_offline",
                    format!("Request von {} gespeichert – Prüfung, sobald Spotify erreichbar ist", req.requester.name),
                    json!({ "user": req.requester.name, "query": req.query }),
                );
                self.changed();
                let r = self.store.get(&req.id).unwrap_or(req);
                return SubmitOutcome::PendingOffline { request: r };
            }
            Resolve::Found(t) => t,
        };
        let rules = cfg::read(&self.settings).requests.clone();
        let stats = self.store.stats(&req.requester.id, Some(&track.uri), &req.id);
        if let Err(r) = rules::check_track(&rules, &self.store.blocklist(), &track, req.requester.role, &stats) {
            let _ = self.store.set_track_and_status(&req.id, &track, from, from, None, now);
            return self.reject(&req, r);
        }
        let position = self.insertion_position(&req.requester.id, rules.fair_order);
        let _ = self.store.set_position(&req.id, position, now);
        let moderated = rules.mode == AcceptMode::Moderation && req.requester.role != crate::settings::Role::Broadcaster;
        let (to, pending) = if moderated {
            (RequestStatus::PendingReview, Some(PendingReason::Moderation))
        } else {
            (RequestStatus::Accepted, None)
        };
        let _ = self.store.set_track_and_status(&req.id, &track, from, to, pending, now);
        let stored = self.store.get(&req.id).unwrap_or(req);
        self.changed();
        if moderated {
            self.activity.info(
                "request.pending_review",
                format!("{} wünscht „{}“ – Freigabe ausstehend", stored.requester.name, track.title),
                json!({ "user": stored.requester.name, "title": track.title, "artist": track.artist_line() }),
            );
            SubmitOutcome::PendingReview { request: stored }
        } else {
            let pos = self.display_position(&stored.id);
            self.activity.success(
                "request.accepted",
                format!("Request angenommen: „{}“ von {} (für {})", track.title, track.artist_line(), stored.requester.name),
                json!({ "user": stored.requester.name, "title": track.title, "artist": track.artist_line(), "position": pos }),
            );
            SubmitOutcome::Accepted { request: stored, position: pos }
        }
    }

    fn set_pending_reason(&self, id: &str, r: PendingReason) -> Result<(), String> {
        let v = match r {
            PendingReason::Moderation => "moderation",
            PendingReason::Offline => "offline",
        };
        self.store
            .db()
            .conn()
            .execute("UPDATE requests SET pending_reason = ?2 WHERE id = ?1", rusqlite::params![id, v])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    fn reject(&self, req: &SongRequest, r: Rejection) -> SubmitOutcome {
        let now = self.now();
        let cur = self.store.get(&req.id).map(|x| x.status).unwrap_or(RequestStatus::Received);
        let _ = self.store.transition(&req.id, &[cur], RequestStatus::Rejected, now, Some((r.code(), &r.text())));
        self.activity.info(
            "request.rejected",
            format!("Request von {} abgelehnt: {}", req.requester.name, r.text()),
            json!({ "user": req.requester.name, "code": r.code(), "query": req.query }),
        );
        self.changed();
        SubmitOutcome::Rejected { code: r.code().into(), text: r.text(), request: self.store.get(&req.id) }
    }

    /// Faire Reihenfolge: Ein neuer Request wird vor dem ersten Eintrag einsortiert,
    /// dessen Anfragender bereits mehr offene Requests hat als der neue.
    fn insertion_position(&self, requester_id: &str, fair: bool) -> f64 {
        let end = self.store.max_position() + 1.0;
        if !fair {
            return end;
        }
        let movable: Vec<SongRequest> = self
            .store
            .pending()
            .into_iter()
            .filter(|r| r.status.is_movable() && !r.priority)
            .collect();
        let mine = movable.iter().filter(|r| r.requester.id == requester_id).count();
        let mut seen: HashMap<&str, usize> = HashMap::new();
        let mut prev: Option<f64> = None;
        for r in &movable {
            let rank = seen.entry(r.requester.id.as_str()).or_insert(0);
            if *rank > mine {
                return match prev {
                    Some(p) => (p + r.position) / 2.0,
                    None => r.position - 1.0,
                };
            }
            *rank += 1;
            prev = Some(r.position);
        }
        end
    }

    /// 1-basierte Position unter den noch nicht gespielten Requests.
    pub fn display_position(&self, id: &str) -> usize {
        self.store
            .pending()
            .iter()
            .filter(|r| r.status != RequestStatus::Playing)
            .position(|r| r.id == id)
            .map(|p| p + 1)
            .unwrap_or(0)
    }

    // ------------------------------------------------------------------
    // Moderation und manuelle Bearbeitung
    // ------------------------------------------------------------------

    pub async fn approve(&self, id: &str) -> Result<(), String> {
        let r = self.store.get(id).ok_or("Request nicht gefunden")?;
        if r.pending_reason == Some(PendingReason::Offline) || r.track.is_none() {
            return Err("Dieser Request wird erst geprüft, wenn Spotify erreichbar ist.".into());
        }
        if !self.store.transition(id, &[RequestStatus::PendingReview], RequestStatus::Accepted, self.now(), None)? {
            return Err("Request ist nicht mehr in Prüfung.".into());
        }
        self.activity.success(
            "request.approved",
            format!("Freigegeben: „{}“ für {}", r.track.as_ref().map(|t| t.title.as_str()).unwrap_or(""), r.requester.name),
            json!({ "user": r.requester.name }),
        );
        self.changed();
        self.maybe_handoff().await;
        Ok(())
    }

    pub fn reject_manual(&self, id: &str, code: &str) -> Result<(), String> {
        let r = self.store.get(id).ok_or("Request nicht gefunden")?;
        let text = match code {
            "removed_by_streamer" => "vom Streamer entfernt",
            "removed_by_user" => "selbst entfernt",
            _ => "abgelehnt",
        };
        if !self.store.transition(
            id,
            &[RequestStatus::Received, RequestStatus::PendingReview, RequestStatus::Accepted],
            RequestStatus::Rejected,
            self.now(),
            Some((code, text)),
        )? {
            return Err("Nur noch nicht übergebene Requests können entfernt werden.".into());
        }
        self.activity.info(
            "request.removed",
            format!("Request von {} entfernt", r.requester.name),
            json!({ "user": r.requester.name, "code": code }),
        );
        self.changed();
        Ok(())
    }

    /// Verschiebt einen lokalen Request an `index` innerhalb der umsortierbaren Einträge.
    pub fn move_to(&self, id: &str, index: usize) -> Result<(), String> {
        let movable: Vec<SongRequest> = self.store.pending().into_iter().filter(|r| r.status.is_movable()).collect();
        let me = movable.iter().find(|r| r.id == id).ok_or("Nur noch nicht übergebene Requests sind verschiebbar.")?;
        let others: Vec<&SongRequest> = movable.iter().filter(|r| r.id != id && r.priority == me.priority).collect();
        let idx = index.min(others.len());
        let pos = match (idx.checked_sub(1).and_then(|i| others.get(i)), others.get(idx)) {
            (None, None) => me.position,
            (None, Some(n)) => n.position - 1.0,
            (Some(p), None) => p.position + 1.0,
            (Some(p), Some(n)) => (p.position + n.position) / 2.0,
        };
        self.store.set_position(id, pos, self.now())?;
        self.changed();
        Ok(())
    }

    pub fn set_priority(&self, id: &str, priority: bool) -> Result<(), String> {
        let r = self.store.get(id).ok_or("Request nicht gefunden")?;
        if !r.status.is_movable() {
            return Err("Bereits an Spotify übergeben.".into());
        }
        self.store.set_priority(id, priority, self.now())?;
        self.changed();
        Ok(())
    }

    /// Entscheidung bei unklarem Ausgang: erneut übergeben.
    pub async fn retry(&self, id: &str) -> Result<(), String> {
        if !self.store.transition(id, &[RequestStatus::Uncertain, RequestStatus::Failed], RequestStatus::Accepted, self.now(), None)? {
            return Err("Request ist nicht in einem wiederholbaren Zustand.".into());
        }
        self.activity.info("request.retry", "Request wird erneut übergeben", json!({ "id": id }));
        self.changed();
        self.maybe_handoff().await;
        Ok(())
    }

    /// Entscheidung bei unklarem Ausgang: als erledigt betrachten (nicht erneut senden).
    pub fn dismiss(&self, id: &str) -> Result<(), String> {
        if !self.store.transition(id, &[RequestStatus::Uncertain], RequestStatus::Completed, self.now(), Some(("dismissed", "manuell abgeschlossen")))? {
            return Err("Request ist nicht unklar.".into());
        }
        self.changed();
        Ok(())
    }

    /// `!remove`: jüngster eigener, noch nicht übergebener Request.
    pub fn remove_own(&self, requester_id: &str) -> Option<SongRequest> {
        let mine = self
            .store
            .pending()
            .into_iter()
            .filter(|r| r.requester.id == requester_id && r.status.is_movable())
            .max_by_key(|r| r.received_at)?;
        self.reject_manual(&mine.id, "removed_by_user").ok()?;
        Some(mine)
    }

    // ------------------------------------------------------------------
    // Übergabe an Spotify
    // ------------------------------------------------------------------

    pub async fn maybe_handoff(&self) {
        let _g = self.handoff_lock.lock().await;
        loop {
            let st = self.sp_state.borrow().clone();
            if !st.is_online() {
                return;
            }
            let PlaybackView::Active(pb) = &st.playback else { return };
            let Some(device) = &pb.device else { return };
            if device.is_restricted {
                return;
            }
            // Nie auf Basis alter Daten handeln (z. B. nach Standby).
            if self.now() - pb.fetched_at_ms > 15_000 {
                return;
            }
            let ahead = cfg::read(&self.settings).requests.handoff_ahead as usize;
            let in_flight = self.store.by_status(RequestStatus::HandedOff).len()
                + self.store.by_status(RequestStatus::HandingOff).len();
            if in_flight >= ahead {
                return;
            }
            let Some(next) = self.store.by_status(RequestStatus::Accepted).into_iter().find(|r| r.track.is_some()) else {
                return;
            };
            let track = next.track.clone().expect("track");
            let now = self.now();
            match self.store.transition(&next.id, &[RequestStatus::Accepted], RequestStatus::HandingOff, now, None) {
                Ok(true) => {}
                _ => continue,
            }
            self.changed();
            let result = self.spotify.add_to_queue(&track.uri, device.id.as_deref()).await;
            let now = self.now();
            match result {
                Ok(()) => {
                    let _ = self.store.transition(&next.id, &[RequestStatus::HandingOff], RequestStatus::HandedOff, now, None);
                    self.activity.success(
                        "request.handed_off",
                        format!("„{}“ an Spotify übergeben", track.title),
                        json!({ "title": track.title, "user": next.requester.name }),
                    );
                    self.changed();
                }
                Err(e) if e.is_ambiguous_write() => {
                    let _ = self.store.transition(
                        &next.id,
                        &[RequestStatus::HandingOff],
                        RequestStatus::Uncertain,
                        now,
                        Some(("handoff_unclear", "Antwort von Spotify fehlt")),
                    );
                    self.activity.warn(
                        "request.uncertain",
                        format!("Übergabe von „{}“ unklar – wird abgeglichen, nicht wiederholt", track.title),
                        json!({ "title": track.title, "code": e.code() }),
                    );
                    self.changed();
                    return;
                }
                Err(e @ (ApiError::BadRequest { .. } | ApiError::NotFound | ApiError::Decode { .. })) => {
                    let _ = self.store.transition(
                        &next.id,
                        &[RequestStatus::HandingOff],
                        RequestStatus::Failed,
                        now,
                        Some(("handoff_failed", &e.to_string())),
                    );
                    self.activity.error(
                        "request.failed",
                        format!("„{}“ konnte nicht übergeben werden", track.title),
                        json!({ "title": track.title, "code": e.code() }),
                    );
                    self.changed();
                }
                Err(e) => {
                    // Vom Server abgelehnt oder nicht gesendet: sicher zurück in die lokale Queue.
                    let _ = self.store.transition(&next.id, &[RequestStatus::HandingOff], RequestStatus::Accepted, now, None);
                    tracing::info!(target: "queue", code = e.code(), "Übergabe zurückgestellt");
                    if matches!(e, ApiError::NoActiveDevice) {
                        self.activity.warn("spotify.no_device", "Kein aktives Spotify-Gerät – Übergabe wartet", json!({}));
                    }
                    self.changed();
                    return;
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Beobachtung und Abgleich
    // ------------------------------------------------------------------

    /// Verarbeitet einen neuen bestätigten Wiedergabezustand.
    pub async fn on_spotify_state(&self, st: &SpotifyState) {
        if !st.is_online() {
            return;
        }
        let now = self.now();
        let current = match &st.playback {
            PlaybackView::Active(pb) => pb.track.clone(),
            _ => None,
        };
        let current_uri = current.as_ref().map(|t| t.uri.clone());
        let track_changed = {
            let mut last = self.last_track_uri.lock().unwrap();
            let changed = *last != current_uri;
            *last = current_uri.clone();
            changed
        };
        let mut dirty = false;

        // Laufende Requests abschließen, wenn ein anderer Titel läuft.
        for r in self.store.by_status(RequestStatus::Playing) {
            if r.track.as_ref().map(|t| Some(&t.uri) != current_uri.as_ref()).unwrap_or(true) {
                dirty |= self.store.transition(&r.id, &[RequestStatus::Playing], RequestStatus::Completed, now, None).unwrap_or(false);
            }
        }

        let mut matched: Option<SongRequest> = None;
        if let Some(uri) = &current_uri {
            let mut handed: Vec<SongRequest> = self
                .store
                .pending()
                .into_iter()
                .filter(|r| matches!(r.status, RequestStatus::HandedOff | RequestStatus::Uncertain))
                .collect();
            handed.sort_by_key(|r| r.handoff_at.unwrap_or(i64::MAX));
            if let Some(idx) = handed.iter().position(|r| r.track.as_ref().map(|t| &t.uri) == Some(uri)) {
                let hit = handed[idx].clone();
                if self
                    .store
                    .transition(&hit.id, &[RequestStatus::HandedOff, RequestStatus::Uncertain], RequestStatus::Playing, now, None)
                    .unwrap_or(false)
                {
                    self.activity.info(
                        "request.playing",
                        format!("Läuft: „{}“ (Wunsch von {})", hit.track.as_ref().map(|t| t.title.as_str()).unwrap_or(""), hit.requester.name),
                        json!({ "user": hit.requester.name }),
                    );
                    dirty = true;
                }
                // Spotify spielt die Queue in Reihenfolge: früher übergebene sind vorbei.
                for older in handed[..idx].iter().filter(|r| r.status == RequestStatus::HandedOff) {
                    dirty |= self
                        .store
                        .transition(&older.id, &[RequestStatus::HandedOff], RequestStatus::Completed, now, Some(("not_observed", "Wiedergabe nicht beobachtet")))
                        .unwrap_or(false);
                }
                matched = Some(hit);
            }
        }

        if track_changed {
            if let Some(t) = &current {
                let _ = self.store.add_history(t, now, matched.as_ref());
                self.bus.changed(Topic::History);
            }
        }
        if dirty {
            self.changed();
        }
        self.process_offline_pending().await;
        self.reconcile().await;
        self.maybe_handoff().await;
    }

    /// Unklare Übergaben mit Spotifys Queue abgleichen. Nie blind erneut senden.
    pub async fn reconcile(&self) {
        let candidates: Vec<SongRequest> = self
            .store
            .by_status(RequestStatus::Uncertain)
            .into_iter()
            .filter(|r| matches!(r.reason.as_deref(), Some("handoff_unclear") | Some("crash_recovery")))
            .collect();
        if candidates.is_empty() || !self.spotify_online() {
            return;
        }
        let q = match self.spotify.queue().await {
            Ok(q) => q,
            Err(e) => {
                tracing::info!(target: "queue", code = e.code(), "Abgleich verschoben");
                return;
            }
        };
        let now = self.now();
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for u in &q.uris {
            *counts.entry(u.as_str()).or_insert(0) += 1;
        }
        let playing = q.currently_playing.as_ref().map(|t| t.uri.clone());
        for r in candidates {
            let Some(uri) = r.track.as_ref().map(|t| t.uri.as_str()) else { continue };
            if playing.as_deref() == Some(uri) {
                let _ = self.store.transition(&r.id, &[RequestStatus::Uncertain], RequestStatus::Playing, now, None);
            } else if let Some(c) = counts.get_mut(uri).filter(|c| **c > 0) {
                *c -= 1;
                let _ = self.store.transition(&r.id, &[RequestStatus::Uncertain], RequestStatus::HandedOff, now, None);
                self.activity.success("request.reconciled", "Unklare Übergabe bestätigt: Titel liegt in der Spotify-Queue", json!({ "id": r.id }));
            } else {
                let _ = self.store.transition(
                    &r.id,
                    &[RequestStatus::Uncertain],
                    RequestStatus::Uncertain,
                    now,
                    Some(("not_in_spotify_queue", "Nicht in der Spotify-Queue gefunden – bitte entscheiden")),
                );
                self.activity.warn(
                    "request.needs_decision",
                    "Übergabe nicht bestätigbar – bitte „Erneut übergeben“ oder „Erledigt“ wählen",
                    json!({ "id": r.id }),
                );
            }
        }
        self.changed();
    }

    /// Requests, die offline eingingen, jetzt prüfen.
    async fn process_offline_pending(&self) {
        let items: Vec<SongRequest> = self
            .store
            .by_status(RequestStatus::PendingReview)
            .into_iter()
            .filter(|r| r.pending_reason == Some(PendingReason::Offline))
            .collect();
        for r in items {
            if !self.spotify_online() {
                return;
            }
            let resolved = self.resolve(&r.query).await;
            if matches!(resolved, Resolve::Offline) {
                return;
            }
            let reply_to = r.chat_message_id.clone();
            let outcome = self.decide(r, resolved).await;
            if let Some(n) = self.notifier.get() {
                if let Some(text) = super::super::twitch::commands::reply_for_outcome(&cfg::read(&self.settings).commands.replies, &outcome) {
                    n.notify(text, reply_to);
                }
            }
        }
    }

    /// Nach App-Start: Zwischenzustände eines Absturzes auflösen.
    pub async fn recover_after_start(&self) {
        let now = self.now();
        let mut n = 0;
        for r in self.store.by_status(RequestStatus::HandingOff) {
            // Unklar, ob Spotify die Anfrage noch erhalten hat – abgleichen statt senden.
            if self
                .store
                .transition(&r.id, &[RequestStatus::HandingOff], RequestStatus::Uncertain, now, Some(("crash_recovery", "Übergabe beim Beenden unterbrochen")))
                .unwrap_or(false)
            {
                n += 1;
            }
        }
        for r in self.store.by_status(RequestStatus::Received) {
            // Vor dem Absturz nicht fertig geprüft: als „Prüfung ausstehend“ neu einplanen.
            let _ = self.store.transition(&r.id, &[RequestStatus::Received], RequestStatus::PendingReview, now, None);
            let _ = self.set_pending_reason(&r.id, PendingReason::Offline);
        }
        if n > 0 {
            self.activity.warn(
                "queue.recovered",
                format!("{n} Übergabe(n) wurden unterbrochen und werden mit Spotify abgeglichen"),
                json!({ "count": n }),
            );
        }
        self.changed();
    }

    pub fn session_summary(&self) -> HashMap<String, i64> {
        self.store.session_counts(self.session_started_ms).into_iter().collect()
    }
}
