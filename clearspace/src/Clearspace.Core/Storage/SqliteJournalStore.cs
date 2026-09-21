using Clearspace.Core.Cleanup;
using Clearspace.Core.Model;

namespace Clearspace.Core.Storage;

/// <summary>Dauerhaftes Journal in SQLite. Ueberlebt Neustarts und Abstuerze.</summary>
public sealed class SqliteJournalStore : IJournalStore
{
    private readonly SqliteDatabase _db;

    public SqliteJournalStore(SqliteDatabase db) => _db = db;

    public void AppendPlan(string planId, CleanupMode mode, IEnumerable<JournalRecord> records)
    {
        using var tx = _db.Connection.BeginTransaction();
        _db.Execute("INSERT OR REPLACE INTO plans (id,mode,created_utc) VALUES ($i,$m,$t);", cmd =>
        {
            cmd.Transaction = tx;
            cmd.Parameters.AddWithValue("$i", planId);
            cmd.Parameters.AddWithValue("$m", (int)mode);
            cmd.Parameters.AddWithValue("$t", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        });

        foreach (var r in records)
            _db.Execute("""
                INSERT OR REPLACE INTO journal
                    (id,plan_id,entry_id,entry_name,kind,source_path,target_path,status,skip_reason,
                     message,source_fingerprint,created_utc,updated_utc,is_undone)
                VALUES ($i,$p,$e,$n,$k,$s,$t,$st,$sr,$m,$f,$c,$u,$un);
                """, cmd =>
            {
                cmd.Transaction = tx;
                Bind(cmd, r);
            });

        tx.Commit();
    }

    private static void Bind(Microsoft.Data.Sqlite.SqliteCommand cmd, JournalRecord r)
    {
        cmd.Parameters.AddWithValue("$i", r.Id);
        cmd.Parameters.AddWithValue("$p", r.PlanId);
        cmd.Parameters.AddWithValue("$e", r.EntryId);
        cmd.Parameters.AddWithValue("$n", r.EntryName);
        cmd.Parameters.AddWithValue("$k", (int)r.Kind);
        cmd.Parameters.AddWithValue("$s", r.SourcePath);
        cmd.Parameters.AddWithValue("$t", (object?)r.TargetPath ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$st", (int)r.Status);
        cmd.Parameters.AddWithValue("$sr", (int)r.SkipReason);
        cmd.Parameters.AddWithValue("$m", (object?)r.Message ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$f", (object?)r.SourceFingerprint ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$c", r.CreatedUtc.ToUnixTimeMilliseconds());
        cmd.Parameters.AddWithValue("$u", (object?)r.UpdatedUtc?.ToUnixTimeMilliseconds() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$un", r.IsUndone ? 1 : 0);
    }

    public void Update(JournalRecord record) => _db.Execute("""
        INSERT OR REPLACE INTO journal
            (id,plan_id,entry_id,entry_name,kind,source_path,target_path,status,skip_reason,
             message,source_fingerprint,created_utc,updated_utc,is_undone)
        VALUES ($i,$p,$e,$n,$k,$s,$t,$st,$sr,$m,$f,$c,$u,$un);
        """, cmd => Bind(cmd, record));

    private static JournalRecord Read(Microsoft.Data.Sqlite.SqliteDataReader r) => new()
    {
        Id = r.GetString(0),
        PlanId = r.GetString(1),
        EntryId = r.GetString(2),
        EntryName = r.GetString(3),
        Kind = (PlannedActionKind)r.GetInt32(4),
        SourcePath = r.GetString(5),
        TargetPath = r.IsDBNull(6) ? null : r.GetString(6),
        Status = (ActionStatus)r.GetInt32(7),
        SkipReason = (SkipReason)r.GetInt32(8),
        Message = r.IsDBNull(9) ? null : r.GetString(9),
        SourceFingerprint = r.IsDBNull(10) ? null : r.GetString(10),
        CreatedUtc = DateTimeOffset.FromUnixTimeMilliseconds(r.GetInt64(11)),
        UpdatedUtc = r.IsDBNull(12) ? null : DateTimeOffset.FromUnixTimeMilliseconds(r.GetInt64(12)),
        IsUndone = r.GetInt32(13) == 1
    };

    private IReadOnlyList<JournalRecord> QueryList(string sql, Action<Microsoft.Data.Sqlite.SqliteCommand>? bind = null)
        => _db.Query(sql, reader =>
        {
            var list = new List<JournalRecord>();
            while (reader.Read()) list.Add(Read(reader));
            return (IReadOnlyList<JournalRecord>)list;
        }, bind);

    public IReadOnlyList<JournalRecord> GetByPlan(string planId)
        => QueryList("SELECT * FROM journal WHERE plan_id=$p ORDER BY created_utc;",
            c => c.Parameters.AddWithValue("$p", planId));

    public IReadOnlyList<string> GetPlanIds()
        => _db.Query("SELECT id FROM plans ORDER BY created_utc DESC;", reader =>
        {
            var list = new List<string>();
            while (reader.Read()) list.Add(reader.GetString(0));
            return (IReadOnlyList<string>)list;
        });

    public IReadOnlyList<JournalRecord> GetUnfinished()
        => QueryList($"SELECT * FROM journal WHERE status IN ({(int)ActionStatus.Planned},{(int)ActionStatus.Running});");

    public IReadOnlyList<JournalRecord> GetUndoable(string? planId = null)
        => planId is null
            ? QueryList($"SELECT * FROM journal WHERE status={(int)ActionStatus.Completed} AND is_undone=0;")
            : QueryList($"SELECT * FROM journal WHERE status={(int)ActionStatus.Completed} AND is_undone=0 AND plan_id=$p;",
                c => c.Parameters.AddWithValue("$p", planId));

    public CleanupMode? GetPlanMode(string planId)
        => _db.Query("SELECT mode FROM plans WHERE id=$i;",
            r => r.Read() ? (CleanupMode?)r.GetInt32(0) : null,
            c => c.Parameters.AddWithValue("$i", planId));
}
