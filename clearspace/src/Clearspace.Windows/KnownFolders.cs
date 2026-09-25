using System.Runtime.InteropServices;

namespace Clearspace.Windows;

/// <summary>
/// Zugriff auf Windows Known Folders ueber die dokumentierte Funktion SHGetKnownFolderPath.
/// Damit werden umgeleitete Desktop-Pfade (auch OneDrive) korrekt aufgeloest; hartcodierte
/// Pfade werden bewusst vermieden.
/// </summary>
public static class KnownFolders
{
    // Dokumentierte KNOWNFOLDERID-Werte (Knownfolders.h)
    private static readonly Guid Desktop = new("B4BFCC3A-DB2C-424C-B029-7FE99A87C641");
    private static readonly Guid PublicDesktop = new("C4AA340D-F20F-4863-AFEF-F87EF2E6BA25");
    private static readonly Guid StartMenu = new("625B53C3-AB48-4EC1-BA1F-A1EF4146FC19");
    private static readonly Guid CommonStartMenu = new("A4115719-D62E-491D-AA7C-E74B8BE3B067");
    private static readonly Guid LocalAppData = new("F1B32785-6FBA-4FCF-9D55-7B8E7F157091");
    private static readonly Guid RoamingAppData = new("3EB685DB-65F9-4CF6-A03A-E3EF65729F3D");
    private static readonly Guid Documents = new("FDD39AD0-238F-46AF-ADB4-6C85480369C7");
    private static readonly Guid Downloads = new("374DE290-123F-4565-9164-39C4925E467B");

    [Flags]
    private enum KnownFolderFlag : uint
    {
        None = 0x00000000,
        DontVerify = 0x00004000
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, PreserveSig = false)]
    private static extern string SHGetKnownFolderPath(
        [MarshalAs(UnmanagedType.LPStruct)] Guid rfid, uint dwFlags, IntPtr hToken);

    private static string? Get(Guid id)
    {
        try { return SHGetKnownFolderPath(id, (uint)KnownFolderFlag.None, IntPtr.Zero); }
        catch (COMException) { return null; }
        catch (EntryPointNotFoundException) { return null; }
    }

    public static string? GetDesktop() => Get(Desktop);
    public static string? GetPublicDesktop() => Get(PublicDesktop);
    public static string? GetStartMenu() => Get(StartMenu);
    public static string? GetCommonStartMenu() => Get(CommonStartMenu);
    public static string? GetLocalAppData() => Get(LocalAppData);
    public static string? GetRoamingAppData() => Get(RoamingAppData);
    public static string? GetDocuments() => Get(Documents);
    public static string? GetDownloads() => Get(Downloads);

    /// <summary>
    /// Zusaetzliche Desktop-Pfade, die bei aktiver OneDrive-Ordnersicherung neben dem
    /// Known-Folder-Pfad existieren koennen. Nur vorhandene Verzeichnisse werden geliefert.
    /// </summary>
    public static IReadOnlyList<string> GetAdditionalDesktopCandidates()
    {
        var result = new List<string>();
        var known = GetDesktop();

        foreach (var variable in new[] { "OneDrive", "OneDriveCommercial", "OneDriveConsumer" })
        {
            var root = Environment.GetEnvironmentVariable(variable);
            if (string.IsNullOrWhiteSpace(root)) continue;
            foreach (var name in new[] { "Desktop", "Schreibtisch" })
            {
                var candidate = Path.Combine(root, name);
                if (Directory.Exists(candidate) && !SamePath(candidate, known)) result.Add(candidate);
            }
        }

        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var local = Path.Combine(profile, "Desktop");
        if (Directory.Exists(local) && !SamePath(local, known) && !result.Any(p => SamePath(p, local)))
            result.Add(local);

        return result;
    }

    private static bool SamePath(string a, string? b)
        => b is not null && string.Equals(a.TrimEnd('\\'), b.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
}
