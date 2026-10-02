//! Aktivitätsprotokoll: relevante Ereignisse für die UI („Request angenommen“,
//! „Verbindung wiederhergestellt“). Enthält nie Tokens oder vollständige URLs.

use crate::clock::SharedClock;
use crate::events::{AppEvent, EventBus};
use crate::storage::Db;
use rusqlite::params;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Info,
    Success,
    Warn,
    Error,
}

impl Level {
    fn as_str(self) -> &'static str {
        match self {
            Level::Info => "info",
            Level::Success => "success",
            Level::Warn => "warn",
            Level::Error => "error",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "success" => Level::Success,
            "warn" => Level::Warn,
            "error" => Level::Error,
            _ => Level::Info,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Activity {
    pub id: i64,
    pub ts: i64,
    pub level: Level,
    /// Stabiler Schlüssel für Lokalisierung, z. B. `request.accepted`.
    pub kind: String,
    /// Deutscher Standardtext.
    pub message: String,
    pub params: Value,
    pub corr: Option<String>,
}

#[derive(Clone)]
pub struct ActivityLog {
    db: Db,
    bus: EventBus,
    clock: SharedClock,
}

impl ActivityLog {
    pub fn new(db: Db, bus: EventBus, clock: SharedClock) -> Self {
        Self { db, bus, clock }
    }

    pub fn log(&self, level: Level, kind: &str, message: impl Into<String>, params: Value, corr: Option<&str>) {
        let message = message.into();
        let ts = self.clock.now_ms();
        let id = {
            let c = self.db.conn();
            let _ = c.execute(
                "INSERT INTO activity(ts, level, kind, message, params, corr) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![ts, level.as_str(), kind, message, params.to_string(), corr],
            );
            c.last_insert_rowid()
        };
        tracing::info!(target: "activity", kind, level = level.as_str(), corr, "{message}");
        self.bus.emit(AppEvent::Activity(Activity {
            id,
            ts,
            level,
            kind: kind.into(),
            message,
            params,
            corr: corr.map(str::to_string),
        }));
    }

    pub fn info(&self, kind: &str, message: impl Into<String>, params: Value) {
        self.log(Level::Info, kind, message, params, None)
    }
    pub fn success(&self, kind: &str, message: impl Into<String>, params: Value) {
        self.log(Level::Success, kind, message, params, None)
    }
    pub fn warn(&self, kind: &str, message: impl Into<String>, params: Value) {
        self.log(Level::Warn, kind, message, params, None)
    }
    pub fn error(&self, kind: &str, message: impl Into<String>, params: Value) {
        self.log(Level::Error, kind, message, params, None)
    }

    pub fn recent(&self, limit: u32) -> Vec<Activity> {
        let c = self.db.conn();
        let mut st = match c.prepare(
            "SELECT id, ts, level, kind, message, params, corr FROM activity ORDER BY id DESC LIMIT ?1",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        st.query_map(params![limit], |r| {
            let lvl: String = r.get(2)?;
            let p: String = r.get(5)?;
            Ok(Activity {
                id: r.get(0)?,
                ts: r.get(1)?,
                level: Level::parse(&lvl),
                kind: r.get(3)?,
                message: r.get(4)?,
                params: serde_json::from_str(&p).unwrap_or(Value::Null),
                corr: r.get(6)?,
            })
        })
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default()
    }
}
