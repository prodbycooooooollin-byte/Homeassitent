using Clearspace.Core.Abstractions;
using Clearspace.Core.Cleanup;
using Clearspace.Core.Model;
using Clearspace.Core.Tests.Fakes;
using Clearspace.Presentation.Services;
using Clearspace.Presentation.ViewModels;
using Xunit;

namespace Clearspace.Core.Tests;

/// <summary>
/// Durchgaengiger schmaler Ablauf ueber die Oberflaechenschicht:
/// Desktop lesen, zuordnen, Vorschau, verschieben, starten, rueckgaengig machen.
/// </summary>
public class PresentationFlowTests
{
    private static (ClearspaceSession session, FakeLauncher launcher, TestWorld world) BuildSession()
    {
        var world = new TestWorld().WithDefaultSources();
        world.AddShortcut("FL Studio 21.lnk", @"C:\Program Files\Image-Line\FL Studio 21\FL64.exe",
            publisher: "Image-Line", product: "FL Studio");
        world.AddShortcut("Mein Spiel.lnk", @"C:\Program Files (x86)\Steam\steamapps\common\Spiel\spiel.exe",
            args: "-novid", workDir: @"C:\Program Files (x86)\Steam\steamapps\common\Spiel");
        world.AddFile("Serum.vst3", 4000);
        world.AddShortcut("ZXQ.lnk", @"C:\Tools\zxq\zxq.exe");

        var launcher = new FakeLauncher();
        var sources = new FakeScanSourceProvider(world.Sources, TestWorld.LibraryRoot, @"C:\Users\Test\AppData\Clearspace");
        var session = new ClearspaceSession(world.Fs, world.Shortcuts, sources, launcher, world.Clock,
            world.Store, new InMemoryJournalStore());
        return (session, launcher, world);
    }

