using System.Windows;
using System.Windows.Controls;
using Clearspace.Presentation.ViewModels;

namespace Clearspace.App;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    private ShellViewModel? Shell => DataContext as ShellViewModel;

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        SettingsPage.Initialise(Shell);
        if (Shell?.NeedsOnboarding == true) ShowPage(ShellPage.Launcher, onboarding: true);
        else ShowPage(ShellPage.Launcher);
    }

    /// <summary>Das Schliessen minimiert in den Infobereich; Clearspace bleibt erreichbar.</summary>
    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        e.Cancel = true;
        Hide();
    }

    private void Navigate_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string tag) return;
        if (Enum.TryParse<ShellPage>(tag, out var page)) ShowPage(page);
    }

    public void ShowPage(ShellPage page, bool onboarding = false)
    {
        OnboardingPage.Visibility = onboarding ? Visibility.Visible : Visibility.Collapsed;
        LauncherPage.Visibility = !onboarding && page == ShellPage.Launcher ? Visibility.Visible : Visibility.Collapsed;
        LibraryPage.Visibility = !onboarding && page == ShellPage.Library ? Visibility.Visible : Visibility.Collapsed;
        CleanupPage.Visibility = !onboarding && page == ShellPage.Cleanup ? Visibility.Visible : Visibility.Collapsed;
        RulesPage.Visibility = !onboarding && page == ShellPage.Rules ? Visibility.Visible : Visibility.Collapsed;
        HistoryPage.Visibility = !onboarding && page == ShellPage.History ? Visibility.Visible : Visibility.Collapsed;
        SettingsPage.Visibility = !onboarding && page == ShellPage.Settings ? Visibility.Visible : Visibility.Collapsed;

        if (Shell is not null) Shell.Page = page;
        if (!onboarding && page == ShellPage.Launcher) FocusSearch();
    }

    public void FocusSearch() => LauncherPage.FocusSearch();

    /// <summary>Wird vom Abschluss der Ersteinrichtung aufgerufen.</summary>
    public void FinishOnboarding()
    {
        Shell?.Rescan();
        ShowPage(ShellPage.Cleanup);
    }
}
