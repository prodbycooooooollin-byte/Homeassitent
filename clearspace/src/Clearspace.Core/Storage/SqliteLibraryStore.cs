using System.Text.Json;
using Clearspace.Core.Library;
using Clearspace.Core.Model;
using Microsoft.Data.Sqlite;

namespace Clearspace.Core.Storage;

public sealed class SqliteLibraryStore : ILibraryStore
{
    private readonly SqliteDatabase _db;

    public SqliteLibraryStore(SqliteDatabase db) => _db = db;

    private static long? ToUnix(DateTimeOffset? value) => value?.ToUnixTimeMilliseconds();
    private static DateTimeOffset FromUnix(long value) => DateTimeOffset.FromUnixTimeMilliseconds(value);

    public void SaveEntries(IEnumerable<LibraryEntry> entries)
    {
        using var tx = _db.Connection.BeginTransaction();
        foreach (var e in entries)
        {
            _db.Execute("""
                INSERT INTO entries (id, display_name, original_name, type, path, original_path, source,
                    target_path, arguments, working_directory, icon_location, publisher, product_name,
                    product_description, extension, protocol_or_appid, size_bytes, last_write_utc,
                    first_seen_utc, last_seen_utc, is_cloud_placeholder, is_reparse_point, is_missing,
                    is_favorite, tags, origins, launch_count, last_launch_utc)
                VALUES ($id,$dn,$on,$ty,$p,$op,$src,$tp,$ar,$wd,$il,$pu,$pn,$pd,$ex,$pr,$sz,$lw,$fs,$ls,$cp,$rp,$mi,$fa,$tg,$og,$lc,$ll)
                ON CONFLICT(id) DO UPDATE SET
                    display_name=excluded.display_name, type=excluded.type, path=excluded.path,
                    target_path=excluded.target_path, arguments=excluded.arguments,
                    working_directory=excluded.working_directory, icon_location=excluded.icon_location,
                    publisher=excluded.publisher, product_name=excluded.product_name,
                    product_description=excluded.product_description, extension=excluded.extension,
                    protocol_or_appid=excluded.protocol_or_appid, size_bytes=excluded.size_bytes,
                    last_write_utc=excluded.last_write_utc, last_seen_utc=excluded.last_seen_utc,
                    is_cloud_placeholder=excluded.is_cloud_placeholder, is_reparse_point=excluded.is_reparse_point,
                    is_missing=excluded.is_missing, is_favorite=excluded.is_favorite, tags=excluded.tags,
                    origins=excluded.origins, launch_count=excluded.launch_count, last_launch_utc=excluded.last_launch_utc;
                """, cmd =>
            {
                cmd.Transaction = tx;
                cmd.Parameters.AddWithValue("$id", e.Id);
                cmd.Parameters.AddWithValue("$dn", e.DisplayName);
                cmd.Parameters.AddWithValue("$on", e.OriginalName);
                cmd.Parameters.AddWithValue("$ty", (int)e.Type);
                cmd.Parameters.AddWithValue("$p", e.Path);
                cmd.Parameters.AddWithValue("$op", e.OriginalPath);
                cmd.Parameters.AddWithValue("$src", (int)e.Source);
                Add(cmd, "$tp", e.TargetPath);
                Add(cmd, "$ar", e.Arguments);
                Add(cmd, "$wd", e.WorkingDirectory);
                Add(cmd, "$il", e.IconLocation);
                Add(cmd, "$pu", e.Publisher);
                Add(cmd, "$pn", e.ProductName);
                Add(cmd, "$pd", e.ProductDescription);
                Add(cmd, "$ex", e.Extension);
                Add(cmd, "$pr", e.ProtocolOrAppId);
                cmd.Parameters.AddWithValue("$sz", e.SizeBytes);
                Add(cmd, "$lw", ToUnix(e.LastWriteUtc));
                cmd.Parameters.AddWithValue("$fs", e.FirstSeenUtc.ToUnixTimeMilliseconds());
                cmd.Parameters.AddWithValue("$ls", e.LastSeenUtc.ToUnixTimeMilliseconds());
                cmd.Parameters.AddWithValue("$cp", e.IsCloudPlaceholder ? 1 : 0);
                cmd.Parameters.AddWithValue("$rp", e.IsReparsePoint ? 1 : 0);
                cmd.Parameters.AddWithValue("$mi", e.IsMissing ? 1 : 0);
                cmd.Parameters.AddWithValue("$fa", e.IsFavorite ? 1 : 0);
                cmd.Parameters.AddWithValue("$tg", string.Join('\u001f', e.Tags));
                cmd.Parameters.AddWithValue("$og", JsonSerializer.Serialize(e.AdditionalOrigins));
                cmd.Parameters.AddWithValue("$lc", e.LaunchCount);
                Add(cmd, "$ll", ToUnix(e.LastLaunchUtc));
            });
        }
        tx.Commit();
    }

