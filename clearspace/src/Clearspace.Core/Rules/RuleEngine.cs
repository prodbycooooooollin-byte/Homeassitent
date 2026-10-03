using Clearspace.Core.Model;

namespace Clearspace.Core.Rules;

public sealed record RuleOutcome(
    IReadOnlyList<CategoryAssignment> Assignments,
    bool KeepOnDesktop,
    bool ProtectedFromFileActions,
    bool AllowAutomaticFileActions,
    IReadOnlyList<Rule> MatchedRules);

/// <summary>
/// Wendet Regeln in Prioritaetsreihenfolge an. Manuelle Festlegungen und Schutzregeln stehen
/// ueber automatischen Vorschlaegen; das wird beim Zusammenfuehren in <see cref="Library"/> erzwungen.
/// </summary>
public sealed class RuleEngine
{
    public bool Matches(Rule rule, LibraryEntry entry)
    {
        if (!rule.IsEnabled) return false;
        if (rule.Conditions.Count == 0) return false;
        return rule.Conditions.All(c => MatchesCondition(c, entry));
    }

    private static bool MatchesCondition(RuleCondition condition, LibraryEntry entry)
    {
        var result = condition.Kind switch
        {
            RuleMatchKind.EntryId => string.Equals(entry.Id, condition.Value, StringComparison.Ordinal),
            RuleMatchKind.PathPrefix => StartsWithPath(entry.Path, condition.Value)
                                        || StartsWithPath(entry.OriginalPath, condition.Value)
                                        || entry.AdditionalOrigins.Any(o => StartsWithPath(o.Path, condition.Value)),
            RuleMatchKind.TargetPathEquals => Eq(entry.TargetPath, condition.Value),
            RuleMatchKind.TargetPathPrefix => StartsWithPath(entry.TargetPath, condition.Value),
            RuleMatchKind.PublisherEquals => Eq(entry.Publisher, condition.Value),
            RuleMatchKind.NameContains => (entry.DisplayName + " " + entry.OriginalName)
                .Contains(condition.Value, StringComparison.OrdinalIgnoreCase),
            RuleMatchKind.ExtensionEquals => Eq(entry.Extension, condition.Value),
            RuleMatchKind.EntryTypeEquals => string.Equals(entry.Type.ToString(), condition.Value, StringComparison.OrdinalIgnoreCase),
            _ => false
        };
        return condition.Negate ? !result : result;
    }

    private static bool Eq(string? a, string b) => a is not null && string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    private static bool StartsWithPath(string? path, string prefix)
    {
        if (string.IsNullOrEmpty(path)) return false;
        var p = path.Replace('/', '\\').TrimEnd('\\');
        var q = prefix.Replace('/', '\\').TrimEnd('\\');
        if (q.Length == 0) return false;
        if (!p.StartsWith(q, StringComparison.OrdinalIgnoreCase)) return false;
        return p.Length == q.Length || p[q.Length] == '\\';
    }

    public RuleOutcome Apply(LibraryEntry entry, IEnumerable<Rule> rules)
    {
        var matched = rules.Where(r => Matches(r, entry))
            .OrderByDescending(r => r.Priority)
            .ThenBy(r => r.CreatedUtc)
            .ToList();

        var assignments = new List<CategoryAssignment>();
        var keepOnDesktop = false;
        var protectedFromActions = false;
        var allowAuto = false;
        var primarySet = false;

        foreach (var rule in matched)
        {
            switch (rule.Effect)
            {
                case RuleEffectKind.SetPrimaryCategory when rule.CategoryId is not null:
                    if (primarySet) break;
                    primarySet = true;
                    assignments.Add(new CategoryAssignment
                    {
                        EntryId = entry.Id, CategoryId = rule.CategoryId, Source = AssignmentSource.Rule,
                        Confidence = Confidence.High, IsPrimary = true, RuleId = rule.Id,
                        Reason = $"Regel \"{rule.Name}\""
                    });
                    break;
                case RuleEffectKind.AddCategory when rule.CategoryId is not null:
                    assignments.Add(new CategoryAssignment
                    {
                        EntryId = entry.Id, CategoryId = rule.CategoryId, Source = AssignmentSource.Rule,
                        Confidence = Confidence.High, IsPrimary = false, RuleId = rule.Id,
                        Reason = $"Regel \"{rule.Name}\""
                    });
                    break;
                case RuleEffectKind.KeepOnDesktop:
                    keepOnDesktop = true;
                    break;
                case RuleEffectKind.ProtectFromFileActions:
                    protectedFromActions = true;
                    break;
                case RuleEffectKind.AllowAutomaticFileActions:
                    allowAuto = true;
                    break;
            }
        }

        return new RuleOutcome(assignments, keepOnDesktop, protectedFromActions, allowAuto, matched);
    }

    /// <summary>
    /// Erzeugt aus einer Nutzerkorrektur einen Regelvorschlag. Der Vorschlag ist bewusst eng
    /// (genau dieser Eintrag); breitere Varianten muessen ausdruecklich gewaehlt werden.
    /// </summary>
    public static IReadOnlyList<Rule> SuggestRulesFromCorrection(LibraryEntry entry, string categoryId, string categoryName)
    {
        var suggestions = new List<Rule>
        {
            new()
            {
                Id = Guid.NewGuid().ToString("n"),
                Name = $"\"{entry.DisplayName}\" gehoert zu {categoryName}",
                Description = "Gilt nur fuer genau diesen Eintrag.",
                Conditions = { new RuleCondition { Kind = RuleMatchKind.EntryId, Value = entry.Id } },
                Effect = RuleEffectKind.SetPrimaryCategory,
                CategoryId = categoryId,
                Priority = 200,
                CreatedFromCorrection = true
            }
        };

        if (!string.IsNullOrWhiteSpace(entry.Publisher))
            suggestions.Add(new Rule
            {
                Id = Guid.NewGuid().ToString("n"),
                Name = $"Alles von \"{entry.Publisher}\" gehoert zu {categoryName}",
                Description = "Betrifft alle aktuellen und kuenftigen Eintraege dieses Herausgebers. Bitte bewusst bestaetigen.",
                Conditions = { new RuleCondition { Kind = RuleMatchKind.PublisherEquals, Value = entry.Publisher! } },
                Effect = RuleEffectKind.SetPrimaryCategory,
                CategoryId = categoryId,
                Priority = 100,
                CreatedFromCorrection = true
            });

        var folder = System.IO.Path.GetDirectoryName(entry.TargetPath ?? entry.Path);
        if (!string.IsNullOrWhiteSpace(folder))
            suggestions.Add(new Rule
            {
                Id = Guid.NewGuid().ToString("n"),
                Name = $"Eintraege aus \"{folder}\" gehoeren zu {categoryName}",
                Description = "Betrifft alle Eintraege aus diesem Verzeichnis.",
                Conditions = { new RuleCondition { Kind = RuleMatchKind.TargetPathPrefix, Value = folder! } },
                Effect = RuleEffectKind.SetPrimaryCategory,
                CategoryId = categoryId,
                Priority = 120,
                CreatedFromCorrection = true
            });

        return suggestions;
    }
}