    [Fact]
    public void VollstaendigerAblauf_ScanVorschauVerschiebenStartenRueckgaengig()
    {
        var (session, launcher, world) = BuildSession();
        var shell = new ShellViewModel(session);

        // 1) Erster Start: Quellen zeigen und scannen.
        Assert.True(shell.NeedsOnboarding);
        Assert.NotEmpty(shell.Onboarding.Sources);
        var summary = shell.Onboarding.RunScan();
        Assert.Equal(4, summary.Total);
        Assert.Equal(1, summary.Inbox);              // nur das unbekannte Tool
        shell.Onboarding.Finish();
        Assert.False(shell.NeedsOnboarding);

        // 2) Bibliothek zeigt echte Eintraege mit Begruendung.
        shell.Library.Reload();
        Assert.Contains(shell.Library.Categories, c => c.Id == "music");
        Assert.Contains(shell.Library.Categories, c => c.Id == "gaming");
        Assert.Single(shell.Library.Inbox);

        var musicNode = shell.Library.Categories.First(c => c.Id == "music");
        shell.Library.SelectedCategory = musicNode;
        var fl = shell.Library.Entries.First(e => e.DisplayName.Contains("FL Studio"));
        Assert.Contains("fl studio", fl.ReasonLabel, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("sicher", fl.ConfidenceLabel);

        // 3) Vorschau: Verknuepfungen verschieben, Plugin nur einsortieren.
        shell.Cleanup.Mode = CleanupMode.LauncherLibrary;
        shell.Cleanup.CreatePlan();
        Assert.Equal(2, shell.Cleanup.FileActionCount);   // FL Studio und Spiel
        Assert.Contains(shell.Cleanup.PlannedActions, a => a.EntryName == "Serum.vst3" && a.IsVirtualOnly);
        Assert.Contains(shell.Cleanup.Remaining, r => r.Name == "Serum.vst3");
        Assert.Contains(shell.Cleanup.Remaining, r => r.Name == "ZXQ");

        // 4) Ausfuehren.
        shell.Cleanup.Execute();
        var result = shell.Cleanup.Result!;
        Assert.Equal(2, result.Completed.Count);
        Assert.Contains("bleiben sichtbar", shell.Cleanup.Status);
        Assert.False(world.Fs.FileExists(TestWorld.Desktop + @"\FL Studio 21.lnk"));
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Serum.vst3"));

        // 5) Aus dem Launcher starten - mit aktualisiertem Pfad.
        shell.Launcher.Refresh();
        shell.Launcher.Query = "fl studio";
        Assert.NotEmpty(shell.Launcher.Results);
        shell.Launcher.LaunchSelected();
        Assert.Single(launcher.Launched);
        Assert.StartsWith(TestWorld.LibraryRoot, launcher.Launched[0]);

        // 6) Rueckgaengig - auch der Pfad wird zurueckgesetzt.
        var undo = shell.Cleanup.UndoLast()!;
        Assert.Equal(2, undo.Restored);
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\FL Studio 21.lnk"));
        Assert.Equal(TestWorld.Desktop + @"\FL Studio 21.lnk",
            session.Library.Entries.First(e => e.DisplayName.Contains("FL Studio")).Path);
    }

    [Fact]
    public void SucheIstTippfehlertolerantUndFindetUeberKategorie()
    {
        var (session, _, _) = BuildSession();
        var shell = new ShellViewModel(session);
        shell.Onboarding.RunScan();
        shell.Launcher.Refresh();

        shell.Launcher.Query = "fl studoi";   // Tippfehler
        Assert.Contains(shell.Launcher.Results, r => r.DisplayName.Contains("FL Studio"));

        shell.Launcher.Query = "fls";         // Initialen
        Assert.Contains(shell.Launcher.Results, r => r.DisplayName.Contains("FL Studio"));

        shell.Launcher.Query = "musikproduktion";
        Assert.Contains(shell.Launcher.Results, r => r.DisplayName.Contains("FL Studio"));
    }

    [Fact]
    public void PluginWirdNichtGestartetSondernErklaert()
    {
        var (session, launcher, _) = BuildSession();
        var shell = new ShellViewModel(session);
        shell.Onboarding.RunScan();
        shell.Launcher.Refresh();
        shell.Launcher.Query = "Serum";

        var plugin = shell.Launcher.Results.First(r => r.DisplayName == "Serum.vst3");
        Assert.NotNull(plugin.NonLaunchableHint);
        shell.Launcher.Launch(plugin);

        Assert.Empty(launcher.Launched);
        Assert.Contains("eigenstaendiges Programm", shell.Launcher.Status);
    }

    [Fact]
    public void KorrekturBietetRegelnAnUndWirktErstNachUebernahme()
    {
        var (session, _, _) = BuildSession();
        var shell = new ShellViewModel(session);
        shell.Onboarding.RunScan();
        shell.Library.Reload();

        var unknown = shell.Library.Inbox.Single();
        shell.Library.CorrectCategory(unknown, "music.audiotools");

        Assert.NotEmpty(shell.Library.PendingRuleSuggestions);
        Assert.Empty(session.Library.Rules);              // noch keine Regel aktiv

        var rule = shell.Library.PendingRuleSuggestions.First();
        Assert.NotEmpty(shell.Library.PreviewRule(rule)); // Vorschau vor der Uebernahme
        shell.Library.AcceptRule(rule);
        Assert.Single(session.Library.Rules);
        Assert.Empty(shell.Library.Inbox);
    }

    [Fact]
    public void OrdnermodusNutztWenigeThemenordnerAufDemDesktop()
    {
        var (session, _, world) = BuildSession();
        var shell = new ShellViewModel(session);
        shell.Onboarding.RunScan();

        shell.Cleanup.Mode = CleanupMode.FolderOrganisation;
        shell.Cleanup.CreatePlan();
        shell.Cleanup.Execute();

        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Musik\FL Studio 21.lnk"));
        Assert.True(world.Fs.FileExists(TestWorld.Desktop + @"\Gaming\Mein Spiel.lnk"));
    }

    [Fact]
    public void SichtbarkeitsmodusVeraendertKeineDateien()
    {
        var (session, _, world) = BuildSession();
        var shell = new ShellViewModel(session);
        shell.Onboarding.RunScan();

        shell.Cleanup.Mode = CleanupMode.VisibilityOnly;
        shell.Cleanup.CreatePlan();

        Assert.Equal(0, shell.Cleanup.FileActionCount);
        Assert.All(shell.Cleanup.PlannedActions, a => Assert.True(a.IsVirtualOnly));
        shell.Cleanup.Execute();
        Assert.Empty(world.Fs.MoveLog);
    }
}
