namespace Clearspace.Core.Model;

/// <summary>
/// Dauerhafter Journaleintrag je Dateiaktion. Wird vor Beginn geschrieben und nach jedem
/// Schritt aktualisiert, damit der tatsaechliche Zustand nach einem Absturz rekonstruierbar ist.
/// </summary>
public sealed class JournalRecord
{
    public required string Id { get; init; }
    public required string PlanId { get; init; }
    public required string EntryId { get; init; }
    public required string EntryName { get; init; }
    public required PlannedActionKind Kind { get; init; }
    public required string SourcePath { get; init; }
    public string? TargetPath { get; set; }
    public ActionStatus Status { get; set; } = ActionStatus.Planned;
    public SkipReason SkipReason { get; set; } = SkipReason.None;
    public string? Message { get; set; }
    public string? SourceFingerprint { get; set; }
    public DateTimeOffset CreatedUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedUtc { get; set; }

    /// <summary>true, sobald diese Aktion erfolgreich rueckgaengig gemacht wurde.</summary>
    public bool IsUndone { get; set; }
}
