//! Auswahl-Abläufe, Austausch eigener Wünsche, Vorprüfung und „zuletzt gespielt“.
//!
//! Alle Wege (Chat, Kanalpunkte, App) nutzen dieselbe Auflösung (`Resolver`), dieselbe
//! Regelprüfung (`QueueService::evaluate`) und dieselbe Annahme (`QueueService::decide`).

use super::rules::Rejection;
use super::service::{QueueService, Resolve, SESSION_GAP_MS};
use super::{ChoicePrompt, PendingReason, RequestStatus, Requester, SongRequest, Source, SubmitOutcome};
use crate::events::Topic;
use crate::model::Track;
use crate::queue::store::HistoryEntry;
use crate::resolve::matching::parse_title;
use crate::resolve::{MatchMethod, Origin, Resolution, ResolveError, SourceItem};
use crate::selection::{Purpose, RequestChoice, Selection, SelectionData, Stage, MAX_LOADED};
use crate::settings::{self as cfg, Role};
use serde::Serialize;
use serde_json::json;

/// Ergebnis eines Chat- bzw. App-Vorgangs rund um Auswahl und Austausch.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "flow", rename_all = "snake_case")]
pub enum ChatFlow {
    /// Neuer Wunsch wurde entschieden (angenommen, Moderation, abgelehnt …).
    Outcome { outcome: SubmitOutcome },
    /// Auswahl anzeigen (Version, Playlist-Seite, eigener Wunsch).
    Prompt { prompt: ChoicePrompt },
    /// Austausch erfolgreich; Platz bleibt erhalten.
    Replaced { request: SongRequest },
    /// Austausch nicht möglich – der bisherige Wunsch bleibt unverändert.
    ReplaceFailed { code: String, text: String },
    /// Kurzer Hinweis ohne Zustandsänderung.
    Notice { notice: Notice },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum Notice {
    NoSelection,
    Invalid,
    Canceled,
    LastPage,
    ReplaceNothing,
    ReplaceLocked,
    ReplaceSame,
    /// Gewählter Playlist-Eintrag ließ sich nicht verwenden; Auswahl bleibt offen.
    ItemFailed { text: String },
}

/// Ergebnis der Vorprüfung (reserviert nichts und löst keine Spotify-Aktion aus).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Verdict {
    pub ok: bool,
    pub blocking: Option<Issue>,
    pub notices: Vec<Issue>,
    pub moderation: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Issue {
    pub code: String,
    pub text: String,
}

fn mmss(ms: u64) -> String {
    let s = ms / 1000;
    format!("{}:{:02}", s / 60, s % 60)
}

/// „Titel – Interpret (Version, 3:20)“ – kurz, aber unterscheidbar.
pub fn track_label(t: &Track) -> String {
    let p = parse_title(&t.title);
    let v = match &p.version.remixer {
        Some(r) if p.version.tags.contains(&crate::resolve::matching::Tag::Remix) => {
            let name: String = r.split(' ').map(|w| {
                let mut c = w.chars();
                c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
            }).collect::<Vec<_>>().join(" ");
            format!("{name} Remix")
        }
        _ => p.version.label(),
    };
    let explicit = if t.explicit { ", E" } else { "" };
    format!("{} – {} ({v}, {}{explicit})", p.title, t.artists.first().cloned().unwrap_or_default(), mmss(t.duration_ms))
}

fn item_label(i: &SourceItem) -> String {
    if !i.available {
        return format!("{} (nicht verfügbar)", i.display());
    }
    match (&i.spotify, i.duration_ms) {
        (Some(t), _) => track_label(t),
        (None, Some(d)) => format!("{} ({})", i.display(), mmss(d)),
        (None, None) => i.display(),
    }
}

impl QueueService {
    fn timeout_ms(&self) -> i64 {
        cfg::read(self.settings()).sources.selection_timeout_s as i64 * 1000
    }

    fn page_size(&self, channel: &str) -> u32 {
        if channel == crate::selection::LOCAL_CHANNEL {
            20
        } else {
            cfg::read(self.settings()).sources.chat_page_size
        }
    }

