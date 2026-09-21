using Clearspace.Core.Abstractions;
using Clearspace.Core.Watching;

namespace Clearspace.Windows;

/// <summary>
/// Verbindet FileSystemWatcher mit dem entprellenden Koordinator. Ergaenzend laeuft ein
/// regelmaessiger Abgleich, damit verlorene Ereignisse nicht dauerhaft unbemerkt bleiben.
/// </summary>
public sealed class DesktopWatcherService : IDisposable
{
    private readonly List<FileSystemWatcher> _watchers = new();
    private readonly DesktopWatchCoordinator _coordinator;
    private readonly System.Timers.Timer _drainTimer;
    private readonly System.Timers.Timer _reconcileTimer;
    private readonly IClock _clock;

    /// <summary>Gemeldete, entprellte und stabile Aenderungen.</summary>
    public event Action<IReadOnlyList<WatchBatchItem>>? BatchReady;

    /// <summary>Regelmaessiger vollstaendiger Abgleich der Quellen (Standard: alle 15 Minuten).</summary>
    public event Action? PeriodicRescanDue;

    public DesktopWatcherService(DesktopWatchCoordinator coordinator, IClock? clock = null,
        TimeSpan? drainInterval = null, TimeSpan? rescanInterval = null)
    {
        _coordinator = coordinator;
        _clock = clock ?? new SystemClock();

        _drainTimer = new System.Timers.Timer((drainInterval ?? TimeSpan.FromSeconds(1)).TotalMilliseconds)
            { AutoReset = true };
        _drainTimer.Elapsed += (_, _) =>
        {
            var batch = _coordinator.Drain(_clock.UtcNow);
            if (batch.Count > 0) BatchReady?.Invoke(batch);
        };

        _reconcileTimer = new System.Timers.Timer((rescanInterval ?? TimeSpan.FromMinutes(15)).TotalMilliseconds)
            { AutoReset = true };
        _reconcileTimer.Elapsed += (_, _) => PeriodicRescanDue?.Invoke();
    }

    public void Watch(string directory)
    {
        if (!Directory.Exists(directory)) return;

        var watcher = new FileSystemWatcher(directory)
        {
            IncludeSubdirectories = false,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName
                           | NotifyFilters.LastWrite | NotifyFilters.Size,
            InternalBufferSize = 64 * 1024
        };

        watcher.Created += (_, e) => Report(e.FullPath, FileChangeKind.Created);
        watcher.Changed += (_, e) => Report(e.FullPath, FileChangeKind.Changed);
        watcher.Deleted += (_, e) => Report(e.FullPath, FileChangeKind.Deleted);
        watcher.Renamed += (_, e) => _coordinator.Report(
            new FileChange(e.FullPath, FileChangeKind.Renamed, _clock.UtcNow, e.OldFullPath));

        // Pufferueberlauf: Ereignisse koennen verloren gehen - dann hilft nur ein Abgleich.
        watcher.Error += (_, _) => PeriodicRescanDue?.Invoke();

        watcher.EnableRaisingEvents = true;
        _watchers.Add(watcher);
    }

    private void Report(string path, FileChangeKind kind)
        => _coordinator.Report(new FileChange(path, kind, _clock.UtcNow));

    public void Start()
    {
        _drainTimer.Start();
        _reconcileTimer.Start();
    }

    public void Pause()
    {
        _coordinator.IsPaused = true;
        _drainTimer.Stop();
    }

    public void Resume()
    {
        _coordinator.IsPaused = false;
        _drainTimer.Start();
    }

    public void Dispose()
    {
        foreach (var watcher in _watchers)
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
        }
        _watchers.Clear();
        _drainTimer.Dispose();
        _reconcileTimer.Dispose();
    }
}
