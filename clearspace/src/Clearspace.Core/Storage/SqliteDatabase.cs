using Microsoft.Data.Sqlite;

namespace Clearspace.Core.Storage;

/// <summary>Verbindung und Schema. Alle Daten bleiben lokal; nichts wird uebertragen.</summary>
public sealed class SqliteDatabase : IDisposable
{
    private readonly SqliteConnection _connection;

    public SqliteDatabase(string databasePath)
    {
        var dir = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        _connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString());
        _connection.Open();
        Execute("PRAGMA journal_mode=WAL;");
        Execute("PRAGMA synchronous=FULL;");
        Execute("PRAGMA foreign_keys=ON;");
        Migrate();
    }

    public SqliteConnection Connection => _connection;

    public void Execute(string sql, Action<SqliteCommand>? bind = null)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = sql;
        bind?.Invoke(cmd);
        cmd.ExecuteNonQuery();
    }

    public T Query<T>(string sql, Func<SqliteDataReader, T> read, Action<SqliteCommand>? bind = null)
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = sql;
        bind?.Invoke(cmd);
        using var reader = cmd.ExecuteReader();
        return read(reader);
    }

    private void Migrate()
    {
        Execute("""
            CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                original_name TEXT NOT NULL,
                type INTEGER NOT NULL,
                path TEXT NOT NULL,
                original_path TEXT NOT NULL,
                source INTEGER NOT NULL,
                target_path TEXT,
                arguments TEXT,
                working_directory TEXT,
                icon_location TEXT,
                publisher TEXT,
                product_name TEXT,
                product_description TEXT,
                extension TEXT,
                protocol_or_appid TEXT,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                last_write_utc INTEGER,
                first_seen_utc INTEGER NOT NULL,
                last_seen_utc INTEGER NOT NULL,
                is_cloud_placeholder INTEGER NOT NULL DEFAULT 0,
                is_reparse_point INTEGER NOT NULL DEFAULT 0,
                is_missing INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '',
                origins TEXT NOT NULL DEFAULT '[]',
                launch_count INTEGER NOT NULL DEFAULT 0,
                last_launch_utc INTEGER
            );

            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                icon TEXT NOT NULL DEFAULT 'folder',
                color TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_system INTEGER NOT NULL DEFAULT 0,
                folder_name TEXT
            );

            CREATE TABLE IF NOT EXISTS manual_assignments (
                entry_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                is_primary INTEGER NOT NULL DEFAULT 0,
                reason TEXT NOT NULL DEFAULT '',
                created_utc INTEGER NOT NULL,
                PRIMARY KEY (entry_id, category_id)
            );

            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                conditions TEXT NOT NULL,
                effect INTEGER NOT NULL,
                category_id TEXT,
                priority INTEGER NOT NULL DEFAULT 0,
                is_enabled INTEGER NOT NULL DEFAULT 1,
                created_utc INTEGER NOT NULL,
                from_correction INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                mode INTEGER NOT NULL,
                created_utc INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS journal (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                entry_id TEXT NOT NULL,
                entry_name TEXT NOT NULL,
                kind INTEGER NOT NULL,
                source_path TEXT NOT NULL,
                target_path TEXT,
                status INTEGER NOT NULL,
                skip_reason INTEGER NOT NULL DEFAULT 0,
                message TEXT,
                source_fingerprint TEXT,
                created_utc INTEGER NOT NULL,
                updated_utc INTEGER,
                is_undone INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS ix_journal_plan ON journal(plan_id);
            CREATE INDEX IF NOT EXISTS ix_journal_status ON journal(status);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """);

        var version = Query("SELECT version FROM schema_version LIMIT 1;",
            r => r.Read() ? r.GetInt32(0) : 0);
        if (version == 0) Execute("INSERT INTO schema_version (version) VALUES (1);");
    }

    public void Dispose()
    {
        _connection.Close();
        _connection.Dispose();
        SqliteConnection.ClearAllPools();
    }
}
