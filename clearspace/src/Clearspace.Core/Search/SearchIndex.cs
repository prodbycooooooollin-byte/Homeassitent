using Clearspace.Core.Model;

namespace Clearspace.Core.Search;

public sealed record SearchHit(LibraryEntry Entry, int Score, string MatchedOn);

/// <summary>
/// In-Memory-Index ueber Namen, Kategorien und eigene Tags. Bewusst einfach gehalten:
/// bei einigen Tausend Eintraegen reicht eine lineare Bewertung.
/// </summary>
public sealed class SearchIndex
{
    private readonly List<IndexItem> _items = new();

    private sealed record IndexItem(LibraryEntry Entry, string[] CategoryNames);

    public int Count => _items.Count;

    public void Rebuild(IEnumerable<LibraryEntry> entries,
        IReadOnlyDictionary<string, List<string>>? categoryNamesByEntry = null)
    {
        _items.Clear();
        foreach (var entry in entries)
        {
            var names = categoryNamesByEntry is not null && categoryNamesByEntry.TryGetValue(entry.Id, out var list)
                ? list.ToArray()
                : Array.Empty<string>();
            _items.Add(new IndexItem(entry, names));
        }
    }

    public IReadOnlyList<SearchHit> Search(string query, int limit = 50)
    {
        if (string.IsNullOrWhiteSpace(query))
            return _items
                .OrderByDescending(i => i.Entry.IsFavorite)
                .ThenByDescending(i => i.Entry.LaunchCount)
                .ThenBy(i => i.Entry.DisplayName, StringComparer.CurrentCultureIgnoreCase)
                .Take(limit)
                .Select(i => new SearchHit(i.Entry, 0, string.Empty))
                .ToList();

        var hits = new List<SearchHit>();
        foreach (var item in _items)
        {
            var best = 0;
            var matchedOn = string.Empty;

            var nameScore = FuzzySearch.Score(query, item.Entry.DisplayName);
            if (nameScore > best) { best = nameScore; matchedOn = "Name"; }

            if (!string.Equals(item.Entry.OriginalName, item.Entry.DisplayName, StringComparison.Ordinal))
            {
                var originalScore = FuzzySearch.Score(query, item.Entry.OriginalName) - 20;
                if (originalScore > best) { best = originalScore; matchedOn = "Dateiname"; }
            }

            foreach (var tag in item.Entry.Tags)
            {
                var tagScore = FuzzySearch.Score(query, tag) - 30;
                if (tagScore > best) { best = tagScore; matchedOn = $"Tag \"{tag}\""; }
            }

            foreach (var cat in item.CategoryNames)
            {
                var catScore = FuzzySearch.Score(query, cat) - 120;
                if (catScore > best) { best = catScore; matchedOn = $"Kategorie \"{cat}\""; }
            }

            if (!string.IsNullOrEmpty(item.Entry.Publisher))
            {
                var pubScore = FuzzySearch.Score(query, item.Entry.Publisher!) - 150;
                if (pubScore > best) { best = pubScore; matchedOn = "Herausgeber"; }
            }

            if (best <= 0) continue;

            if (item.Entry.IsFavorite) best += 60;
            best += Math.Min(40, item.Entry.LaunchCount * 4);
            hits.Add(new SearchHit(item.Entry, best, matchedOn));
        }

        return hits
            .OrderByDescending(h => h.Score)
            .ThenBy(h => h.Entry.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .Take(limit)
            .ToList();
    }
}