    /// Anzeige für eine Sitzung.
    pub fn prompt_for(&self, sel: &Selection) -> ChoicePrompt {
        let d = &sel.data;
        let (options, name) = match sel.stage {
            Stage::Version => (d.versions.iter().map(track_label).collect(), None),
            Stage::Collection => (d.page_items().iter().map(item_label).collect(), d.collection.as_ref().and_then(|c| c.name.clone())),
            Stage::PickRequest => (d.requests.iter().map(|r| r.label.clone()).collect(), None),
        };
        ChoicePrompt {
            selection_id: sel.id.clone(),
            stage: sel.stage,
            name,
            page: d.page + 1,
            pages: if sel.stage == Stage::Collection { d.pages() } else { None },
            options,
            playlist_hint: d.origin.as_ref().and_then(|o| o.playlist_hint.clone()),
        }
    }

    fn selection_data(&self, req: &SongRequest, choice: &Resolution, channel: &str) -> Option<(Stage, SelectionData)> {
        let mut d = SelectionData {
            input: req.query.clone(),
            page_size: self.page_size(channel),
            source: Some(req.source),
            role: Some(req.requester.role),
            chat_message_id: req.chat_message_id.clone(),
            ..Default::default()
        };
        match choice {
            Resolution::Versions { origin, options } => {
                d.origin = Some(origin.clone());
                d.versions = options.clone();
                Some((Stage::Version, d))
            }
            Resolution::Collection { collection, page } => {
                d.collection = Some(collection.clone());
                d.loaded = page.items.clone();
                d.next_cursor = page.next.clone();
                Some((Stage::Collection, d))
            }
            _ => None,
        }
    }

    /// Neuen Wunsch in „Auswahl offen“ versetzen und die Auswahl anlegen.
    pub(crate) async fn open_new_selection(&self, req: SongRequest, choice: Resolution) -> SubmitOutcome {
        let _g = self.select_lock.lock().await;
        let now = self.clock_now();
        let channel = self.channel();
        let Some((stage, data)) = self.selection_data(&req, &choice, &channel) else {
            return self.decide(req, Resolve::Rejected(Rejection::NotFound), false).await;
        };
        if data.versions.is_empty() && data.loaded.is_empty() {
            let e = match &choice {
                Resolution::Collection { collection, .. } => ResolveError::NotAccessible { provider: collection.r.provider },
                _ => ResolveError::NotFound,
            };
            return self.decide(req, Resolve::Rejected(Rejection::Resolve { error: e }), false).await;
        }
        let from = self.store.get(&req.id).map(|r| r.status).unwrap_or(RequestStatus::Received);
        if !self.store.transition(&req.id, &[from], RequestStatus::AwaitingSelection, now, None).unwrap_or(false) {
            return SubmitOutcome::Duplicate;
        }
        let sel = Selection {
            id: uuid::Uuid::new_v4().to_string(),
            channel,
            user_id: req.requester.id.clone(),
            user_name: req.requester.name.clone(),
            purpose: Purpose::New,
            stage,
            request_id: Some(req.id.clone()),
            data,
            state: "open".into(),
            created_at: now,
            expires_at: now + self.timeout_ms(),
        };
        match self.selections.insert(&sel, now) {
            Ok(Some(old)) => self.drop_selection(&old, Rejection::SelectionReplaced),
            Ok(None) => {}
            Err(e) => {
                tracing::error!(target: "queue", error = %e, "Auswahl konnte nicht gespeichert werden");
                return self.decide(req, Resolve::Rejected(Rejection::Technical { detail: "storage".into() }), false).await;
            }
        }
        self.activity().info(
            "request.awaiting_selection",
            format!("{} wählt noch aus ({} Optionen)", req.requester.name, sel.data.versions.len().max(sel.data.loaded.len())),
            json!({ "user": req.requester.name }),
        );
        self.notify_changed();
        let request = self.store.get(&req.id).unwrap_or(req);
        SubmitOutcome::NeedsChoice { prompt: self.prompt_for(&sel), request }
    }

    /// Beendete/ersetzte Sitzung aufräumen: wartender neuer Wunsch wird abgelehnt (bei
    /// Kanalpunkten folgt die Erstattung über die normale Abwicklung).
    fn drop_selection(&self, sel: &Selection, why: Rejection) {
        if sel.purpose != Purpose::New {
            return;
        }
        let Some(id) = &sel.request_id else { return };
        let now = self.clock_now();
        let _ = self.store.transition(id, &[RequestStatus::AwaitingSelection], RequestStatus::Rejected, now, Some((why.code(), &why.text())));
        self.notify_changed();
    }

