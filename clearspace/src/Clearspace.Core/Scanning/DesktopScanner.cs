using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;

namespace Clearspace.Core.Scanning;

public sealed record ScanReport(
    IReadOnlyList<LibraryEntry> Entries,
    IReadOnlyList<ScanSource> ScannedSources,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Erfasst die freigegebenen Quellen. Es wird niemals ungefragt rekursiv die Festplatte gescannt:
/// Desktop-Quellen werden nur eine Ebene tief gelesen, Unterordner bleiben ein einzelner Eintrag.
/// </summary>
public sealed class DesktopScanner
{
    private readonly IFileSystem _fs;
    private readonly IShortcutResolver _shortcuts;
    private readonly IClock _clock;

    public DesktopScanner(IFileSystem fs, IShortcutResolver shortcuts, IClock? clock = null)
    {
        _fs = fs;
        _shortcuts = shortcuts;
        _clock = clock ?? new SystemClock();
    }

    public ScanReport Scan(IEnumerable<ScanSource> sources)
    {
        var entries = new List<LibraryEntry>();
        var warnings = new List<string>();
        var scanned = new List<ScanSource>();

        foreach (var source in sources)
        {
            if (!_fs.DirectoryExists(source.Path))
            {
                warnings.Add($"Quelle \"{source.Label}\" wurde nicht gefunden: {source.Path}");
                continue;
            }

            scanned.Add(source);
            IEnumerable<FileEntryInfo> items;
            try
            {
                items = _fs.EnumerateTopLevel(source.Path).ToList();
            }
            catch (UnauthorizedAccessException)
            {
                warnings.Add($"Quelle \"{source.Label}\" konnte nicht gelesen werden (fehlende Berechtigung).");
                continue;
            }

            foreach (var item in items)
            {
                if (item.Name.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;
                try
                {
                    entries.Add(CreateEntry(item, source));
                }
                catch (Exception ex)
                {
                    warnings.Add($"\"{item.Name}\" konnte nicht ausgewertet werden: {ex.Message}");
                }
            }
        }

        return new ScanReport(entries, scanned, warnings);
    }

    private LibraryEntry CreateEntry(FileEntryInfo info, ScanSource source)
    {
        ShortcutInfo? shortcut = null;
        if (!info.IsDirectory && !info.IsCloudPlaceholder && _shortcuts.CanResolve(info.Path))
        {
            // Aufloesen dient ausschliesslich der Analyse; es wird nichts gestartet.
            try { shortcut = _shortcuts.Resolve(info.Path); }
            catch { shortcut = null; }
        }

        var type = EntryTypeClassifier.Classify(info, shortcut);
        var displayName = info.IsDirectory
            ? info.Name
            : StripKnownExtension(info.Name);

        var entry = new LibraryEntry
        {
            Id = MakeId(info.Path),
            DisplayName = displayName,
            OriginalName = info.Name,
            Path = info.Path,
            OriginalPath = info.Path,
            Source = source.Kind,
            Type = type,
            TargetPath = shortcut?.TargetPath,
            Arguments = shortcut?.Arguments,
            WorkingDirectory = shortcut?.WorkingDirectory,
            IconLocation = shortcut?.IconLocation,
            ProductDescription = shortcut?.Description,
            ProtocolOrAppId = shortcut?.ProtocolOrAppId,
            Extension = info.IsDirectory ? null : System.IO.Path.GetExtension(info.Name),
            SizeBytes = info.SizeBytes,
            LastWriteUtc = info.LastWriteUtc,
            IsCloudPlaceholder = info.IsCloudPlaceholder,
            IsReparsePoint = info.IsReparsePoint,
            FirstSeenUtc = _clock.UtcNow,
            LastSeenUtc = _clock.UtcNow
        };

        // Metadaten nur lesen, wenn ein echtes lokales Ziel vorliegt (keine Cloud-Downloads erzwingen).
        var metaTarget = shortcut?.TargetPath ?? (type == EntryType.PortableApp ? info.Path : null);
        if (metaTarget is not null && !info.IsCloudPlaceholder && _fs.FileExists(metaTarget))
        {
            try
            {
                var meta = _shortcuts.ReadMetadata(metaTarget);
                if (meta is not null)
                {
                    entry.Publisher = meta.Publisher;
                    entry.ProductName = meta.ProductName;
                    entry.ProductDescription ??= meta.FileDescription;
                    if (string.IsNullOrWhiteSpace(entry.ProductDescription))
                        entry.ProductDescription = meta.FileDescription;
                }
            }
            catch { /* Metadaten sind optional */ }
        }

        return entry;
    }

    private static string StripKnownExtension(string fileName)
    {
        var ext = System.IO.Path.GetExtension(fileName);
        return ext.Equals(".lnk", StringComparison.OrdinalIgnoreCase)
               || ext.Equals(".url", StringComparison.OrdinalIgnoreCase)
            ? System.IO.Path.GetFileNameWithoutExtension(fileName)
            : fileName;
    }

    /// <summary>Stabile Id aus dem Erstfundort, damit manuelle Zuordnungen Rescans ueberleben.</summary>
    public static string MakeId(string path)
    {
        var normalized = path.Replace('/', '\\').ToLowerInvariant();
        var bytes = System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(bytes)[..16].ToLowerInvariant();
    }
}
