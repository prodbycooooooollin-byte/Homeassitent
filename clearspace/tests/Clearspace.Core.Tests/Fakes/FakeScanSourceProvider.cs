using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;

namespace Clearspace.Core.Tests.Fakes;

public sealed class FakeScanSourceProvider : IScanSourceProvider
{
    private readonly IReadOnlyList<ScanSource> _desktop;
    private readonly string _libraryRoot;
    private readonly string _dataRoot;

    public FakeScanSourceProvider(IReadOnlyList<ScanSource> desktop, string libraryRoot, string dataRoot)
    {
        _desktop = desktop;
        _libraryRoot = libraryRoot;
        _dataRoot = dataRoot;
    }

    public IReadOnlyList<ScanSource> GetDesktopSources() => _desktop;
    public IReadOnlyList<ScanSource> GetStartMenuSources() => Array.Empty<ScanSource>();
    public IReadOnlyList<LibraryEntry> GetInstalledApplications() => Array.Empty<LibraryEntry>();
    public string GetLibraryRoot() => _libraryRoot;
    public string GetDataRoot() => _dataRoot;
}

public sealed class FakeLauncher : ILauncher
{
    public List<string> Launched { get; } = new();
    public List<string> Revealed { get; } = new();
    public bool FailNext { get; set; }

    public LaunchOutcome Launch(LaunchRequest request)
    {
        if (request.Entry.Type is EntryType.PluginFile or EntryType.PresetFile or EntryType.SampleFile)
            return new LaunchOutcome(false, "Kein eigenstaendiges Programm.", false);

        if (request.Entry.Type == EntryType.Installer && !request.UserConfirmedUnknownExecutable)
            return new LaunchOutcome(false, "Bestaetigung noetig", true);

        if (FailNext) { FailNext = false; return new LaunchOutcome(false, "Start fehlgeschlagen", false); }

        Launched.Add(request.Entry.Path);
        return new LaunchOutcome(true, null, false);
    }

    public bool RevealInExplorer(string path)
    {
        Revealed.Add(path);
        return true;
    }
}
