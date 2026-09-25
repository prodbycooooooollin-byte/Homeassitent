using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Clearspace.Presentation.ViewModels;

namespace Clearspace.App.Views;

public partial class LauncherView : UserControl
{
    public LauncherView() => InitializeComponent();

    private LauncherViewModel? Model => DataContext as LauncherViewModel;

    public void FocusSearch()
    {
        SearchBox.Focus();
        SearchBox.SelectAll();
    }

    private void SearchBox_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Down:
                Model?.MoveSelection(1);
                e.Handled = true;
                break;
            case Key.Up:
                Model?.MoveSelection(-1);
                e.Handled = true;
                break;
            case Key.Enter:
                Model?.LaunchSelected();
                e.Handled = true;
                break;
            case Key.Escape:
                Window.GetWindow(this)?.Hide();
                e.Handled = true;
                break;
        }
    }

    private void ResultList_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            Model?.LaunchSelected();
            e.Handled = true;
        }
        else if (e.Key == Key.Escape)
        {
            Window.GetWindow(this)?.Hide();
            e.Handled = true;
        }
    }

    private void ResultList_MouseDoubleClick(object sender, MouseButtonEventArgs e) => Model?.LaunchSelected();

    private void Open_Click(object sender, RoutedEventArgs e) => Model?.LaunchSelected();

    private void Reveal_Click(object sender, RoutedEventArgs e) => Model?.RevealSelected();

    private void ConfirmLaunch_Click(object sender, RoutedEventArgs e) => Model?.ConfirmLaunch();

    private void CancelConfirm_Click(object sender, RoutedEventArgs e) => Model?.CancelConfirmation();
}
