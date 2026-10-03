using Clearspace.Core.Model;

namespace Clearspace.Core.Categorization;

public sealed record ClassificationHit(string CategoryId, Confidence Confidence, string Reason, int Score);

public sealed record ClassificationResult(IReadOnlyList<ClassificationHit> Hits)
{
    public bool IsInbox => Hits.Count == 0 || Hits[0].CategoryId == CategoryCatalog.Inbox;
    public ClassificationHit Primary => Hits.Count > 0
        ? Hits[0]
        : new ClassificationHit(CategoryCatalog.Inbox, Confidence.Low, "Keine belastbaren Hinweise gefunden", 0);
}

/// <summary>
/// Kombiniert mehrere Signale (Produktname, Metadaten, Herausgeber, Ziel, Dateityp, Ablageort)
/// zu einer oder mehreren Kategoriezuordnungen mit kurzer Begruendung.
/// Ohne belastbare Hinweise landet ein Eintrag sichtbar im Eingang.
/// </summary>
public sealed class CategoryClassifier
{
    private readonly KnowledgeData _knowledge;

    public CategoryClassifier(KnowledgeData? knowledge = null) => _knowledge = knowledge ?? KnowledgeBase.Load();

    private const int ScoreProduct = 100;
    private const int ScoreProtocol = 90;
    private const int ScorePathHint = 80;
    private const int ScorePublisher = 55;
    private const int ScoreKeyword = 45;
    private const int ScoreType = 40;

    public ClassificationResult Classify(LibraryEntry entry)
    {
        var scores = new Dictionary<string, ClassificationHit>(StringComparer.Ordinal);

        void Offer(string categoryId, Confidence confidence, string reason, int score)
        {
            if (scores.TryGetValue(categoryId, out var existing))
            {
                if (score <= existing.Score) return;
                scores[categoryId] = existing with { Confidence = confidence, Reason = reason, Score = score };
                return;
            }
            scores[categoryId] = new ClassificationHit(categoryId, confidence, reason, score);
        }

        var name = Normalize(entry.DisplayName + " " + entry.OriginalName + " " + (entry.ProductName ?? string.Empty));
        var description = Normalize(entry.ProductDescription ?? string.Empty);
        var publisher = Normalize(entry.Publisher ?? string.Empty);
        var targetish = Normalize((entry.TargetPath ?? string.Empty) + " " + (entry.Path ?? string.Empty)
                                  + " " + (entry.Arguments ?? string.Empty) + " " + (entry.WorkingDirectory ?? string.Empty));
        var protocol = Normalize(entry.ProtocolOrAppId ?? string.Empty);

        foreach (var rule in _knowledge.Products)
            if (MatchesWord(name, rule.Match, out var hit) || MatchesWord(Normalize(entry.TargetPath ?? ""), rule.Match, out hit))
                foreach (var c in rule.Categories)
                    Offer(c, rule.ConfidenceValue, $"{rule.Reason}: \"{hit}\" erkannt", ScoreProduct);

        foreach (var rule in _knowledge.Protocols)
            if (Contains(protocol + " " + targetish, rule.Match, out var hit))
                foreach (var c in rule.Categories)
                    Offer(c, rule.ConfidenceValue, $"{rule.Reason} ({hit})", ScoreProtocol);

        foreach (var rule in _knowledge.PathHints)
            if (Contains(targetish, rule.Match, out var hit))
                foreach (var c in rule.Categories)
                    Offer(c, rule.ConfidenceValue, $"{rule.Reason} ({hit.Trim('\\')})", ScorePathHint);

        foreach (var rule in _knowledge.Publishers)
            if (Contains(publisher, rule.Match, out var hit))
                foreach (var c in rule.Categories)
                    Offer(c, rule.ConfidenceValue, $"{rule.Reason}: Herausgeber \"{hit}\"", ScorePublisher);

        foreach (var rule in _knowledge.Keywords)
            if (Contains(description + " " + name, rule.Match, out var hit))
                foreach (var c in rule.Categories)
                    Offer(c, rule.ConfidenceValue, $"{rule.Reason} (\"{hit}\")", ScoreKeyword);

        ApplyTypeSignal(entry, Offer);

        if (scores.Count == 0)
            return new ClassificationResult(Array.Empty<ClassificationHit>());

        var ordered = scores.Values
            .OrderByDescending(h => h.Score)
            .ThenByDescending(h => (int)h.Confidence)
            .ThenBy(h => h.CategoryId, StringComparer.Ordinal)
            .ToList();

        // Reine Low-Signale aus dem Typ allein reichen fuer eine Hauptzuordnung nicht aus,
        // wenn es sich um ein ausfuehrbares Programm handelt: dann lieber sichtbar in den Eingang.
        if (ordered[0].Score <= ScoreType && ordered[0].Confidence == Confidence.Low
            && entry.Type is EntryType.AppShortcut or EntryType.PortableApp or EntryType.InstalledApp)
            return new ClassificationResult(Array.Empty<ClassificationHit>());

        return new ClassificationResult(ordered);
    }

