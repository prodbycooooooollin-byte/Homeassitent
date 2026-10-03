using System.Windows;
using System.Windows.Controls;
using Clearspace.Presentation.ViewModels;

namespace Clearspace.App.Views;

public partial class OnboardingView : UserControl
{
    public OnboardingView() => InitializeComponent();

    private OnboardingViewModel? Model => DataContext as OnboardingViewModel;

    private void Scan_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null) return;
        var summary = Model.RunScan();
        ScanResultText.Text =
            $"{summary.Total} Eintraege erfasst, {summary.New} davon neu. " +
            $"{summary.Inbox} Eintraege haben noch keine sichere Zuordnung und landen sichtbar im Eingang." +
            (summary.Warnings.Count > 0 ? "\n\nHinweise:\n" + string.Join("\n", summary.Warnings) : string.Empty);
    }

    private void Finish_Click(object sender, RoutedEventArgs e)
    {
        Model?.Finish();
        if (Window.GetWindow(this) is MainWindow main) main.FinishOnboarding();
    }
}
