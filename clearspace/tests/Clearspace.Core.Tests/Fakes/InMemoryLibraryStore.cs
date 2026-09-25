using Clearspace.Core.Library;
using Clearspace.Core.Model;

namespace Clearspace.Core.Tests.Fakes;

/// <summary>Speicher im Arbeitsspeicher fuer Tests, die keine Persistenz pruefen.</summary>
public sealed class InMemoryLibraryStore : ILibraryStore
{
    private readonly Dictionary<string, LibraryEntry> _entries = new(StringComparer.Ordinal);
    private readonly Dictionary<(string, string), CategoryAssignment> _manual = new();
    private readonly Dictionary<string, Category> _categories = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Rule> _rules = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _settings = new(StringComparer.Ordinal);

    public void SaveEntries(IEnumerable<LibraryEntry> entries)
    {
        foreach (var e in entries) _entries[e.Id] = e;
    }

    public IReadOnlyList<LibraryEntry> GetEntries() => _entries.Values.ToList();
    public void RemoveEntry(string entryId) => _entries.Remove(entryId);

    public void SaveManualAssignment(CategoryAssignment assignment)
        => _manual[(assignment.EntryId, assignment.CategoryId)] = assignment;

    public void RemoveManualAssignment(string entryId, string categoryId) => _manual.Remove((entryId, categoryId));
    public IReadOnlyList<CategoryAssignment> GetManualAssignments() => _manual.Values.ToList();

    public void SaveCategory(Category category) => _categories[category.Id] = category;
    public void DeleteCategory(string categoryId) => _categories.Remove(categoryId);
    public IReadOnlyList<Category> GetCategories() => _categories.Values.OrderBy(c => c.SortOrder).ToList();

    public void SaveRule(Rule rule) => _rules[rule.Id] = rule;
    public void DeleteRule(string ruleId) => _rules.Remove(ruleId);
    public IReadOnlyList<Rule> GetRules() => _rules.Values.OrderByDescending(r => r.Priority).ToList();

    public string? GetSetting(string key) => _settings.TryGetValue(key, out var v) ? v : null;
    public void SetSetting(string key, string value) => _settings[key] = value;
}
