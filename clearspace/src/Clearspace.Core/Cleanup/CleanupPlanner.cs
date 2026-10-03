using Clearspace.Core.Abstractions;
using Clearspace.Core.Categorization;
using Clearspace.Core.Model;

namespace Clearspace.Core.Cleanup;

public sealed class CleanupOptions
{
    /// <summary>Dauerhaftes Benutzerverzeichnis der Bibliothek (Modus A). Kein Cache, kein Temp.</summary>
    public required string LibraryRoot { get; init; }

    /// <summary>Desktop-Verzeichnis, in dem im Ordnermodus (B) die Themenordner entstehen.</summary>
    public string? DesktopRoot { get; init; }

    /// <summary>Eintraege, die durch Regeln geschuetzt sind oder auf dem Desktop bleiben sollen.</summary>
    public HashSet<string> ProtectedEntryIds { get; init; } = new(StringComparer.Ordinal);

    /// <summary>Nur diese Eintraege beruecksichtigen (null = alle).</summary>
    public HashSet<string>? OnlyEntryIds { get; init; }

    /// <summary>Im Ordnermodus: Unterordner je Hauptbereich statt vollstaendiger Kategoriehierarchie.</summary>
    public bool FlattenToRootCategories { get; init; } = true;
}

/// <summary>
/// Erzeugt den Aufraeumplan. Es werden ausschliesslich Verknuepfungsdateien zum Verschieben
/// vorgeschlagen; echte Dateien, Ordner, Plugins, Samples und Projekte bleiben virtuell.
/// </summary>
public sealed class CleanupPlanner
{
    private readonly IFileSystem _fs;
    private readonly IReadOnlyDictionary<string, Category> _categories;

    public CleanupPlanner(IFileSystem fs, IEnumerable<Category> categories)
    {
        _fs = fs;
        _categories = categories.ToDictionary(c => c.Id, StringComparer.Ordinal);
    }

    public CleanupPlan CreatePlan(
        IEnumerable<LibraryEntry> entries,
        IReadOnlyDictionary<string, CategoryAssignment> primaryByEntry,
        CleanupMode mode,
        CleanupOptions options)
    {
        var plan = new CleanupPlan { Id = Guid.NewGuid().ToString("n"), Mode = mode };
        var plannedTargets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in entries)
        {
            if (options.OnlyEntryIds is not null && !options.OnlyEntryIds.Contains(entry.Id)) continue;

            primaryByEntry.TryGetValue(entry.Id, out var assignment);
            var categoryId = assignment?.CategoryId ?? CategoryCatalog.Inbox;
            var categoryLabel = _categories.TryGetValue(categoryId, out var cat) ? cat.Name : categoryId;

            var action = new PlannedAction
            {
                Id = Guid.NewGuid().ToString("n"),
                EntryId = entry.Id,
                EntryName = entry.DisplayName,
                Kind = PlannedActionKind.VirtualOnly,
                SourcePath = entry.Path,
                CategoryId = categoryId,
                CategoryLabel = categoryLabel,
                Confidence = assignment?.Confidence ?? Confidence.Low,
                Reason = assignment?.Reason ?? "Keine belastbaren Hinweise gefunden"
            };

            var skip = EvaluateSkip(entry, categoryId, mode, options);
            if (skip.reason != SkipReason.None)
            {
                action.SkipReason = skip.reason;
                action.SkipExplanation = skip.explanation;
                plan.Actions.Add(action);
                plan.Remaining.Add(new RemainingItem(entry.Id, entry.DisplayName, entry.Type, skip.explanation));
                continue;
            }

            var targetDir = BuildTargetDirectory(categoryId, mode, options);
            var targetPath = PathUtil.Combine(targetDir, entry.OriginalName);

            if (!SameVolume(entry.Path, targetDir))
            {
                action.SkipReason = SkipReason.CrossVolume;
                action.SkipExplanation = "Quelle und Ziel liegen auf verschiedenen Laufwerken. " +
                                         "Volumeuebergreifende Aktionen fuehrt Clearspace nicht aus.";
                plan.Actions.Add(action);
                plan.Remaining.Add(new RemainingItem(entry.Id, entry.DisplayName, entry.Type, action.SkipExplanation));
                continue;
            }

            // Konflikte bereits im Plan sichtbar machen, ohne etwas zu ueberschreiben.
            targetPath = ResolveConflictFreeTarget(targetPath, plannedTargets);
            plannedTargets.Add(targetPath);

            var moved = new PlannedAction
            {
                Id = action.Id,
                EntryId = entry.Id,
                EntryName = entry.DisplayName,
                Kind = PlannedActionKind.MoveShortcut,
                SourcePath = entry.Path,
                TargetPath = targetPath,
                CategoryId = categoryId,
                CategoryLabel = categoryLabel,
                Confidence = action.Confidence,
                Reason = action.Reason,
                SourceFingerprint = Fingerprint(entry.Path)
            };
            plan.Actions.Add(moved);
        }

