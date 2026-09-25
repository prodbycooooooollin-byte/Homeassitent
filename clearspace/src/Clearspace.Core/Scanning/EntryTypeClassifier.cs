using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;

namespace Clearspace.Core.Scanning;

/// <summary>
/// Bestimmt den Eintragstyp aus Endung, Verknuepfungsziel und Ablageort.
/// Endungen allein entscheiden nicht ueber die spaetere Behandlung.
/// </summary>
public static class EntryTypeClassifier
{
    private static readonly HashSet<string> PluginExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".vst", ".vst3", ".dll", ".clap", ".aax", ".component", ".nks" };

    private static readonly HashSet<string> PresetExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".fxp", ".fxb", ".nksf", ".nmsv", ".h2p", ".vstpreset", ".fst", ".serumpreset", ".spf" };

    private static readonly HashSet<string> ProjectExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".flp", ".als", ".alp", ".cpr", ".rpp", ".song", ".ptx", ".logicx", ".bwproject", ".reason",
          ".sln", ".csproj", ".prproj", ".veg", ".aep", ".blend", ".psd", ".ai", ".afphoto", ".afdesign" };

    private static readonly HashSet<string> AudioExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".wav", ".aiff", ".aif", ".flac", ".mp3", ".ogg", ".m4a", ".midi", ".mid" };

    private static readonly HashSet<string> MediaExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mkv", ".mov", ".avi", ".webm" };

    private static readonly HashSet<string> ArchiveExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".zip", ".rar", ".7z", ".tar", ".gz", ".iso" };

    private static readonly HashSet<string> DocumentExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".pdf", ".docx", ".doc", ".xlsx", ".pptx", ".txt", ".md", ".rtf", ".odt", ".csv" };

    private static readonly string[] SampleFolderMarkers =
        { "samples", "sample packs", "drumkits", "drum kits", "loops", "one shots", "oneshots", "stems" };

    private static readonly string[] PresetFolderMarkers = { "presets", "soundbanks", "patches", "skins" };

    private static readonly string[] InstallerMarkers = { "setup", "install", "installer", "_x64", "-setup" };

    private static readonly string[] GameTargetMarkers =
        { "\\steamapps\\", "/steamapps/", "\\epic games\\", "\\gog galaxy\\games\\", "\\riot games\\",
          "\\battle.net\\", "steam://rungameid", "com.epicgames.launcher://apps" };

    /// <summary>Besondere Desktop-Symbole (Papierkorb, Dieser PC, Netzwerk) als CLSID-Ordner.</summary>
    public static bool IsSpecialDesktopIcon(string name)
        => name.Contains(".{", StringComparison.Ordinal) && name.EndsWith("}", StringComparison.Ordinal);

    public static EntryType Classify(FileEntryInfo info, ShortcutInfo? shortcut)
    {
        if (IsSpecialDesktopIcon(info.Name))
            return EntryType.SpecialDesktopIcon;

        if (info.IsDirectory)
            return EntryType.Folder;

        var ext = System.IO.Path.GetExtension(info.Name);
        var lowerPath = info.Path.Replace('/', '\\').ToLowerInvariant();

        if (ext.Equals(".url", StringComparison.OrdinalIgnoreCase))
            return EntryType.InternetShortcut;

        if (ext.Equals(".lnk", StringComparison.OrdinalIgnoreCase))
        {
            var target = (shortcut?.TargetPath ?? string.Empty).Replace('/', '\\').ToLowerInvariant();
            var protocol = shortcut?.ProtocolOrAppId?.ToLowerInvariant() ?? string.Empty;
            var args = shortcut?.Arguments?.ToLowerInvariant() ?? string.Empty;
            var haystack = target + " " + protocol + " " + args;

            if (GameTargetMarkers.Any(m => haystack.Contains(m, StringComparison.Ordinal)))
                return EntryType.GameShortcut;

            if (!string.IsNullOrEmpty(protocol) && !protocol.StartsWith("file:", StringComparison.Ordinal)
                && target.Length == 0)
                return EntryType.InternetShortcut;

            return EntryType.AppShortcut;
        }

        if (PresetExtensions.Contains(ext) || InFolder(lowerPath, PresetFolderMarkers) && AudioExtensions.Contains(ext) == false)
        {
            if (PresetExtensions.Contains(ext)) return EntryType.PresetFile;
        }

        if (PluginExtensions.Contains(ext))
        {
            // Eine DLL ist nur dann ein Plugin, wenn sie plausibel in einem Plugin-Kontext liegt.
            if (!ext.Equals(".dll", StringComparison.OrdinalIgnoreCase)
                || lowerPath.Contains("vst", StringComparison.Ordinal)
                || lowerPath.Contains("plugin", StringComparison.Ordinal))
                return EntryType.PluginFile;
        }

        if (ProjectExtensions.Contains(ext))
            return EntryType.ProjectFile;

        if (AudioExtensions.Contains(ext))
            return InFolder(lowerPath, SampleFolderMarkers) ? EntryType.SampleFile : EntryType.MediaFile;

        if (MediaExtensions.Contains(ext))
            return EntryType.MediaFile;

        if (ArchiveExtensions.Contains(ext))
            return EntryType.Archive;

        if (DocumentExtensions.Contains(ext))
            return EntryType.Document;

        if (ext.Equals(".msi", StringComparison.OrdinalIgnoreCase))
            return EntryType.Installer;

        if (ext.Equals(".exe", StringComparison.OrdinalIgnoreCase))
        {
            var fileName = System.IO.Path.GetFileNameWithoutExtension(info.Name).ToLowerInvariant();
            if (InstallerMarkers.Any(m => fileName.Contains(m, StringComparison.Ordinal)))
                return EntryType.Installer;
            return EntryType.PortableApp;
        }

        return EntryType.Unknown;
    }

    private static bool InFolder(string lowerPath, string[] markers)
        => markers.Any(m => lowerPath.Contains("\\" + m + "\\", StringComparison.Ordinal));

    /// <summary>Typen, die niemals automatisch im Dateisystem bewegt werden duerfen.</summary>
    public static bool IsProtectedByType(EntryType type) => type is
        EntryType.PluginFile or EntryType.PresetFile or EntryType.SampleFile or EntryType.ProjectFile
        or EntryType.InstalledApp or EntryType.PortableApp or EntryType.Folder or EntryType.SpecialDesktopIcon;
}
