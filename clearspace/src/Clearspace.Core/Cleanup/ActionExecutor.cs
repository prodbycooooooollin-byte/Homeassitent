using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;

namespace Clearspace.Core.Cleanup;

public sealed record ExecutionProgress(int Done, int Total, string CurrentName);

public sealed record UndoResult(
    int Restored,
    int Failed,
    IReadOnlyList<UndoConflict> Conflicts,
    IReadOnlyList<string> Messages);

/// <summary>Der urspruengliche Ort ist belegt. Beide Inhalte bleiben erhalten.</summary>
public sealed record UndoConflict(string EntryName, string OriginalPath, string RestoredTo, string Explanation);

/// <summary>
/// Fuehrt einen Plan aus. Vor jedem Schritt wird geprueft, ob die Quelle noch zum Plan passt.
/// Es wird niemals eine bestehende Datei ueberschrieben.
/// </summary>
public sealed class ActionExecutor
{
    private readonly IFileSystem _fs;
    private readonly IJournalStore _journal;
    private readonly IClock _clock;

    public ActionExecutor(IFileSystem fs, IJournalStore journal, IClock? clock = null)
    {
        _fs = fs;
        _journal = journal;
        _clock = clock ?? new SystemClock();
    }

    public CleanupResult Execute(CleanupPlan plan, IProgress<ExecutionProgress>? progress = null,
        CancellationToken cancellation = default)
    {
        var fileActions = plan.SelectedFileActions.ToList();

        // 1) Journal vollstaendig vor Beginn schreiben.
        var records = fileActions.Select(a => new JournalRecord
        {
            Id = a.Id,
            PlanId = plan.Id,
            EntryId = a.EntryId,
            EntryName = a.EntryName,
            Kind = a.Kind,
            SourcePath = a.SourcePath!,
            TargetPath = a.TargetPath,
            SourceFingerprint = a.SourceFingerprint,
            Status = ActionStatus.Planned,
            CreatedUtc = _clock.UtcNow
        }).ToList();
        _journal.AppendPlan(plan.Id, plan.Mode, records);

        var result = new CleanupResult { PlanId = plan.Id };
        result.VirtualAssignments = plan.Actions.Count(a => a.Kind == PlannedActionKind.VirtualOnly);
        result.RemainingOnDesktop.AddRange(plan.Remaining);

        var done = 0;
        foreach (var record in records)
        {
            cancellation.ThrowIfCancellationRequested();
            var action = fileActions.First(a => a.Id == record.Id);
            progress?.Report(new ExecutionProgress(done, records.Count, action.EntryName));

            record.Status = ActionStatus.Running;
            record.UpdatedUtc = _clock.UtcNow;
            _journal.Update(record);

            try
            {
                var outcome = ExecuteOne(record, action);
                switch (outcome)
                {
                    case ActionStatus.Completed: result.Completed.Add(action); break;
                    case ActionStatus.Skipped: result.Skipped.Add(action); break;
                    default: result.Failed.Add(action); break;
                }
            }
            catch (OperationCanceledException)
            {
                // Abbruch: der laufende Schritt bleibt als "Running" im Journal und wird beim
                // naechsten Start durch Reconcile() wahrheitsgemaess aufgeloest.
                throw;
            }
            catch (Exception ex)
            {
                record.Status = ActionStatus.Failed;
                record.Message = ex.Message;
                record.UpdatedUtc = _clock.UtcNow;
                _journal.Update(record);
                action.SkipExplanation = ex.Message;
                result.Failed.Add(action);
            }

            done++;
        }

        progress?.Report(new ExecutionProgress(done, records.Count, string.Empty));
        return result;
    }

    private ActionStatus ExecuteOne(JournalRecord record, PlannedAction action)
    {
        // 2) Unmittelbar vor der Ausfuehrung erneut pruefen, ob die Quelle noch zum Plan passt.
        var info = _fs.GetInfo(record.SourcePath);
        if (info is null)
        {
            Finish(record, ActionStatus.Skipped, SkipReason.SourceMissing,
                "Die Datei existiert nicht mehr am geplanten Ort.");
            action.SkipReason = SkipReason.SourceMissing;
            action.SkipExplanation = record.Message;
            return ActionStatus.Skipped;
        }

        var currentFingerprint = $"{info.SizeBytes}:{info.LastWriteUtc.ToUnixTimeMilliseconds()}";
        if (record.SourceFingerprint is not null && record.SourceFingerprint != currentFingerprint)
        {
            Finish(record, ActionStatus.Skipped, SkipReason.SourceChanged,
                "Die Datei wurde seit der Vorschau geaendert. Der Plan muss neu bewertet werden.");
            action.SkipReason = SkipReason.SourceChanged;
            action.SkipExplanation = record.Message;
            return ActionStatus.Skipped;
        }

        var targetDir = PathUtil.GetDirectory(record.TargetPath!);
        if (!_fs.DirectoryExists(targetDir)) _fs.CreateDirectory(targetDir);

        // 3) Namenskonflikte nachvollziehbar aufloesen, niemals ueberschreiben.
        var finalTarget = record.TargetPath!;
        if (_fs.FileExists(finalTarget) || _fs.DirectoryExists(finalTarget))
        {
            finalTarget = NextFreeName(finalTarget);
            record.Message = $"Zielname war belegt, gespeichert als \"{PathUtil.GetFileName(finalTarget)}\".";
        }

        _fs.MoveFile(record.SourcePath, finalTarget);
        record.TargetPath = finalTarget;
        action.TargetPath = finalTarget;
        Finish(record, ActionStatus.Completed, SkipReason.None, record.Message);
        return ActionStatus.Completed;
    }

