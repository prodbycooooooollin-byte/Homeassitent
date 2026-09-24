//! SQLite-Speicher mit versionierten Migrationen (`PRAGMA user_version`).
//! Vor jeder Schemaänderung einer bestehenden Datenbank wird eine Sicherung
//! per `VACUUM INTO` angelegt.

use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

pub type DbResult<T> = Result<T, String>;

const MIGRATIONS: &[&str] = &[
    // v1
    r#"
    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE requests (
        id             TEXT PRIMARY KEY,
        provider       TEXT NOT NULL,
        track_id       TEXT,
        track_uri      TEXT,
        title          TEXT,
        artists        TEXT,
        album          TEXT,
        image_url      TEXT,
        duration_ms    INTEGER,
        explicit       INTEGER NOT NULL DEFAULT 0,
        query          TEXT NOT NULL,
        requester_id   TEXT NOT NULL,
        requester_name TEXT NOT NULL,
        requester_role TEXT NOT NULL,
        source         TEXT NOT NULL,
        source_event   TEXT,
        received_at    INTEGER NOT NULL,
        status         TEXT NOT NULL,
        pending_reason TEXT,
        reason         TEXT,
        position       REAL NOT NULL,
        priority       INTEGER NOT NULL DEFAULT 0,
        updated_at     INTEGER NOT NULL,
        handoff_at     INTEGER,
        observed_at    INTEGER,
        finished_at    INTEGER,
        chat_message_id TEXT
    );
    CREATE INDEX idx_requests_status ON requests(status);
    CREATE INDEX idx_requests_requester ON requests(requester_id, received_at);
    CREATE TABLE processed_events (
        source     TEXT NOT NULL,
        event_id   TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, event_id)
    );
    CREATE TABLE history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        track_uri  TEXT NOT NULL,
        track_id   TEXT NOT NULL,
        title      TEXT NOT NULL,
        artists    TEXT NOT NULL,
        album      TEXT,
        image_url  TEXT,
        duration_ms INTEGER NOT NULL,
        played_at  INTEGER NOT NULL,
        request_id TEXT,
        requester_name TEXT
    );
    CREATE INDEX idx_history_played ON history(played_at);
    CREATE TABLE activity (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      INTEGER NOT NULL,
        level   TEXT NOT NULL,
        kind    TEXT NOT NULL,
        message TEXT NOT NULL,
        params  TEXT NOT NULL DEFAULT '{}',
        corr    TEXT
    );
    CREATE TABLE blocklist (
        kind  TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (kind, value)
    );
    "#,
];

pub fn schema_version() -> i64 {
    MIGRATIONS.len() as i64
}

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
    path: Option<PathBuf>,
}

impl Db {
    pub fn open(path: &Path) -> DbResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        let db = Self { conn: Arc::new(Mutex::new(conn)), path: Some(path.to_path_buf()) };
        db.init()?;
        Ok(db)
    }

    pub fn in_memory() -> DbResult<Self> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        let db = Self { conn: Arc::new(Mutex::new(conn)), path: None };
        db.init()?;
        Ok(db)
    }

    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn init(&self) -> DbResult<()> {
        let conn = self.conn();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;",
        )
        .map_err(|e| e.to_string())?;
        let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        let target = schema_version();
        if current > target {
            return Err(format!(
                "Datenbank-Schema v{current} ist neuer als diese App-Version (v{target}). Bitte ON AIR aktualisieren."
            ));
        }
        if current < target && current > 0 {
            if let Some(path) = &self.path {
                let backup = backup_path(path, current);
                let _ = std::fs::remove_file(&backup);
                conn.execute("VACUUM INTO ?1", params![backup.to_string_lossy()])
                    .map_err(|e| format!("Sicherung vor Migration fehlgeschlagen: {e}"))?;
                tracing::info!(target: "storage", from = current, to = target, "Sicherung vor Migration angelegt");
            }
        }
        for (i, sql) in MIGRATIONS.iter().enumerate() {
            let v = (i + 1) as i64;
            if v <= current {
                continue;
            }
            let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
            tx.execute_batch(sql).map_err(|e| format!("Migration v{v}: {e}"))?;
            tx.execute_batch(&format!("PRAGMA user_version = {v}")).map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> DbResult<()> {
        self.conn()
            .execute(
                "INSERT INTO settings(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// Alte Aktivitäten, verarbeitete Event-IDs und Verlauf begrenzen.
    pub fn prune(&self, now_ms: i64) -> DbResult<()> {
        let c = self.conn();
        let day = 86_400_000i64;
        c.execute("DELETE FROM processed_events WHERE created_at < ?1", params![now_ms - 7 * day])
            .map_err(|e| e.to_string())?;
        c.execute(
            "DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 2000)",
            [],
        )
        .map_err(|e| e.to_string())?;
        c.execute("DELETE FROM history WHERE played_at < ?1", params![now_ms - 180 * day])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn backup_path(path: &Path, version: i64) -> PathBuf {
    let dir = path.parent().map(Path::to_path_buf).unwrap_or_default().join("backups");
    let _ = std::fs::create_dir_all(&dir);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    dir.join(format!("onair-v{version}-{ts}.db"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_and_persists() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("onair.db");
        {
            let db = Db::open(&p).unwrap();
            db.set_setting("a", "1").unwrap();
        }
        let db = Db::open(&p).unwrap();
        assert_eq!(db.get_setting("a").as_deref(), Some("1"));
        let v: i64 = db.conn().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, schema_version());
    }

    #[test]
    fn refuses_newer_schema() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("onair.db");
        {
            let c = Connection::open(&p).unwrap();
            c.execute_batch("PRAGMA user_version = 999").unwrap();
        }
        assert!(Db::open(&p).is_err());
    }
}
