namespace Clearspace.Core.Search;

/// <summary>Tippfehlertolerante Bewertung von Suchtreffern.</summary>
public static class FuzzySearch
{
    /// <summary>Damerau-Levenshtein-Distanz mit Obergrenze (fruehzeitiger Abbruch).</summary>
    public static int Distance(string a, string b, int max = 3)
    {
        if (a == b) return 0;
        if (a.Length == 0) return b.Length;
        if (b.Length == 0) return a.Length;
        if (Math.Abs(a.Length - b.Length) > max) return max + 1;

        var previous = new int[b.Length + 1];
        var current = new int[b.Length + 1];
        var beforePrevious = new int[b.Length + 1];

        for (var j = 0; j <= b.Length; j++) previous[j] = j;

        for (var i = 1; i <= a.Length; i++)
        {
            current[0] = i;
            var rowMin = current[0];
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                var value = Math.Min(Math.Min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1])
                    value = Math.Min(value, beforePrevious[j - 2] + 1);
                current[j] = value;
                if (value < rowMin) rowMin = value;
            }
            if (rowMin > max) return max + 1;
            Array.Copy(previous, beforePrevious, previous.Length);
            Array.Copy(current, previous, current.Length);
        }
        return previous[b.Length];
    }

    /// <summary>
    /// Bewertet einen Kandidaten gegen die Suchanfrage. 0 = kein Treffer, hoeher = besser.
    /// </summary>
    public static int Score(string query, string candidate)
    {
        if (string.IsNullOrWhiteSpace(query)) return 0;
        var q = query.Trim().ToLowerInvariant();
        var c = candidate.ToLowerInvariant();
        if (c.Length == 0) return 0;

        if (c == q) return 1000;
        if (c.StartsWith(q, StringComparison.Ordinal)) return 800 - Math.Min(100, c.Length - q.Length);

        var wordStart = IsWordStartMatch(c, q);
        if (wordStart) return 700;

        if (c.Contains(q, StringComparison.Ordinal)) return 600 - Math.Min(100, c.Length - q.Length);

        if (InitialsMatch(c, q)) return 550;
        if (IsSubsequence(q, c)) return 400;

        // Tippfehlertoleranz: Wort fuer Wort vergleichen.
        var max = q.Length <= 4 ? 1 : q.Length <= 8 ? 2 : 3;
        foreach (var word in c.Split(new[] { ' ', '-', '_', '.' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var d = Distance(q, word, max);
            if (d <= max) return 350 - d * 50;
        }

        var whole = Distance(q, c, max);
        if (whole <= max) return 300 - whole * 50;

        return 0;
    }

    private static bool IsWordStartMatch(string candidate, string query)
    {
        var idx = candidate.IndexOf(query, StringComparison.Ordinal);
        while (idx > 0)
        {
            var prev = candidate[idx - 1];
            if (prev is ' ' or '-' or '_' or '.') return true;
            idx = candidate.IndexOf(query, idx + 1, StringComparison.Ordinal);
        }
        return false;
    }

    /// <summary>"fls" trifft "FL Studio".</summary>
    private static bool InitialsMatch(string candidate, string query)
    {
        var initials = string.Concat(candidate
            .Split(new[] { ' ', '-', '_', '.' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w[0]));
        return initials.Length >= 2 && initials.StartsWith(query, StringComparison.Ordinal);
    }

    private static bool IsSubsequence(string query, string candidate)
    {
        var qi = 0;
        foreach (var ch in candidate)
        {
            if (qi < query.Length && ch == query[qi]) qi++;
            if (qi == query.Length) return true;
        }
        return qi == query.Length;
    }
}