    private string NextFreeName(string desired)
    {
        var dir = PathUtil.GetDirectory(desired);
        var stem = PathUtil.GetFileNameWithoutExtension(desired);
        var ext = PathUtil.GetExtension(desired);
        for (var i = 2; i < 1000; i++)
        {
            var candidate = PathUtil.Combine(dir, $"{stem} ({i}){ext}");
            if (!_fs.FileExists(candidate) && !_fs.DirectoryExists(candidate)) return candidate;
        }
        throw new InvalidOperationException("Zu viele Namenskonflikte im Zielverzeichnis.");
    }

    private void Finish(JournalRecord record, ActionStatus status, SkipReason reason, string? message)
    {
        record.Status = status;
        record.SkipReason = reason;
        if (message is not null) record.Message = message;
        record.UpdatedUtc = _clock.UtcNow;
        _journal.Update(record);
    }

    /// <summary>
    /// Rekonstruiert nach Absturz oder Abbruch den tatsaechlichen Zustand, ohne Aktionen blind
    /// zu wiederholen: es wird nur nachgesehen, wo die Datei jetzt wirklich liegt.
    /// </summary>
    public IReadOnlyList<JournalRecord> Reconcile()
    {
        var changed = new List<JournalRecord>();
        foreach (var record in _journal.GetUnfinished())
        {
            var sourceExists = _fs.FileExists(record.SourcePath);
            var targetExists = record.TargetPath is not null && _fs.FileExists(record.TargetPath);

            if (targetExists && !sourceExists)
                Finish(record, ActionStatus.Completed, SkipReason.None,
                    "Nach Abbruch geprueft: Die Datei liegt am neuen Ort. Aktion war erfolgreich.");
            else if (sourceExists && !targetExists)
                Finish(record, ActionStatus.Skipped, SkipReason.None,
                    "Nach Abbruch geprueft: Die Datei liegt noch am urspruenglichen Ort. Nichts veraendert.");
            else if (sourceExists && targetExists)
                Finish(record, ActionStatus.Failed, SkipReason.TargetOccupied,
                    "Nach Abbruch geprueft: An beiden Orten liegt eine Datei. Bitte manuell pruefen; nichts wurde geloescht.");
            else
                Finish(record, ActionStatus.Failed, SkipReason.SourceMissing,
                    "Nach Abbruch geprueft: Die Datei ist an keinem der beiden Orte auffindbar.");

            changed.Add(record);
        }
        return changed;
    }

    /// <summary>
    /// Macht abgeschlossene Aktionen rueckgaengig; funktioniert auch nach einem Neustart,
    /// da ausschliesslich das dauerhafte Journal ausgewertet wird.
    /// </summary>
    public UndoResult Undo(string? planId = null, IEnumerable<string>? actionIds = null)
    {
        var records = _journal.GetUndoable(planId).ToList();
        if (actionIds is not null)
        {
            var wanted = actionIds.ToHashSet(StringComparer.Ordinal);
            records = records.Where(r => wanted.Contains(r.Id)).ToList();
        }

        var restored = 0;
        var failed = 0;
        var conflicts = new List<UndoConflict>();
        var messages = new List<string>();

        foreach (var record in records.OrderByDescending(r => r.CreatedUtc).ThenByDescending(r => r.Id))
        {
            if (record.TargetPath is null || !_fs.FileExists(record.TargetPath))
            {
                failed++;
                record.Status = ActionStatus.UndoFailed;
                record.Message = "Die verschobene Datei wurde am neuen Ort nicht gefunden.";
                record.UpdatedUtc = _clock.UtcNow;
                _journal.Update(record);
                messages.Add($"{record.EntryName}: {record.Message}");
                continue;
            }

            var destination = record.SourcePath;
            var originalDir = PathUtil.GetDirectory(destination);
            if (!_fs.DirectoryExists(originalDir))
            {
                try { _fs.CreateDirectory(originalDir); }
                catch (Exception ex)
                {
                    failed++;
                    record.Status = ActionStatus.UndoFailed;
                    record.Message = $"Urspruengliches Verzeichnis konnte nicht angelegt werden: {ex.Message}";
                    record.UpdatedUtc = _clock.UtcNow;
                    _journal.Update(record);
                    continue;
                }
            }

            UndoConflict? conflict = null;
            if (_fs.FileExists(destination) || _fs.DirectoryExists(destination))
            {
                // Beide Inhalte erhalten: der frueher belegte Platz bleibt unangetastet.
                var alternative = NextFreeName(destination);
                conflict = new UndoConflict(record.EntryName, destination, alternative,
                    "Am urspruenglichen Ort liegt bereits eine Datei. Beide Inhalte wurden erhalten.");
                destination = alternative;
            }

            try
            {
                _fs.MoveFile(record.TargetPath, destination);
                record.Status = ActionStatus.UndoneCompleted;
                record.IsUndone = true;
                record.Message = conflict is null
                    ? "Wiederhergestellt."
                    : $"Wiederhergestellt als \"{PathUtil.GetFileName(destination)}\" (Originalort war belegt).";
                record.UpdatedUtc = _clock.UtcNow;
                _journal.Update(record);
                restored++;
                if (conflict is not null) conflicts.Add(conflict);
            }
            catch (Exception ex)
            {
                failed++;
                record.Status = ActionStatus.UndoFailed;
                record.Message = ex.Message;
                record.UpdatedUtc = _clock.UtcNow;
                _journal.Update(record);
                messages.Add($"{record.EntryName}: {ex.Message}");
            }
        }

        return new UndoResult(restored, failed, conflicts, messages);
    }
}
