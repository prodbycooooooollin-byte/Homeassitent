using Clearspace.Core.Abstractions;
using Clearspace.Core.Categorization;
using Clearspace.Core.Cleanup;
using Clearspace.Core.Library;
using Clearspace.Core.Model;
using Clearspace.Core.Scanning;
using Clearspace.Core.Storage;
using Clearspace.Core.Watching;

namespace Clearspace.Presentation.Services;

/// <summary>
/// Zusammenbau aller Bausteine. Haelt keine Windows-Abhaengigkeit; die Plattformdienste
/// werden von aussen hineingegeben.
/// </summary>
public sealed class ClearspaceSession : IDisposable
{
    private readonly SqliteDatabase? _database;

    public ClearspaceSession(
        IFileSystem fileSystem,
        IShortcutResolver shortcutResolver,
        IScanSourceProvider sources,
        ILauncher launcher,
        IClock? clock = null,
        ILibraryStore? storeOverride = null,
        IJournalStore? journalOverride = null)
    {
        FileSystem = fileSystem;
        Shortcuts = shortcutResolver;
        Sources = sources;
        Launcher = launcher;
        Clock = clock ?? new SystemClock();

        if (storeOverride is null || journalOverride is null)
        {
            var dbPath = Path.Combine(sources.GetDataRoot(), "clearspace.db");
            _database = new SqliteDatabase(dbPath);
            DatabasePath = dbPath;
        }

        Store = storeOverride ?? new SqliteLibraryStore(_database!);
        Journal = journalOverride ?? new SqliteJournalStore(_database!);

        var scanner = new DesktopScanner(fileSystem, shortcutResolver, Clock);
        Library = new LibraryService(Store, scanner, new CategoryClassifier(), Clock);
        Executor = new ActionExecutor(fileSystem, Journal, Clock);
        Automation = new AutomationPolicy(Library);

        Watcher = new DesktopWatchCoordinator(fileSystem);
        Watcher.Exclude(sources.GetLibraryRoot());
    }

    public IFileSystem FileSystem { get; }
    public IShortcutResolver Shortcuts { get; }
    public IScanSourceProvider Sources { get; }
    public ILauncher Launcher { get; }
    public IClock Clock { get; }
    public ILibraryStore Store { get; }
    public IJournalStore Journal { get; }
    public LibraryService Library { get; }
    public ActionExecutor Executor { get; }
    public AutomationPolicy Automation { get; }
    public DesktopWatchCoordinator Watcher { get; }
    public string? DatabasePath { get; }

    public string LibraryRoot => Sources.GetLibraryRoot();

    public CleanupPlanner CreatePlanner() => new(FileSystem, Library.Categories.Values);

    public CleanupOptions CreateOptions(CleanupMode mode) => new()
    {
        LibraryRoot = LibraryRoot,
        DesktopRoot = Sources.GetDesktopSources().FirstOrDefault(s => s.Kind == SourceKind.UserDesktop)?.Path,
        ProtectedEntryIds = Library.ProtectedEntryIds.ToHashSet(StringComparer.Ordinal)
    };

    /// <summary>
    /// Beim Start pruefen, ob eine fruehere Ausfuehrung abgebrochen wurde, und den tatsaechlichen
    /// Zustand ermitteln, ohne etwas zu wiederholen.
    /// </summary>
    public IReadOnlyList<JournalRecord> ReconcileOnStartup() => Executor.Reconcile();

    public string GetSetting(string key, string fallback) => Store.GetSetting(key) ?? fallback;
    public void SetSetting(string key, string value) => Store.SetSetting(key, value);

    public void Dispose() => _database?.Dispose();
}
