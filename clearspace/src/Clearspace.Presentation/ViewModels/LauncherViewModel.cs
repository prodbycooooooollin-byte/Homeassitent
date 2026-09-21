using System.Collections.ObjectModel;
using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

/// <summary>Schneller Zugriff: Suche, Favoriten, zuletzt und haeufig ueber Clearspace geoeffnet.</summary>
public sealed class LauncherViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private string _query = string.Empty;
    private int _selectedIndex = -1;
    private string? _status;
    private EntryItemViewModel? _confirmationPending;

    public LauncherViewModel(ClearspaceSession session)
    {
        _session = session;
        LaunchCommand = new RelayCommand(_ => LaunchSelected(), _ => Selected is not null);
        RevealCommand = new RelayCommand(_ => RevealSelected(), _ => Selected is not null);
        ConfirmLaunchCommand = new RelayCommand(_ => ConfirmLaunch(), _ => _confirmationPending is not null);
        Refresh();
    }

    public ObservableCollection<EntryItemViewModel> Results { get; } = new();

    public string Query
    {
        get => _query;
        set { if (SetField(ref _query, value)) Refresh(); }
    }

    public int SelectedIndex
    {
        get => _selectedIndex;
        set { SetField(ref _selectedIndex, value); OnPropertyChanged(nameof(Selected)); }
    }

    public EntryItemViewModel? Selected =>
        _selectedIndex >= 0 && _selectedIndex < Results.Count ? Results[_selectedIndex] : null;

    public string? Status
    {
        get => _status;
        private set => SetField(ref _status, value);
    }

    /// <summary>Gesetzt, wenn vor dem Start eine Bestaetigung noetig ist.</summary>
    public string? ConfirmationQuestion { get; private set; }

    public RelayCommand LaunchCommand { get; }
    public RelayCommand RevealCommand { get; }
    public RelayCommand ConfirmLaunchCommand { get; }

    public IReadOnlyList<EntryItemViewModel> Favorites => _session.Library.Entries
        .Where(e => e.IsFavorite && !e.IsMissing)
        .OrderBy(e => e.DisplayName, StringComparer.CurrentCultureIgnoreCase)
        .Select(e => new EntryItemViewModel(_session.Library, _session.Library.ToView(e)))
        .ToList();

    public IReadOnlyList<EntryItemViewModel> RecentlyOpened => _session.Library.Entries
        .Where(e => e.LastLaunchUtc is not null && !e.IsMissing)
        .OrderByDescending(e => e.LastLaunchUtc)
        .Take(8)
        .Select(e => new EntryItemViewModel(_session.Library, _session.Library.ToView(e)))
        .ToList();

    public IReadOnlyList<EntryItemViewModel> FrequentlyOpened => _session.Library.Entries
        .Where(e => e.LaunchCount > 0 && !e.IsMissing)
        .OrderByDescending(e => e.LaunchCount)
        .Take(8)
        .Select(e => new EntryItemViewModel(_session.Library, _session.Library.ToView(e)))
        .ToList();

    public void Refresh()
    {
        var hits = _session.Library.Index.Search(Query, 60);
        Results.Clear();
        foreach (var hit in hits)
            Results.Add(new EntryItemViewModel(_session.Library, _session.Library.ToView(hit.Entry)));

        SelectedIndex = Results.Count > 0 ? 0 : -1;
        OnPropertyChanged(nameof(Favorites));
        OnPropertyChanged(nameof(RecentlyOpened));
        OnPropertyChanged(nameof(FrequentlyOpened));
        LaunchCommand.RaiseCanExecuteChanged();
    }

    public void MoveSelection(int delta)
    {
        if (Results.Count == 0) return;
        var next = SelectedIndex + delta;
        SelectedIndex = Math.Clamp(next, 0, Results.Count - 1);
    }

    public void LaunchSelected() => Launch(Selected);

    public void Launch(EntryItemViewModel? item)
    {
        if (item is null) return;
        var outcome = _session.Launcher.Launch(new LaunchRequest(item.Entry, false));
        if (outcome.NeedsConfirmation)
        {
            _confirmationPending = item;
            ConfirmationQuestion =
                $"\"{item.DisplayName}\" startet: {item.Entry.TargetPath ?? item.Entry.Path}. Wirklich starten?";
            OnPropertyChanged(nameof(ConfirmationQuestion));
            ConfirmLaunchCommand.RaiseCanExecuteChanged();
            return;
        }

        FinishLaunch(item, outcome);
    }

    public void ConfirmLaunch()
    {
        if (_confirmationPending is null) return;
        var item = _confirmationPending;
        _confirmationPending = null;
        ConfirmationQuestion = null;
        OnPropertyChanged(nameof(ConfirmationQuestion));
        FinishLaunch(item, _session.Launcher.Launch(new LaunchRequest(item.Entry, true)));
    }

    public void CancelConfirmation()
    {
        _confirmationPending = null;
        ConfirmationQuestion = null;
        OnPropertyChanged(nameof(ConfirmationQuestion));
    }

    private void FinishLaunch(EntryItemViewModel item, LaunchOutcome outcome)
    {
        if (outcome.Started)
        {
            // Zaehlt ausschliesslich Starts aus Clearspace; es gibt keine systemweite Beobachtung.
            if (StatisticsEnabled) _session.Library.RecordLaunch(item.Id);
            Status = $"\"{item.DisplayName}\" gestartet.";
            OnPropertyChanged(nameof(RecentlyOpened));
            OnPropertyChanged(nameof(FrequentlyOpened));
        }
        else
        {
            Status = outcome.Message;
        }
    }

    public bool StatisticsEnabled
    {
        get => _session.GetSetting("launch_statistics", "true") == "true";
        set
        {
            _session.SetSetting("launch_statistics", value ? "true" : "false");
            if (!value) _session.Library.ClearLaunchStatistics();
            OnPropertyChanged();
            OnPropertyChanged(nameof(RecentlyOpened));
            OnPropertyChanged(nameof(FrequentlyOpened));
        }
    }

    public void RevealSelected()
    {
        if (Selected is null) return;
        if (!_session.Launcher.RevealInExplorer(Selected.Path))
            Status = "Der Ort konnte nicht geoeffnet werden.";
    }
}
