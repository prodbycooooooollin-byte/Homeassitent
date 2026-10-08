"""SQLite-Speicher: nur Zähler, keine Audioaufnahmen und keine Transkripte."""
import sqlite3
import threading
import time


class Store:
    def __init__(self, path: str):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS counts (
                    guild_id INTEGER NOT NULL,
                    user_id  INTEGER NOT NULL,
                    total    INTEGER NOT NULL DEFAULT 0,
                    last_at  INTEGER,
                    PRIMARY KEY (guild_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS events (
                    guild_id INTEGER NOT NULL,
                    user_id  INTEGER NOT NULL,
                    ts       INTEGER NOT NULL,
                    n        INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_guild_ts ON events (guild_id, ts);
                CREATE TABLE IF NOT EXISTS names (
                    guild_id INTEGER NOT NULL,
                    user_id  INTEGER NOT NULL,
                    name     TEXT NOT NULL,
                    PRIMARY KEY (guild_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS guilds (
                    guild_id INTEGER PRIMARY KEY,
                    name     TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS optout (
                    guild_id INTEGER NOT NULL,
                    user_id  INTEGER NOT NULL,
                    PRIMARY KEY (guild_id, user_id)
                );
                """
            )

    def add(self, guild_id: int, user_id: int, n: int = 1, name: str | None = None,
            guild_name: str | None = None) -> None:
        if n <= 0 or self.is_opted_out(guild_id, user_id):
            return
        now = int(time.time())
        with self._lock:
            self._db.execute("INSERT INTO events VALUES (?, ?, ?, ?)", (guild_id, user_id, now, n))
            if name:
                self._db.execute("INSERT OR REPLACE INTO names VALUES (?, ?, ?)", (guild_id, user_id, name))
            if guild_name:
                self._db.execute("INSERT OR REPLACE INTO guilds VALUES (?, ?)", (guild_id, guild_name))
            self._db.execute(
                """INSERT INTO counts (guild_id, user_id, total, last_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(guild_id, user_id)
                   DO UPDATE SET total = total + excluded.total, last_at = excluded.last_at""",
                (guild_id, user_id, n, now),
            )
            self._db.commit()

    def top(self, guild_id: int, limit: int = 10) -> list[tuple[int, int]]:
        with self._lock:
            return self._db.execute(
                "SELECT user_id, total FROM counts WHERE guild_id=? AND total>0 ORDER BY total DESC LIMIT ?",
                (guild_id, limit),
            ).fetchall()

    def get(self, guild_id: int, user_id: int) -> int:
        with self._lock:
            row = self._db.execute(
                "SELECT total FROM counts WHERE guild_id=? AND user_id=?", (guild_id, user_id)
            ).fetchone()
        return row[0] if row else 0

    def set_optout(self, guild_id: int, user_id: int, value: bool) -> None:
        with self._lock:
            if value:
                self._db.execute("INSERT OR IGNORE INTO optout VALUES (?, ?)", (guild_id, user_id))
                # Opt-out löscht auch bestehende Daten der Person
                for table in ("counts", "events", "names"):
                    self._db.execute(f"DELETE FROM {table} WHERE guild_id=? AND user_id=?", (guild_id, user_id))
            else:
                self._db.execute("DELETE FROM optout WHERE guild_id=? AND user_id=?", (guild_id, user_id))
            self._db.commit()

    def is_opted_out(self, guild_id: int, user_id: int) -> bool:
        with self._lock:
            return (
                self._db.execute(
                    "SELECT 1 FROM optout WHERE guild_id=? AND user_id=?", (guild_id, user_id)
                ).fetchone()
                is not None
            )

    # --- Lesezugriffe für das Dashboard ---
    def guilds(self) -> list[tuple[int, str]]:
        with self._lock:
            return self._db.execute(
                """SELECT e.guild_id, COALESCE(g.name, CAST(e.guild_id AS TEXT))
                   FROM (SELECT guild_id, SUM(n) AS s FROM events GROUP BY guild_id) e
                   LEFT JOIN guilds g USING (guild_id) ORDER BY e.s DESC"""
            ).fetchall()

    def events(self, guild_id: int) -> list[tuple[int, int, int]]:
        with self._lock:
            return self._db.execute(
                "SELECT user_id, ts, n FROM events WHERE guild_id=? ORDER BY ts", (guild_id,)
            ).fetchall()

    def names(self, guild_id: int) -> dict[int, str]:
        with self._lock:
            return dict(self._db.execute("SELECT user_id, name FROM names WHERE guild_id=?", (guild_id,)).fetchall())
