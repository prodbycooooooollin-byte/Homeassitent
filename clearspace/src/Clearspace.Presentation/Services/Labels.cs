using Clearspace.Core.Model;

namespace Clearspace.Presentation.Services;

/// <summary>Deutsche Beschriftungen ohne technische Begriffe in gewoehnlichen Nutzeraktionen.</summary>
public static class Labels
{
    public static string EntryType(EntryType type) => type switch
    {
        Core.Model.EntryType.AppShortcut => "Programmverknuepfung",
        Core.Model.EntryType.GameShortcut => "Spielverknuepfung",
        Core.Model.EntryType.InternetShortcut => "Internetverknuepfung",
        Core.Model.EntryType.InstalledApp => "Installierte Anwendung",
        Core.Model.EntryType.PortableApp => "Portables Programm",
        Core.Model.EntryType.Installer => "Installationsdatei",
        Core.Model.EntryType.Document => "Dokument",
        Core.Model.EntryType.ProjectFile => "Projektdatei",
        Core.Model.EntryType.Folder => "Ordner",
        Core.Model.EntryType.PluginFile => "Plugin",
        Core.Model.EntryType.PresetFile => "Preset",
        Core.Model.EntryType.SampleFile => "Sample",
        Core.Model.EntryType.MediaFile => "Mediendatei",
        Core.Model.EntryType.Archive => "Archiv",
        Core.Model.EntryType.SpecialDesktopIcon => "Windows-Symbol",
        _ => "Unbekannt"
    };

    public static string Confidence(Confidence confidence) => confidence switch
    {
        Core.Model.Confidence.High => "sicher",
        Core.Model.Confidence.Medium => "wahrscheinlich",
        _ => "unsicher"
    };

    public static string AssignmentSource(AssignmentSource source) => source switch
    {
        Core.Model.AssignmentSource.Manual => "von dir festgelegt",
        Core.Model.AssignmentSource.Rule => "durch eine Regel",
        _ => "automatisch vorgeschlagen"
    };

    public static string CleanupMode(CleanupMode mode) => mode switch
    {
        Core.Model.CleanupMode.LauncherLibrary => "Aufgeraeumter Desktop mit Bibliothek",
        Core.Model.CleanupMode.FolderOrganisation => "Klassische Ordnerorganisation",
        _ => "Nur Sichtbarkeit"
    };

    public static string Action(PlannedActionKind kind) => kind switch
    {
        PlannedActionKind.MoveShortcut => "Verknuepfung verschieben",
        PlannedActionKind.MoveFile => "Datei verschieben",
        PlannedActionKind.CreateFolder => "Ordner anlegen",
        _ => "Nur einsortieren (keine Dateiaenderung)"
    };

    public static string SkipReason(SkipReason reason) => reason switch
    {
        Core.Model.SkipReason.Protected => "geschuetzt",
        Core.Model.SkipReason.NotMovable => "wird nicht verschoben",
        Core.Model.SkipReason.RelativeTargetRisk => "relativer Zielpfad",
        Core.Model.SkipReason.CrossVolume => "anderes Laufwerk",
        Core.Model.SkipReason.SourceChanged => "zwischenzeitlich geaendert",
        Core.Model.SkipReason.SourceMissing => "nicht mehr vorhanden",
        Core.Model.SkipReason.TargetOccupied => "Zielname belegt",
        Core.Model.SkipReason.AccessDenied => "keine Berechtigung",
        Core.Model.SkipReason.CloudPlaceholder => "nur in der Cloud",
        Core.Model.SkipReason.ReparsePoint => "Verweis",
        Core.Model.SkipReason.UserDeselected => "abgewaehlt",
        _ => string.Empty
    };
}
