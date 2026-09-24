//! Transaktionale Persistenz der Requests. Statuswechsel sind Compare-and-Set:
//! Ein veralteter Vorgang kann einen neueren Zustand nicht überschreiben.

use super::rules::{Blocklist, QueueStats};
use super::{PendingReason, RequestStatus, Requester, SongRequest, Source};
use crate::model::{Provider, Track};
use crate::settings::Role;
use crate::storage::{Db, DbResult};
use rusqlite::{params, OptionalExtension, Row};

const COLS: &str = "id, track_id, track_uri, title, artists, album, image_url, duration_ms, explicit, query, \
requester_id, requester_name, requester_role, source, source_event, received_at, status, pending_reason, reason, \
position, priority, updated_at, handoff_at, observed_at, finished_at, chat_message_id";

fn role_str(r: Role) -> &'static str {
    match r {
        Role::Everyone => "everyone",
        Role::Subscriber => "subscriber",
        Role::Vip => "vip",
        Role::Moderator => "moderator",
        Role::Broadcaster => "broadcaster",
    }
}

fn role_parse(s: &str) -> Role {
    match s {
        "subscriber" => Role::Subscriber,
        "vip" => Role::Vip,
        "moderator" => Role::Moderator,
        "broadcaster" => Role::Broadcaster,
        _ => Role::Everyone,
    }
}

fn pending_str(p: Option<PendingReason>) -> Option<&'static str> {
    p.map(|p| match p {
        PendingReason::Moderation => "moderation",
        PendingReason::Offline => "offline",
    })
}

/// Grund-Code und optionaler Text werden als `code|text` gespeichert.
fn split_reason(raw: Option<String>) -> (Option<String>, Option<String>) {
    match raw {
        None => (None, None),
        Some(r) => match r.split_once('|') {
            Some((c, t)) => (Some(c.to_string()), (!t.is_empty()).then(|| t.to_string())),
            None => (Some(r), None),
        },
    }
}

fn from_row(r: &Row) -> rusqlite::Result<SongRequest> {
    let track_id: Option<String> = r.get(1)?;
    let track = match track_id {
        Some(id) => {
            let artists: String = r.get(4)?;
            Some(Track {
                provider: Provider::Spotify,
                id,
                uri: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                title: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                artists: serde_json::from_str(&artists).unwrap_or_default(),
                album: r.get(5)?,
                image_url: r.get(6)?,
                duration_ms: r.get::<_, Option<i64>>(7)?.unwrap_or(0) as u64,
                explicit: r.get::<_, i64>(8)? != 0,
                external_url: None,
            })
        }
        None => None,
    };
    let pending: Option<String> = r.get(17)?;
    let (reason, reason_text) = split_reason(r.get(18)?);
    Ok(SongRequest {
        id: r.get(0)?,
        track,
        query: r.get(9)?,
        requester: Requester { id: r.get(10)?, name: r.get(11)?, role: role_parse(&r.get::<_, String>(12)?) },
        source: Source::parse(&r.get::<_, String>(13)?),
        source_event: r.get(14)?,
        received_at: r.get(15)?,
        status: RequestStatus::parse(&r.get::<_, String>(16)?),
        pending_reason: pending.as_deref().map(|p| if p == "offline" { PendingReason::Offline } else { PendingReason::Moderation }),
        reason,
        reason_text,
        position: r.get(19)?,
        priority: r.get::<_, i64>(20)? != 0,
        updated_at: r.get(21)?,
        handoff_at: r.get(22)?,
        observed_at: r.get(23)?,
        finished_at: r.get(24)?,
        chat_message_id: r.get(25)?,
    })
}

#[derive(Clone)]
pub struct QueueStore {
    db: Db,
}

impl QueueStore {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    pub fn db(&self) -> &Db {
        &self.db
    }