    /// Abgelaufene Auswahlen beenden; betroffene Zuschauer bekommen einen Hinweis.
    pub async fn sweep_selections(&self) {
        let _g = self.select_lock.lock().await;
        self.sweep_locked();
    }

    fn sweep_locked(&self) {
        let now = self.clock_now();
        for sel in self.selections.expired(now) {
            if !self.selections.finish(&sel.id, "expired", now).unwrap_or(false) {
                continue;
            }
            self.drop_selection(&sel, Rejection::SelectionExpired);
            let replies = cfg::read(self.settings()).commands.replies.clone();
            let mut text = crate::twitch::commands::fill(&replies.selection_expired, &[("user", sel.user_name.clone())]);
            let req = sel.request_id.as_deref().and_then(|id| self.store.get(id));
            if sel.purpose == Purpose::New && req.as_ref().is_some_and(|r| r.redemption.is_some()) && !replies.points_refund.trim().is_empty() {
                text.push_str(&replies.points_refund);
            }
            if sel.channel != crate::selection::LOCAL_CHANNEL {
                self.chat(text, sel.data.chat_message_id.clone());
            }
        }
        // Verwaiste wartende Wünsche (z. B. nach Datenverlust der Sitzung) nicht festhalten.
        for r in self.store.awaiting() {
            if self.selections.for_request(&r.id).is_none() {
                let _ = self.store.transition(&r.id, &[RequestStatus::AwaitingSelection], RequestStatus::Rejected, now, Some((Rejection::SelectionExpired.code(), &Rejection::SelectionExpired.text())));
                self.notify_changed();
            }
        }
    }

    fn open_selection(&self, channel: &str, user_id: &str) -> Option<Selection> {
        self.sweep_locked();
        self.selections.open_for(channel, user_id, self.clock_now())
    }

    /// `!auswahl N`
    pub async fn choose(&self, channel: &str, requester: &Requester, n: usize) -> ChatFlow {
        let _g = self.select_lock.lock().await;
        let Some(mut sel) = self.open_selection(channel, &requester.id) else { return ChatFlow::Notice { notice: Notice::NoSelection } };
        let now = self.clock_now();
        match sel.stage {
            Stage::Version => {
                let Some(track) = n.checked_sub(1).and_then(|i| sel.data.versions.get(i)).cloned() else {
                    return ChatFlow::Notice { notice: Notice::Invalid };
                };
                let mut origin = sel.data.origin.clone().unwrap_or_else(|| Origin {
                    provider: None,
                    url: None,
                    title: None,
                    artists: vec![],
                    duration_ms: None,
                    isrc: None,
                    method: MatchMethod::UserChoice,
                    collection: None,
                    playlist_hint: None,
                });
                origin.method = MatchMethod::UserChoice;
                if let Some(c) = &sel.data.collection {
                    origin.collection = Some(c.url.clone());
                }
                if !self.selections.finish(&sel.id, "done", now).unwrap_or(false) {
                    return ChatFlow::Notice { notice: Notice::NoSelection };
                }
                self.complete(&sel, track, origin, requester).await
            }
            Stage::Collection => {
                let Some(item) = n.checked_sub(1).and_then(|i| sel.data.page_items().get(i)).cloned() else {
                    return ChatFlow::Notice { notice: Notice::Invalid };
                };
                if !item.available {
                    return ChatFlow::Notice { notice: Notice::ItemFailed { text: "dieser Eintrag ist nicht verfügbar – wähle einen anderen".into() } };
                }
                let coll_url = sel.data.collection.as_ref().map(|c| c.url.clone());
                match self.resolver.match_item(&item).await {
                    Resolution::Track { track, mut origin } => {
                        origin.method = MatchMethod::UserChoice;
                        origin.collection = coll_url;
                        if !self.selections.finish(&sel.id, "done", now).unwrap_or(false) {
                            return ChatFlow::Notice { notice: Notice::NoSelection };
                        }
                        self.complete(&sel, track, origin, requester).await
                    }
                    Resolution::Versions { mut origin, options } => {
                        // Zweite, eindeutig getrennte Stufe: Spotify-Version bestätigen.
                        origin.collection = coll_url;
                        sel.data.origin = Some(origin);
                        sel.data.versions = options;
                        sel.data.from_collection = true;
                        let exp = now + self.timeout_ms();
                        if !self.selections.update(&sel.id, Stage::Version, &sel.data, exp, now).unwrap_or(false) {
                            return ChatFlow::Notice { notice: Notice::NoSelection };
                        }
                        sel.stage = Stage::Version;
                        ChatFlow::Prompt { prompt: self.prompt_for(&sel) }
                    }
                    Resolution::Failed { error } => ChatFlow::Notice { notice: Notice::ItemFailed { text: error.text() } },
                    Resolution::Collection { .. } => ChatFlow::Notice { notice: Notice::Invalid },
                }
            }
            Stage::PickRequest => {
                let Some(choice) = n.checked_sub(1).and_then(|i| sel.data.requests.get(i)).cloned() else {
                    return ChatFlow::Notice { notice: Notice::Invalid };
                };
                if !self.selections.finish(&sel.id, "done", now).unwrap_or(false) {
                    return ChatFlow::Notice { notice: Notice::NoSelection };
                }
                let input = sel.data.input.clone();
                self.replace_target(channel, requester, &choice.id, &input, false).await
            }
        }
    }

