using Clearspace.Core.Categorization;
using Clearspace.Core.Cleanup;
using Clearspace.Core.Model;
using Clearspace.Core.Storage;
using Clearspace.Core.Tests.Fakes;
using Xunit;

namespace Clearspace.Core.Tests;

/// <summary>Die verbindlichen Abnahmefaelle aus Abschnitt 14 der Anforderungen.</summary>
public class AcceptanceTests
{
    // Fall 1: FL Studio landet unter Musikproduktion, ein unbekanntes Spezialtool im Eingang.
    [Fact]
    public void Fall01_FlStudioWirdMusikproduktion_UnbekanntesToolBleibtImEingang()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("FL Studio 21.lnk", @"C:\Program Files\Image-Line\FL Studio 21\FL64.exe",
            publisher: "Image-Line", product: "FL Studio", description: "FL Studio");
        world.AddShortcut("ZXQ Tool.lnk", @"C:\Tools\zxq\zxq.exe");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var fl = library.Entries.Single(e => e.DisplayName.Contains("FL Studio"));
        var flPrimary = library.GetPrimary(fl.Id);
        Assert.StartsWith("music", flPrimary.CategoryId);
        Assert.Equal(Confidence.High, flPrimary.Confidence);
        Assert.Contains("fl studio", flPrimary.Reason, StringComparison.OrdinalIgnoreCase);