        return plan;
    }

    private (SkipReason reason, string explanation) EvaluateSkip(
        LibraryEntry entry, string categoryId, CleanupMode mode, CleanupOptions options)
    {
        if (mode == CleanupMode.VisibilityOnly)
            return (SkipReason.NotMovable,
                "Sichtbarkeitsmodus: Es werden keine Dateien verschoben, nur Symbole ein- oder ausgeblendet.");

        if (options.ProtectedEntryIds.Contains(entry.Id))
            return (SkipReason.Protected, "Eine Schutzregel haelt diesen Eintrag auf dem Desktop.");

        if (entry.Type == EntryType.SpecialDesktopIcon)
            return (SkipReason.NotMovable, "Besonderes Windows-Symbol (z. B. Papierkorb) wird nicht veraendert.");

        if (EntryTypeClassifierBridge.IsProtectedByType(entry.Type))
            return (SkipReason.NotMovable, TypeExplanation(entry.Type));

        if (!entry.IsMovableShortcut)
            return (SkipReason.NotMovable, "Nur Verknuepfungen auf dem Desktop werden verschoben.");

        if (entry.Source == SourceKind.PublicDesktop)
            return (SkipReason.AccessDenied,
                "Liegt auf dem oeffentlichen Desktop. Aenderungen dort benoetigen erhoehte Rechte und werden uebersprungen.");

        if (entry.IsReparsePoint)
            return (SkipReason.ReparsePoint, "Verweis (Symlink oder Junction) wird nicht verschoben.");

        if (entry.IsCloudPlaceholder)
            return (SkipReason.CloudPlaceholder,
                "Cloud-Platzhalter: Die Datei ist nicht lokal verfuegbar und wird nicht angefasst.");

        if (categoryId == CategoryCatalog.Inbox)
            return (SkipReason.Protected,
                "Noch keine sichere Zuordnung. Der Eintrag bleibt sichtbar im Eingang.");

        if (entry.Type != EntryType.InternetShortcut
            && !string.IsNullOrWhiteSpace(entry.TargetPath)
            && !PathUtil.IsAbsoluteWindowsPath(entry.TargetPath!))
            return (SkipReason.RelativeTargetRisk,
                "Die Verknuepfung nutzt einen relativen Zielpfad. Ein Umzug koennte sie unbrauchbar machen.");

        return (SkipReason.None, string.Empty);
    }

    private static string TypeExplanation(EntryType type) => type switch
    {
        EntryType.PluginFile => "Plugin-Datei: Pfade koennen von DAW oder Manager benoetigt werden, bleibt unveraendert.",
        EntryType.PresetFile => "Preset- bzw. Soundbank-Datei bleibt an ihrem Platz.",
        EntryType.SampleFile => "Sample-Datei bleibt an ihrem Platz, da Projekte darauf verweisen koennen.",
        EntryType.ProjectFile => "Projektdatei bleibt an ihrem Platz, da Verweise auf Samples bestehen koennen.",
        EntryType.PortableApp => "Portables Programm wird nicht verschoben.",
        EntryType.InstalledApp => "Installierte Anwendung wird nicht veraendert.",
        EntryType.Folder => "Unbekannte Ordner bleiben standardmaessig unveraendert.",
        _ => "Dieser Eintragstyp wird nicht automatisch verschoben."
    };

    private string BuildTargetDirectory(string categoryId, CleanupMode mode, CleanupOptions options)
    {
        if (mode == CleanupMode.FolderOrganisation && options.DesktopRoot is not null)
        {
            var rootId = CategoryCatalog.RootOf(_categories, categoryId);
            var root = _categories.TryGetValue(rootId, out var rc) ? rc : null;
            var folder = PathUtil.SanitizeFolderName(root?.FolderName ?? root?.Name ?? "Sonstiges");
            return PathUtil.Combine(options.DesktopRoot, folder);
        }

        // Modus A: vollstaendige Kategoriehierarchie unterhalb der Bibliothek.
        var chain = CategoryCatalog.AncestorChain(_categories, categoryId).Reverse()
            .Select(id => PathUtil.SanitizeFolderName(_categories.TryGetValue(id, out var c) ? c.Name : id))
            .ToArray();
        return chain.Length == 0
            ? PathUtil.Combine(options.LibraryRoot, "Sonstiges")
            : PathUtil.Combine(options.LibraryRoot, chain);
    }

    private bool SameVolume(string a, string b)
    {
        try { return string.Equals(_fs.GetVolumeId(a), _fs.GetVolumeId(b), StringComparison.OrdinalIgnoreCase); }
        catch { return true; }
    }

    /// <summary>Niemals ueberschreiben: existierende oder bereits eingeplante Ziele weichen aus.</summary>
    public string ResolveConflictFreeTarget(string desiredPath, HashSet<string>? plannedTargets = null)
    {
        var dir = PathUtil.GetDirectory(desiredPath);
        var stem = PathUtil.GetFileNameWithoutExtension(desiredPath);
        var ext = PathUtil.GetExtension(desiredPath);
        var candidate = desiredPath;
        var index = 2;
        while (_fs.FileExists(candidate) || _fs.DirectoryExists(candidate)
               || (plannedTargets?.Contains(candidate) ?? false))
        {
            candidate = PathUtil.Combine(dir, $"{stem} ({index}){ext}");
            index++;
            if (index > 999) throw new InvalidOperationException("Zu viele Namenskonflikte im Zielverzeichnis.");
        }
        return candidate;
    }

    public string? Fingerprint(string path)
    {
        var info = _fs.GetInfo(path);
        return info is null ? null : $"{info.SizeBytes}:{info.LastWriteUtc.ToUnixTimeMilliseconds()}";
    }
}

/// <summary>Bruecke zum Typklassifizierer, damit Cleanup nicht direkt von Scanning abhaengt.</summary>
internal static class EntryTypeClassifierBridge
{
    public static bool IsProtectedByType(EntryType type)
        => Scanning.EntryTypeClassifier.IsProtectedByType(type);
}
