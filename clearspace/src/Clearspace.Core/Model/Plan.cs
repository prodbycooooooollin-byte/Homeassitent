namespace Clearspace.Core.Model;

/// <summary>Eine einzelne geplante Aktion. Vor der Ausfuehrung im Journal festgehalten.</summary>
public sealed class PlannedAction
{
    public required string Id { get; init; }
    public required string EntryId { get; init; }
    public required string EntryName { get; init; }
    public required PlannedActionKind Kind { get; init; }

    /// <summary>Bisheriger Ort (null bei rein virtuellen Zuordnungen).</summary>
    public string? SourcePath { get; init; }

    /// <summary>Neuer Ort. Kann sich bei Namenskonflikten vor der Ausfuehrung noch aendern.</summary>
    public string? TargetPath { get; set; }

    public string? CategoryId { get; init; }
    public string CategoryLabel { get; init; } = string.Empty;
    public Confidence Confidence { get; init; } = Confidence.Low;
    public string Reason { get; init; } = string.Empty;

    /// <summary>Vom Nutzer abgewaehlt.</summary>
    public bool IsSelected { get; set; } = true;

    public SkipReason SkipReason { get; set; } = SkipReason.None;
    public string? SkipExplanation { get; set; }

    /// <summary>Fingerabdruck der Quelle zum Planungszeitpunkt (Groesse + Zeitstempel).</summary>
    public string? SourceFingerprint { get; set; }

    public bool IsFileAction => Kind is PlannedActionKind.MoveShortcut or PlannedActionKind.MoveFile or PlannedActionKind.CreateFolder;
}

/// <summary>Gesamter Aufraeumplan mit Vorschau.</summary>
public sealed class CleanupPlan
{
    public required string Id { get; init; }
    public required CleanupMode Mode { get; init; }
    public DateTimeOffset CreatedUtc { get; init; } = DateTimeOffset.UtcNow;
    public List<PlannedAction> Actions { get; init; } = new();

    /// <summary>Eintraege, die sichtbar auf dem Desktop verbleiben, mit Begruendung.</summary>
    public List<RemainingItem> Remaining { get; init; } = new();

    public IEnumerable<PlannedAction> SelectedFileActions =>
        Actions.Where(a => a.IsSelected && a.IsFileAction && a.SkipReason == SkipReason.None);

    public IEnumerable<PlannedAction> VirtualActions =>
        Actions.Where(a => a.Kind == PlannedActionKind.VirtualOnly);
}

public sealed record RemainingItem(string EntryId, string Name, EntryType Type, string Explanation);

/// <summary>Ergebnis der Ausfuehrung, ehrlich getrennt nach tatsaechlich Verschobenem und Verbliebenem.</summary>
public sealed class CleanupResult
{
    public required string PlanId { get; init; }
    public List<PlannedAction> Completed { get; init; } = new();
    public List<PlannedAction> Skipped { get; init; } = new();
    public List<PlannedAction> Failed { get; init; } = new();
    public List<RemainingItem> RemainingOnDesktop { get; init; } = new();
    public int VirtualAssignments { get; set; }
}
