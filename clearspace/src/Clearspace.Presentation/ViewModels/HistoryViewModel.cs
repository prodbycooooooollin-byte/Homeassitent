using System.Collections.ObjectModel;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

public sealed record HistoryRow(string EntryName, string StatusLabel, string From, string To, string? Message);

/// <summary>Wiederherstellungsverlauf aus dem dauerhaften Journal - auch nach Neustart.</summary>
public sealed class HistoryViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private string? _selectedPlanId;
    private string? _status;

    public HistoryViewModel(ClearspaceSession session)
    {
        _session = session;
        UndoPlanCommand = new RelayCommand(_ => UndoSelectedPlan(), _ => CanUndoSelected);
        Reload();
    }

    public ObservableCollection<string> PlanIds { get; } = new();
    public ObservableCollection<HistoryRow> Rows { get; } = new();
    public RelayCommand UndoPlanCommand { get; }

    public string? SelectedPlanId
    {
        get => _selectedPlanId;
        set { if (SetField(ref _selectedPlanId, value)) LoadRows(); }
    }

    public string? Status
    {
        get => _status;
        private set => SetField(ref _status, value);
    }

    public bool CanUndoSelected => SelectedPlanId is not null && _session.Journal.GetUndoable(SelectedPlanId).Count > 0;

    public void Reload()
    {
        PlanIds.Clear();
        foreach (var id in _session.Journal.GetPlanIds()) PlanIds.Add(id);
        SelectedPlanId = PlanIds.FirstOrDefault();
    }

    private void LoadRows()
    {
        Rows.Clear();
        if (SelectedPlanId is null) return;
        foreach (var record in _session.Journal.GetByPlan(SelectedPlanId))
            Rows.Add(new HistoryRow(record.EntryName, StatusLabel(record.Status),
                record.SourcePath, record.TargetPath ?? "-", record.Message));
        OnPropertyChanged(nameof(CanUndoSelected));
        UndoPlanCommand.RaiseCanExecuteChanged();
    }

    private static string StatusLabel(ActionStatus status) => status switch
    {
        ActionStatus.Completed => "verschoben",
        ActionStatus.Skipped => "uebersprungen",
        ActionStatus.Failed => "fehlgeschlagen",
        ActionStatus.UndoneCompleted => "wiederhergestellt",
        ActionStatus.UndoFailed => "Wiederherstellung fehlgeschlagen",
        ActionStatus.Running => "unterbrochen",
        _ => "geplant"
    };

    public void UndoSelectedPlan()
    {
        if (SelectedPlanId is null) return;
        var undo = _session.Executor.Undo(SelectedPlanId);
        foreach (var record in _session.Journal.GetByPlan(SelectedPlanId).Where(r => r.IsUndone))
            _session.Library.UpdatePathAfterFileAction(record.EntryId, record.SourcePath);

        Status = $"{undo.Restored} wiederhergestellt, {undo.Failed} fehlgeschlagen." +
                 (undo.Conflicts.Count > 0
                     ? $" {undo.Conflicts.Count} urspruengliche Orte waren belegt - beide Inhalte wurden erhalten."
                     : string.Empty);
        LoadRows();
    }
}