        var unknown = library.Entries.Single(e => e.DisplayName.Contains("ZXQ"));
        Assert.Equal(CategoryCatalog.Inbox, library.GetPrimary(unknown.Id).CategoryId);
        Assert.Contains(library.GetInbox(), v => v.Entry.Id == unknown.Id);
    }

    // Fall 2: Mehrfachzuordnung ohne zusaetzliche physische Datei.
    [Fact]
    public void Fall02_EintragInMehrerenKategorienOhneZweiteDatei()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("OBS Studio.lnk", @"C:\Program Files\obs-studio\bin\64bit\obs64.exe",
            publisher: "OBS Project", product: "OBS Studio", description: "OBS Studio");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var obs = library.Entries.Single();
        var categories = library.GetAssignments(obs.Id).Select(a => a.CategoryId).ToList();
        Assert.Contains("content.streaming", categories);
        Assert.Contains("gaming.tools", categories);

        library.AddCategoryManually(obs.Id, "dev");
        Assert.Contains("dev", library.GetAssignments(obs.Id).Select(a => a.CategoryId));

        // Es existiert weiterhin genau eine Datei.
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\OBS Studio.lnk"));
        Assert.Single(library.Entries);
        Assert.Empty(world.Fs.MoveLog);
    }

    // Fall 3: Verschobener Spiele-Shortcut behaelt Argumente und Arbeitsverzeichnis.
    [Fact]
    public void Fall03_SpieleShortcutBehaeltArgumenteUndArbeitsverzeichnis()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Mein Spiel.lnk", @"C:\Program Files (x86)\Steam\steamapps\common\Spiel\spiel.exe",
            args: "-novid -high", workDir: @"C:\Program Files (x86)\Steam\steamapps\common\Spiel");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var entry = library.Entries.Single();
        Assert.Equal(EntryType.GameShortcut, entry.Type);

        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        var action = plan.Actions.Single();
        Assert.Equal(PlannedActionKind.MoveShortcut, action.Kind);

        var journal = new InMemoryJournalStore();
        var executor = new ActionExecutor(world.Fs, journal, world.Clock);
        var result = executor.Execute(plan);

        Assert.Single(result.Completed);
        var moved = result.Completed[0];
        Assert.False(world.Fs.FileExists(TestWorld.Desktop + @"\Mein Spiel.lnk"));
        Assert.True(world.Fs.FileExists(moved.TargetPath!));

        // Nur die Verknuepfungsdatei wurde bewegt, nie das Zielprogramm.
        Assert.True(world.Fs.FileExists(@"C:\Program Files (x86)\Steam\steamapps\common\Spiel\spiel.exe"));

        // Argumente und Arbeitsverzeichnis bleiben im Eintrag erhalten und werden zum Start verwendet.
        library.UpdatePathAfterFileAction(entry.Id, moved.TargetPath!);
        var after = library.GetEntry(entry.Id)!;
        Assert.Equal("-novid -high", after.Arguments);
        Assert.Equal(@"C:\Program Files (x86)\Steam\steamapps\common\Spiel", after.WorkingDirectory);
        Assert.Equal(@"C:\Program Files (x86)\Steam\steamapps\common\Spiel\spiel.exe", after.TargetPath);
    }

    // Fall 4: Plugin-Datei wird weder verschoben noch als Standalone-App behandelt.
    [Fact]
    public void Fall04_PluginDateiWirdNichtVerschobenUndNichtAlsAppBehandelt()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddFile("Serum.vst3", 5_000_000);

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var plugin = library.Entries.Single();

        Assert.Equal(EntryType.PluginFile, plugin.Type);
        Assert.False(plugin.IsMovableShortcut);
        Assert.Contains("music.plugins", library.GetAssignments(plugin.Id).Select(a => a.CategoryId));

        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        var action = plan.Actions.Single();
        Assert.Equal(PlannedActionKind.VirtualOnly, action.Kind);
        Assert.Equal(SkipReason.NotMovable, action.SkipReason);
        Assert.Contains("Plugin", action.SkipExplanation);

        new ActionExecutor(world.Fs, new InMemoryJournalStore(), world.Clock).Execute(plan);
        Assert.Empty(world.Fs.MoveLog);
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Serum.vst3"));
    }

    // Fall 5: Musikprojekt und zugehoerige Samples bleiben unveraendert.
    [Fact]
    public void Fall05_MusikprojektUndSamplesBleibenUnveraendert()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddFile("Beat 2026.flp", 250_000);
        world.Fs.AddFile(TestWorld.Desktop + @"\Samples\kick.wav", 90_000);
        world.Fs.AddFolderEntry(TestWorld.Desktop + @"\Samples");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var project = library.Entries.Single(e => e.OriginalName.EndsWith(".flp"));
        Assert.Equal(EntryType.ProjectFile, project.Type);
        Assert.Equal("music.projects", library.GetPrimary(project.Id).CategoryId);

        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));
        new ActionExecutor(world.Fs, new InMemoryJournalStore(), world.Clock).Execute(plan);

        Assert.Empty(world.Fs.MoveLog);
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Beat 2026.flp"));
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Samples\kick.wav"));
        Assert.All(plan.Actions, a => Assert.Equal(PlannedActionKind.VirtualOnly, a.Kind));
    }

    // Fall 6: Manuelle Korrektur ueberlebt Rescan und Neustart (echte SQLite-Datei).
    [Fact]
    public void Fall06_ManuelleKorrekturUeberlebtRescanUndNeustart()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "clearspace-test-" + Guid.NewGuid().ToString("n"), "clearspace.db");
        try
        {
            string entryId;

            // Die Datenbank wird bewusst geschlossen, bevor die naechste Instanz oeffnet:
            // unter Windows ist eine geoeffnete Datei gesperrt.
            using (var db = new SqliteDatabase(dbPath))
            {
                var world = new TestWorld(new SqliteLibraryStore(db)).WithDefaultSources();
                world.AddShortcut("Spezialtool.lnk", @"C:\Tools\spezial\tool.exe");

                var library = world.BuildLibrary();
                library.Refresh(world.Sources);
                var entry = library.Entries.Single();
                entryId = entry.Id;
                Assert.Equal(CategoryCatalog.Inbox, library.GetPrimary(entryId).CategoryId);

                library.SetPrimaryCategoryManually(entryId, "music.audiotools");
                Assert.Equal("music.audiotools", library.GetPrimary(entryId).CategoryId);

                // Rescan aendert nichts an der manuellen Festlegung.
                library.Refresh(world.Sources);
                Assert.Equal("music.audiotools", library.GetPrimary(entryId).CategoryId);
            }

            // Neustart: frische Instanz auf derselben Datenbank.
            using (var db2 = new SqliteDatabase(dbPath))
            {
                var world2 = new TestWorld(new SqliteLibraryStore(db2)).WithDefaultSources();
                world2.AddShortcut("Spezialtool.lnk", @"C:\Tools\spezial\tool.exe");
                var library2 = world2.BuildLibrary();
                library2.Refresh(world2.Sources);

                var primary = library2.GetPrimary(entryId);
                Assert.Equal("music.audiotools", primary.CategoryId);
                Assert.Equal(AssignmentSource.Manual, primary.Source);
            }
        }
        finally
        {
            var dir = Path.GetDirectoryName(dbPath)!;
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
        }
    }

    // Fall 7: Namenskonflikte fuehren nie zu Ueberschreiben oder Datenverlust.
    [Fact]
    public void Fall07_NamenskonflikteUeberschreibenNiemals()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Discord.lnk", @"C:\Users\Test\AppData\Local\Discord\Update.exe",
            args: "--processStart Discord.exe", product: "Discord", description: "Discord");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));
        var action = plan.Actions.Single(a => a.Kind == PlannedActionKind.MoveShortcut);
        var plannedTarget = action.TargetPath!;

        // Nach der Vorschau taucht am Zielort eine fremde Datei mit gleichem Namen auf.
        world.Fs.AddFile(plannedTarget, 999);

        var journal = new InMemoryJournalStore();
        var result = new ActionExecutor(world.Fs, journal, world.Clock).Execute(plan);

        Assert.Single(result.Completed);
        var finalPath = result.Completed[0].TargetPath!;
        Assert.NotEqual(plannedTarget, finalPath);
        Assert.Contains("(2)", finalPath);
        // Beide Dateien existieren weiterhin, die fremde Datei wurde nicht ueberschrieben.
        Assert.True(world.Fs.FileExists(plannedTarget));
        Assert.True(world.Fs.FileExists(finalPath));
        Assert.Equal(999, world.Fs.GetInfo(plannedTarget)!.SizeBytes);
    }

    // Fall 8: Rueckgaengig funktioniert nach Neustart und behandelt belegte Originalpfade.
    [Fact]
    public void Fall08_RueckgaengigNachNeustartUndBeiBelegtemOriginalpfad()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "clearspace-test-" + Guid.NewGuid().ToString("n"), "clearspace.db");
        try
        {
            var world = new TestWorld().WithDefaultSources();
            world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");

            var library = world.BuildLibrary();
            library.Refresh(world.Sources);
            var planner = world.BuildPlanner(library);
            var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
                CleanupMode.LauncherLibrary, world.Options(library));

            string planId;
            using (var db = new SqliteDatabase(dbPath))
            {
                var journal = new SqliteJournalStore(db);
                var result = new ActionExecutor(world.Fs, journal, world.Clock).Execute(plan);
                Assert.Single(result.Completed);
                planId = plan.Id;
            }

            Assert.False(world.Fs.FileExists(TestWorld.Desktop + @"\Steam.lnk"));

            // Zwischenzeitlich liegt am urspruenglichen Ort wieder eine Datei gleichen Namens.
            world.Fs.AddFile(TestWorld.Desktop + @"\Steam.lnk", 42);

            // "Neustart": neue Instanzen, nur das dauerhafte Journal wird gelesen.
            using (var db2 = new SqliteDatabase(dbPath))
            {
                var journal2 = new SqliteJournalStore(db2);
                Assert.Single(journal2.GetUndoable(planId));

                var undo = new ActionExecutor(world.Fs, journal2, world.Clock).Undo(planId);

                Assert.Equal(1, undo.Restored);
                Assert.Single(undo.Conflicts);
                // Beide Inhalte bleiben erhalten.
                Assert.Equal(42, world.Fs.GetInfo(TestWorld.Desktop + @"\Steam.lnk")!.SizeBytes);
                Assert.True(world.Fs.FileExists(undo.Conflicts[0].RestoredTo));
                Assert.Empty(journal2.GetUndoable(planId));
            }
        }
        finally
        {
            var dir = Path.GetDirectoryName(dbPath)!;
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
        }
    }

    // Fall 9: Abbruch mitten in der Aktion ergibt ein rekonstruierbares Journal.
    [Fact]
    public void Fall09_AbbruchErgibtRekonstruierbaresJournal()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Discord.lnk", @"C:\Discord\Discord.exe", product: "Discord");
        world.AddShortcut("Steam.lnk", @"C:\Steam\steam.exe", product: "Steam");
        world.AddShortcut("Chrome.lnk", @"C:\Chrome\chrome.exe", product: "Google Chrome");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        var journal = new InMemoryJournalStore();
        var executor = new ActionExecutor(world.Fs, journal, world.Clock);
        using var cts = new CancellationTokenSource();

        var progress = new SynchronousProgress<ExecutionProgress>(p => { if (p.Done >= 1) cts.Cancel(); });
        Assert.ThrowsAny<OperationCanceledException>(() => executor.Execute(plan, progress, cts.Token));

        // Das Journal wurde vor Beginn vollstaendig geschrieben.
        var records = journal.GetByPlan(plan.Id);
        Assert.Equal(3, records.Count);
        Assert.Contains(records, r => r.Status == ActionStatus.Completed);
        Assert.Contains(records, r => r.Status == ActionStatus.Planned);

        // Nach dem Neustart wird der tatsaechliche Zustand ermittelt, ohne etwas zu wiederholen.
        var movesBefore = world.Fs.MoveLog.Count;
        var reconciled = executor.Reconcile();
        Assert.Equal(movesBefore, world.Fs.MoveLog.Count);
        Assert.All(reconciled, r => Assert.NotEqual(ActionStatus.Planned, r.Status));
        Assert.Empty(journal.GetUnfinished());
        Assert.All(reconciled, r => Assert.False(string.IsNullOrWhiteSpace(r.Message)));
    }

    // Fall 10: Oeffentlicher Desktop wird gelesen, aber ohne Rechte nicht veraendert.
    [Fact]
    public void Fall10_OeffentlicherDesktopWirdGelesenAberNichtVeraendert()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Firma-Tool.lnk", @"C:\Firma\tool.exe", directory: TestWorld.PublicDesktop);
        world.AddShortcut("Discord.lnk", @"C:\Discord\Discord.exe", product: "Discord");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var publicEntry = library.Entries.Single(e => e.Source == SourceKind.PublicDesktop);
        Assert.Equal("Firma-Tool", publicEntry.DisplayName);

        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        var publicAction = plan.Actions.Single(a => a.EntryId == publicEntry.Id);
        Assert.Equal(PlannedActionKind.VirtualOnly, publicAction.Kind);
        Assert.Equal(SkipReason.AccessDenied, publicAction.SkipReason);
        Assert.Contains("oeffentlichen Desktop", publicAction.SkipExplanation);

        new ActionExecutor(world.Fs, new InMemoryJournalStore(), world.Clock).Execute(plan);
        Assert.True(world.Fs.FileExists(TestWorld.PublicDesktop + @"\Firma-Tool.lnk"));
    }

    // Fall 13: Kernfunktionen arbeiten offline mit echten Daten; Beispieldaten nur im Demo-Modus.
    [Fact]
    public void Fall13_KategorienEnthaltenEchteDatenOhneNetzwerk()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("FL Studio 21.lnk", @"C:\Program Files\Image-Line\FL Studio 21\FL64.exe",
            publisher: "Image-Line", product: "FL Studio");
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);

        var visible = library.GetNonEmptyCategories().Select(c => c.Id).ToList();
        Assert.Contains("music", visible);
        Assert.Contains("gaming", visible);
        // Leere Unterkategorien erscheinen nicht.
        Assert.DoesNotContain("content.assets", visible);
        Assert.DoesNotContain("gaming.mods", visible);

        Assert.All(library.Entries, e => Assert.True(world.Fs.FileExists(e.Path)));
    }

    // Fall 14: Nach dem Aufraeumen ist nachvollziehbar, was entfernt wurde und was bleibt.
    [Fact]
    public void Fall14_ErgebnisZeigtEntferntesUndVerbliebenes()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("Steam.lnk", @"C:\Program Files (x86)\Steam\steam.exe", product: "Steam");
        world.AddFile("Serum.vst3", 3000);
        world.AddFile("Beat.flp", 3000);
        world.AddShortcut("Unbekannt.lnk", @"C:\X\x.exe");

        var library = world.BuildLibrary();
        library.Refresh(world.Sources);
        var planner = world.BuildPlanner(library);
        var plan = planner.CreatePlan(library.Entries, library.GetPrimaryMap(),
            CleanupMode.LauncherLibrary, world.Options(library));

        var journal = new InMemoryJournalStore();
        var result = new ActionExecutor(world.Fs, journal, world.Clock).Execute(plan);

        Assert.Single(result.Completed);
        Assert.Equal("Steam", result.Completed[0].EntryName);

        // Alles, was sichtbar bleibt, hat eine Begruendung.
        Assert.Equal(3, result.RemainingOnDesktop.Count);
        Assert.All(result.RemainingOnDesktop, r => Assert.False(string.IsNullOrWhiteSpace(r.Explanation)));
        Assert.Contains(result.RemainingOnDesktop, r => r.Name == "Serum.vst3");
        Assert.Contains(result.RemainingOnDesktop, r => r.Name == "Unbekannt");

        // Und alles ist wiederherstellbar.
        Assert.Single(journal.GetUndoable(plan.Id));
    }
}

/// <summary>Meldet synchron, damit der Abbruchtest deterministisch bleibt.</summary>
internal sealed class SynchronousProgress<T> : IProgress<T>
{
    private readonly Action<T> _handler;
    public SynchronousProgress(Action<T> handler) => _handler = handler;
    public void Report(T value) => _handler(value);
}
