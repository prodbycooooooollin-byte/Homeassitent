using Clearspace.Core.Model;

namespace Clearspace.Core.Cleanup;

/// <summary>
/// Dauerhaftes Journal. Wird vor Beginn der Ausfuehrung geschrieben und nach jedem Schritt
/// aktualisiert, damit "Rueckgaengig" und die Wiederherstellung nach Abbruch funktionieren.
/// </summary>
public interface IJournalStore
{
    void AppendPlan(string planId, CleanupMode mode, IEnumerable<JournalRecord> records);
    void Update(JournalRecord record);
    IReadOnlyList<JournalRecord> GetByPlan(string planId);
    IReadOnlyList<string> GetPlanIds();
    IReadOnlyList<JournalRecord> GetUnfinished();
    IReadOnlyList<JournalRecord> GetUndoable(string? planId = null);
    CleanupMode? GetPlanMode(string planId);
}

/// <summary>Journal im Arbeitsspeicher, fuer Tests und den Demo-Modus.</summary>
public sealed class InMemoryJournalStore : IJournalStore
{
    private readonly List<JournalRecord> _records = new();
    private readonly Dictionary<string, CleanupMode> _plans = new(StringComparer.Ordinal);

    public void AppendPlan(string planId, CleanupMode mode, IEnumerable<JournalRecord> records)
    {
        _plans[planId] = mode;
        _records.AddRange(records);
    }

    public void Update(JournalRecord record)
    {
        var idx = _records.FindIndex(r => r.Id == record.Id);
        if (idx >= 0) _records[idx] = record;
        else _records.Add(record);
    }

    public IReadOnlyList<JournalRecord> GetByPlan(string planId)
        => _records.Where(r => r.PlanId == planId).ToList();

    public IReadOnlyList<string> GetPlanIds() => _plans.Keys.ToList();

    public IReadOnlyList<JournalRecord> GetUnfinished()
        => _records.Where(r => r.Status is ActionStatus.Planned or ActionStatus.Running).ToList();

    public IReadOnlyList<JournalRecord> GetUndoable(string? planId = null)
        => _records.Where(r => r.Status == ActionStatus.Completed && !r.IsUndone
                               && (planId is null || r.PlanId == planId)).ToList();

    public CleanupMode? GetPlanMode(string planId)
        => _plans.TryGetValue(planId, out var m) ? m : null;
}
