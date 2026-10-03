using Clearspace.Core.Library;

namespace Clearspace.Core.Watching;

/// <summary>
/// Entscheidet, ob die Hintergrundautomatik fuer einen Eintrag Dateiaktionen ausfuehren darf.
/// Standard ist "nein": neue Eintraege werden nur indexiert und als Vorschlag angeboten.
/// </summary>
public sealed class AutomationPolicy
{
    private readonly LibraryService _library;

    public AutomationPolicy(LibraryService library) => _library = library;

    /// <summary>Globale Pause der Automatik.</summary>
    public bool IsPaused { get; set; }

    public bool MayActAutomatically(string entryId)
    {
        if (IsPaused) return false;
        if (_library.ProtectedEntryIds.Contains(entryId)) return false;
        if (!_library.AutomaticFileActionEntryIds.Contains(entryId)) return false;

        // Zusaetzlich muss die Zuordnung sicher sein; unklare Faelle bleiben im Eingang.
        var primary = _library.GetPrimary(entryId);
        return primary.CategoryId != Categorization.CategoryCatalog.Inbox
               && primary.Confidence == Model.Confidence.High;
    }

    public string ExplainDecision(string entryId)
    {
        if (IsPaused) return "Die Automatik ist pausiert.";
        if (_library.ProtectedEntryIds.Contains(entryId)) return "Eine Schutzregel verhindert automatische Aktionen.";
        if (!_library.AutomaticFileActionEntryIds.Contains(entryId))
            return "Es ist keine Regel aktiv, die automatische Dateiaktionen erlaubt. Der Eintrag wurde nur indexiert.";
        var primary = _library.GetPrimary(entryId);
        if (primary.CategoryId == Categorization.CategoryCatalog.Inbox)
            return "Die Zuordnung ist unklar. Der Eintrag bleibt im Eingang.";
        if (primary.Confidence != Model.Confidence.High)
            return "Die Zuordnung ist nicht sicher genug fuer eine stille Aktion.";
        return "Wird nach dem bestaetigten Aufraeumprofil behandelt.";
    }
}
