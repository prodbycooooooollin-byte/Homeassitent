using Clearspace.Core.Abstractions;
using Clearspace.Core.Categorization;
using Clearspace.Core.Model;
using Clearspace.Core.Rules;
using Clearspace.Core.Scanning;
using Clearspace.Core.Search;

namespace Clearspace.Core.Library;

public sealed record EntryView(
    LibraryEntry Entry,
    IReadOnlyList<CategoryAssignment> Assignments,
    CategoryAssignment Primary,
    bool KeepOnDesktop,
    bool IsProtected);

public sealed record LibraryRefreshResult(
    int TotalEntries,
    int NewEntries,
    int MissingEntries,
    int InboxEntries,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Zentrale Orchestrierung: Erfassung, Zusammenfuehrung, Kategorisierung, Regeln und manuelle
/// Festlegungen. Rangfolge: manuelle Zuordnung > Regel > automatischer Vorschlag.
/// </summary>
public sealed class LibraryService
{
    private readonly ILibraryStore _store;
    private readonly DesktopScanner _scanner;
    private readonly CategoryClassifier _classifier;
    private readonly RuleEngine _ruleEngine = new();
    private readonly SearchIndex _index = new();
    private readonly IClock _clock;

    private readonly Dictionary<string, LibraryEntry> _entries = new(StringComparer.Ordinal);
    private readonly Dictionary<string, List<CategoryAssignment>> _assignments = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Category> _categories = new(StringComparer.Ordinal);
    private List<Rule> _rules = new();
    private readonly HashSet<string> _keepOnDesktop = new(StringComparer.Ordinal);
    private readonly HashSet<string> _protectedEntries = new(StringComparer.Ordinal);
    private readonly HashSet<string> _automaticFileActions = new(StringComparer.Ordinal);

    public LibraryService(ILibraryStore store, DesktopScanner scanner,
        CategoryClassifier? classifier = null, IClock? clock = null)
    {
        _store = store;
        _scanner = scanner;
        _classifier = classifier ?? new CategoryClassifier();
        _clock = clock ?? new SystemClock();
        LoadFromStore();
    }

    public IReadOnlyCollection<LibraryEntry> Entries => _entries.Values;
    public IReadOnlyDictionary<string, Category> Categories => _categories;
    public IReadOnlyList<Rule> Rules => _rules;
    public SearchIndex Index => _index;
    public IReadOnlySet<string> ProtectedEntryIds => _protectedEntries;
    public IReadOnlySet<string> KeepOnDesktopEntryIds => _keepOnDesktop;

    /// <summary>
    /// Eintraege, fuer die eine ausdruecklich aktivierte Regel automatische Dateiaktionen erlaubt.
    /// Ohne diese Regel wird ausschliesslich indexiert und vorgeschlagen.
    /// </summary>
    public IReadOnlySet<string> AutomaticFileActionEntryIds => _automaticFileActions;

    private void LoadFromStore()
    {
        var categories = _store.GetCategories();
        if (categories.Count == 0)
        {
            foreach (var cat in CategoryCatalog.CreateDefaults()) _store.SaveCategory(cat);
            categories = _store.GetCategories();
        }
        foreach (var cat in categories) _categories[cat.Id] = cat;

        _rules = _store.GetRules().ToList();

        foreach (var entry in _store.GetEntries()) _entries[entry.Id] = entry;
        Recompute();
    }

    /// <summary>Erfasst die angegebenen Quellen neu und fuehrt das Ergebnis mit der Bibliothek zusammen.</summary>
    public LibraryRefreshResult Refresh(IEnumerable<ScanSource> sources)
    {
        var report = _scanner.Scan(sources);
        var merged = EntryMerger.Merge(report.Entries);
        var scannedRoots = report.ScannedSources.Select(s => s.Path).ToList();

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var newCount = 0;

        foreach (var scanned in merged)
        {
            seen.Add(scanned.Id);
            if (_entries.TryGetValue(scanned.Id, out var existing))
            {
                // Vorhandenen Eintrag aktualisieren, aber Nutzerdaten erhalten.
                existing.Path = scanned.Path;
                existing.Type = scanned.Type;
                existing.TargetPath = scanned.TargetPath;
                existing.Arguments = scanned.Arguments;
                existing.WorkingDirectory = scanned.WorkingDirectory;
                existing.IconLocation = scanned.IconLocation;
                existing.Publisher = scanned.Publisher;
                existing.ProductName = scanned.ProductName;
                existing.ProductDescription = scanned.ProductDescription;
                existing.ProtocolOrAppId = scanned.ProtocolOrAppId;
                existing.Extension = scanned.Extension;
                existing.SizeBytes = scanned.SizeBytes;
                existing.LastWriteUtc = scanned.LastWriteUtc;
                existing.IsCloudPlaceholder = scanned.IsCloudPlaceholder;
                existing.IsReparsePoint = scanned.IsReparsePoint;
                existing.AdditionalOrigins = scanned.AdditionalOrigins;
                existing.IsMissing = false;
                existing.LastSeenUtc = _clock.UtcNow;
            }
            else
            {
                _entries[scanned.Id] = scanned;
                newCount++;
            }
        }

        // Fehlende Eintraege nur innerhalb der tatsaechlich gescannten Quellen markieren.
        var missing = 0;
        foreach (var entry in _entries.Values)
        {
            if (seen.Contains(entry.Id)) continue;
            var inScannedArea = scannedRoots.Any(root => Cleanup.PathUtil.IsInside(entry.OriginalPath, root));
            if (!inScannedArea) continue;
            // Verschobene Verknuepfungen liegen jetzt in der Bibliothek und gelten nicht als fehlend.
            if (!string.Equals(entry.Path, entry.OriginalPath, StringComparison.OrdinalIgnoreCase)) continue;
            entry.IsMissing = true;
            missing++;
        }

        _store.SaveEntries(_entries.Values);
        Recompute();

        var inbox = _assignments.Count(kv => kv.Value.Count > 0 && kv.Value[0].CategoryId == CategoryCatalog.Inbox);
        return new LibraryRefreshResult(_entries.Count, newCount, missing, inbox, report.Warnings);
    }

    /// <summary>Berechnet Zuordnungen neu: Automatik, dann Regeln, dann manuelle Festlegungen.</summary>
    public void Recompute()
    {
        _assignments.Clear();
        _keepOnDesktop.Clear();
        _protectedEntries.Clear();
        _automaticFileActions.Clear();

        var manual = _store.GetManualAssignments()
            .GroupBy(a => a.EntryId, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);

        foreach (var entry in _entries.Values)
        {
            var list = new List<CategoryAssignment>();

            // 1) Automatische Vorschlaege
            var auto = _classifier.Classify(entry);
            foreach (var hit in auto.Hits.Where(h => _categories.ContainsKey(h.CategoryId)))
                list.Add(new CategoryAssignment
                {
                    EntryId = entry.Id, CategoryId = hit.CategoryId, Source = AssignmentSource.Automatic,
                    Confidence = hit.Confidence, Reason = hit.Reason
                });

            // 2) Regeln
            var outcome = _ruleEngine.Apply(entry, _rules);
            if (outcome.KeepOnDesktop) _keepOnDesktop.Add(entry.Id);
            if (outcome.ProtectedFromFileActions || outcome.KeepOnDesktop) _protectedEntries.Add(entry.Id);
            if (outcome.AllowAutomaticFileActions) _automaticFileActions.Add(entry.Id);
            foreach (var ruleAssignment in outcome.Assignments.Where(a => _categories.ContainsKey(a.CategoryId)))
            {
                list.RemoveAll(a => a.CategoryId == ruleAssignment.CategoryId && a.Source == AssignmentSource.Automatic);
                list.Add(ruleAssignment);
            }

            // 3) Manuelle Festlegungen haben immer Vorrang
            if (manual.TryGetValue(entry.Id, out var manualList))
                foreach (var m in manualList.Where(a => _categories.ContainsKey(a.CategoryId)))
                {
                    list.RemoveAll(a => a.CategoryId == m.CategoryId);
                    list.Add(m);
                }

            if (list.Count == 0)
                list.Add(new CategoryAssignment
                {
                    EntryId = entry.Id, CategoryId = CategoryCatalog.Inbox, Source = AssignmentSource.Automatic,
                    Confidence = Confidence.Low, Reason = "Keine belastbaren Hinweise gefunden", IsPrimary = true
                });

            var primary = SelectPrimary(list);
            foreach (var a in list) a.IsPrimary = ReferenceEquals(a, primary);

            _assignments[entry.Id] = list;
        }

        RebuildIndex();
    }

    private static CategoryAssignment SelectPrimary(List<CategoryAssignment> list)
    {
        // Rangfolge strikt einhalten: manuelle Festlegung vor Regel vor Automatik.
        var manualPrimary = list.FirstOrDefault(a => a.IsPrimary && a.Source == AssignmentSource.Manual);
        if (manualPrimary is not null) return manualPrimary;

        var rulePrimary = list.FirstOrDefault(a => a.IsPrimary && a.Source == AssignmentSource.Rule);
        if (rulePrimary is not null) return rulePrimary;

        return list
            .OrderByDescending(a => (int)a.Source)
            .ThenByDescending(a => a.IsPrimary)
            .ThenByDescending(a => (int)a.Confidence)
            .ThenBy(a => a.CategoryId == CategoryCatalog.Inbox ? 1 : 0)
            .First();
    }

    private void RebuildIndex()
    {
        var names = _assignments.ToDictionary(
            kv => kv.Key,
            kv => kv.Value.Select(a => _categories.TryGetValue(a.CategoryId, out var c) ? c.Name : a.CategoryId).ToList(),
            StringComparer.Ordinal);
        _index.Rebuild(_entries.Values.Where(e => !e.IsMissing), names);
    }

    public IReadOnlyList<CategoryAssignment> GetAssignments(string entryId)
        => _assignments.TryGetValue(entryId, out var list) ? list : Array.Empty<CategoryAssignment>();

    public CategoryAssignment GetPrimary(string entryId)
        => GetAssignments(entryId).FirstOrDefault(a => a.IsPrimary)
           ?? new CategoryAssignment
           {
               EntryId = entryId, CategoryId = CategoryCatalog.Inbox, Confidence = Confidence.Low,
               Reason = "Keine belastbaren Hinweise gefunden", IsPrimary = true
           };

    public IReadOnlyDictionary<string, CategoryAssignment> GetPrimaryMap()
        => _entries.Keys.ToDictionary(id => id, GetPrimary, StringComparer.Ordinal);

    public IReadOnlyList<EntryView> GetByCategory(string categoryId, bool includeSubcategories = true)
    {
        var wanted = new HashSet<string>(StringComparer.Ordinal) { categoryId };
        if (includeSubcategories)
            foreach (var c in _categories.Values)
                if (CategoryCatalog.AncestorChain(_categories, c.Id).Contains(categoryId))
                    wanted.Add(c.Id);

        return _entries.Values
            .Where(e => !e.IsMissing && GetAssignments(e.Id).Any(a => wanted.Contains(a.CategoryId)))
            .OrderByDescending(e => e.IsFavorite)
            .ThenBy(e => e.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .Select(ToView)
            .ToList();
    }

    public EntryView ToView(LibraryEntry entry) => new(
        entry, GetAssignments(entry.Id), GetPrimary(entry.Id),
        _keepOnDesktop.Contains(entry.Id), _protectedEntries.Contains(entry.Id));

    /// <summary>Kategorien mit Inhalt. Leere Unterkategorien werden nicht angezeigt.</summary>
    public IReadOnlyList<Category> GetNonEmptyCategories()
    {
        var used = new HashSet<string>(StringComparer.Ordinal);
        foreach (var list in _assignments.Values)
            foreach (var a in list)
                foreach (var ancestor in CategoryCatalog.AncestorChain(_categories, a.CategoryId))
                    used.Add(ancestor);

        return _categories.Values
            .Where(c => !c.IsHidden && (used.Contains(c.Id) || c.Id == CategoryCatalog.Inbox))
            .OrderBy(c => c.SortOrder)
            .ToList();
    }

    public int CountInCategory(string categoryId, bool includeSubcategories = true)
        => GetByCategory(categoryId, includeSubcategories).Count;

    // --- Nutzerkorrekturen ---

    /// <summary>
    /// Setzt die primaere Kategorie manuell. Die Festlegung ueberlebt Rescan und Neustart und
    /// veraendert ausdruecklich keine anderen Eintraege desselben Herstellers.
    /// </summary>
    public void SetPrimaryCategoryManually(string entryId, string categoryId)
    {
        if (!_categories.ContainsKey(categoryId)) throw new ArgumentException("Unbekannte Kategorie", nameof(categoryId));

        foreach (var existing in _store.GetManualAssignments().Where(a => a.EntryId == entryId && a.IsPrimary))
            _store.RemoveManualAssignment(existing.EntryId, existing.CategoryId);

        _store.SaveManualAssignment(new CategoryAssignment
        {
            EntryId = entryId, CategoryId = categoryId, Source = AssignmentSource.Manual,
            Confidence = Confidence.High, IsPrimary = true, Reason = "Von dir festgelegt",
            CreatedUtc = _clock.UtcNow
        });
        Recompute();
    }

    /// <summary>Zeigt einen Eintrag zusaetzlich in einer weiteren Kategorie (Mehrfachzuordnung).</summary>
    public void AddCategoryManually(string entryId, string categoryId)
    {
        if (!_categories.ContainsKey(categoryId)) throw new ArgumentException("Unbekannte Kategorie", nameof(categoryId));
        _store.SaveManualAssignment(new CategoryAssignment
        {
            EntryId = entryId, CategoryId = categoryId, Source = AssignmentSource.Manual,
            Confidence = Confidence.High, IsPrimary = false, Reason = "Von dir zusaetzlich zugeordnet",
            CreatedUtc = _clock.UtcNow
        });
        Recompute();
    }

    public void RemoveCategoryManually(string entryId, string categoryId)
    {
        _store.RemoveManualAssignment(entryId, categoryId);
        Recompute();
    }

    public IReadOnlyList<Rule> SuggestRulesFor(string entryId, string categoryId)
    {
        if (!_entries.TryGetValue(entryId, out var entry)) return Array.Empty<Rule>();
        var name = _categories.TryGetValue(categoryId, out var c) ? c.Name : categoryId;
        return RuleEngine.SuggestRulesFromCorrection(entry, categoryId, name);
    }

    // --- Regeln ---

    public void SaveRule(Rule rule)
    {
        _store.SaveRule(rule);
        _rules = _store.GetRules().ToList();
        Recompute();
    }

    public void DeleteRule(string ruleId)
    {
        _store.DeleteRule(ruleId);
        _rules = _store.GetRules().ToList();
        Recompute();
    }

    /// <summary>Vorschau: welche Eintraege wuerde diese Regel betreffen?</summary>
    public IReadOnlyList<LibraryEntry> PreviewRule(Rule rule)
        => _entries.Values.Where(e => _ruleEngine.Matches(rule, e)).ToList();

    // --- Kategorien ---

    public void SaveCategory(Category category)
    {
        _store.SaveCategory(category);
        _categories[category.Id] = category;
        Recompute();
    }

    public void DeleteCategory(string categoryId)
    {
        if (_categories.TryGetValue(categoryId, out var cat) && cat.IsSystem)
            throw new InvalidOperationException("Systemkategorien koennen nicht geloescht werden.");
        _store.DeleteCategory(categoryId);
        _categories.Remove(categoryId);
        Recompute();
    }

    // --- Eintragspflege ---

    public void SetDisplayName(string entryId, string name)
    {
        if (!_entries.TryGetValue(entryId, out var entry)) return;
        entry.DisplayName = name;
        _store.SaveEntries(new[] { entry });
        RebuildIndex();
    }

    public void SetFavorite(string entryId, bool favorite)
    {
        if (!_entries.TryGetValue(entryId, out var entry)) return;
        entry.IsFavorite = favorite;
        _store.SaveEntries(new[] { entry });
        RebuildIndex();
    }

    public void SetTags(string entryId, IEnumerable<string> tags)
    {
        if (!_entries.TryGetValue(entryId, out var entry)) return;
        entry.Tags = tags.Select(t => t.Trim()).Where(t => t.Length > 0).Distinct().ToList();
        _store.SaveEntries(new[] { entry });
        RebuildIndex();
    }

    /// <summary>Zaehlt ausschliesslich Starts aus dem Clearspace-Launcher.</summary>
    public void RecordLaunch(string entryId)
    {
        if (!_entries.TryGetValue(entryId, out var entry)) return;
        entry.LaunchCount++;
        entry.LastLaunchUtc = _clock.UtcNow;
        _store.SaveEntries(new[] { entry });
    }

    public void ClearLaunchStatistics()
    {
        foreach (var entry in _entries.Values) { entry.LaunchCount = 0; entry.LastLaunchUtc = null; }
        _store.SaveEntries(_entries.Values);
    }

    /// <summary>Aktualisiert den Pfad nach einer erfolgreichen Dateiaktion (Aufraeumen oder Rueckgaengig).</summary>
    public void UpdatePathAfterFileAction(string entryId, string newPath)
    {
        if (!_entries.TryGetValue(entryId, out var entry)) return;
        entry.Path = newPath;
        entry.IsMissing = false;
        _store.SaveEntries(new[] { entry });
    }

    public LibraryEntry? GetEntry(string entryId)
        => _entries.TryGetValue(entryId, out var entry) ? entry : null;

    /// <summary>Eintraege, die noch keine belastbare Zuordnung haben.</summary>
    public IReadOnlyList<EntryView> GetInbox()
        => _entries.Values
            .Where(e => !e.IsMissing && GetPrimary(e.Id).CategoryId == CategoryCatalog.Inbox)
            .OrderByDescending(e => e.FirstSeenUtc)
            .Select(ToView)
            .ToList();
}
