using Clearspace.Core.Cleanup;
using Clearspace.Core.Watching;
using Clearspace.Core.Model;
using Clearspace.Core.Rules;
using Xunit;

namespace Clearspace.Core.Tests;

public class AutomationTests
{
    // Fall 12: Ohne aktivierte Dateiaktionsregel loest eine neue Datei nur Indexierung aus.
    [Fact]
    public void Fall12_OhneRegelNurIndexierungUndVorschlag()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var entry = library.Entries.Single();

        var policy = new AutomationPolicy(library);
        Assert.False(policy.MayActAutomatically(entry.Id));

        // Erst mit ausdruecklich aktivierter Regel darf die Automatik Dateiaktionen ausfuehren.
        library.SaveRule(new Rule
        {
            Id = "auto1",
            Name = "Neue Desktop-Verknuepfungen nach Profil behandeln",
            Conditions = { new RuleCondition { Kind = RuleMatchKind.EntryTypeEquals, Value = nameof(EntryType.AppShortcut) } },
            Effect = RuleEffectKind.AllowAutomaticFileActions,
            Priority = 50
        });
        Assert.True(new AutomationPolicy(library).MayActAutomatically(entry.Id));
    }

    [Fact]
    public void EinzelkorrekturSortiertNichtAlleProdukteDesHerstellersUm()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Produkt A.lnk", @"C:\Hersteller\a.exe", publisher: "Beispiel GmbH");
        world.AddShortcut("Produkt B.lnk", @"C:\Hersteller\b.exe", publisher: "Beispiel GmbH");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var a = library.Entries.Single(e => e.DisplayName == "Produkt A");
        var b = library.Entries.Single(e => e.DisplayName == "Produkt B");

        library.SetPrimaryCategoryManually(a.Id, "dev");

        Assert.Equal("dev", library.GetPrimary(a.Id).CategoryId);
        Assert.NotEqual("dev", library.GetPrimary(b.Id).CategoryId);

        // Der Herstellervorschlag existiert, wird aber nur auf ausdrueckliche Bestaetigung wirksam.
        var suggestions = library.SuggestRulesFor(a.Id, "dev");
        Assert.Contains(suggestions, r => r.Conditions.Any(c => c.Kind == RuleMatchKind.PublisherEquals));
        Assert.Contains(suggestions, r => r.Conditions.Any(c => c.Kind == RuleMatchKind.EntryId));

        var publisherRule = suggestions.First(r => r.Conditions.Any(c => c.Kind == RuleMatchKind.PublisherEquals));
        Assert.Equal(2, library.PreviewRule(publisherRule).Count);   // Vorschau zeigt die Reichweite
        library.SaveRule(publisherRule);
        Assert.Equal("dev", library.GetPrimary(b.Id).CategoryId);
    }

    [Fact]
    public void SchutzregelHaeltEintragAufDemDesktop()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var entry = library.Entries.Single();

        library.SaveRule(new Rule
        {
            Id = "keep1",
            Name = "Steam bleibt auf dem Desktop",
            Conditions = { new RuleCondition { Kind = RuleMatchKind.EntryId, Value = entry.Id } },
            Effect = RuleEffectKind.KeepOnDesktop,
            Priority = 300
        });

        Assert.Contains(entry.Id, library.KeepOnDesktopEntryIds);

        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));
        var action = plan.Actions.Single();
        Assert.Equal(SkipReason.Protected, action.SkipReason);
        Assert.Equal(PlannedActionKind.VirtualOnly, action.Kind);
    }

    [Fact]
    public void ManuelleZuordnungSchlaegtRegelUndAutomatik()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var entry = library.Entries.Single();
        Assert.Equal("gaming.launchers", library.GetPrimary(entry.Id).CategoryId);

        library.SaveRule(new Rule
        {
            Id = "r1", Name = "Steam als Kommunikation",
            Conditions = { new RuleCondition { Kind = RuleMatchKind.EntryId, Value = entry.Id } },
            Effect = RuleEffectKind.SetPrimaryCategory, CategoryId = "communication", Priority = 10
        });
        Assert.Equal("communication", library.GetPrimary(entry.Id).CategoryId);

        library.SetPrimaryCategoryManually(entry.Id, "work");
        Assert.Equal("work", library.GetPrimary(entry.Id).CategoryId);
        Assert.Equal(AssignmentSource.Manual, library.GetPrimary(entry.Id).Source);
    }
}