    /// Auswahl abschließen: neuer Wunsch → normale Annahme; Austausch → atomarer Austausch.
    async fn complete(&self, sel: &Selection, track: Track, origin: Origin, requester: &Requester) -> ChatFlow {
        match sel.purpose {
            Purpose::New => {
                let Some(req) = sel.request_id.as_deref().and_then(|id| self.store.get(id)) else {
                    return ChatFlow::Notice { notice: Notice::NoSelection };
                };
                if req.status != RequestStatus::AwaitingSelection {
                    return ChatFlow::Notice { notice: Notice::NoSelection };
                }
                let outcome = self.decide(req, Resolve::Found(track, Some(origin)), true).await;
                self.after_accept();
                ChatFlow::Outcome { outcome }
            }
            Purpose::Replace => {
                let Some(target) = sel.request_id.clone() else { return ChatFlow::Notice { notice: Notice::ReplaceNothing } };
                let admin = sel.channel == crate::selection::LOCAL_CHANNEL && requester.role == Role::Broadcaster;
                self.commit_replace(&target, track, origin, requester, &sel.data.input, admin).await
            }
        }
    }

    fn after_accept(&self) {
        // Übergabe anstoßen, ohne den Aufrufer (Chat) warten zu lassen, erfolgt über den Beobachter.
        self.notify_changed();
    }

    /// `!weiter` / `!zurueck`
    pub async fn page_step(&self, channel: &str, requester: &Requester, forward: bool) -> ChatFlow {
        let _g = self.select_lock.lock().await;
        let Some(mut sel) = self.open_selection(channel, &requester.id) else { return ChatFlow::Notice { notice: Notice::NoSelection } };
        let now = self.clock_now();
        // In der Versionsauswahl eines Playlist-Titels führt „zurück“ zur Liste.
        if sel.stage == Stage::Version && sel.data.from_collection && !forward {
            sel.data.versions.clear();
            sel.data.from_collection = false;
            let exp = now + self.timeout_ms();
            let _ = self.selections.update(&sel.id, Stage::Collection, &sel.data, exp, now);
            sel.stage = Stage::Collection;
            return ChatFlow::Prompt { prompt: self.prompt_for(&sel) };
        }
        if sel.stage != Stage::Collection {
            return ChatFlow::Prompt { prompt: self.prompt_for(&sel) };
        }
        let size = sel.data.page_size.max(1) as usize;
        if forward {
            let next_start = (sel.data.page as usize + 1) * size;
            if next_start >= sel.data.loaded.len() {
                let Some(cursor) = sel.data.next_cursor.clone().filter(|_| sel.data.loaded.len() < MAX_LOADED) else {
                    return ChatFlow::Notice { notice: Notice::LastPage };
                };
                let Some(coll) = sel.data.collection.clone() else { return ChatFlow::Notice { notice: Notice::LastPage } };
                match self.resolver.page(&coll.r, Some(&cursor)).await {
                    Ok((_, page)) => {
                        sel.data.loaded.extend(page.items);
                        sel.data.loaded.truncate(MAX_LOADED);
                        sel.data.next_cursor = page.next;
                    }
                    Err(e) => return ChatFlow::Notice { notice: Notice::ItemFailed { text: e.text() } },
                }
                if next_start >= sel.data.loaded.len() {
                    return ChatFlow::Notice { notice: Notice::LastPage };
                }
            }
            sel.data.page += 1;
        } else {
            sel.data.page = sel.data.page.saturating_sub(1);
        }
        let exp = now + self.timeout_ms();
        if !self.selections.update(&sel.id, Stage::Collection, &sel.data, exp, now).unwrap_or(false) {
            return ChatFlow::Notice { notice: Notice::NoSelection };
        }
        ChatFlow::Prompt { prompt: self.prompt_for(&sel) }
    }

