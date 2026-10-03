using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;
using Clearspace.Core.Scanning;
using Microsoft.Win32;

namespace Clearspace.Windows;

/// <summary>
/// Liefert die erfassbaren Quellen: Benutzerdesktop (inklusive umgeleiteter und OneDrive-Pfade),
/// oeffentlicher Desktop sowie lesend Startmenue und installierte Anwendungen.
/// Es wird nie ungefragt die gesamte Festplatte durchsucht.
/// </summary>
public sealed class WindowsScanSourceProvider : IScanSourceProvider
{
    private readonly IShortcutResolver _resolver;

    public WindowsScanSourceProvider(IShortcutResolver resolver) => _resolver = resolver;

    public IReadOnlyList<ScanSource> GetDesktopSources()
    {
        var sources = new List<ScanSource>();
        var desktop = KnownFolders.GetDesktop();
        if (desktop is not null && Directory.Exists(desktop))
            sources.Add(new ScanSource(desktop, SourceKind.UserDesktop, "Dein Desktop", IsWritable(desktop)));

        foreach (var extra in KnownFolders.GetAdditionalDesktopCandidates())
            sources.Add(new ScanSource(extra, SourceKind.UserDesktop,
                extra.Contains("OneDrive", StringComparison.OrdinalIgnoreCase) ? "Desktop in OneDrive" : "Weiterer Desktop-Ordner",
                IsWritable(extra)));

        var publicDesktop = KnownFolders.GetPublicDesktop();
        if (publicDesktop is not null && Directory.Exists(publicDesktop))
            sources.Add(new ScanSource(publicDesktop, SourceKind.PublicDesktop,
                "Oeffentlicher Desktop (alle Benutzer)", IsWritable(publicDesktop)));

        return sources;
    }

    public IReadOnlyList<ScanSource> GetStartMenuSources()
    {
        var sources = new List<ScanSource>();
        var user = KnownFolders.GetStartMenu();
        if (user is not null && Directory.Exists(user))
            sources.Add(new ScanSource(Path.Combine(user, "Programs"), SourceKind.StartMenu, "Startmenue", false));
        var common = KnownFolders.GetCommonStartMenu();
        if (common is not null && Directory.Exists(common))
            sources.Add(new ScanSource(Path.Combine(common, "Programs"), SourceKind.StartMenu,
                "Startmenue (alle Benutzer)", false));
        return sources.Where(s => Directory.Exists(s.Path)).ToList();
    }

    /// <summary>
    /// Installierte Anwendungen aus den dokumentierten Uninstall-Schluesseln der Registrierung.
    /// Ausschliesslich lesend; es wird nichts deinstalliert oder veraendert.
    /// </summary>
    public IReadOnlyList<LibraryEntry> GetInstalledApplications()
    {
        var result = new List<LibraryEntry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var roots = new (RegistryKey Hive, string Path, RegistryView View)[]
        {
            (Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", RegistryView.Registry64),
            (Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", RegistryView.Registry32),
            (Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", RegistryView.Default)
        };

        foreach (var (hive, path, view) in roots)
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(
                    hive == Registry.LocalMachine ? RegistryHive.LocalMachine : RegistryHive.CurrentUser, view);
                using var key = baseKey.OpenSubKey(path);
                if (key is null) continue;

                foreach (var subName in key.GetSubKeyNames())
                {
                    using var sub = key.OpenSubKey(subName);
                    if (sub is null) continue;

                    var name = sub.GetValue("DisplayName") as string;
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    if ((sub.GetValue("SystemComponent") as int?) == 1) continue;
                    if (sub.GetValue("ParentKeyName") is string) continue;
                    if (!seen.Add(name)) continue;

                    var icon = sub.GetValue("DisplayIcon") as string;
                    var install = sub.GetValue("InstallLocation") as string;
                    var publisher = sub.GetValue("Publisher") as string;

                    var targetExe = ResolveExecutable(icon, install);
                    var identity = targetExe ?? install ?? ("registry:" + subName);

                    var entry = new LibraryEntry
                    {
                        Id = DesktopScanner.MakeId("installed:" + identity),
                        DisplayName = name!,
                        OriginalName = name!,
                        Path = install ?? targetExe ?? string.Empty,
                        OriginalPath = install ?? targetExe ?? string.Empty,
                        Source = SourceKind.InstalledApps,
                        Type = EntryType.InstalledApp,
                        TargetPath = targetExe,
                        Publisher = publisher,
                        ProductName = name,
                        IconLocation = icon
                    };

                    if (targetExe is not null)
                    {
                        var meta = _resolver.ReadMetadata(targetExe);
                        if (meta is not null)
                        {
                            entry.Publisher ??= meta.Publisher;
                            entry.ProductDescription = meta.FileDescription;
                        }
                    }

                    result.Add(entry);
                }
            }
            catch (System.Security.SecurityException) { /* Schluessel ohne Leserecht ueberspringen */ }
            catch (UnauthorizedAccessException) { }
        }

        return result;
    }

    private static string? ResolveExecutable(string? displayIcon, string? installLocation)
    {
        if (!string.IsNullOrWhiteSpace(displayIcon))
        {
            var value = displayIcon!.Trim('"');
            var comma = value.LastIndexOf(',');
            if (comma > 2) value = value[..comma];
            if (value.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(value)) return value;
        }
        return null;
    }

    /// <summary>Dauerhaftes Benutzerverzeichnis der Bibliothek - bewusst kein Cache und kein Temp.</summary>
    public string GetLibraryRoot()
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(profile, "Clearspace", "Bibliothek");
    }

    public string GetDataRoot()
    {
        var appData = KnownFolders.GetRoamingAppData()
                      ?? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "Clearspace");
    }

    private static bool IsWritable(string directory)
    {
        try
        {
            var probe = Path.Combine(directory, ".clearspace-schreibtest.tmp");
            using (var stream = File.Create(probe, 1, FileOptions.DeleteOnClose)) { }
            return true;
        }
        catch (UnauthorizedAccessException) { return false; }
        catch (IOException) { return false; }
    }
}