    /// Prüft, ob ein Provider-Ereignis bereits verarbeitet wurde, und markiert es
    /// atomar. `true` = neu.
    pub fn claim_event(&self, source: &str, event_id: &str, now: i64) -> DbResult<bool> {
        let n = self
            .db
            .conn()
            .execute(
                "INSERT OR IGNORE INTO processed_events(source, event_id, created_at) VALUES (?1, ?2, ?3)",
                params![source, event_id, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
    }

    /// Legt einen Request an und markiert – falls vorhanden – das auslösende
    /// Provider-Ereignis in derselben Transaktion. `false` = Ereignis war schon bekannt.
    pub fn insert_with_event(&self, r: &SongRequest, source: &str, now: i64) -> DbResult<bool> {
        let mut c = self.db.conn();
        let tx = c.transaction().map_err(|e| e.to_string())?;
        if let Some(ev) = &r.source_event {
            let n = tx
                .execute(
                    "INSERT OR IGNORE INTO processed_events(source, event_id, created_at) VALUES (?1, ?2, ?3)",
                    params![source, ev, now],
                )
                .map_err(|e| e.to_string())?;
            if n == 0 {
                return Ok(false);
            }
        }
        Self::insert_on(&tx, r)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(true)
    }

    pub fn insert(&self, r: &SongRequest) -> DbResult<()> {
        let c = self.db.conn();
        Self::insert_on(&c, r)
    }

    fn insert_on(c: &rusqlite::Connection, r: &SongRequest) -> DbResult<()> {
        let t = r.track.as_ref();
        c.execute(
            &format!("INSERT INTO requests(provider, {COLS}) VALUES ('spotify', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26)"),
            params![
                r.id,
                t.map(|t| t.id.clone()),
                t.map(|t| t.uri.clone()),
                t.map(|t| t.title.clone()),
                t.map(|t| serde_json::to_string(&t.artists).unwrap_or_default()),
                t.and_then(|t| t.album.clone()),
                t.and_then(|t| t.image_url.clone()),
                t.map(|t| t.duration_ms as i64),
                t.map(|t| t.explicit as i64).unwrap_or(0),
                r.query,
                r.requester.id,
                r.requester.name,
                role_str(r.requester.role),
                r.source.as_str(),
                r.source_event,
                r.received_at,
                r.status.as_str(),
                pending_str(r.pending_reason),
                join_reason(&r.reason, &r.reason_text),
                r.position,
                r.priority as i64,
                r.updated_at,
                r.handoff_at,
                r.observed_at,
                r.finished_at,
                r.chat_message_id,
            ],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    }

    pub fn get(&self, id: &str) -> Option<SongRequest> {
        self.db
            .conn()
            .query_row(&format!("SELECT {COLS} FROM requests WHERE id = ?1"), params![id], from_row)
            .optional()
            .ok()
            .flatten()
    }

    fn query(&self, where_sql: &str, p: impl rusqlite::Params) -> Vec<SongRequest> {
        let c = self.db.conn();
        let mut st = match c.prepare(&format!("SELECT {COLS} FROM requests {where_sql}")) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!(target: "queue", error = %e, "Abfrage fehlgeschlagen");
                return vec![];
            }
        };
        st.query_map(p, from_row).map(|rows| rows.filter_map(Result::ok).collect()).unwrap_or_default()
    }

    /// Offene Requests in Anzeigereihenfolge: an Spotify übergebene zuerst, dann
    /// Priorität, dann Position.
    pub fn pending(&self) -> Vec<SongRequest> {
        self.query(
            "WHERE status IN ('received','pending_review','accepted','handing_off','handed_off','uncertain','playing') \
             ORDER BY CASE status WHEN 'playing' THEN 0 WHEN 'handed_off' THEN 1 WHEN 'handing_off' THEN 1 WHEN 'uncertain' THEN 2 ELSE 3 END, \
             priority DESC, position ASC",
            [],
        )
    }

    pub fn by_status(&self, status: RequestStatus) -> Vec<SongRequest> {
        self.query("WHERE status = ?1 ORDER BY priority DESC, position ASC", params![status.as_str()])
    }

    pub fn recent_finished(&self, limit: u32) -> Vec<SongRequest> {
        self.query(
            "WHERE status IN ('completed','rejected','failed') ORDER BY updated_at DESC LIMIT ?1",
            params![limit],
        )
    }

    pub fn session_counts(&self, since_ms: i64) -> Vec<(String, i64)> {
        let c = self.db.conn();
        let mut st = match c.prepare("SELECT status, COUNT(*) FROM requests WHERE received_at >= ?1 GROUP BY status") {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        st.query_map(params![since_ms], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }

    /// Compare-and-Set: ändert den Status nur, wenn der aktuelle Status in `from` liegt.
    pub fn transition(
        &self,
        id: &str,
        from: &[RequestStatus],
        to: RequestStatus,
        now: i64,
        reason: Option<(&str, &str)>,
    ) -> DbResult<bool> {
        let from_list = from.iter().map(|s| format!("'{}'", s.as_str())).collect::<Vec<_>>().join(",");
        let reason_raw = reason.map(|(c, t)| format!("{c}|{t}"));
        let (handoff, observed, finished) = match to {
            RequestStatus::HandingOff => (Some(now), None, None),
            RequestStatus::Playing => (None, Some(now), None),
            s if s.is_final() => (None, None, Some(now)),
            _ => (None, None, None),
        };
        let n = self
            .db
            .conn()
            .execute(
                &format!(
                    "UPDATE requests SET status = ?2, updated_at = ?3, \
                     reason = COALESCE(?4, CASE WHEN ?2 IN ('accepted','handed_off','playing') THEN NULL ELSE reason END), \
                     pending_reason = CASE WHEN ?2 = 'pending_review' THEN pending_reason ELSE NULL END, \
                     handoff_at = COALESCE(?5, handoff_at), observed_at = COALESCE(?6, observed_at), \
                     finished_at = COALESCE(?7, finished_at) \
                     WHERE id = ?1 AND status IN ({from_list})"
                ),
                params![id, to.as_str(), now, reason_raw, handoff, observed, finished],
            )
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
    }

    pub fn set_track_and_status(
        &self,
        id: &str,
        track: &Track,
        from: RequestStatus,
        to: RequestStatus,
        pending: Option<PendingReason>,
        now: i64,
    ) -> DbResult<bool> {
        let n = self
            .db
            .conn()
            .execute(
                "UPDATE requests SET track_id=?2, track_uri=?3, title=?4, artists=?5, album=?6, image_url=?7, \
                 duration_ms=?8, explicit=?9, status=?10, pending_reason=?11, updated_at=?12 WHERE id=?1 AND status=?13",
                params![
                    id,
                    track.id,
                    track.uri,
                    track.title,
                    serde_json::to_string(&track.artists).unwrap_or_default(),
                    track.album,
                    track.image_url,
                    track.duration_ms as i64,
                    track.explicit as i64,
                    to.as_str(),
                    pending_str(pending),
                    now,
                    from.as_str()
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
    }

    pub fn set_position(&self, id: &str, position: f64, now: i64) -> DbResult<()> {
        self.db
            .conn()
            .execute("UPDATE requests SET position=?2, updated_at=?3 WHERE id=?1", params![id, position, now])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn set_priority(&self, id: &str, priority: bool, now: i64) -> DbResult<()> {
        self.db
            .conn()
            .execute("UPDATE requests SET priority=?2, updated_at=?3 WHERE id=?1", params![id, priority as i64, now])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn max_position(&self) -> f64 {
        self.db
            .conn()
            .query_row("SELECT COALESCE(MAX(position), 0) FROM requests", [], |r| r.get(0))
            .unwrap_or(0.0)
    }

    /// Kennzahlen für die Regelprüfung; `exclude_id` ist der gerade geprüfte Request.
    pub fn stats(&self, requester_id: &str, track_uri: Option<&str>, exclude_id: &str) -> QueueStats {
        let c = self.db.conn();
        let pend = format!(
            "('received','pending_review','accepted','handing_off','handed_off','uncertain') AND id != '{}'",
            exclude_id.replace('\'', "")
        );
        let q = |sql: &str, p: &[&dyn rusqlite::ToSql]| -> Option<i64> {
            c.query_row(sql, p, |r| r.get::<_, Option<i64>>(0)).ok().flatten()
        };
        QueueStats {
            pending_total: q(&format!("SELECT COUNT(*) FROM requests WHERE status IN {pend}"), &[]).unwrap_or(0) as u32,
            pending_for_user: q(
                &format!("SELECT COUNT(*) FROM requests WHERE status IN {pend} AND requester_id = ?1"),
                &[&requester_id],
            )
            .unwrap_or(0) as u32,
            last_by_user_ms: q(
                &format!("SELECT MAX(received_at) FROM requests WHERE requester_id = ?1 AND status NOT IN ('rejected') AND id != '{}'", exclude_id.replace('\'', "")),
                &[&requester_id],
            ),
            last_global_ms: q(&format!("SELECT MAX(received_at) FROM requests WHERE status NOT IN ('rejected') AND id != '{}'", exclude_id.replace('\'', "")), &[]),
            track_pending: match track_uri {
                Some(u) => q(&format!("SELECT COUNT(*) FROM requests WHERE status IN {pend} AND track_uri = ?1"), &[&u])
                    .unwrap_or(0)
                    > 0,
                None => false,
            },
        }
    }

    pub fn blocklist(&self) -> Blocklist {
        let c = self.db.conn();
        let mut b = Blocklist::default();
        if let Ok(mut st) = c.prepare("SELECT kind, value FROM blocklist") {
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)));
            if let Ok(rows) = rows {
                for (k, v) in rows.flatten() {
                    match k.as_str() {
                        "user" => b.users.push(v),
                        "track" => b.tracks.push(v),
                        "artist" => b.artists.push(v),
                        _ => {}
                    }
                }
            }
        }
        b
    }

    pub fn blocklist_entries(&self) -> Vec<BlockEntry> {
        let c = self.db.conn();
        let mut st = match c.prepare("SELECT kind, value, label, created_at FROM blocklist ORDER BY created_at DESC") {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        st.query_map([], |r| {
            Ok(BlockEntry { kind: r.get(0)?, value: r.get(1)?, label: r.get(2)?, created_at: r.get(3)? })
        })
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
    }

    pub fn add_block(&self, kind: &str, value: &str, label: &str, now: i64) -> DbResult<()> {
        if !matches!(kind, "user" | "track" | "artist") {
            return Err("unbekannte Sperrart".into());
        }
        self.db
            .conn()
            .execute(
                "INSERT OR REPLACE INTO blocklist(kind, value, label, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![kind, value, label, now],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn remove_block(&self, kind: &str, value: &str) -> DbResult<()> {
        self.db
            .conn()
            .execute("DELETE FROM blocklist WHERE kind=?1 AND value=?2", params![kind, value])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn add_history(&self, t: &Track, now: i64, req: Option<&SongRequest>) -> DbResult<()> {
        self.db
            .conn()
            .execute(
                "INSERT INTO history(track_uri, track_id, title, artists, album, image_url, duration_ms, played_at, request_id, requester_name) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    t.uri,
                    t.id,
                    t.title,
                    serde_json::to_string(&t.artists).unwrap_or_default(),
                    t.album,
                    t.image_url,
                    t.duration_ms as i64,
                    now,
                    req.map(|r| r.id.clone()),
                    req.map(|r| r.requester.name.clone()),
                ],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn history(&self, search: &str, limit: u32) -> Vec<HistoryEntry> {
        let c = self.db.conn();
        let like = format!("%{}%", search.trim().replace('%', "").replace('_', ""));
        let mut st = match c.prepare(
            "SELECT id, track_uri, track_id, title, artists, album, image_url, duration_ms, played_at, requester_name \
             FROM history WHERE (?1 = '%%' OR title LIKE ?1 OR artists LIKE ?1) ORDER BY played_at DESC LIMIT ?2",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        st.query_map(params![like, limit], |r| {
            let artists: String = r.get(4)?;
            Ok(HistoryEntry {
                id: r.get(0)?,
                track: Track {
                    provider: Provider::Spotify,
                    uri: r.get(1)?,
                    id: r.get(2)?,
                    title: r.get(3)?,
                    artists: serde_json::from_str(&artists).unwrap_or_default(),
                    album: r.get(5)?,
                    image_url: r.get(6)?,
                    duration_ms: r.get::<_, i64>(7)? as u64,
                    explicit: false,
                    external_url: None,
                },
                played_at: r.get(8)?,
                requester_name: r.get(9)?,
            })
        })
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
    }
}

fn join_reason(code: &Option<String>, text: &Option<String>) -> Option<String> {
    code.as_ref().map(|c| format!("{c}|{}", text.clone().unwrap_or_default()))
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BlockEntry {
    pub kind: String,
    pub value: String,
    pub label: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub track: Track,
    pub played_at: i64,
    pub requester_name: Option<String>,
}