    /// `!abbrechen`
    pub async fn cancel_selection(&self, channel: &str, requester: &Requester) -> ChatFlow {
        let _g = self.select_lock.lock().await;
        let Some(sel) = self.open_selection(channel, &requester.id) else { return ChatFlow::Notice { notice: Notice::NoSelection } };
        if self.selections.finish(&sel.id, "canceled", self.clock_now()).unwrap_or(false) {
            self.drop_selection(&sel, Rejection::SelectionCanceled);
        }
        ChatFlow::Notice { notice: Notice::Canceled }
    }

    /// Offene Auswahl in der App (Streamer).
    pub fn local_selection(&self) -> Option<Selection> {
        self.selections.open_for(crate::selection::LOCAL_CHANNEL, &Requester::streamer().id, self.clock_now())
    }

    // ------------------------------------------------------------------
    // Austausch eigener Wünsche
    // ------------------------------------------------------------------

    /// `!ersetzen <Link oder Suchtext>` bzw. „Song ändern“.
    /// `target`: bestimmter Request (App: Verwaltungsrechte; Chat: eigene Auswahl).
    pub async fn replace(&self, channel: &str, requester: &Requester, input: &str, target: Option<&str>) -> ChatFlow {
        let input = input.trim();
        if input.is_empty() {
            return ChatFlow::ReplaceFailed { code: "not_found".into(), text: Rejection::NotFound.text() };
        }
        let admin = requester.role == Role::Broadcaster && channel == crate::selection::LOCAL_CHANNEL;
        if let Some(id) = target {
            return self.replace_target(channel, requester, id, input, admin).await;
        }
        let own: Vec<SongRequest> = self.store.pending().into_iter().filter(|r| r.requester.id == requester.id).collect();
        let replaceable: Vec<&SongRequest> = own.iter().filter(|r| r.status.is_replaceable()).collect();
        match replaceable.len() {
            0 if own.iter().any(|r| matches!(r.status, RequestStatus::HandingOff | RequestStatus::HandedOff | RequestStatus::Playing | RequestStatus::Uncertain)) => {
                ChatFlow::Notice { notice: Notice::ReplaceLocked }
            }
            0 => ChatFlow::Notice { notice: Notice::ReplaceNothing },
            1 => {
                let id = replaceable[0].id.clone();
                self.replace_target(channel, requester, &id, input, admin).await
            }
            _ => {
                // Mehrere eigene Wünsche: zuerst wählen, welcher ersetzt werden soll (stabile IDs).
                let _g = self.select_lock.lock().await;
                let now = self.clock_now();
                let data = SelectionData {
                    input: input.to_string(),
                    page_size: self.page_size(channel),
                    requests: replaceable
                        .iter()
                        .map(|r| RequestChoice { id: r.id.clone(), label: r.track.as_ref().map(|t| format!("{} – {}", t.title, t.artists.first().cloned().unwrap_or_default())).unwrap_or_else(|| r.query.clone()) })
                        .collect(),
                    ..Default::default()
                };
                let sel = Selection {
                    id: uuid::Uuid::new_v4().to_string(),
                    channel: channel.to_string(),
                    user_id: requester.id.clone(),
                    user_name: requester.name.clone(),
                    purpose: Purpose::Replace,
                    stage: Stage::PickRequest,
                    request_id: None,
                    data,
                    state: "open".into(),
                    created_at: now,
                    expires_at: now + self.timeout_ms(),
                };
                match self.selections.insert(&sel, now) {
                    Ok(old) => {
                        if let Some(old) = old {
                            self.drop_selection(&old, Rejection::SelectionReplaced);
                        }
                        ChatFlow::Prompt { prompt: self.prompt_for(&sel) }
                    }
                    Err(_) => ChatFlow::ReplaceFailed { code: "storage".into(), text: "interner Fehler".into() },
                }
            }
        }
    }

