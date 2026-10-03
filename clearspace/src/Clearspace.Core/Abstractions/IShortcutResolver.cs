using Clearspace.Core.Model;

namespace Clearspace.Core.Abstractions;

/// <summary>Aufgeloeste Verknuepfungsinformationen. Das Ziel wird nie gestartet.</summary>
public sealed record ShortcutInfo(
    string? TargetPath,
    string? Arguments,
    string? WorkingDirectory,
    string? IconLocation,
    string? Description,
    string? ProtocolOrAppId,
    bool TargetIsRelative);

/// <summary>Dateimetadaten (Versionsinfo) einer ausfuehrbaren Datei.</summary>
public sealed record FileMetadata(string? Publisher, string? ProductName, string? FileDescription);

public interface IShortcutResolver
{
    bool CanResolve(string path);

    /// <summary>Loest eine Verknuepfung ausschliesslich zur Analyse auf.</summary>
    ShortcutInfo? Resolve(string path);

    FileMetadata? ReadMetadata(string executablePath);
}

/// <summary>Quelle erfassbarer Verzeichnisse (Known Folders, ausgewaehlte Ordner).</summary>
public sealed record ScanSource(string Path, SourceKind Kind, string Label, bool IsWritable);

public interface IScanSourceProvider
{
    /// <summary>Benutzerdesktop, umgeleitete/OneDrive-Pfade und oeffentlicher Desktop.</summary>
    IReadOnlyList<ScanSource> GetDesktopSources();

    /// <summary>Startmenue-Verzeichnisse (nur lesend).</summary>
    IReadOnlyList<ScanSource> GetStartMenuSources();

    /// <summary>Installierte Anwendungen aus den dokumentierten Registrierungsquellen.</summary>
    IReadOnlyList<LibraryEntry> GetInstalledApplications();

    /// <summary>Dauerhaftes Benutzerverzeichnis der Clearspace-Bibliothek (kein Cache, kein Temp).</summary>
    string GetLibraryRoot();

    /// <summary>Verzeichnis fuer Datenbank und Journal.</summary>
    string GetDataRoot();
}
