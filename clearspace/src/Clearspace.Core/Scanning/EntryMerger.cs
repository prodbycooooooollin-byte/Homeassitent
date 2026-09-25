using Clearspace.Core.Model;

namespace Clearspace.Core.Scanning;

/// <summary>
/// Fasst Verknuepfungen zum gleichen Programm in der Darstellung zusammen. Originale bleiben
/// unangetastet; unterschiedliche Startparameter oder Arbeitsverzeichnisse gelten als
/// eigenstaendige Startprofile und werden nicht zusammengefuehrt.
/// </summary>
public static class EntryMerger
{
    public static IReadOnlyList<LibraryEntry> Merge(IEnumerable<LibraryEntry> entries)
    {
        var result = new List<LibraryEntry>();
        var byKey = new Dictionary<string, LibraryEntry>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in entries)
        {
            var key = MergeKey(entry);
            if (key is null) { result.Add(entry); continue; }

            if (byKey.TryGetValue(key, out var primary))
            {
                primary.AdditionalOrigins.Add(new EntryOrigin
                {
                    Path = entry.Path,
                    Source = entry.Source,
                    Arguments = entry.Arguments,
                    WorkingDirectory = entry.WorkingDirectory
                });
                continue;
            }

            byKey[key] = entry;
            result.Add(entry);
        }

        return result;
    }

    /// <summary>Null = nicht zusammenfassbar (bleibt immer ein eigener Eintrag).</summary>
    private static string? MergeKey(LibraryEntry entry)
    {
        if (entry.Type is not (EntryType.AppShortcut or EntryType.GameShortcut or EntryType.InternetShortcut))
            return null;

        var target = entry.TargetPath ?? entry.ProtocolOrAppId;
        if (string.IsNullOrWhiteSpace(target)) return null;

        // Startparameter und Arbeitsverzeichnis gehen in den Schluessel ein: unterschiedliche
        // Startprofile bleiben dadurch getrennt sichtbar.
        return string.Join('|',
            target.Replace('/', '\\').ToLowerInvariant(),
            (entry.Arguments ?? string.Empty).Trim().ToLowerInvariant(),
            (entry.WorkingDirectory ?? string.Empty).Replace('/', '\\').TrimEnd('\\').ToLowerInvariant());
    }

    /// <summary>Sortiert Herkuenfte so, dass Desktop-Fundorte bevorzugt der Primaereintrag sind.</summary>
    public static int SourcePreference(SourceKind kind) => kind switch
    {
        SourceKind.UserDesktop => 0,
        SourceKind.PublicDesktop => 1,
        SourceKind.StartMenu => 2,
        SourceKind.InstalledApps => 3,
        _ => 4
    };
}
