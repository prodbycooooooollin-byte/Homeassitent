using Clearspace.Core.Cleanup;
using Clearspace.Core.Model;
using Clearspace.Core.Tests.Fakes;
using Xunit;

namespace Clearspace.Core.Tests;

/// <summary>Randfaelle, die Daten gefaehrden koennten, wenn sie falsch behandelt werden.</summary>
public class SafetyTests
{
    private static (TestWorld world, Clearspace.Core.Library.LibraryService library) Build()
    {
        var world = new TestWorld().WithDefaultSources();
        return (world, world.BuildLibrary());
    }

    [Fact]
    public void VolumeuebergreifendeAktionWirdUebersprungen()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");
        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var options = new CleanupOptions { LibraryRoot = @"D:\Clearspace\Bibliothek" };
        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, options);

        var action = plan.Actions.Single();
        Assert.Equal(SkipReason.CrossVolume, action.SkipReason);
        Assert.Equal(PlannedActionKind.VirtualOnly, action.Kind);
    }

    [Fact]
    public void RelativesVerknuepfungszielWirdNichtRiskiertVerschoben()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Portabel.lnk", @"..\tools\portabel.exe", product: "Steam");
        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        var action = plan.Actions.Single();
        Assert.Equal(SkipReason.RelativeTargetRisk, action.SkipReason);
        Assert.Contains("relativen Zielpfad", action.SkipExplanation);
    }

    [Fact]
    public void CloudPlatzhalterUndVerweiseBleibenUnberuehrt()
    {
        var world = new TestWorld().WithDefaultSources();
        world.Fs.AddFile(TestWorld.Desktop + @"\Cloud.lnk", 10, cloudPlaceholder: true);
        world.Shortcuts.Add(TestWorld.Desktop + @"\Cloud.lnk", @"C:\Program Files (x86)\Steam\steam.exe");
        world.Fs.AddFile(TestWorld.Desktop + @"\Verweis.lnk", 10, reparsePoint: true);
        world.Shortcuts.Add(TestWorld.Desktop + @"\Verweis.lnk", @"C:\Program Files (x86)\Steam\steam.exe");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        Assert.All(plan.Actions, a => Assert.Equal(PlannedActionKind.VirtualOnly, a.Kind));
        new ActionExecutor(world.Fs, new InMemoryJournalStore(), world.Clock).Execute(plan);
        Assert.Empty(world.Fs.MoveLog);
    }

    [Fact]
    public void ZwischenzeitlichGeaenderteQuelleWirdNeuBewertetStattVerschoben()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");
        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        // Nach der Vorschau wird die Datei veraendert.
        world.Fs.Touch(TestWorld.Desktop + @"\Steam.lnk", 12345);

        var journal = new InMemoryJournalStore();
        var result = new ActionExecutor(world.Fs, journal, world.Clock).Execute(plan);

        Assert.Empty(result.Completed);
        Assert.Single(result.Skipped);
        Assert.Equal(SkipReason.SourceChanged, result.Skipped[0].SkipReason);
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Steam.lnk"));
        Assert.Empty(world.Fs.MoveLog);
    }

    [Fact]
    public void VerschwundeneQuelleWirdUebersprungenNichtErfunden()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");
        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        world.Fs.MoveFile(TestWorld.Desktop + @"\Steam.lnk", TestWorld.Desktop + @"\Woanders.lnk");

        var result = new ActionExecutor(world.Fs, new InMemoryJournalStore(), world.Clock).Execute(plan);
        Assert.Single(result.Skipped);
        Assert.Equal(SkipReason.SourceMissing, result.Skipped[0].SkipReason);
    }

    [Fact]
    public void UnterschiedlicheStartprofileBleibenGetrennt()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Spiel normal.lnk", @"C:\Games\spiel.exe", args: "-normal");
        world.AddShortcut("Spiel modded.lnk", @"C:\Games\spiel.exe", args: "-mods");
        world.AddShortcut("Spiel Kopie.lnk", @"C:\Games\spiel.exe", args: "-normal");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        // Gleiche Parameter werden zusammengefasst, unterschiedliche bleiben eigenstaendig.
        Assert.Equal(2, library.Entries.Count);
        var merged = library.Entries.First(e => e.Arguments == "-normal");
        Assert.Single(merged.AdditionalOrigins);
        Assert.Contains(library.Entries, e => e.Arguments == "-mods");
    }

    [Fact]
    public void BesondereDesktopSymboleWerdenNieVeraendert()
    {
        var world = new TestWorld().WithDefaultSources();
        world.Fs.AddFolderEntry(TestWorld.Desktop + @"\Papierkorb.{645ff040-5081-101b-9f08-00aa002f954e}");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var entry = library.Entries.Single();
        Assert.Equal(EntryType.SpecialDesktopIcon, entry.Type);

        var plan = world.BuildPlanner(library).CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));
        Assert.Equal(SkipReason.NotMovable, plan.Actions.Single().SkipReason);
    }

    [Fact]
    public void MehrereEintraegeMitGleichemNamenErhaltenEigeneZiele()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Discord.lnk", @"C:\A\Discord.exe", args: "--a", product: "Discord");
        world.Fs.AddFile(TestWorld.PublicDesktop + @"\Discord.lnk");
        world.Shortcuts.Add(TestWorld.PublicDesktop + @"\Discord.lnk", @"C:\B\Discord.exe", "--b");
        world.Shortcuts.AddMetadata(@"C:\B\Discord.exe", null, "Discord", null);
        world.Fs.AddFile(@"C:\B\Discord.exe", 4096);

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        Assert.Equal(2, library.Entries.Count);

        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        // Der oeffentliche Desktop wird uebersprungen, der eigene verschoben - ohne Kollision.
        var targets = plan.Actions.Where(a => a.TargetPath is not null).Select(a => a.TargetPath!).ToList();
        Assert.Equal(targets.Count, targets.Distinct(StringComparer.OrdinalIgnoreCase).Count());
    }
}
