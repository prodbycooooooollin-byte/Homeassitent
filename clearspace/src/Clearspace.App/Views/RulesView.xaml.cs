using System.Windows;
using System.Windows.Controls;
using Clearspace.Presentation.ViewModels;

namespace Clearspace.App.Views;

public partial class RulesView : UserControl
{
    public RulesView() => InitializeComponent();

    private RulesViewModel? Model => DataContext as RulesViewModel;

    private static RuleItemViewModel? ItemOf(object sender)
        => (sender as Button)?.Tag as RuleItemViewModel;

    private void Preview_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || ItemOf(sender) is not { } item) return;
        Model.ShowPreview(item);
    }

    private void Up_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || ItemOf(sender) is not { } item) return;
        Model.ChangePriority(item, item.Priority + 10);
    }

    private void Down_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || ItemOf(sender) is not { } item) return;
        Model.ChangePriority(item, item.Priority - 10);
    }

    private void Delete_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || ItemOf(sender) is not { } item) return;
        var answer = MessageBox.Show($"Regel \"{item.Name}\" wirklich loeschen?", "Regel loeschen",
            MessageBoxButton.OKCancel, MessageBoxImage.Question);
        if (answer == MessageBoxResult.OK) Model.Delete(item);
    }
}
