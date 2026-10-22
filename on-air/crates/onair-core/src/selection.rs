//! Persistente Auswahl-Sitzungen („Spotify-Version bestätigen“, „Playlist-Titel wählen“,
//! „Welchen Wunsch ändern?“).
//!
//! - Gebunden an Kanal und stabile Nutzer-ID; höchstens eine offene Sitzung pro Nutzer und
//!   Kanal (eindeutiger Index). Eine neue ersetzt die alte ausdrücklich.
//! - Die Optionen speichern konkrete Kennungen (Spotify-/Quell-IDs), keine Positionsnummern:
//!   Ändert sich eine Playlist, ergibt dieselbe Nummer nie unbemerkt einen anderen Song.
//! - Zustandswechsel sind Compare-and-Set; eine doppelt gesendete Bestätigung kann keinen
//!   zweiten Request erzeugen.

use crate::model::Track;
use crate::queue::Source;
use crate::resolve::{CollectionInfo, Origin, SourceItem};
use crate::settings::Role;
use crate::storage::{Db, DbResult};
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

/// Kanal der App selbst (Streamer im Desktop-Dialog).
pub const LOCAL_CHANNEL: &str = "local";
/// Obergrenze geladener Playlist-Einträge pro Sitzung.
pub const MAX_LOADED: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    /// Neuer Wunsch.
    New,
    /// Austausch eines bestehenden Wunschs.
    Replace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    /// Spotify-Version bestätigen.
    Version,
    /// Playlist- bzw. Albumtitel wählen.
    Collection,
    /// Welchen eigenen Wunsch ersetzen?
    PickRequest,
}

