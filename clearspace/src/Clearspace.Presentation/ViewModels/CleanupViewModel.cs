using System.Collections.ObjectModel;
using Clearspace.Core.Cleanup;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

/// <summary>
/// Aufraeumen mit Vorschau, Ausfuehrung und ehrlichem Ergebnis: was wurde entfernt,
/// was bleibt sichtbar und warum.
/// </summary>
public sealed class CleanupViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private CleanupMode _mode = CleanupMode.LauncherLibrary;
    private CleanupPlan? _plan;
    private CleanupResult? _result;
    private string? _status;
    private bool _isBusy;

    public CleanupViewModel(ClearspaceSession session)
    {
        _session = session;
        CreatePlanCommand = new RelayCommand(_ => CreatePlan(), _ => !IsBusy);
        ExecuteCommand = new RelayCommand(_ => Execute(), _ => !IsBusy && _plan is not null && HasSelectedFileActions);
        UndoCommand = new RelayCommand(_ => UndoLast(), _ => CanUndo);
    }

    public ObservableCollection<PlannedActionViewModel> PlannedActions { get; } = new();
    public ObservableCollection<RemainingItem> Remaining { get; } = new();
    public ObservableCollection<string> ExecutionMessages { get; } = new();

    public RelayCommand CreatePlanCommand { get; }
    public RelayCommand ExecuteCommand { get; }
    public RelayCommand UndoCommand { get; }

    public CleanupMode Mode
    {
        get => _mode;
        set { if (SetField(ref _mode, value)) { OnPropertyChanged(nameof(ModeLabel)); OnPropertyChanged(nameof(ModeExplanation)); } }
    }

    public string ModeLabel => Labels.CleanupMode(Mode);

    public string ModeExplanation => Mode switch
    {
        CleanupMode.LauncherLibrary =>
            $"Ausgewaehlte Desktop-Verknuepfungen wandern in dein dauerhaftes Verzeichnis \"{_session.LibraryRoot}\". " +
            "Sie bleiben im Launcher startbar und ueber \"Im Explorer oeffnen\" erreichbar. " +
            "Echte Dateien und Ordner werden nur virtuell einsortiert.",
        CleanupMode.FolderOrganisation =>
            "Ausgewaehlte Desktop-Verknuepfungen werden in wenige Themenordner direkt auf dem Desktop einsortiert. " +
            "Die Bibliothek bietet weiterhin feinere Kategorien und Mehrfachzuordnungen.",
        _ =>
            "Es wird nichts verschoben und nichts sortiert. Dieser Modus betrifft nur die Sichtbarkeit aller " +
            "Desktop-Symbole und veraendert kein Ergebnis der anderen Aufraeumaktionen."
    };

    public bool IsBusy
    {
        get => _isBusy;
        private set
        {
            SetField(ref _isBusy, value);
            CreatePlanCommand.RaiseCanExecuteChanged();
            ExecuteCommand.RaiseCanExecuteChanged();
        }
    }

    public string? Status
    {
        get => _status;
        private set => SetField(ref _status, value);
    }

    public bool HasSelectedFileActions => _plan?.SelectedFileActions.Any() == true;
    public int FileActionCount => _plan?.SelectedFileActions.Count() ?? 0;
    public int VirtualCount => _plan?.VirtualActions.Count() ?? 0;

    public bool CanUndo => _result?.Completed.Count > 0
                           || _session.Journal.GetUndoable().Count > 0;

    public CleanupResult? Result => _result;

    public void CreatePlan()
    {
        var planner = _session.CreatePlanner();
        _plan = planner.CreatePlan(
            _session.Library.Entries.Where(e => !e.IsMissing),
            _session.Library.GetPrimaryMap(),
            Mode,
            _session.CreateOptions(Mode));

        PlannedActions.Clear();
        foreach (var action in _plan.Actions
                     .OrderByDescending(a => a.IsFileAction)
                     .ThenBy(a => a.CategoryLabel, StringComparer.CurrentCultureIgnoreCase)
                     .ThenBy(a => a.EntryName, StringComparer.CurrentCultureIgnoreCase))
            PlannedActions.Add(new PlannedActionViewModel(action));

        Remaining.Clear();
        foreach (var item in _plan.Remaining) Remaining.Add(item);

        Status = Mode == CleanupMode.VisibilityOnly
            ? "Dieser Modus fuehrt keine Dateiaktionen aus."
            : $"{FileActionCount} Verknuepfung(en) wuerden verschoben, {VirtualCount} Eintraege nur einsortiert.";

        OnPropertyChanged(nameof(FileActionCount));
        OnPropertyChanged(nameof(VirtualCount));
        OnPropertyChanged(nameof(HasSelectedFileActions));
        ExecuteCommand.RaiseCanExecuteChanged();
    }

    public void Execute(IProgress<ExecutionProgress>? progress = null, CancellationToken cancellation = default)
    {
        if (_plan is null) return;
        IsBusy = true;
        ExecutionMessages.Clear();
        try
        {
            // Eigene Aktionen der Ueberwachung melden, damit keine Schleife entsteht.
            foreach (var action in _plan.SelectedFileActions)
            {
                if (action.SourcePath is not null) _session.Watcher.NotifyOwnAction(action.SourcePath, _session.Clock.UtcNow);
                if (action.TargetPath is not null) _session.Watcher.NotifyOwnAction(action.TargetPath, _session.Clock.UtcNow);
            }

            _result = _session.Executor.Execute(_plan, progress, cancellation);

            foreach (var completed in _result.Completed)
                _session.Library.UpdatePathAfterFileAction(completed.EntryId, completed.TargetPath!);

            foreach (var action in _result.Completed)
                ExecutionMessages.Add($"Verschoben: {action.EntryName} -> {action.TargetPath}");
            foreach (var action in _result.Skipped)
                ExecutionMessages.Add($"Uebersprungen: {action.EntryName} ({Labels.SkipReason(action.SkipReason)}) - {action.SkipExplanation}");
            foreach (var action in _result.Failed)
                ExecutionMessages.Add($"Fehlgeschlagen: {action.EntryName} - {action.SkipExplanation}");

            Remaining.Clear();
            foreach (var item in _result.RemainingOnDesktop) Remaining.Add(item);

            Status = BuildHonestSummary(_result);
        }
        catch (OperationCanceledException)
        {
            Status = "Abgebrochen. Der tatsaechliche Zustand wird beim naechsten Start aus dem Journal ermittelt.";
        }
        finally
        {
            IsBusy = false;
            OnPropertyChanged(nameof(CanUndo));
            UndoCommand.RaiseCanExecuteChanged();
        }
    }

    /// <summary>Ergebnis ohne Beschoenigung: verschoben, uebersprungen und weiterhin sichtbar.</summary>
    public static string BuildHonestSummary(CleanupResult result)
    {
        var parts = new List<string>
        {
            $"{result.Completed.Count} Verknuepfung(en) vom Desktop in die Bibliothek verschoben",
            $"{result.VirtualAssignments} Eintraege nur virtuell einsortiert (Dateien unveraendert)",
            $"{result.RemainingOnDesktop.Count} Element(e) bleiben sichtbar auf dem Desktop"
        };
        if (result.Skipped.Count > 0) parts.Add($"{result.Skipped.Count} uebersprungen");
        if (result.Failed.Count > 0) parts.Add($"{result.Failed.Count} fehlgeschlagen");
        return string.Join(" - ", parts) + ". Alles laesst sich rueckgaengig machen.";
    }

    public UndoResult? UndoLast()
    {
        var planId = _result?.PlanId;
        var undo = _session.Executor.Undo(planId);

        foreach (var record in _session.Journal.GetByPlan(planId ?? string.Empty).Where(r => r.IsUndone))
            _session.Library.UpdatePathAfterFileAction(record.EntryId, record.SourcePath);

        Status = undo.Conflicts.Count == 0
            ? $"{undo.Restored} Eintrag/Eintraege wiederhergestellt."
            : $"{undo.Restored} wiederhergestellt. Bei {undo.Conflicts.Count} war der urspruengliche Ort belegt - " +
              "beide Inhalte wurden erhalten.";

        foreach (var conflict in undo.Conflicts)
            ExecutionMessages.Add($"{conflict.EntryName}: {conflict.Explanation} Neuer Ort: {conflict.RestoredTo}");

        OnPropertyChanged(nameof(CanUndo));
        UndoCommand.RaiseCanExecuteChanged();
        return undo;
    }
}
