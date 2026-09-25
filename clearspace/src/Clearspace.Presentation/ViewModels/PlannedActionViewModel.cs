using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

public sealed class PlannedActionViewModel : ObservableObject
{
    public PlannedActionViewModel(PlannedAction action) => Action = action;

    public PlannedAction Action { get; }

    public string EntryName => Action.EntryName;
    public string CategoryLabel => Action.CategoryLabel;
    public string ActionLabel => Labels.Action(Action.Kind);
    public string ConfidenceLabel => Labels.Confidence(Action.Confidence);
    public string Reason => Action.Reason;
    public string FromPath => Action.SourcePath ?? string.Empty;
    public string ToPath => Action.TargetPath ?? "(bleibt an seinem Ort)";
    public bool IsFileAction => Action.IsFileAction;
    public bool IsVirtualOnly => Action.Kind == PlannedActionKind.VirtualOnly;
    public string? SkipExplanation => Action.SkipExplanation;
    public bool IsSkipped => Action.SkipReason != SkipReason.None;

    public bool IsSelected
    {
        get => Action.IsSelected;
        set { Action.IsSelected = value; OnPropertyChanged(); }
    }

    /// <summary>Klare Trennung: virtuelle Zuordnung oder tatsaechliche Verschiebung.</summary>
    public string KindBadge => IsFileAction ? "Datei wird verschoben" : "Nur Zuordnung";
}
