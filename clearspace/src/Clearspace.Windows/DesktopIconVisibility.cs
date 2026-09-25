using System.Diagnostics;

namespace Clearspace.Windows;

/// <summary>
/// Modus C (visuell leerer Desktop).
///
/// Windows bietet fuer das Ein- und Ausblenden aller Desktop-Symbole keine dokumentierte,
/// stabile Programmierschnittstelle. Die verbreiteten Verfahren beruhen auf dem Versenden
/// interner Nachrichten an das Explorer-Fenster "SHELLDLL_DefView". Das ist ein nicht
/// unterstuetzter Eingriff in die Shell und kann sich mit jedem Windows-Update aendern.
///
/// Clearspace setzt diesen Modus deshalb bewusst NICHT automatisiert um, sondern
/// kennzeichnet ihn als manuellen Schritt und erklaert den Weg ueber die Windows-Funktion.
/// Simulierte Automatik gibt es hier nicht.
/// </summary>
public static class DesktopIconVisibility
{
    /// <summary>Immer false: es existiert keine zuverlaessige dokumentierte Integration.</summary>
    public static bool IsAutomatable => false;

    public const string ModeTitle = "Sichtbarkeitsmodus (manuell)";

    public const string Explanation =
        "Dieser Modus blendet alle Desktop-Symbole aus. Er sortiert nichts und verschiebt nichts: " +
        "alle Dateien bleiben genau dort, wo sie sind, und alle bisherigen Aufraeumergebnisse bleiben unveraendert. " +
        "Windows stellt dafuer keine dokumentierte Schnittstelle bereit, deshalb fuehrt Clearspace diesen " +
        "Schritt nicht selbst aus.";

    public static readonly string[] ManualSteps =
    {
        "Klicke mit der rechten Maustaste auf eine freie Stelle des Desktops.",
        "Waehle \"Ansicht\".",
        "Entferne den Haken bei \"Desktopsymbole anzeigen\".",
        "Zum Wiederanzeigen denselben Weg gehen und den Haken wieder setzen."
    };

    public const string LauncherHint =
        "Clearspace bleibt weiterhin ueber das Infobereichssymbol und den eingestellten Tastenkuerzel erreichbar.";

    /// <summary>Oeffnet die Windows-Einstellungen fuer Desktopsymbole (dokumentierte ms-settings-URI).</summary>
    public static bool OpenWindowsDesktopIconSettings()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "ms-settings:themes",
                UseShellExecute = true
            });
            return true;
        }
        catch (System.ComponentModel.Win32Exception) { return false; }
    }
}
