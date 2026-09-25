namespace Clearspace.Core.Model;

/// <summary>Woher ein Eintrag stammt. Die Herkunft bleibt dauerhaft erhalten.</summary>
public enum SourceKind
{
    UserDesktop,
    PublicDesktop,
    StartMenu,
    InstalledApps,
    UserFolder,
    Manual
}

/// <summary>Was ein Eintrag inhaltlich ist. Bestimmt, welche Aktionen zulaessig sind.</summary>
public enum EntryType
{
    Unknown,
    AppShortcut,
    GameShortcut,
    InternetShortcut,
    InstalledApp,
    PortableApp,
    Installer,
    Document,
    ProjectFile,
    Folder,
    PluginFile,
    PresetFile,
    SampleFile,
    MediaFile,
    Archive,
    SpecialDesktopIcon
}

/// <summary>Wie sicher eine automatische Zuordnung ist. Heuristik, keine Statistik.</summary>
public enum Confidence
{
    Low,
    Medium,
    High
}

/// <summary>Wer eine Kategoriezuordnung vorgenommen hat. Bestimmt den Vorrang.</summary>
public enum AssignmentSource
{
    Automatic = 0,
    Rule = 1,
    Manual = 2
}

/// <summary>Aufraeummodus laut Abschnitt 6 der Anforderungen.</summary>
public enum CleanupMode
{
    /// <summary>A: Verknuepfungen in ein dauerhaftes Bibliotheksverzeichnis verschieben.</summary>
    LauncherLibrary,
    /// <summary>B: Verknuepfungen in wenige Themenordner auf dem Desktop einsortieren.</summary>
    FolderOrganisation,
    /// <summary>C: Nur Sichtbarkeit, keine Dateiaktion.</summary>
    VisibilityOnly
}

public enum PlannedActionKind
{
    /// <summary>Nur virtuelle Zuordnung, keine Aenderung am Dateisystem.</summary>
    VirtualOnly,
    MoveShortcut,
    CreateFolder,
    MoveFile
}

public enum ActionStatus
{
    Planned,
    Running,
    Completed,
    Skipped,
    Failed,
    UndoneCompleted,
    UndoFailed
}

public enum SkipReason
{
    None,
    Protected,
    NotMovable,
    RelativeTargetRisk,
    CrossVolume,
    SourceChanged,
    SourceMissing,
    TargetOccupied,
    AccessDenied,
    CloudPlaceholder,
    ReparsePoint,
    UserDeselected
}
