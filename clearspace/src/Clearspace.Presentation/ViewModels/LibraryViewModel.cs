using System.Collections.ObjectModel;
using Clearspace.Core.Model;
using Clearspace.Core.Rules;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

/// <summary>Bibliothek mit Kategorien, Mehrfachzuordnung, Korrekturen und Regelvorschlaegen.</summary>
public sealed class LibraryViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private CategoryNodeViewModel? _selectedCategory;
    private EntryItemViewModel? _selectedEntry;
    private string? _status;

    public LibraryViewModel(ClearspaceSession session)
    {
        _session = session;
        Reload();
    }

    public ObservableCollection<CategoryNodeViewModel> Categories { get; } = new();
    public ObservableCollection<EntryItemViewModel> Entries { get; } = new();
    public ObservableCollection<EntryItemViewModel> Inbox { get; } = new();

    /// <summary>Regelvorschlaege nach einer Korrektur. Sie wirken erst nach ausdruecklicher Uebernahme.</summary>
    public ObservableCollection<Rule> PendingRuleSuggestions { get; } = new();

    public CategoryNodeViewModel? SelectedCategory
    {
        get => _selectedCategory;
        set { if (SetField(ref _selectedCategory, value)) LoadEntries(); }
    }

    public EntryItemViewModel? SelectedEntry
    {
        get => _selectedEntry;
        set => SetField(ref _selectedEntry, value);
    }

    public string? Status
    {
        get => _status;
        private set => SetField(ref _status, value);
    }

    public int InboxCount => Inbox.Count;

    public void Reload()
    {
        var previous = SelectedCategory?.Id;
        Categories.Clear();

        var nonEmpty = _session.Library.GetNonEmptyCategories();
        var byId = nonEmpty.ToDictionary(c => c.Id, StringComparer.Ordinal);
        var nodes = new Dictionary<string, CategoryNodeViewModel>(StringComparer.Ordinal);

        foreach (var category in nonEmpty.Where(c => c.ParentId is null))
        {
            var node = new CategoryNodeViewModel(category, _session.Library.CountInCategory(category.Id));
            nodes[category.Id] = node;
            Categories.Add(node);
        }

        // Unterkategorien nur anzeigen, wenn sie Inhalte haben.
        foreach (var category in nonEmpty.Where(c => c.ParentId is not null))
        {
            var count = _session.Library.CountInCategory(category.Id);
            if (count == 0) continue;
            if (!nodes.TryGetValue(category.ParentId!, out var parent)) continue;
            parent.Children.Add(new CategoryNodeViewModel(category, count));
        }

        Inbox.Clear();
        foreach (var view in _session.Library.GetInbox())
            Inbox.Add(new EntryItemViewModel(_session.Library, view));
        OnPropertyChanged(nameof(InboxCount));

        SelectedCategory = (previous is not null ? FindNode(previous) : null) ?? Categories.FirstOrDefault();
        LoadEntries();
    }

    private CategoryNodeViewModel? FindNode(string id)
        => Categories.Concat(Categories.SelectMany(c => c.Children)).FirstOrDefault(n => n.Id == id);

    private void LoadEntries()
    {
        Entries.Clear();
        if (SelectedCategory is null) return;
        foreach (var view in _session.Library.GetByCategory(SelectedCategory.Id))
            Entries.Add(new EntryItemViewModel(_session.Library, view));
    }

    /// <summary>Korrigiert die Hauptkategorie und bietet danach passende Regeln an.</summary>
    public void CorrectCategory(EntryItemViewModel item, string categoryId)
    {
        _session.Library.SetPrimaryCategoryManually(item.Id, categoryId);
        PendingRuleSuggestions.Clear();
        foreach (var rule in _session.Library.SuggestRulesFor(item.Id, categoryId))
            PendingRuleSuggestions.Add(rule);

        Status = "Zuordnung gespeichert. Sie bleibt auch nach einem neuen Scan erhalten.";
        Reload();
    }

    public void AddCategory(EntryItemViewModel item, string categoryId)
    {
        _session.Library.AddCategoryManually(item.Id, categoryId);
        Status = "Der Eintrag erscheint jetzt zusaetzlich in dieser Kategorie - ohne zweite Datei.";
        Reload();
    }

    public IReadOnlyList<LibraryEntry> PreviewRule(Rule rule) => _session.Library.PreviewRule(rule);

    public void AcceptRule(Rule rule)
    {
        _session.Library.SaveRule(rule);
        PendingRuleSuggestions.Remove(rule);
        Status = $"Regel \"{rule.Name}\" ist aktiv.";
        Reload();
    }

    public void DiscardRuleSuggestions() => PendingRuleSuggestions.Clear();

    public void Rename(EntryItemViewModel item, string newName)
    {
        _session.Library.SetDisplayName(item.Id, newName);
        Reload();
    }

    public void SetTags(EntryItemViewModel item, string commaSeparated)
    {
        _session.Library.SetTags(item.Id, commaSeparated.Split(',', StringSplitOptions.RemoveEmptyEntries));
        Reload();
    }

    public IReadOnlyList<Category> AllCategories => _session.Library.Categories.Values
        .Where(c => !c.IsHidden)
        .OrderBy(c => c.SortOrder)
        .ToList();
}
