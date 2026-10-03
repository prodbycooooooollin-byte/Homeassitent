using Clearspace.Core.Model;

namespace Clearspace.Core.Library;

/// <summary>Dauerhafte Ablage von Bibliothek, manuellen Zuordnungen, Kategorien und Regeln.</summary>
public interface ILibraryStore
{
    void SaveEntries(IEnumerable<LibraryEntry> entries);
    IReadOnlyList<LibraryEntry> GetEntries();
    void RemoveEntry(string entryId);

    /// <summary>Manuelle Zuordnungen. Sie haben Vorrang und ueberleben Rescan und Neustart.</summary>
    void SaveManualAssignment(CategoryAssignment assignment);
    void RemoveManualAssignment(string entryId, string categoryId);
    IReadOnlyList<CategoryAssignment> GetManualAssignments();

    void SaveCategory(Category category);
    void DeleteCategory(string categoryId);
    IReadOnlyList<Category> GetCategories();

    void SaveRule(Rule rule);
    void DeleteRule(string ruleId);
    IReadOnlyList<Rule> GetRules();

    string? GetSetting(string key);
    void SetSetting(string key, string value);
}
