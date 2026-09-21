using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;
using Clearspace.Core.Watching;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

public enum ShellPage { Launcher, Library, Cleanup, Rules, History, Settings }

/// <summary>Hauptfenster: Suche, angeheftete Eintraege und Kategorien stehen vorn.</summary>
public sealed class ShellViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private ShellPage _page = ShellPage.Launcher;
    private string _statusText = string.Empty;

    public ShellViewModel(ClearspaceSession session)
    {
        _session = session;
        Launcher = new LauncherViewModel(session);
        Library = new LibraryViewModel(session);
        Cleanup = new CleanupViewModel(session);
        Rules = new RulesViewModel(session);
        History = new HistoryViewModel(session);
        Onboarding = new OnboardingViewModel(session);

        NavigateCommand = new RelayCommand(p =>
        {
            if (p is ShellPage page) Page = page;
        });
        RescanCommand = new RelayCommand(_ => Rescan());

        // Nach Absturz oder Abbruch den tatsaechlichen Zustand ermitteln.
        var reconciled = session.ReconcileOnStartup();
        if (reconciled.Count > 0)
            StatusText = $"Eine frueher abgebrochene Aufraeumaktion wurde geprueft: {reconciled.Count} Schritt(e) " +
                         "wurden anhand des Journals bewertet. Es wurde nichts wiederholt.";
    }

    public LauncherViewModel Launcher { get; }
    public LibraryViewModel Library { get; }
    public CleanupViewModel Cleanup { get; }
    public RulesViewModel Rules { get; }
    public HistoryViewModel History { get; }
    public OnboardingViewModel Onboarding { get; }

    public RelayCommand NavigateCommand { get; }
    public RelayCommand RescanCommand { get; }

    public bool NeedsOnboarding => !Onboarding.IsAlreadyDone;

    public ShellPage Page
    {
        get => _page;
        set => SetField(ref _page, value);
    }

    public string StatusText
    {
        get => _statusText;
        set => SetField(ref _statusText, value);
    }

    public int InboxCount => Library.InboxCount;

    public IReadOnlyList<ScanSource> ActiveSources
    {
        get
        {
            var stored = _session.GetSetting("onboarding_sources", string.Empty);
            var all = _session.Sources.GetDesktopSources().Concat(_session.Sources.GetStartMenuSources()).ToList();
            if (string.IsNullOrEmpty(stored)) return _session.Sources.GetDesktopSources();
            var wanted = stored.Split('\u001f').ToHashSet(StringComparer.OrdinalIgnoreCase);
            return all.Where(s => wanted.Contains(s.Path)).ToList();
        }
    }

    public void Rescan()
    {
        var result = _session.Library.Refresh(ActiveSources);
        Library.Reload();
        Launcher.Refresh();
        StatusText = $"{result.TotalEntries} Eintraege, {result.NewEntries} neu, {result.InboxEntries} im Eingang." +
                     (result.Warnings.Count > 0 ? $" Hinweise: {string.Join(" ", result.Warnings)}" : string.Empty);
        OnPropertyChanged(nameof(InboxCount));
    }

    /// <summary>
    /// Verarbeitet entprellte Aenderungen aus der Hintergrundueberwachung. Ohne aktivierte
    /// Regel bleibt es bei Indexierung und Vorschlag.
    /// </summary>
    public void HandleWatchBatch(IReadOnlyList<WatchBatchItem> batch)
    {
        if (batch.Count == 0) return;
        var result = _session.Library.Refresh(ActiveSources);
        Library.Reload();
        Launcher.Refresh();

        var automatic = batch.Count(item =>
        {
            var entry = _session.Library.Entries.FirstOrDefault(e =>
                string.Equals(e.Path, item.Path, StringComparison.OrdinalIgnoreCase));
            return entry is not null && _session.Automation.MayActAutomatically(entry.Id);
        });

        StatusText = automatic == 0
            ? $"{batch.Count} Aenderung(en) erkannt und indexiert. Es wurden keine Dateien veraendert."
            : $"{batch.Count} Aenderung(en) erkannt, davon {automatic} nach deinem Aufraeumprofil behandelbar.";
        OnPropertyChanged(nameof(InboxCount));
    }
}
