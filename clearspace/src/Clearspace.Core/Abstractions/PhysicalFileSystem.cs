namespace Clearspace.Core.Abstractions;

/// <summary>Echtes Dateisystem. Cloud-Platzhalter werden erkannt, aber nie heruntergeladen.</summary>
public sealed class PhysicalFileSystem : IFileSystem
{
    // Dokumentierte Attribute fuer Cloud-Platzhalter (Windows).
    private const FileAttributes RecallOnOpen = (FileAttributes)0x00040000;      // FILE_ATTRIBUTE_RECALL_ON_OPEN
    private const FileAttributes RecallOnDataAccess = (FileAttributes)0x00400000; // FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
    private const FileAttributes Offline = FileAttributes.Offline;

    public bool FileExists(string path) => File.Exists(path);
    public bool DirectoryExists(string path) => Directory.Exists(path);

    public FileEntryInfo? GetInfo(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                var di = new DirectoryInfo(path);
                return new FileEntryInfo(di.FullName, di.Name, true, 0,
                    di.LastWriteTimeUtc, IsReparse(di.Attributes), false, di.Attributes.HasFlag(FileAttributes.Hidden));
            }
            if (!File.Exists(path)) return null;
            var fi = new FileInfo(path);
            return new FileEntryInfo(fi.FullName, fi.Name, false, fi.Length,
                fi.LastWriteTimeUtc, IsReparse(fi.Attributes), IsPlaceholder(fi.Attributes),
                fi.Attributes.HasFlag(FileAttributes.Hidden));
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    private static bool IsReparse(FileAttributes attributes) => attributes.HasFlag(FileAttributes.ReparsePoint);

    private static bool IsPlaceholder(FileAttributes attributes)
        => attributes.HasFlag(Offline) || attributes.HasFlag(RecallOnOpen) || attributes.HasFlag(RecallOnDataAccess);

    public IEnumerable<FileEntryInfo> EnumerateTopLevel(string directory)
    {
        var di = new DirectoryInfo(directory);
        foreach (var entry in di.EnumerateFileSystemInfos("*", new EnumerationOptions
                 {
                     IgnoreInaccessible = true,
                     RecurseSubdirectories = false,
                     AttributesToSkip = FileAttributes.System,
                     ReturnSpecialDirectories = false
                 }))
        {
            FileEntryInfo? info = null;
            try
            {
                var isDir = entry is DirectoryInfo;
                info = new FileEntryInfo(
                    entry.FullName,
                    entry.Name,
                    isDir,
                    isDir ? 0 : ((FileInfo)entry).Length,
                    entry.LastWriteTimeUtc,
                    IsReparse(entry.Attributes),
                    !isDir && IsPlaceholder(entry.Attributes),
                    entry.Attributes.HasFlag(FileAttributes.Hidden));
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            if (info is not null) yield return info;
        }
    }

    public void CreateDirectory(string path) => Directory.CreateDirectory(path);

    public void MoveFile(string source, string destination)
    {
        // overwrite: false ist entscheidend - es darf nie eine bestehende Datei ueberschrieben werden.
        File.Move(source, destination, overwrite: false);
    }

    public string GetVolumeId(string path)
    {
        var full = Path.GetFullPath(path);
        var root = Path.GetPathRoot(full);
        return string.IsNullOrEmpty(root) ? "/" : root!;
    }

    public string ReadAllText(string path) => File.ReadAllText(path);

    public void WriteAllText(string path, string content)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(path, content);
    }
}
