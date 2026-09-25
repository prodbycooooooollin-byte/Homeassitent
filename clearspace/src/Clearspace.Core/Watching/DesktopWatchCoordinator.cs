using Clearspace.Core.Abstractions;
using Clearspace.Core.Cleanup;

namespace Clearspace.Core.Watching;

public enum FileChangeKind { Created, Changed, Renamed, Deleted }

public sealed record FileChange(string Path, FileChangeKind Kind, DateTimeOffset At, string? OldPath = null);

public enum BatchAction
{
    /// <summary>Nur indexieren und Vorschlaege erzeugen - Standardverhalten.</summary>
    IndexOnly,
    /// <summary>Aus dem Index entfernen bzw. als fehlend markieren.</summary>
    Remove
}

public sealed record WatchBatchItem(string Path, BatchAction Action, FileChangeKind LastKind);

/// <summary>
/// Ereignisbasierte Ueberwachung mit Entprellung. Doppelte, fehlende und umsortierte Ereignisse
/// werden zusammengefasst; eigene Aktionen loesen keine Schleifen aus.
/// </summary>
public sealed class DesktopWatchCoordinator
{
    private readonly IFileSystem _fs;
    private readonly TimeSpan _debounce;
    private readonly TimeSpan _ownActionWindow;

    private readonly Dictionary<string, PendingChange> _pending = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, DateTimeOffset> _ownActions = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<string> _excludedRoots = new();
    private readonly Dictionary<string, (long size, DateTimeOffset seenAt)> _sizeProbe = new(StringComparer.OrdinalIgnoreCase);

    private sealed class PendingChange
    {
        public required string Path { get; init; }
        public FileChangeKind LastKind { get; set; }
        public DateTimeOffset LastActivity { get; set; }
        public bool Deleted { get; set; }
        public bool Created { get; set; }
    }

    public DesktopWatchCoordinator(IFileSystem fs, TimeSpan? debounce = null, TimeSpan? ownActionWindow = null)
    {
        _fs = fs;
        _debounce = debounce ?? TimeSpan.FromSeconds(2);
        _ownActionWindow = ownActionWindow ?? TimeSpan.FromSeconds(30);
    }

    public bool IsPaused { get; set; }

    /// <summary>Verzeichnisse, die nie beobachtet werden (z. B. die Clearspace-Bibliothek selbst).</summary>
    public void Exclude(string rootPath) => _excludedRoots.Add(rootPath);

    /// <summary>Meldet eine eigene Dateiaktion an, damit sie keine Reaktion ausloest.</summary>
    public void NotifyOwnAction(string path, DateTimeOffset at) => _ownActions[path] = at;

    public void Report(FileChange change)
    {
        if (IsPaused) return;
        if (_excludedRoots.Any(root => PathUtil.IsInside(change.Path, root))) return;

        if (IsOwnAction(change.Path, change.At))
        {
            _ownActions.Remove(change.Path);
            return;
        }

        if (change.Kind == FileChangeKind.Renamed && change.OldPath is not null)
            Track(change.OldPath, FileChangeKind.Deleted, change.At);

        Track(change.Path, change.Kind, change.At);
    }

    private bool IsOwnAction(string path, DateTimeOffset at)
        => _ownActions.TryGetValue(path, out var when) && at - when <= _ownActionWindow;

    private void Track(string path, FileChangeKind kind, DateTimeOffset at)
    {
        if (!_pending.TryGetValue(path, out var pending))
        {
            pending = new PendingChange { Path = path, LastKind = kind, LastActivity = at };
            _pending[path] = pending;
        }
        pending.LastKind = kind;
        if (at > pending.LastActivity) pending.LastActivity = at;
        if (kind == FileChangeKind.Deleted) pending.Deleted = true;
        if (kind is FileChangeKind.Created or FileChangeKind.Renamed) { pending.Created = true; pending.Deleted = false; }
    }

    /// <summary>
    /// Liefert die Aenderungen, deren Entprellzeit abgelaufen ist und deren Schreibvorgang
    /// abgeschlossen scheint (stabile Groesse zwischen zwei Durchlaeufen).
    /// </summary>
    public IReadOnlyList<WatchBatchItem> Drain(DateTimeOffset now)
    {
        var ready = new List<WatchBatchItem>();
        if (IsPaused) return ready;

        foreach (var pending in _pending.Values.ToList())
        {
            if (now - pending.LastActivity < _debounce) continue;

            var exists = _fs.FileExists(pending.Path) || _fs.DirectoryExists(pending.Path);
            if (!exists)
            {
                // Fehlende oder nachtraeglich geloeschte Datei: sauber entfernen statt neu anzulegen.
                _pending.Remove(pending.Path);
                _sizeProbe.Remove(pending.Path);
                ready.Add(new WatchBatchItem(pending.Path, BatchAction.Remove, pending.LastKind));
                continue;
            }

            if (!IsWriteFinished(pending.Path, now)) continue;

            _pending.Remove(pending.Path);
            _sizeProbe.Remove(pending.Path);
            ready.Add(new WatchBatchItem(pending.Path, BatchAction.IndexOnly, pending.LastKind));
        }

        // Abgelaufene Eigenaktionen aufraeumen.
        foreach (var key in _ownActions.Where(kv => now - kv.Value > _ownActionWindow).Select(kv => kv.Key).ToList())
            _ownActions.Remove(key);

        return ready;
    }

    /// <summary>Wartet auf eine zwischen zwei Durchlaeufen unveraenderte Groesse.</summary>
    private bool IsWriteFinished(string path, DateTimeOffset now)
    {
        var info = _fs.GetInfo(path);
        if (info is null) return false;
        if (info.IsDirectory) return true;

        if (_sizeProbe.TryGetValue(path, out var probe) && probe.size == info.SizeBytes && now > probe.seenAt)
            return true;

        _sizeProbe[path] = (info.SizeBytes, now);
        return false;
    }

    public int PendingCount => _pending.Count;
}
