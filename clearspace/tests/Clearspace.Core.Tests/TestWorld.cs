using Clearspace.Core.Abstractions;
using Clearspace.Core.Categorization;
using Clearspace.Core.Cleanup;
using Clearspace.Core.Library;
using Clearspace.Core.Model;
using Clearspace.Core.Scanning;
using Clearspace.Core.Tests.Fakes;

namespace Clearspace.Core.Tests;

/// <summary>
/// Isolierte Testumgebung mit einem nachgebildeten Desktop. Der echte Entwicklungsdesktop
/// wird nie beruehrt.
/// </summary>
public sealed class TestWorld
{
    public const string Desktop = @"C:\Users\Test\Desktop";
    public const string PublicDesktop = @"C:\Users\Public\Desktop";
    public const string LibraryRoot = @"C:\Users\Test\Clearspace\Bibliothek";

    public FakeFileSystem Fs { get; } = new();
    public FakeShortcutResolver Shortcuts { get; } = new();
    public FixedClock Clock { get; } = new();
    public ILibraryStore Store { get; }

    public TestWorld(ILibraryStore? store = null)
    {
        Store = store ?? new InMemoryLibraryStore();
        Fs.AddDirectory(Desktop);
        Fs.AddDirectory(PublicDesktop);
    }

    public IReadOnlyList<ScanSource> Sources { get; private set; } = Array.Empty<ScanSource>();

    public TestWorld WithDefaultSources()
    {
        Sources = new List<ScanSource>
        {
            new(Desktop, SourceKind.UserDesktop, "Desktop", true),
            new(PublicDesktop, SourceKind.PublicDesktop, "Oeffentlicher Desktop", false)
        };
        return this;
    }

    public TestWorld AddShortcut(string name, string target, string? args = null, string? workDir = null,
        string? publisher = null, string? product = null, string? description = null, string? protocol = null,
        string directory = Desktop)
    {
        var path = directory + "\\" + name;
        Fs.AddFile(path);
        Shortcuts.Add(path, target, args, workDir, description, protocol);
        if (target.Length > 0)
        {
            Fs.AddFile(target, 4096);
            Shortcuts.AddMetadata(target, publisher, product, description);
        }
        return this;
    }

    public TestWorld AddFile(string name, long size = 1000, string directory = Desktop)
    {
        Fs.AddFile(directory + "\\" + name, size);
        return this;
    }

    public LibraryService BuildLibrary()
    {
        var scanner = new DesktopScanner(Fs, Shortcuts, Clock);
        return new LibraryService(Store, scanner, new CategoryClassifier(), Clock);
    }

    public CleanupPlanner BuildPlanner(LibraryService library)
        => new(Fs, library.Categories.Values);

    public CleanupOptions Options(LibraryService library) => new()
    {
        LibraryRoot = LibraryRoot,
        DesktopRoot = Desktop,
        ProtectedEntryIds = library.ProtectedEntryIds.ToHashSet(StringComparer.Ordinal)
    };
}
