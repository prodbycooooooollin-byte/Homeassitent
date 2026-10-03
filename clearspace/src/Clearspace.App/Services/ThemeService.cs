using System.Windows;
using System.Windows.Media;
using Microsoft.Win32;

namespace Clearspace.App.Services;

public enum AppTheme { System, Light, Dark }

/// <summary>
/// Helles und dunkles Design. Standard folgt der Windows-Einstellung. Transparenz ist optional;
/// Lesbarkeit und Leistung haben Vorrang, im Modus "hoher Kontrast" wird sie immer abgeschaltet.
/// </summary>
public static class ThemeService
{
    public static bool TransparencyEnabled { get; private set; } = true;

    public static void Apply(AppTheme theme, bool transparency)
    {
        var dark = theme switch
        {
            AppTheme.Dark => true,
            AppTheme.Light => false,
            _ => IsWindowsUsingDarkMode()
        };

        var highContrast = SystemParameters.HighContrast;
        TransparencyEnabled = transparency && !highContrast;

        var resources = Application.Current.Resources;
        if (highContrast)
        {
            Set(resources, "SurfaceBrush", SystemColors.WindowColor);
            Set(resources, "SurfaceElevatedBrush", SystemColors.WindowColor);
            Set(resources, "BorderBrushSoft", SystemColors.WindowTextColor);
            Set(resources, "TextPrimaryBrush", SystemColors.WindowTextColor);
            Set(resources, "TextSecondaryBrush", SystemColors.WindowTextColor);
            Set(resources, "AccentBrush", SystemColors.HighlightColor);
            Set(resources, "AccentSoftBrush", SystemColors.HighlightColor);
            Set(resources, "WarningBrush", SystemColors.WindowTextColor);
            return;
        }

        if (dark)
        {
            Set(resources, "SurfaceBrush", Color.FromRgb(0x14, 0x15, 0x19));
            Set(resources, "SurfaceElevatedBrush", Color.FromRgb(0x1C, 0x1E, 0x24));
            Set(resources, "BorderBrushSoft", Color.FromArgb(0x33, 0xFF, 0xFF, 0xFF));
            Set(resources, "TextPrimaryBrush", Color.FromRgb(0xF2, 0xF3, 0xF6));
            Set(resources, "TextSecondaryBrush", Color.FromArgb(0xAA, 0xF2, 0xF3, 0xF6));
            Set(resources, "AccentBrush", Color.FromRgb(0x6E, 0x94, 0xFF));
            Set(resources, "AccentSoftBrush", Color.FromArgb(0x2A, 0x6E, 0x94, 0xFF));
            Set(resources, "WarningBrush", Color.FromRgb(0xE8, 0xB3, 0x39));
        }
        else
        {
            Set(resources, "SurfaceBrush", Color.FromRgb(0xF7, 0xF7, 0xF9));
            Set(resources, "SurfaceElevatedBrush", Colors.White);
            Set(resources, "BorderBrushSoft", Color.FromArgb(0x22, 0x00, 0x00, 0x00));
            Set(resources, "TextPrimaryBrush", Color.FromRgb(0x16, 0x18, 0x1D));
            Set(resources, "TextSecondaryBrush", Color.FromArgb(0x99, 0x16, 0x18, 0x1D));
            Set(resources, "AccentBrush", Color.FromRgb(0x3E, 0x6D, 0xF0));
            Set(resources, "AccentSoftBrush", Color.FromArgb(0x1A, 0x3E, 0x6D, 0xF0));
            Set(resources, "WarningBrush", Color.FromRgb(0xB4, 0x69, 0x0E));
        }
    }

    private static void Set(ResourceDictionary resources, string key, Color color)
        => resources[key] = new SolidColorBrush(color);

    /// <summary>Dokumentierter Registrierungswert der Windows-Personalisierung.</summary>
    public static bool IsWindowsUsingDarkMode()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return key?.GetValue("AppsUseLightTheme") is int value && value == 0;
        }
        catch (System.Security.SecurityException) { return false; }
    }

    /// <summary>Reduzierte Bewegung respektieren (Windows-Systemeinstellung).</summary>
    public static bool ReduceMotion => !SystemParameters.ClientAreaAnimation;
}
