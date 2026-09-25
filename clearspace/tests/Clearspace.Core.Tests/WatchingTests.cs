using Clearspace.Core.Tests.Fakes;
using Clearspace.Core.Watching;
using Xunit;

namespace Clearspace.Core.Tests;

public class WatchingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    // Fall 11: Neue und geloeschte Eintraege, ohne Schleifen durch eigene Aktionen.
    [Fact]
    public void Fall11_NeueUndGeloeschteEintraegeOhneSchleifen()
    {
        var fs = new FakeFileSystem().AddDirectory(@"C:\Desktop");
        var coordinator = new DesktopWatchCoordinator(fs, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(30));
        coordinator.Exclude(@"C:\Bibliothek");

        // Neue Datei: erst nach Entprellung und stabiler Groesse melden.
        fs.AddFile(@"C:\Desktop\Neu.lnk", 100);
        coordinator.Report(new FileChange(@"C:\Desktop\Neu.lnk", FileChangeKind.Created, T0));
        coordinator.Report(new FileChange(@"C:\Desktop\Neu.lnk", FileChangeKind.Changed, T0.AddMilliseconds(300)));

        Assert.Empty(coordinator.Drain(T0.AddMilliseconds(500)));       // Entprellzeit laeuft noch
        Assert.Empty(coordinator.Drain(T0.AddSeconds(3)));              // erste Groessenmessung
        var batch = coordinator.Drain(T0.AddSeconds(4));                // Groesse stabil
        var item = Assert.Single(batch);
        Assert.Equal(BatchAction.IndexOnly, item.Action);

        // Eigene Aktion loest keine Reaktion aus.
        coordinator.NotifyOwnAction(@"C:\Desktop\Eigen.lnk", T0.AddSeconds(5));
        coordinator.Report(new FileChange(@"C:\Desktop\Eigen.lnk", FileChangeKind.Deleted, T0.AddSeconds(5)));
        Assert.Empty(coordinator.Drain(T0.AddSeconds(20)));

        // Ausgeschlossene Verzeichnisse werden ignoriert.
        coordinator.Report(new FileChange(@"C:\Bibliothek\Gaming\Steam.lnk", FileChangeKind.Created, T0.AddSeconds(6)));
        Assert.Empty(coordinator.Drain(T0.AddSeconds(30)));

        // Geloeschte Datei wird sauber als Entfernung gemeldet.
        coordinator.Report(new FileChange(@"C:\Desktop\Weg.lnk", FileChangeKind.Deleted, T0.AddSeconds(40)));
        var removal = Assert.Single(coordinator.Drain(T0.AddSeconds(45)));
        Assert.Equal(BatchAction.Remove, removal.Action);
    }

    [Fact]
    public void DoppelteEreignisseWerdenZusammengefasst()
    {
        var fs = new FakeFileSystem().AddDirectory(@"C:\Desktop").AddFile(@"C:\Desktop\A.lnk", 10);
        var coordinator = new DesktopWatchCoordinator(fs, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30));

        for (var i = 0; i < 10; i++)
            coordinator.Report(new FileChange(@"C:\Desktop\A.lnk", FileChangeKind.Changed, T0.AddMilliseconds(i * 50)));

        Assert.Equal(1, coordinator.PendingCount);
        coordinator.Drain(T0.AddSeconds(2));
        Assert.Single(coordinator.Drain(T0.AddSeconds(3)));
    }

    [Fact]
    public void PausierenUnterdruecktAlles()
    {
        var fs = new FakeFileSystem().AddDirectory(@"C:\Desktop").AddFile(@"C:\Desktop\A.lnk", 10);
        var coordinator = new DesktopWatchCoordinator(fs) { IsPaused = true };
        coordinator.Report(new FileChange(@"C:\Desktop\A.lnk", FileChangeKind.Created, T0));
        Assert.Empty(coordinator.Drain(T0.AddMinutes(1)));
    }
}
