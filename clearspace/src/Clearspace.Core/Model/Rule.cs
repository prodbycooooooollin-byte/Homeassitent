namespace Clearspace.Core.Model;

public enum RuleMatchKind
{
    EntryId,
    PathPrefix,
    TargetPathEquals,
    TargetPathPrefix,
    PublisherEquals,
    NameContains,
    ExtensionEquals,
    EntryTypeEquals
}

public enum RuleEffectKind
{
    /// <summary>Setzt die primaere Kategorie.</summary>
    SetPrimaryCategory,
    /// <summary>Zeigt den Eintrag zusaetzlich in einer weiteren Kategorie.</summary>
    AddCategory,
    /// <summary>Eintrag bleibt immer auf dem Desktop und wird nie verschoben.</summary>
    KeepOnDesktop,
    /// <summary>Eintrag wird von allen Dateiaktionen ausgenommen.</summary>
    ProtectFromFileActions,
    /// <summary>Erlaubt der Automatik, neue Treffer ohne Rueckfrage nach Profil zu behandeln.</summary>
    AllowAutomaticFileActions
}

public sealed class RuleCondition
{
    public required RuleMatchKind Kind { get; init; }
    public required string Value { get; init; }
    public bool Negate { get; init; }
}

/// <summary>
/// Nachvollziehbare Regel. Regeln sind priorisierbar, deaktivierbar und per Vorschau pruefbar.
/// Eine Einzelkorrektur erzeugt niemals stillschweigend eine Herstellerregel.
/// </summary>
public sealed class Rule
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? Description { get; set; }

    /// <summary>Alle Bedingungen muessen zutreffen (UND-Verknuepfung).</summary>
    public List<RuleCondition> Conditions { get; set; } = new();

    public RuleEffectKind Effect { get; set; }

    /// <summary>Kategorie-Id bei kategoriebezogenen Effekten.</summary>
    public string? CategoryId { get; set; }

    /// <summary>Hoehere Zahl = hoehere Prioritaet.</summary>
    public int Priority { get; set; }

    public bool IsEnabled { get; set; } = true;
    public DateTimeOffset CreatedUtc { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>Wurde aus einer Nutzerkorrektur erzeugt.</summary>
    public bool CreatedFromCorrection { get; init; }
}
