namespace Clearspace.Core.Model;

/// <summary>Virtuelle Kategorie. Ordner sind eine optionale Ausgabeform, nicht das Datenmodell.</summary>
public sealed class Category
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public string? ParentId { get; set; }

    /// <summary>Symbolname (vom UI auf ein konkretes Glyph abgebildet).</summary>
    public string Icon { get; set; } = "folder";

    /// <summary>Akzentfarbe als #RRGGBB.</summary>
    public string? Color { get; set; }

    public int SortOrder { get; set; }
    public bool IsHidden { get; set; }
    public bool IsFavorite { get; set; }

    /// <summary>Systemkategorien (z. B. Eingang) koennen nicht geloescht werden.</summary>
    public bool IsSystem { get; init; }

    /// <summary>Zielordnername fuer den klassischen Ordnermodus (B). Null = kein eigener Ordner.</summary>
    public string? FolderName { get; set; }

    public override string ToString() => Id;
}

/// <summary>Zuordnung eines Eintrags zu einer Kategorie inklusive Begruendung.</summary>
public sealed class CategoryAssignment
{
    public required string EntryId { get; init; }
    public required string CategoryId { get; init; }
    public AssignmentSource Source { get; init; } = AssignmentSource.Automatic;
    public Confidence Confidence { get; init; } = Confidence.Low;

    /// <summary>Kurze, verstaendliche Begruendung, z. B. "Produktbeschreibung nennt Audiointerface".</summary>
    public string Reason { get; init; } = string.Empty;

    /// <summary>Id der Regel, falls die Zuordnung aus einer Regel stammt.</summary>
    public string? RuleId { get; init; }

    /// <summary>Primaere Kategorie eines Eintrags (fuer den Ordnermodus relevant).</summary>
    public bool IsPrimary { get; set; }

    public DateTimeOffset CreatedUtc { get; init; } = DateTimeOffset.UtcNow;
}