    /// Neuen Song für einen bestimmten Wunsch auflösen. Der ursprüngliche Wunsch bleibt während
    /// Suche, Auswahl und Prüfung vollständig erhalten.
    async fn replace_target(&self, channel: &str, requester: &Requester, target_id: &str, input: &str, admin: bool) -> ChatFlow {
        let Some(target) = self.store.get(target_id) else { return ChatFlow::Notice { notice: Notice::ReplaceNothing } };
        if !admin && target.requester.id != requester.id {
            return ChatFlow::Notice { notice: Notice::ReplaceNothing };
        }
        if !target.status.is_replaceable() {
            return ChatFlow::Notice { notice: if target.status.is_final() { Notice::ReplaceNothing } else { Notice::ReplaceLocked } };
        }
        if !self.spotify_online() {
            return ChatFlow::ReplaceFailed { code: "spotify_offline".into(), text: ResolveError::SpotifyOffline.text() };
        }
        match self.resolver.resolve(input).await {
            Resolution::Track { track, origin } => self.commit_replace(target_id, track, origin, requester, input, admin).await,
            choice @ (Resolution::Versions { .. } | Resolution::Collection { .. }) => {
                let _g = self.select_lock.lock().await;
                let now = self.clock_now();
                let mut probe = target.clone();
                probe.query = input.to_string();
                probe.chat_message_id = None;
                let Some((stage, mut data)) = self.selection_data(&probe, &choice, channel) else {
                    return ChatFlow::ReplaceFailed { code: "not_found".into(), text: Rejection::NotFound.text() };
                };
                data.role = Some(requester.role);
                if data.versions.is_empty() && data.loaded.is_empty() {
                    return ChatFlow::ReplaceFailed { code: "not_found".into(), text: Rejection::NotFound.text() };
                }
                let sel = Selection {
                    id: uuid::Uuid::new_v4().to_string(),
                    channel: channel.to_string(),
                    user_id: requester.id.clone(),
                    user_name: requester.name.clone(),
                    purpose: Purpose::Replace,
                    stage,
                    request_id: Some(target_id.to_string()),
                    data,
                    state: "open".into(),
                    created_at: now,
                    expires_at: now + self.timeout_ms(),
                };
                match self.selections.insert(&sel, now) {
                    Ok(old) => {
                        if let Some(old) = old {
                            self.drop_selection(&old, Rejection::SelectionReplaced);
                        }
                        ChatFlow::Prompt { prompt: self.prompt_for(&sel) }
                    }
                    Err(_) => ChatFlow::ReplaceFailed { code: "storage".into(), text: "interner Fehler".into() },
                }
            }
            Resolution::Failed { error } => ChatFlow::ReplaceFailed { code: error.code().into(), text: error.text() },
        }
    }

