using Clearspace.Core.Abstractions;

namespace Clearspace.Core.Tests.Fakes;

public sealed class FakeShortcutResolver : IShortcutResolver
{
    private readonly Dictionary<string, ShortcutInfo> _shortcuts = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, FileMetadata> _metadata = new(StringComparer.OrdinalIgnoreCase);

    public FakeShortcutResolver Add(string lnkPath, string? target, string? arguments = null,
        string? workingDirectory = null, string? description = null, string? protocol = null)
    {
        _shortcuts[Normalize(lnkPath)] = new ShortcutInfo(target, arguments, workingDirectory, null,
            description, protocol, target is not null && !IsAbsolute(target));
        return this;
    }

    public FakeShortcutResolver AddMetadata(string exePath, string? publisher, string? product, string? description)
    {
        _metadata[Normalize(exePath)] = new FileMetadata(publisher, product, description);
        return this;
    }

    private static string Normalize(string path) => path.Replace('/', '\\');
    private static bool IsAbsolute(string p) => p.Length > 2 && p[1] == ':' || p.StartsWith("\\\\", StringComparison.Ordinal);

    public bool CanResolve(string path) =>
        path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".url", StringComparison.OrdinalIgnoreCase);

    public ShortcutInfo? Resolve(string path) => _shortcuts.TryGetValue(Normalize(path), out var s) ? s : null;

    public FileMetadata? ReadMetadata(string executablePath)
        => _metadata.TryGetValue(Normalize(executablePath), out var m) ? m : null;
}

public sealed class FixedClock : Clearspace.Core.Abstractions.IClock
{
    public DateTimeOffset UtcNow { get; set; } = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
}