impl Stage {
    fn as_str(self) -> &'static str {
        match self {
            Stage::Version => "version",
            Stage::Collection => "collection",
            Stage::PickRequest => "pick_request",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "collection" => Stage::Collection,
            "pick_request" => Stage::PickRequest,
            _ => Stage::Version,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequestChoice {
    pub id: String,
    pub label: String,
}

/// Inhalt einer Auswahl-Sitzung.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct SelectionData {
    /// Ursprüngliche Eingabe (bei `PickRequest`: der gewünschte neue Song).
    pub input: String,
    pub origin: Option<Origin>,
    /// Stufe „Version“: die angebotenen Spotify-Titel.
    pub versions: Vec<Track>,
    pub collection: Option<CollectionInfo>,
    /// Bereits geladene Einträge der Sammlung (in Anbieterreihenfolge).
    pub loaded: Vec<SourceItem>,
    pub next_cursor: Option<String>,
    /// Aktuelle Chatseite (0-basiert) und Seitengröße.
    pub page: u32,
    pub page_size: u32,
    /// Stufe „Welchen Wunsch?“.
    pub requests: Vec<RequestChoice>,
    pub source: Option<Source>,
    pub role: Option<Role>,
    pub chat_message_id: Option<String>,
    /// Eintrag der Sammlung, der gerade in der Versionsauswahl steckt (zurück zur Liste möglich).
    pub from_collection: bool,
}

impl SelectionData {
    pub fn page_items(&self) -> &[SourceItem] {
        let size = self.page_size.max(1) as usize;
        let start = self.page as usize * size;
        if start >= self.loaded.len() {
            return &[];
        }
        &self.loaded[start..(start + size).min(self.loaded.len())]
    }
    /// Anzahl Seiten; `None`, wenn die Sammlung noch nicht vollständig geladen ist und die
    /// Gesamtzahl unbekannt ist.
    pub fn pages(&self) -> Option<u32> {
        let size = self.page_size.max(1);
        let total = self.collection.as_ref().and_then(|c| c.total).map(|t| t as usize).or(self.next_cursor.is_none().then_some(self.loaded.len()))?;
        Some((total as u32).div_ceil(size).max(1))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Selection {
    pub id: String,
    pub channel: String,
    pub user_id: String,
    pub user_name: String,
    pub purpose: Purpose,
    pub stage: Stage,
    /// Bei `New`: der wartende Request (Status `awaiting_selection`); bei `Replace`: das Ziel.
    pub request_id: Option<String>,
    pub data: SelectionData,
    pub state: String,
    pub created_at: i64,
    pub expires_at: i64,
}

fn from_row(r: &Row) -> rusqlite::Result<Selection> {
    let raw: String = r.get(7)?;
    Ok(Selection {
        id: r.get(0)?,
        channel: r.get(1)?,
        user_id: r.get(2)?,
        user_name: r.get(3)?,
        purpose: if r.get::<_, String>(4)? == "replace" { Purpose::Replace } else { Purpose::New },
        stage: Stage::parse(&r.get::<_, String>(5)?),
        request_id: r.get(6)?,
        data: serde_json::from_str(&raw).unwrap_or_default(),
        state: r.get(8)?,
        created_at: r.get(9)?,
        expires_at: r.get(10)?,
    })
}

const COLS: &str = "id, channel, user_id, user_name, purpose, stage, request_id, data, state, created_at, expires_at";

#[derive(Clone)]
pub struct SelectionStore {
    db: Db,
}

impl SelectionStore {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Offene Sitzung eines Nutzers (abgelaufene zählen nicht).
    pub fn open_for(&self, channel: &str, user_id: &str, now: i64) -> Option<Selection> {
        self.db
            .conn()
            .query_row(
                &format!("SELECT {COLS} FROM selections WHERE channel = ?1 AND user_id = ?2 AND state = 'open' AND expires_at > ?3"),
                params![channel, user_id, now],
                from_row,
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn get(&self, id: &str) -> Option<Selection> {
        self.db.conn().query_row(&format!("SELECT {COLS} FROM selections WHERE id = ?1"), params![id], from_row).optional().ok().flatten()
    }

    /// Legt eine Sitzung an; eine bestehende offene Sitzung desselben Nutzers wird in derselben
    /// Transaktion als `replaced` beendet. Liefert die ersetzte Sitzung.
    pub fn insert(&self, s: &Selection, now: i64) -> DbResult<Option<Selection>> {
        let mut c = self.db.conn();
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let old = tx
            .query_row(&format!("SELECT {COLS} FROM selections WHERE channel = ?1 AND user_id = ?2 AND state = 'open'"), params![s.channel, s.user_id], from_row)
            .optional()
            .map_err(|e| e.to_string())?;
        if old.is_some() {
            tx.execute("UPDATE selections SET state = 'replaced', updated_at = ?3 WHERE channel = ?1 AND user_id = ?2 AND state = 'open'", params![s.channel, s.user_id, now])
                .map_err(|e| e.to_string())?;
        }
        tx.execute(
            "INSERT INTO selections(id, channel, user_id, user_name, purpose, stage, request_id, data, state, created_at, updated_at, expires_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', ?9, ?9, ?10)",
            params![
                s.id,
                s.channel,
                s.user_id,
                s.user_name,
                if s.purpose == Purpose::Replace { "replace" } else { "new" },
                s.stage.as_str(),
                s.request_id,
                serde_json::to_string(&s.data).unwrap_or_default(),
                now,
                s.expires_at
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        // Eine abgelaufene, noch nicht aufgeräumte Sitzung gilt nicht als ersetzt.
        Ok(old.filter(|o| o.expires_at > now))
    }

    /// Stufe/Daten aktualisieren – nur solange die Sitzung offen ist.
    pub fn update(&self, id: &str, stage: Stage, data: &SelectionData, expires_at: i64, now: i64) -> DbResult<bool> {
        let n = self
            .db
            .conn()
            .execute(
                "UPDATE selections SET stage = ?2, data = ?3, expires_at = ?4, updated_at = ?5 WHERE id = ?1 AND state = 'open'",
                params![id, stage.as_str(), serde_json::to_string(data).unwrap_or_default(), expires_at, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
    }

    /// Beenden (Compare-and-Set von `open`). `true` = dieser Aufruf hat beendet.
    pub fn finish(&self, id: &str, state: &str, now: i64) -> DbResult<bool> {
        let n = self
            .db
            .conn()
            .execute("UPDATE selections SET state = ?2, updated_at = ?3 WHERE id = ?1 AND state = 'open'", params![id, state, now])
            .map_err(|e| e.to_string())?;
        Ok(n == 1)
    }

    /// Abgelaufene, noch offene Sitzungen.
    pub fn expired(&self, now: i64) -> Vec<Selection> {
        let c = self.db.conn();
        let mut st = match c.prepare(&format!("SELECT {COLS} FROM selections WHERE state = 'open' AND expires_at <= ?1")) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        st.query_map(params![now], from_row).map(|r| r.filter_map(Result::ok).collect()).unwrap_or_default()
    }

    /// Offene Sitzungen (für die App-Anzeige).
    pub fn open(&self, now: i64) -> Vec<Selection> {
        let c = self.db.conn();
        let mut st = match c.prepare(&format!("SELECT {COLS} FROM selections WHERE state = 'open' AND expires_at > ?1 ORDER BY created_at")) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        st.query_map(params![now], from_row).map(|r| r.filter_map(Result::ok).collect()).unwrap_or_default()
    }

    /// Offene Sitzung zu einem Request (z. B. wartender Kanalpunkte-Wunsch).
    pub fn for_request(&self, request_id: &str) -> Option<Selection> {
        self.db
            .conn()
            .query_row(&format!("SELECT {COLS} FROM selections WHERE request_id = ?1 AND state = 'open'"), params![request_id], from_row)
            .optional()
            .ok()
            .flatten()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sel(id: &str, user: &str, exp: i64) -> Selection {
        Selection {
            id: id.into(),
            channel: "c".into(),
            user_id: user.into(),
            user_name: user.into(),
            purpose: Purpose::New,
            stage: Stage::Version,
            request_id: None,
            data: SelectionData::default(),
            state: "open".into(),
            created_at: 0,
            expires_at: exp,
        }
    }

    #[test]
    fn one_open_selection_per_user_and_cas_finish() {
        let s = SelectionStore::new(Db::in_memory().unwrap());
        assert!(s.insert(&sel("a", "u1", 1000), 0).unwrap().is_none());
        assert!(s.insert(&sel("b", "u2", 1000), 0).unwrap().is_none(), "anderer Nutzer unabhängig");
        let replaced = s.insert(&sel("c", "u1", 1000), 1).unwrap();
        assert_eq!(replaced.map(|x| x.id), Some("a".into()));
        assert_eq!(s.open_for("c", "u1", 2).map(|x| x.id), Some("c".into()));
        assert!(s.finish("c", "done", 3).unwrap());
        assert!(!s.finish("c", "done", 4).unwrap(), "zweite Bestätigung wirkungslos");
        assert!(s.open_for("c", "u1", 5).is_none());
        assert_eq!(s.expired(2000).len(), 1, "u2 ist abgelaufen");
    }
}