    /// Atomarer Austausch unter der Annahmesperre. Gleiche Identität, gleicher Eingangszeitpunkt,
    /// gleiche Position; kein zusätzlicher Platz, keine neuen Kanalpunkte; alle Regeln erneut
    /// geprüft (der eigene alte Eintrag wird dabei herausgerechnet). Scheitert irgendetwas,
    /// bleibt der ursprüngliche Wunsch unverändert.
    pub(crate) async fn commit_replace(&self, target_id: &str, track: Track, origin: Origin, requester: &Requester, input: &str, admin: bool) -> ChatFlow {
        let _g = self.decide_lock_guard().await;
        let now = self.clock_now();
        let Some(target) = self.store.get(target_id) else { return ChatFlow::Notice { notice: Notice::ReplaceNothing } };
        if !admin && target.requester.id != requester.id {
            return ChatFlow::Notice { notice: Notice::ReplaceNothing };
        }
        if !target.status.is_replaceable() {
            return ChatFlow::Notice { notice: if target.status.is_final() { Notice::ReplaceNothing } else { Notice::ReplaceLocked } };
        }
        if target.track.as_ref().is_some_and(|t| t.uri == track.uri) {
            return ChatFlow::Notice { notice: Notice::ReplaceSame };
        }
        // Prüfung wie bei einem neuen Wunsch – aber als dieser Request (Limits/Duplikate/Zeitbudget
        // ohne den alten Song), ohne Cooldown (ein Austausch ist kein neuer Wunsch).
        let mut probe = target.clone();
        if admin {
            probe.requester.role = Role::Broadcaster;
        }
        let rules = cfg::read(self.settings()).requests.clone();
        let block = self.store.blocklist();
        let check = (|| -> Result<bool, Rejection> {
            if !admin && probe.source != Source::App {
                self.gate_check(probe.source)?;
            }
            let stats = self.store.stats(&probe.requester.id, Some(&track.uri), &probe.id);
            let mut limits_only = rules.clone();
            limits_only.user_cooldown_s = 0;
            limits_only.global_cooldown_s = 0;
            super::rules::check_requester(&limits_only, &block, &probe.requester.id, &probe.requester.name, probe.requester.role, &stats, now, probe.source == Source::ChannelPoints)?;
            super::rules::check_track(&rules, &block, &track, probe.requester.role, &stats)?;
            if !admin {
                self.check_plan_fit(&probe, &track)?;
            }
            let mode = if probe.source == Source::ChannelPoints { cfg::read(self.settings()).channel_points.mode } else { rules.mode };
            Ok(mode == crate::settings::AcceptMode::Moderation && probe.requester.role != Role::Broadcaster)
        })();
        let moderated = match check {
            Ok(m) => m,
            Err(r) => return ChatFlow::ReplaceFailed { code: r.code().into(), text: r.text() },
        };
        // Ein anderer Song darf eine nötige Freigabe nicht umgehen; tauscht der Streamer selbst,
        // bleibt eine offene Moderationsfreigabe offen, sonst gilt der Wunsch als angenommen.
        let (to, pending) = if admin {
            match (target.status, target.pending_reason) {
                (RequestStatus::PendingReview, Some(PendingReason::Moderation)) => (RequestStatus::PendingReview, Some(PendingReason::Moderation)),
                _ => (RequestStatus::Accepted, None),
            }
        } else if moderated {
            (RequestStatus::PendingReview, Some(PendingReason::Moderation))
        } else {
            (RequestStatus::Accepted, None)
        };
        let query: String = input.chars().take(200).collect();
        match self.store.replace_track(target_id, target.rev, &track, &query, Some(&origin), to, pending, now) {
            Ok(true) => {}
            Ok(false) => return ChatFlow::Notice { notice: Notice::ReplaceLocked },
            Err(e) => return ChatFlow::ReplaceFailed { code: "storage".into(), text: e },
        }
        let old_title = target.track.as_ref().map(|t| t.title.clone()).unwrap_or(target.query.clone());
        self.activity().info(
            "request.replaced",
            format!("{} hat „{}“ durch „{}“ ersetzt – Platz bleibt erhalten", target.requester.name, old_title, track.title),
            json!({ "user": target.requester.name, "from": old_title, "to": track.title, "id": target.id }),
        );
        self.notify_changed();
        match self.store.get(target_id) {
            Some(r) => ChatFlow::Replaced { request: r },
            None => ChatFlow::Notice { notice: Notice::ReplaceNothing },
        }
    }

    // ------------------------------------------------------------------
    // Vorprüfung
    // ------------------------------------------------------------------

