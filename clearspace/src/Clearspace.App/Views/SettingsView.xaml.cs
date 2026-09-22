using System.Windows;
using System.Windows.Controls;
using Clearspace.App.Services;
using Clearspace.Presentation.ViewModels;

namespace Clearspace.App.Views;

public partial class SettingsView : UserControl
{
    private ShellViewModel? _shell;

    /// <summary>
    /// Erst true, wenn alle Bedienelemente stehen. WPF loest Ereignisse bereits waehrend des
    /// Aufbaus aus; ohne diese Sperre greift ein Handler auf noch nicht erzeugte Elemente zu.
    /// </summary>
    private bool _ready;

    public SettingsView() => InitializeComponent();

    public void Initialise(ShellViewModel? shell)
    {
        _shell = shell;
        HotkeyBox.Text = "Control+Alt+Space";
        AutostartBox.IsChecked = StartupService.IsEnabled();
        StatisticsBox.IsChecked = _shell?.Launcher.StatisticsEnabled ?? true;
        TransparencyBox.IsChecked = ThemeService.TransparencyEnabled;
        ThemeSystem.IsChecked = true;
        DatabaseHint.Text = "Bibliothek, Regeln und Journal liegen lokal in einer Datenbankdatei deines Benutzerprofils.";

        _ready = true;
    }

    private void Theme_Checked(object sender, RoutedEventArgs e)
    {
        if (!_ready || sender is not RadioButton { Tag: string tag }) return;
        var theme = tag switch
        {
            "Light" => AppTheme.Light,
            "Dark" => AppTheme.Dark,
            _ => AppTheme.System
        };
        ThemeService.Apply(theme, TransparencyBox.IsChecked == true);
        SettingsStatus.Text = "Darstellung aktualisiert.";
    }

    private void Transparency_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) return;
        var theme = ThemeLight.IsChecked == true ? AppTheme.Light
            : ThemeDark.IsChecked == true ? AppTheme.Dark : AppTheme.System;
        ThemeService.Apply(theme, TransparencyBox.IsChecked == true);
    }

    private void SaveHotkey_Click(object sender, RoutedEventArgs e)
    {
        SettingsStatus.Text =
            $"Gespeichert: {HotkeyBox.Text}. Die Kombination wird beim naechsten Start von Clearspace registriert; " +
            "ist sie belegt, erscheint ein Hinweis in der Statuszeile.";
    }

    private void Autostart_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) return;
        var wanted = AutostartBox.IsChecked == true;
        if (!StartupService.SetEnabled(wanted))
        {
            AutostartBox.IsChecked = !wanted;
            SettingsStatus.Text = "Der Autostart konnte nicht geaendert werden.";
            return;
        }
        SettingsStatus.Text = wanted ? "Clearspace startet kuenftig im Infobereich mit." : "Autostart abgeschaltet.";
    }

    private void Statistics_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready || _shell is null) return;
        _shell.Launcher.StatisticsEnabled = StatisticsBox.IsChecked == true;
    }

    private void ClearStatistics_Click(object sender, RoutedEventArgs e)
    {
        if (_shell is null) return;
        _shell.Launcher.StatisticsEnabled = false;
        StatisticsBox.IsChecked = false;
        SettingsStatus.Text = "Startstatistik geloescht.";
    }
}
