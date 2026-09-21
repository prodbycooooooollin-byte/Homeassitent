using System.Collections.ObjectModel;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;

namespace Clearspace.Presentation.ViewModels;

public sealed class CategoryNodeViewModel : ObservableObject
{
    public CategoryNodeViewModel(Category category, int count)
    {
        Category = category;
        Count = count;
    }

    public Category Category { get; }
    public string Id => Category.Id;
    public string Name => Category.Name;
    public string Icon => Category.Icon;
    public string? Color => Category.Color;
    public int Count { get; }
    public ObservableCollection<CategoryNodeViewModel> Children { get; } = new();
    public bool IsInbox => Category.Id == Core.Categorization.CategoryCatalog.Inbox;
    public string Header => Count > 0 ? $"{Name} ({Count})" : Name;
}
