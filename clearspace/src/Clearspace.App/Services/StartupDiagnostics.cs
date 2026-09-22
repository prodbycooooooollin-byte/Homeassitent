using System.IO;
using System.Text;

namespace Clearspace.App.Services;

/// <summary>
/// Macht Startfehler sichtbar. Ohne das stirbt eine WPF-Anwendung bei einer Ausnahme vor dem
/// ersten Fenster lautlos - der Doppelklick scheint dann wirkungslos.
/// </summary>
public static class StartupDiagnostics
{
    private static readonly StringBuilder Phases = new();

    /// <summary>Protokoll im Benutzerprofil, damit es auch ohne Schreibrechte anderswo funktioniert.</summary>
    public static string LogPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Clearspace", "start-protokoll.txt");

    /// <summary>Unterdrueckt Dialoge (fuer automatische Startpruefungen).</summary>
    private static bool DialogsSuppressed =>
        Environment.GetEnvironmentVariable("CLEARSPACE_OHNE_DIALOG") == "1";

    public static void Note(string phase)
    {
        Phases.AppendLine($"{DateTimeOffset.Now:HH:mm:ss.fff}  {phase}");
        TryWrite();
    }

    public static void Begin()
    {
        Phases.Clear();
        Phases.AppendLine($"Clearspace-Start am {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}");
        Phases.AppendLine($"Programmdatei: {Environment.ProcessPath}");
        Phases.AppendLine($"Betriebssystem: {Environment.OSVersion}");
        Phases.AppendLine($".NET: {Environment.Version}");
        Phases.AppendLine();
        TryWrite();
    }

    /// <summary>Schreibt den Fehler ins Protokoll und zeigt ihn verstaendlich an.</summary>
    public static void Report(Exception exception, string phase)
    {
        Phases.AppendLine();
        Phases.AppendLine($"FEHLER in Phase \"{phase}\":");
        Phases.AppendLine(exception.ToString());
        TryWrite();

        if (DialogsSuppressed) return;

        var message =
            $"Clearspace konnte nicht starten.\n\n" +
            $"Schritt: {phase}\n" +
            $"Ursache: {exception.GetType().Name} - {exception.Message}\n\n" +
            $"Ein ausfuehrliches Protokoll liegt hier:\n{LogPath}";

        try
        {
            MessageBox.Show(message, "Clearspace", System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
        catch
        {
            // Wenn nicht einmal mehr ein Dialog moeglich ist, bleibt das Protokoll.
        }
    }

    private static void TryWrite()
    {
        try
        {
            var directory = Path.GetDirectoryName(LogPath);
            if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
            File.WriteAllText(LogPath, Phases.ToString());
        }
        catch
        {
            // Ein nicht schreibbares Protokoll darf den Start nie verhindern.
        }
    }
}