    private static void Add(SqliteCommand cmd, string name, object? value)
        => cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);

    public IReadOnlyList<LibraryEntry> GetEntries() => _db.Query("SELECT * FROM entries;", reader =>
    {
        var list = new List<LibraryEntry>();
        while (reader.Read())
        {
            var tags = reader.GetString(reader.GetOrdinal("tags"));
            var entry = new LibraryEntry
            {
                Id = reader.GetString(reader.GetOrdinal("id")),
                DisplayName = reader.GetString(reader.GetOrdinal("display_name")),
                OriginalName = reader.GetString(reader.GetOrdinal("original_name")),
                Type = (EntryType)reader.GetInt32(reader.GetOrdinal("type")),
                Path = reader.GetString(reader.GetOrdinal("path")),
                OriginalPath = reader.GetString(reader.GetOrdinal("original_path")),
                Source = (SourceKind)reader.GetInt32(reader.GetOrdinal("source")),
                TargetPath = GetNullableString(reader, "target_path"),
                Arguments = GetNullableString(reader, "arguments"),
                WorkingDirectory = GetNullableString(reader, "working_directory"),
                IconLocation = GetNullableString(reader, "icon_location"),
                Publisher = GetNullableString(reader, "publisher"),
                ProductName = GetNullableString(reader, "product_name"),
                ProductDescription = GetNullableString(reader, "product_description"),
                Extension = GetNullableString(reader, "extension"),
                ProtocolOrAppId = GetNullableString(reader, "protocol_or_appid"),
                SizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes")),
                IsCloudPlaceholder = reader.GetInt32(reader.GetOrdinal("is_cloud_placeholder")) == 1,
                IsReparsePoint = reader.GetInt32(reader.GetOrdinal("is_reparse_point")) == 1,
                IsMissing = reader.GetInt32(reader.GetOrdinal("is_missing")) == 1,
                IsFavorite = reader.GetInt32(reader.GetOrdinal("is_favorite")) == 1,
                LaunchCount = reader.GetInt32(reader.GetOrdinal("launch_count")),
                FirstSeenUtc = FromUnix(reader.GetInt64(reader.GetOrdinal("first_seen_utc"))),
                LastSeenUtc = FromUnix(reader.GetInt64(reader.GetOrdinal("last_seen_utc"))),
                Tags = tags.Length == 0 ? new List<string>() : tags.Split('\u001f').ToList()
            };
            var lw = reader.GetOrdinal("last_write_utc");
            if (!reader.IsDBNull(lw)) entry.LastWriteUtc = FromUnix(reader.GetInt64(lw));
            var ll = reader.GetOrdinal("last_launch_utc");
            if (!reader.IsDBNull(ll)) entry.LastLaunchUtc = FromUnix(reader.GetInt64(ll));
            var origins = reader.GetString(reader.GetOrdinal("origins"));
            entry.AdditionalOrigins = JsonSerializer.Deserialize<List<EntryOrigin>>(origins) ?? new();
            list.Add(entry);
        }
        return (IReadOnlyList<LibraryEntry>)list;
    });

    private static string? GetNullableString(SqliteDataReader reader, string column)
    {
        var ord = reader.GetOrdinal(column);
        return reader.IsDBNull(ord) ? null : reader.GetString(ord);
    }

    public void RemoveEntry(string entryId)
        => _db.Execute("DELETE FROM entries WHERE id=$id;", c => c.Parameters.AddWithValue("$id", entryId));

    public void SaveManualAssignment(CategoryAssignment assignment) => _db.Execute("""
        INSERT INTO manual_assignments (entry_id, category_id, is_primary, reason, created_utc)
        VALUES ($e,$c,$p,$r,$t)
        ON CONFLICT(entry_id, category_id) DO UPDATE SET is_primary=excluded.is_primary, reason=excluded.reason;
        """, cmd =>
    {
        cmd.Parameters.AddWithValue("$e", assignment.EntryId);
        cmd.Parameters.AddWithValue("$c", assignment.CategoryId);
        cmd.Parameters.AddWithValue("$p", assignment.IsPrimary ? 1 : 0);
        cmd.Parameters.AddWithValue("$r", assignment.Reason);
        cmd.Parameters.AddWithValue("$t", assignment.CreatedUtc.ToUnixTimeMilliseconds());
    });

    public void RemoveManualAssignment(string entryId, string categoryId) => _db.Execute(
        "DELETE FROM manual_assignments WHERE entry_id=$e AND category_id=$c;", cmd =>
        {
            cmd.Parameters.AddWithValue("$e", entryId);
            cmd.Parameters.AddWithValue("$c", categoryId);
        });

    public IReadOnlyList<CategoryAssignment> GetManualAssignments()
        => _db.Query("SELECT * FROM manual_assignments;", reader =>
        {
            var list = new List<CategoryAssignment>();
            while (reader.Read())
                list.Add(new CategoryAssignment
                {
                    EntryId = reader.GetString(0),
                    CategoryId = reader.GetString(1),
                    IsPrimary = reader.GetInt32(2) == 1,
                    Reason = reader.GetString(3),
                    CreatedUtc = FromUnix(reader.GetInt64(4)),
                    Source = AssignmentSource.Manual,
                    Confidence = Confidence.High
                });
            return (IReadOnlyList<CategoryAssignment>)list;
        });

    public void SaveCategory(Category category) => _db.Execute("""
        INSERT INTO categories (id,name,parent_id,icon,color,sort_order,is_hidden,is_favorite,is_system,folder_name)
        VALUES ($i,$n,$p,$ic,$co,$so,$h,$f,$s,$fn)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent_id=excluded.parent_id, icon=excluded.icon,
            color=excluded.color, sort_order=excluded.sort_order, is_hidden=excluded.is_hidden,
            is_favorite=excluded.is_favorite, folder_name=excluded.folder_name;
        """, cmd =>
    {
        cmd.Parameters.AddWithValue("$i", category.Id);
        cmd.Parameters.AddWithValue("$n", category.Name);
        Add(cmd, "$p", category.ParentId);
        cmd.Parameters.AddWithValue("$ic", category.Icon);
        Add(cmd, "$co", category.Color);
        cmd.Parameters.AddWithValue("$so", category.SortOrder);
        cmd.Parameters.AddWithValue("$h", category.IsHidden ? 1 : 0);
        cmd.Parameters.AddWithValue("$f", category.IsFavorite ? 1 : 0);
        cmd.Parameters.AddWithValue("$s", category.IsSystem ? 1 : 0);
        Add(cmd, "$fn", category.FolderName);
    });

    public void DeleteCategory(string categoryId)
    {
        _db.Execute("DELETE FROM categories WHERE id=$i AND is_system=0;",
            c => c.Parameters.AddWithValue("$i", categoryId));
        _db.Execute("DELETE FROM manual_assignments WHERE category_id=$i;",
            c => c.Parameters.AddWithValue("$i", categoryId));
    }

    public IReadOnlyList<Category> GetCategories() => _db.Query("SELECT * FROM categories ORDER BY sort_order;", reader =>
    {
        var list = new List<Category>();
        while (reader.Read())
            list.Add(new Category
            {
                Id = reader.GetString(0),
                Name = reader.GetString(1),
                ParentId = reader.IsDBNull(2) ? null : reader.GetString(2),
                Icon = reader.GetString(3),
                Color = reader.IsDBNull(4) ? null : reader.GetString(4),
                SortOrder = reader.GetInt32(5),
                IsHidden = reader.GetInt32(6) == 1,
                IsFavorite = reader.GetInt32(7) == 1,
                IsSystem = reader.GetInt32(8) == 1,
                FolderName = reader.IsDBNull(9) ? null : reader.GetString(9)
            });
        return (IReadOnlyList<Category>)list;
    });

    public void SaveRule(Rule rule) => _db.Execute("""
        INSERT INTO rules (id,name,description,conditions,effect,category_id,priority,is_enabled,created_utc,from_correction)
        VALUES ($i,$n,$d,$c,$e,$ca,$p,$en,$t,$fc)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
            conditions=excluded.conditions, effect=excluded.effect, category_id=excluded.category_id,
            priority=excluded.priority, is_enabled=excluded.is_enabled;
        """, cmd =>
    {
        cmd.Parameters.AddWithValue("$i", rule.Id);
        cmd.Parameters.AddWithValue("$n", rule.Name);
        Add(cmd, "$d", rule.Description);
        cmd.Parameters.AddWithValue("$c", JsonSerializer.Serialize(rule.Conditions));
        cmd.Parameters.AddWithValue("$e", (int)rule.Effect);
        Add(cmd, "$ca", rule.CategoryId);
        cmd.Parameters.AddWithValue("$p", rule.Priority);
        cmd.Parameters.AddWithValue("$en", rule.IsEnabled ? 1 : 0);
        cmd.Parameters.AddWithValue("$t", rule.CreatedUtc.ToUnixTimeMilliseconds());
        cmd.Parameters.AddWithValue("$fc", rule.CreatedFromCorrection ? 1 : 0);
    });

    public void DeleteRule(string ruleId)
        => _db.Execute("DELETE FROM rules WHERE id=$i;", c => c.Parameters.AddWithValue("$i", ruleId));

    public IReadOnlyList<Rule> GetRules() => _db.Query("SELECT * FROM rules ORDER BY priority DESC;", reader =>
    {
        var list = new List<Rule>();
        while (reader.Read())
            list.Add(new Rule
            {
                Id = reader.GetString(0),
                Name = reader.GetString(1),
                Description = reader.IsDBNull(2) ? null : reader.GetString(2),
                Conditions = JsonSerializer.Deserialize<List<RuleCondition>>(reader.GetString(3)) ?? new(),
                Effect = (RuleEffectKind)reader.GetInt32(4),
                CategoryId = reader.IsDBNull(5) ? null : reader.GetString(5),
                Priority = reader.GetInt32(6),
                IsEnabled = reader.GetInt32(7) == 1,
                CreatedUtc = FromUnix(reader.GetInt64(8)),
                CreatedFromCorrection = reader.GetInt32(9) == 1
            });
        return (IReadOnlyList<Rule>)list;
    });

    public string? GetSetting(string key) => _db.Query("SELECT value FROM settings WHERE key=$k;",
        r => r.Read() ? r.GetString(0) : null, c => c.Parameters.AddWithValue("$k", key));

    public void SetSetting(string key, string value) => _db.Execute(
        "INSERT INTO settings (key,value) VALUES ($k,$v) ON CONFLICT(key) DO UPDATE SET value=excluded.value;",
        cmd =>
        {
            cmd.Parameters.AddWithValue("$k", key);
            cmd.Parameters.AddWithValue("$v", value);
        });
}
