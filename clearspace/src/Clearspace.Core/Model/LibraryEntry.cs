namespace Clearspace.Core.Model;

/// <summary>
/// Ein erfasster Eintrag der Bibliothek. Die Originaldatei existiert genau einmal;
/// Kategoriezugehoerigkeit wird ausschliesslich ueber <see cref="CategoryAssignment"/> abgebildet.
/// </summary>
public sealed class LibraryEntry
{
    public required string Id { get; init; }

    /// <summary>Angezeigter Name (ggf. vom Nutzer ueberschrieben).</summary>
    public required string DisplayName { get; set; }

    /// <summary>Urspruenglicher Name aus dem Dateisystem, wird nie veraendert.</summary>
    public required string OriginalName { get; init; }

    public EntryType Type { get; set; } = EntryType.Unknown;

    /// <summary>Aktueller Pfad der erfassten Datei bzw. des Ordners.</summary>
    public required string Path { get; set; }

    /// <summary>Pfad zum Zeitpunkt der ersten Erfassung. Basis fuer "Rueckgaengig".</summary>
    public required string OriginalPath { get; init; }

    public SourceKind Source { get; init; } = SourceKind.UserDesktop;

    // --- aufgeloeste Verknuepfungsdaten (nur Analyse, nie Ausfuehrung) ---
    public string? TargetPath { get; set; }
    public string? Arguments { get; set; }
    public string? WorkingDirectory { get; set; }
    public string? IconLocation { get; set; }

    // --- Metadaten ---
    public string? Publisher { get; set; }
    public string? ProductName { get; set; }
    public string? ProductDescription { get; set; }
    public string? Extension { get; set; }

    /// <summary>Protokoll (z. B. "steam://") oder registrierte App-Identitaet (AUMID).</summary>
    public string? ProtocolOrAppId { get; set; }

    public long SizeBytes { get; set; }
    public DateTimeOffset? LastWriteUtc { get; set; }
    public DateTimeOffset FirstSeenUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastSeenUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Datei ist ein Cloud-Platzhalter (nicht lokal verfuegbar). Kein Download erzwingen.</summary>
    public bool IsCloudPlaceholder { get; set; }

    /// <summary>Symlink, Junction oder anderer Reparse-Point.</summary>
    public bool IsReparsePoint { get; set; }

    /// <summary>Der Eintrag wurde beim letzten Scan nicht mehr gefunden.</summary>
    public bool IsMissing { get; set; }

    public bool IsFavorite { get; set; }
    public List<string> Tags { get; set; } = new();

    /// <summary>Weitere Fundorte desselben Programms (Duplikate, die zusammengefasst dargestellt werden).</summary>
    public List<EntryOrigin> AdditionalOrigins { get; set; } = new();

    /// <summary>Anzahl Starts ueber den Clearspace-Launcher. Ausschliesslich eigene Starts.</summary>
    public int LaunchCount { get; set; }
    public DateTimeOffset? LastLaunchUtc { get; set; }

    /// <summary>
    /// Nur Verknuepfungsdateien (.lnk/.url) duerfen beim Aufraeumen bewegt werden.
    /// Installierte Programme, Plugins, Samples, Projekte und Ordner niemals automatisch.
    /// </summary>
    public bool IsMovableShortcut =>
        (Type is EntryType.AppShortcut or EntryType.GameShortcut or EntryType.InternetShortcut)
        && Source is SourceKind.UserDesktop or SourceKind.PublicDesktop
        && !IsReparsePoint;

    /// <summary>Kann ueber den Launcher direkt gestartet werden.</summary>
    public bool IsLaunchable => Type is EntryType.AppShortcut or EntryType.GameShortcut
        or EntryType.InternetShortcut or EntryType.InstalledApp or EntryType.PortableApp
        or EntryType.Document or EntryType.ProjectFile or EntryType.Folder or EntryType.MediaFile;

    public override string ToString() => $"{DisplayName} [{Type}] {Path}";
}

/// <summary>Zusaetzlicher Fundort eines zusammengefassten Eintrags.</summary>
public sealed class EntryOrigin
{
    public required string Path { get; init; }
    public required SourceKind Source { get; init; }
    public string? Arguments { get; init; }
    public string? WorkingDirectory { get; init; }
}
