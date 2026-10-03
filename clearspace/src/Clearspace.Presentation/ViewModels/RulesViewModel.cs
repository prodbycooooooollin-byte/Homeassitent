using System.Collections.ObjectModel;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

public sealed class RuleItemViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;

    public RuleItemViewModel(ClearspaceSession session, Rule rule, int affected)
    {
        _session = session;
        Rule = rule;
        AffectedCount = affected;
    }

    public Rule Rule { get; }
    public string Name => Rule.Name;
    public string? Description => Rule.Description;
    public int Priority => Rule.Priority;
    public int AffectedCount { get; }

    public string EffectLabel => Rule.Effect switch
    {
        RuleEffectKind.SetPrimaryCategory => $"Hauptkategorie: {CategoryName}",
        RuleEffectKind.AddCategory => $"Zusaetzlich anzeigen unter: {CategoryName}",
        RuleEffectKind.KeepOnDesktop => "Bleibt immer auf dem Desktop",
        RuleEffectKind.ProtectFromFileActions => "Von allen Dateiaktionen ausgenommen",
        _ => "Automatische Dateiaktionen erlaubt"
    };

    private string CategoryName => Rule.CategoryId is not null
                                   && _session.Library.Categories.TryGetValue(Rule.CategoryId, out var c)
        ? c.Name : Rule.CategoryId ?? "-";

    public bool IsEnabled
    {
        get => Rule.IsEnabled;
        set
        {
            Rule.IsEnabled = value;
            _session.Library.SaveRule(Rule);
            OnPropertyChanged();
        }
    }
}

/// <summary>Regelverwaltung mit Prioritaet, Vorschau und Konflikthinweis.</summary>
public sealed class RulesViewModel : ObservableObject
{
    private readonly ClearspaceSession _session;
    private string? _status;

    public RulesViewModel(ClearspaceSession session)
    {
        _session = session;
        Reload();
    }

    public ObservableCollection<RuleItemViewModel> Rules { get; } = new();
    public ObservableCollection<LibraryEntry> Preview { get; } = new();

    public string? Status
    {
        get => _status;
        private set => SetField(ref _status, value);
    }

    public void Reload()
    {
        Rules.Clear();
        foreach (var rule in _session.Library.Rules.OrderByDescending(r => r.Priority))
            Rules.Add(new RuleItemViewModel(_session, rule, _session.Library.PreviewRule(rule).Count));
        DescribeConflicts();
    }

    public void ShowPreview(RuleItemViewModel item)
    {
        Preview.Clear();
        foreach (var entry in _session.Library.PreviewRule(item.Rule)) Preview.Add(entry);
        Status = $"Regel \"{item.Name}\" betrifft aktuell {Preview.Count} Eintrag/Eintraege.";
    }

    public void Delete(RuleItemViewModel item)
    {
        _session.Library.DeleteRule(item.Rule.Id);
        Reload();
        Status = $"Regel \"{item.Name}\" geloescht.";
    }

    public void ChangePriority(RuleItemViewModel item, int newPriority)
    {
        item.Rule.Priority = newPriority;
        _session.Library.SaveRule(item.Rule);
        Reload();
    }

    /// <summary>Beschreibt verstaendlich, welche Regel bei Ueberschneidungen gewinnt.</summary>
    private void DescribeConflicts()
    {
        var categoryRules = _session.Library.Rules
            .Where(r => r.IsEnabled && r.Effect == RuleEffectKind.SetPrimaryCategory)
            .ToList();

        var conflicts = new List<string>();
        foreach (var entry in _session.Library.Entries)
        {
            var matching = categoryRules.Where(r => _session.Library.PreviewRule(r).Any(e => e.Id == entry.Id)).ToList();
            if (matching.Count < 2) continue;
            var winner = matching.OrderByDescending(r => r.Priority).ThenBy(r => r.CreatedUtc).First();
            conflicts.Add($"\"{entry.DisplayName}\": {matching.Count} Regeln treffen zu - es gilt \"{winner.Name}\" (hoechste Prioritaet).");
        }

        if (conflicts.Count > 0)
            Status = string.Join(" ", conflicts.Take(3))
                     + (conflicts.Count > 3 ? $" (und {conflicts.Count - 3} weitere)" : string.Empty)
                     + " Manuelle Festlegungen und Schutzregeln stehen ueber allen Vorschlaegen.";
    }
}
