using System.Collections.ObjectModel;
using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

public sealed class SourceSelectionViewModel : ObservableObject
{
    private bool _isSelected = true;

    public SourceSelectionViewModel(ScanSource source, bool selected = true)
    {
        Source = source;
        _isSelected = selected;
    }

    public ScanSource Source { get; }
    public string Label => Source.Label;
    public string Path => Source.Path;
    public string Note => Source.IsWritable ? string.Empty : "nur lesend (keine Aenderungen moeglich)";

    public bool IsSelected
    {
        get => _isSelected;
        set => SetField(ref _isSelected, value);
    }
}

public enum OnboardingStep { Sources, Scan, Suggestions, ChooseMode, Preview, Done }

/// <summary>Erster Start in wenigen Schritten: Quellen zeigen, scannen, pruefen, Modus, Vorschau.</summary>
public sealed class OnboardingViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private OnboardingStep _step = OnboardingStep.Sources;
    private string? _status;

    public OnboardingViewModel(ClearspaceSession session)
    {
        _session = session;
        foreach (var source in session.Sources.GetDesktopSources())
            Sources.Add(new SourceSelectionViewModel(source));
        foreach (var source in session.Sources.GetStartMenuSources())
            Sources.Add(new SourceSelectionViewModel(source, selected: false));
    }

    public ObservableCollection<SourceSelectionViewModel> Sources { get; } = new();

    public OnboardingStep Step
    {
        get => _step;
        private set { SetField(ref _step, value); OnPropertyChanged(nameof(StepTitle)); }
    }

    public string StepTitle => Step switch
    {
        OnboardingStep.Sources => "1. Diese Orte schaue ich mir an",
        OnboardingStep.Scan => "2. Inhalte erfassen",
        OnboardingStep.Suggestions => "3. Vorschlaege pruefen",
        OnboardingStep.ChooseMode => "4. Aufraeummodus waehlen",
        OnboardingStep.Preview => "5. Vorschau bestaetigen",
        _ => "Fertig"
    };

    public string? Status
    {
        get => _status;
        private set => SetField(ref _status, value);
    }

    public LibraryRefreshSummary? ScanSummary { get; private set; }

    public IReadOnlyList<ScanSource> SelectedSources
        => Sources.Where(s => s.IsSelected).Select(s => s.Source).ToList();

    public void GoToScan() => Step = OnboardingStep.Scan;

    public LibraryRefreshSummary RunScan()
    {
        var result = _session.Library.Refresh(SelectedSources);
        ScanSummary = new LibraryRefreshSummary(
            result.TotalEntries, result.NewEntries, result.InboxEntries, result.Warnings);
        Status = $"{result.TotalEntries} Eintraege erfasst, davon {result.InboxEntries} noch ohne sichere Zuordnung.";
        Step = OnboardingStep.Suggestions;
        return ScanSummary;
    }

    public void GoToModeSelection() => Step = OnboardingStep.ChooseMode;
    public void GoToPreview() => Step = OnboardingStep.Preview;

    public void Finish()
    {
        _session.SetSetting("onboarding_done", "true");
        _session.SetSetting("onboarding_sources", string.Join('\u001f', SelectedSources.Select(s => s.Path)));
        Step = OnboardingStep.Done;
    }

    public bool IsAlreadyDone => _session.GetSetting("onboarding_done", "false") == "true";
}

public sealed record LibraryRefreshSummary(int Total, int New, int Inbox, IReadOnlyList<string> Warnings);
