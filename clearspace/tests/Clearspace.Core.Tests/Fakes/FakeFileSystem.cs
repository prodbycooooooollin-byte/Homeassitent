using Clearspace.Core.Abstractions;

namespace Clearspace.Core.Tests.Fakes;

/// <summary>Dateisystem im Arbeitsspeicher mit Windows-aehnlichen Pfaden fuer isolierte Tests.</summary>
public sealed class FakeFileSystem : IFileSystem
{
    private readonly Dictionary<string, FileEntryInfo> _files = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _directories = new(StringComparer.OrdinalIgnoreCase);

    public List<string> MoveLog { get; } = new();

    public FakeFileSystem AddDirectory(string path)
    {
        var normalized = Normalize(path);
        _directories.Add(normalized);
        var parent = ParentOf(normalized);
        while (parent.Length > 0 && _directories.Add(parent)) parent = ParentOf(parent);
        return this;
    }

    public FakeFileSystem AddFile(string path, long size = 100, DateTimeOffset? lastWrite = null,
        bool reparsePoint = false, bool cloudPlaceholder = false)
    {
        var normalized = Normalize(path);
        AddDirectory(ParentOf(normalized));
        _files[normalized] = new FileEntryInfo(normalized, NameOf(normalized), false, size,
            lastWrite ?? DateTimeOffset.UnixEpoch.AddDays(1), reparsePoint, cloudPlaceholder, false);
        return this;
    }

    public FakeFileSystem AddFolderEntry(string path, bool reparsePoint = false)
    {
        var normalized = Normalize(path);
        AddDirectory(normalized);
        _files[normalized] = new FileEntryInfo(normalized, NameOf(normalized), true, 0,
            DateTimeOffset.UnixEpoch.AddDays(1), reparsePoint, false, false);
        return this;
    }

    public void Touch(string path, long newSize)
    {
        var normalized = Normalize(path);
        var old = _files[normalized];
        _files[normalized] = old with { SizeBytes = newSize, LastWriteUtc = old.LastWriteUtc.AddMinutes(5) };
    }

    private static string Normalize(string path) => path.Replace('/', '\\').TrimEnd('\\');
    private static string ParentOf(string path)
    {
        var idx = path.LastIndexOf('\\');
        return idx <= 0 ? string.Empty : path[..idx];
    }
    private static string NameOf(string path)
    {
        var idx = path.LastIndexOf('\\');
        return idx < 0 ? path : path[(idx + 1)..];
    }

    public bool FileExists(string path) => _files.TryGetValue(Normalize(path), out var f) && !f.IsDirectory;
    public bool DirectoryExists(string path) => _directories.Contains(Normalize(path));

    public FileEntryInfo? GetInfo(string path)
    {
        var normalized = Normalize(path);
        if (_files.TryGetValue(normalized, out var info)) return info;
        if (_directories.Contains(normalized))
            return new FileEntryInfo(normalized, NameOf(normalized), true, 0, DateTimeOffset.UnixEpoch, false, false, false);
        return null;
    }

    public IEnumerable<FileEntryInfo> EnumerateTopLevel(string directory)
    {
        var normalized = Normalize(directory);
        foreach (var file in _files.Values)
            if (string.Equals(ParentOf(file.Path), normalized, StringComparison.OrdinalIgnoreCase))
                yield return file;
    }

    public void CreateDirectory(string path) => AddDirectory(path);

    public void MoveFile(string source, string destination)
    {
        var src = Normalize(source);
        var dst = Normalize(destination);
        if (!_files.ContainsKey(src)) throw new FileNotFoundException("Quelle fehlt", src);
        if (_files.ContainsKey(dst) || _directories.Contains(dst))
            throw new IOException("Ziel existiert bereits: " + dst);
        var info = _files[src];
        _files.Remove(src);
        AddDirectory(ParentOf(dst));
        _files[dst] = info with { Path = dst, Name = NameOf(dst) };
        MoveLog.Add($"{src} -> {dst}");
    }

    public string GetVolumeId(string path)
    {
        var normalized = Normalize(path);
        if (normalized.StartsWith("\\\\", StringComparison.Ordinal)) return "UNC";
        return normalized.Length >= 2 && normalized[1] == ':' ? normalized[..2].ToUpperInvariant() : "C:";
    }

    public string ReadAllText(string path) => string.Empty;
    public void WriteAllText(string path, string content) => AddFile(path, content.Length);
}
