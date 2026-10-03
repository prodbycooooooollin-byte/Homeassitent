namespace Clearspace.Core.Abstractions;

/// <summary>Beschreibung eines Dateisystemeintrags ohne Windows-Abhaengigkeit.</summary>
public sealed record FileEntryInfo(
    string Path,
    string Name,
    bool IsDirectory,
    long SizeBytes,
    DateTimeOffset LastWriteUtc,
    bool IsReparsePoint,
    bool IsCloudPlaceholder,
    bool IsHidden);

/// <summary>
/// Abstraktion aller Dateisystemzugriffe. Ermoeglicht Tests in temporaeren Verzeichnissen und
/// haelt den Kern plattformneutral.
/// </summary>
public interface IFileSystem
{
    bool FileExists(string path);
    bool DirectoryExists(string path);
    FileEntryInfo? GetInfo(string path);

    /// <summary>Nicht rekursiv. Zyklen durch Reparse-Points werden nicht verfolgt.</summary>
    IEnumerable<FileEntryInfo> EnumerateTopLevel(string directory);

    void CreateDirectory(string path);

    /// <summary>Verschiebt eine Datei. Muss fehlschlagen, wenn das Ziel bereits existiert.</summary>
    void MoveFile(string source, string destination);

    /// <summary>Volume-/Laufwerkskennung, um volumeuebergreifende Aktionen zu erkennen.</summary>
    string GetVolumeId(string path);

    string ReadAllText(string path);
    void WriteAllText(string path, string content);
}