    /// Prüft, ob ein bestimmter Titel angenommen würde – ohne etwas zu reservieren oder an
    /// Spotify zu übergeben. Dieselben Regeln wie bei der Annahme.
    pub fn precheck_track(&self, track: &Track, requester: &Requester, source: Source, replace_target: Option<&str>) -> Verdict {
        let now = self.clock_now();
        let mut probe = match replace_target.and_then(|id| self.store.get(id)) {
            Some(t) => t,
            None => SongRequest {
                id: String::new(),
                track: None,
                query: String::new(),
                requester: requester.clone(),
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
                redemption: None,
                origin: None,
                rev: 0,
            },
        };
        probe.received_at = now;
        let mut notices = Vec::new();
        if let Some(dup) = self.store.pending_with_track(&track.uri, replace_target) {
            let pos = self.display_position(&dup.id);
            notices.push(Issue { code: "duplicate_position".into(), text: if pos > 0 { format!("Bereits auf Platz {pos}") } else { "Bereits in der Warteschlange".into() } });
        }
        if replace_target.is_some_and(|id| self.store.get(id).and_then(|r| r.track).is_some_and(|t| t.uri == track.uri)) {
            notices.push(Issue { code: "replace_same".into(), text: "Das ist bereits dieser Wunsch".into() });
        }
        if source == Source::App && self.gate_check(Source::Chat).is_err() {
            notices.push(Issue { code: "closed".into(), text: "Requests sind gerade pausiert (du kannst trotzdem hinzufügen)".into() });
        }
        let eval = if replace_target.is_some() {
            // Wie beim Austausch: ohne Cooldown.
            let mut r = cfg::read(self.settings()).requests.clone();
            r.user_cooldown_s = 0;
            r.global_cooldown_s = 0;
            let block = self.store.blocklist();
            let stats = self.store.stats(&probe.requester.id, Some(&track.uri), &probe.id);
            super::rules::check_requester(&r, &block, &probe.requester.id, &probe.requester.name, probe.requester.role, &stats, now, probe.source == Source::ChannelPoints)
                .and_then(|_| super::rules::check_track(&r, &block, track, probe.requester.role, &stats))
                .map(|_| false)
        } else {
            self.evaluate(&probe, track, true, false)
        };
        match eval {
            Ok(moderation) => {
                if moderation {
                    notices.push(Issue { code: "moderation".into(), text: "Freigabe durch einen Moderator erforderlich".into() });
                }
                Verdict { ok: true, blocking: None, notices, moderation }
            }
            Err(r) => {
                let text = match &r {
                    Rejection::Duplicate => notices.iter().find(|n| n.code == "duplicate_position").map(|n| n.text.clone()).unwrap_or(r.text()),
                    Rejection::UserLimit { limit: 1 } => "Du hast noch einen offenen Wunsch".into(),
                    Rejection::TooLong { max_s } => format!("Maximal {} Minuten erlaubt", max_s.div_ceil(60)),
                    Rejection::Closed | Rejection::UpdatePause => "Requests sind gerade pausiert".into(),
                    _ => capitalize(&r.text()),
                };
                Verdict { ok: false, blocking: Some(Issue { code: r.code().into(), text }), notices, moderation: false }
            }
        }
    }

    // ------------------------------------------------------------------
    // Verlauf „zuletzt gespielt“
    // ------------------------------------------------------------------

    /// Bestätigten Titelwechsel dauerhaft festhalten (einmal pro tatsächlicher Wiedergabe).
    pub(crate) fn record_play(&self, t: &Track, now: i64, req: Option<&SongRequest>) {
        let channel = self.channel();
        let first = std::mem::replace(&mut *self.first_observation_lock(), false);
        if first {
            // Nach einem Neustart läuft oft noch derselbe Titel – kein zweiter Eintrag.
            if let Some((sid, _)) = self.store.current_session(&channel, now, SESSION_GAP_MS) {
                if let Some(last) = self.store.session_history(sid, 1).into_iter().next() {
                    if last.track.uri == t.uri && now - last.played_at <= last.track.duration_ms as i64 + 120_000 {
                        let _ = self.store.session_for(&channel, now, SESSION_GAP_MS);
                        return;
                    }
                }
            }
        }
        match self.store.session_for(&channel, now, SESSION_GAP_MS) {
            Ok(sid) => {
                let _ = self.store.add_session_history(t, now, req, sid, &channel);
            }
            Err(e) => tracing::warn!(target: "queue", error = %e, "Verlauf nicht gespeichert"),
        }
        self.bus_changed(Topic::History);
    }

    /// Bis zu `n` zuvor gespielte Titel der laufenden Session, neueste zuerst; der gerade
    /// laufende Titel ist ausgenommen.
    pub fn last_played(&self, n: usize) -> Vec<HistoryEntry> {
        let now = self.clock_now();
        let Some((sid, _)) = self.store.current_session(&self.channel(), now, SESSION_GAP_MS) else { return vec![] };
        let mut list = self.store.session_history(sid, (n + 1) as u32);
        let current = match &self.spotify_state().playback {
            crate::model::PlaybackView::Active(p) => p.track.as_ref().map(|t| t.uri.clone()),
            _ => None,
        };
        if let (Some(first), Some(cur)) = (list.first(), current.as_ref()) {
            if &first.track.uri == cur {
                list.remove(0);
            }
        }
        list.truncate(n);
        list
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}