    private static void ApplyTypeSignal(LibraryEntry entry, Action<string, Confidence, string, int> offer)
    {
        switch (entry.Type)
        {
            case EntryType.PluginFile:
                offer("music.plugins", Confidence.High, "Plugin-Datei, keine eigenstaendig startbare Anwendung", ScoreType + 20);
                break;
            case EntryType.PresetFile:
                offer("music.presets", Confidence.High, "Preset- bzw. Soundbank-Datei erkannt", ScoreType + 20);
                break;
            case EntryType.SampleFile:
                offer("music.samples", Confidence.Medium, "Audiodatei in einem Sample-Verzeichnis", ScoreType + 10);
                break;
            case EntryType.ProjectFile:
                var ext = (entry.Extension ?? string.Empty).ToLowerInvariant();
                if (ext is ".flp" or ".als" or ".cpr" or ".rpp" or ".ptx" or ".song" or ".bwproject")
                    offer("music.projects", Confidence.High, $"Projektdatei der Endung {ext}", ScoreType + 20);
                else if (ext is ".prproj" or ".veg" or ".aep" or ".blend" or ".psd" or ".ai")
                    offer("content.assets", Confidence.Medium, $"Kreativ-Projektdatei der Endung {ext}", ScoreType + 10);
                else
                    offer("dev", Confidence.Low, $"Projektdatei der Endung {ext}", ScoreType);
                break;
            case EntryType.Installer:
                offer("files.installers", Confidence.Medium, "Installationsdatei erkannt", ScoreType);
                break;
            case EntryType.Archive:
                offer("files.archives", Confidence.Medium, "Archivdatei erkannt", ScoreType);
                break;
            case EntryType.MediaFile:
                offer("files.media", Confidence.Low, "Mediendatei erkannt", ScoreType);
                break;
            case EntryType.Document:
                offer("files", Confidence.Low, "Dokument erkannt", ScoreType);
                break;
            case EntryType.GameShortcut:
                offer("gaming.games", Confidence.Medium, "Verknuepfung zeigt auf ein Spielverzeichnis", ScoreType + 15);
                break;
            case EntryType.SpecialDesktopIcon:
                offer("system", Confidence.High, "Besonderes Desktop-Symbol von Windows", ScoreType + 30);
                break;
        }
    }

    private static string Normalize(string value) =>
        value.Replace('/', '\\').ToLowerInvariant();

    private static bool Contains(string haystack, string[] needles, out string hit)
    {
        foreach (var n in needles)
        {
            if (n.Length > 0 && haystack.Contains(n, StringComparison.Ordinal)) { hit = n; return true; }
        }
        hit = string.Empty;
        return false;
    }

    /// <summary>Wortgrenzen-Vergleich, damit "steam" nicht in "steampunk reader" trifft.</summary>
    private static bool MatchesWord(string haystack, string[] needles, out string hit)
    {
        foreach (var n in needles)
        {
            if (n.Length == 0) continue;
            var idx = 0;
            while ((idx = haystack.IndexOf(n, idx, StringComparison.Ordinal)) >= 0)
            {
                var before = idx == 0 || !char.IsLetterOrDigit(haystack[idx - 1]);
                var afterIdx = idx + n.Length;
                var after = afterIdx >= haystack.Length || !char.IsLetterOrDigit(haystack[afterIdx]);
                if (before && after) { hit = n; return true; }
                idx = afterIdx;
            }
        }
        hit = string.Empty;
        return false;
    }
}
