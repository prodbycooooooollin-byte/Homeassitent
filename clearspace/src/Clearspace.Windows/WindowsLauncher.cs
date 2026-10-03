using System.Diagnostics;
using System.Runtime.InteropServices;
using Clearspace.Core.Abstractions;
using Clearspace.Core.Model;

namespace Clearspace.Windows;

/// <summary>
/// Startet Eintraege ueber die vorgesehenen Windows-Mechanismen (ShellExecuteEx bzw. die
/// Standard-Shell-Zuordnung). Es werden nie Kommandozeilen aus Dateinamen zusammengesetzt.
/// </summary>
public sealed class WindowsLauncher : ILauncher
{
    public LaunchOutcome Launch(LaunchRequest request)
    {
        var entry = request.Entry;

        if (entry.Type is EntryType.PluginFile or EntryType.PresetFile or EntryType.SampleFile)
            return new LaunchOutcome(false,
                "Diese Datei ist kein eigenstaendiges Programm. Nutze \"Ordner oeffnen\" oder den zugehoerigen Manager.",
                false);

        if (entry.Type == EntryType.SpecialDesktopIcon)
            return new LaunchOutcome(false, "Besondere Windows-Symbole werden von Clearspace nicht gestartet.", false);

        // Vor dem ersten Start ungewoehnlicher ausfuehrbarer Inhalte muss klar sein, was startet.
        if (NeedsConfirmation(entry) && !request.UserConfirmedUnknownExecutable)
            return new LaunchOutcome(false,
                $"Unbekannte ausfuehrbare Datei: {entry.TargetPath ?? entry.Path}", true);

        var path = entry.Path;
        if (!File.Exists(path) && !Directory.Exists(path))
            return new LaunchOutcome(false, "Der Eintrag wurde an seinem Ort nicht gefunden.", false);

        try
        {
            // UseShellExecute startet .lnk, .url, Dokumente und registrierte Protokolle korrekt.
            var psi = new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true
            };

            // Arbeitsverzeichnis nur setzen, wenn es tatsaechlich existiert; die Verknuepfung
            // selbst traegt ihr Arbeitsverzeichnis ohnehin mit sich.
            if (!string.IsNullOrWhiteSpace(entry.WorkingDirectory) && Directory.Exists(entry.WorkingDirectory))
                psi.WorkingDirectory = entry.WorkingDirectory!;

            Process.Start(psi);
            return new LaunchOutcome(true, null, false);
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            return new LaunchOutcome(false, $"Start fehlgeschlagen: {ex.Message}", false);
        }
        catch (InvalidOperationException ex)
        {
            return new LaunchOutcome(false, $"Start fehlgeschlagen: {ex.Message}", false);
        }
    }

    private static bool NeedsConfirmation(LibraryEntry entry)
    {
        if (entry.Type is EntryType.Installer) return true;
        if (entry.Type is not (EntryType.PortableApp or EntryType.Unknown)) return false;
        // Ohne Herausgeberangabe ist nicht erkennbar, was gestartet wuerde.
        return string.IsNullOrWhiteSpace(entry.Publisher);
    }

    /// <summary>Oeffnet den Explorer und markiert die Datei - ohne Kommandozeilenbau.</summary>
    public bool RevealInExplorer(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
                return true;
            }
            if (!File.Exists(path)) return false;
            return SelectInExplorer(path);
        }
        catch (System.ComponentModel.Win32Exception) { return false; }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SHParseDisplayName(string pszName, IntPtr pbc, out IntPtr ppidl,
        uint sfgaoIn, out uint psfgaoOut);

    [DllImport("shell32.dll", ExactSpelling = true)]
    private static extern int SHOpenFolderAndSelectItems(IntPtr pidlFolder, uint cidl,
        IntPtr[]? apidl, uint dwFlags);

    [DllImport("ole32.dll")]
    private static extern void CoTaskMemFree(IntPtr pv);

    private static bool SelectInExplorer(string filePath)
    {
        var pidl = IntPtr.Zero;
        try
        {
            var hr = SHParseDisplayName(filePath, IntPtr.Zero, out pidl, 0, out _);
            if (hr != 0 || pidl == IntPtr.Zero) return false;
            return SHOpenFolderAndSelectItems(pidl, 0, null, 0) == 0;
        }
        catch (DllNotFoundException) { return false; }
        catch (EntryPointNotFoundException) { return false; }
        finally
        {
            if (pidl != IntPtr.Zero) CoTaskMemFree(pidl);
        }
    }
}
