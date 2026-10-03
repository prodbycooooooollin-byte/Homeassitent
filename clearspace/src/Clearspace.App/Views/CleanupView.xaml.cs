using System.Windows;
using System.Windows.Controls;
using Clearspace.Core.Model;
using Clearspace.Presentation.ViewModels;
using Clearspace.Windows;

namespace Clearspace.App.Views;

public partial class CleanupView : UserControl
{
    public CleanupView() => InitializeComponent();

    private CleanupViewModel? Model => DataContext as CleanupViewModel;

    private void Mode_Checked(object sender, RoutedEventArgs e)
    {
        if (Model is null || sender is not RadioButton { Tag: string tag }) return;
        if (!Enum.TryParse<CleanupMode>(tag, out var mode)) return;
        Model.Mode = mode;

        var isVisibility = mode == CleanupMode.VisibilityOnly;
        VisibilityHelp.Visibility = isVisibility ? Visibility.Visible : Visibility.Collapsed;
        if (isVisibility)
            VisibilityHelpText.Text = DesktopIconVisibility.Explanation + "\n\n"
                                      + string.Join("\n", DesktopIconVisibility.ManualSteps)
                                      + "\n\n" + DesktopIconVisibility.LauncherHint;
    }

    private void Execute_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        if (Model.FileActionCount == 0)
        {
            MessageBox.Show("Es sind keine Dateiaktionen ausgewaehlt. Erstelle zuerst eine Vorschau.",
                "Aufraeumen", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var confirmation = MessageBox.Show(
            $"{Model.FileActionCount} Verknuepfung(en) werden verschoben. Die Zielprogramme bleiben unveraendert. " +
            "Alles laesst sich rueckgaengig machen.\n\nJetzt ausfuehren?",
            "Aufraeumen bestaetigen", MessageBoxButton.OKCancel, MessageBoxImage.Question);
        if (confirmation != MessageBoxResult.OK) return;

        Model.Execute();
    }

    private void OpenWindowsSettings_Click(object sender, RoutedEventArgs e)
    {
        if (!DesktopIconVisibility.OpenWindowsDesktopIconSettings())
            MessageBox.Show("Die Windows-Einstellungen konnten nicht geoeffnet werden.",
                "Hinweis", MessageBoxButton.OK, MessageBoxImage.Warning);
    }
}
