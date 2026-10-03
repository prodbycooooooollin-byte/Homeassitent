using System.Windows;
using System.Windows.Controls;
using Clearspace.Core.Model;
using Clearspace.Core.Rules;
using Clearspace.Presentation.ViewModels;

namespace Clearspace.App.Views;

public partial class LibraryView : UserControl
{
    public LibraryView()
    {
        InitializeComponent();
        DataContextChanged += (_, _) => FillCategoryPicker();
    }

    private LibraryViewModel? Model => DataContext as LibraryViewModel;

    private void FillCategoryPicker()
    {
        if (Model is null) return;
        CategoryPicker.ItemsSource = Model.AllCategories;
        if (CategoryPicker.Items.Count > 0) CategoryPicker.SelectedIndex = 0;
    }

    private void CategoryTree_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
    {
        if (Model is not null && e.NewValue is CategoryNodeViewModel node) Model.SelectedCategory = node;
    }

    private EntryItemViewModel? CurrentEntry
        => EntryList.SelectedItem as EntryItemViewModel ?? InboxList.SelectedItem as EntryItemViewModel;

    private void SetPrimary_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || CurrentEntry is null || CategoryPicker.SelectedItem is not Category category) return;
        Model.CorrectCategory(CurrentEntry, category.Id);
        FillCategoryPicker();
    }

    private void AddCategory_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || CurrentEntry is null || CategoryPicker.SelectedItem is not Category category) return;
        Model.AddCategory(CurrentEntry, category.Id);
        FillCategoryPicker();
    }

    private void PreviewRule_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || sender is not Button { Tag: Rule rule }) return;
        var affected = Model.PreviewRule(rule);
        MessageBox.Show(
            $"Diese Regel betrifft {affected.Count} Eintrag/Eintraege:\n\n" +
            string.Join("\n", affected.Take(15).Select(a => "- " + a.DisplayName)) +
            (affected.Count > 15 ? $"\n... und {affected.Count - 15} weitere" : string.Empty),
            "Vorschau der Regel", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void AcceptRule_Click(object sender, RoutedEventArgs e)
    {
        if (Model is null || sender is not Button { Tag: Rule rule }) return;
        Model.AcceptRule(rule);
    }
}
