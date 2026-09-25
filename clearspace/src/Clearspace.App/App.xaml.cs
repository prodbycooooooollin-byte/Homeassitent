using System.Windows;
using System.Windows.Input;
using Clearspace.App.Services;
using Clearspace.Core.Abstractions;
using Clearspace.Core.Watching;
using Clearspace.Presentation.Services;
using Clearspace.Presentation.ViewModels;
using Clearspace.Windows;
using Forms = System.Windows.Forms;

namespace Clearspace.App;

public partial class App : Application
{
    private ClearspaceSession? _session;
    private ShellViewModel? _shell;
    private MainWindow? _window;
    private Forms.NotifyIcon? _trayIcon;
    private GlobalHotkeyService? _hotkeys;
    private DesktopWatcherService? _watcher;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        StartupDiagnostics.Begin();

        // Spaetere Fehler im laufenden Betrieb ebenfalls sichtbar machen.
        DispatcherUnhandledException += (_, args) =>
        {
            StartupDiagnostics.Report(args.Exception, "laufender Betrieb");
            args.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception ex) StartupDiagnostics.Report(ex, "Hintergrundarbeit");
        };

        var phase = "Start";
        try
        {
            phase = "Windows-Dienste vorbereiten";
            StartupDiagnostics.Note(phase);
            var resolver = new ShellLinkResolver();
            var sources = new WindowsScanSourceProvider(resolver);

            phase = "Datenbank und Bibliothek oeffnen";
            StartupDiagnostics.Note(phase);
            _session = new ClearspaceSession(new PhysicalFileSystem(), resolver, sources, new WindowsLauncher());

            phase = "Bibliothek aufbauen";
            StartupDiagnostics.Note(phase);
            _shell = new ShellViewModel(_session);

            phase = "Darstellung einrichten";
            StartupDiagnostics.Note(phase);
            ThemeService.Apply(ReadTheme(), _session.GetSetting("transparency", "true") == "true");

            phase = "Hauptfenster erzeugen";
            StartupDiagnostics.Note(phase);
            _window = new MainWindow { DataContext = _shell };

            // Ab hier gibt es ein Fenster: Fehler duerfen den Start nicht mehr verhindern.
            TryOptional("Infobereichssymbol", SetUpTrayIcon);
            TryOptional("Tastenkuerzel", SetUpHotkey);
            TryOptional("Ueberwachung des Desktops", () => SetUpWatcher(sources));

            phase = "Fenster anzeigen";
            StartupDiagnostics.Note(phase);
            // Mit "--tray" startet Clearspace unsichtbar im Infobereich (Autostart).
            if (!e.Args.Contains("--tray")) ShowWindow();

            StartupDiagnostics.Note("Start abgeschlossen");
        }
        catch (Exception ex)
        {
            StartupDiagnostics.Report(ex, phase);
            Shutdown(1);
        }
    }

    /// <summary>
    /// Nebensaechliche Bausteine: faellt einer aus, laeuft Clearspace trotzdem weiter und sagt es
    /// in der Statuszeile, statt wortlos zu verschwinden.
    /// </summary>
    private void TryOptional(string name, Action action)
    {
        try
        {
            StartupDiagnostics.Note(name);
            action();
        }
        catch (Exception ex)
        {
            StartupDiagnostics.Note($"{name} nicht verfuegbar: {ex.GetType().Name} - {ex.Message}");
            if (_shell is not null)
                _shell.StatusText = $"{name} steht nicht zur Verfuegung: {ex.Message}";
        }
    }

    private AppTheme ReadTheme() => _session!.GetSetting("theme", "System") switch
    {
        "Light" => AppTheme.Light,
        "Dark" => AppTheme.Dark,
        _ => AppTheme.System
    };

    private void SetUpTrayIcon()
    {
        _trayIcon = new Forms.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            Text = "Clearspace"
        };
        _trayIcon.Click += (_, _) => ShowWindow();

        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Clearspace oeffnen", null, (_, _) => ShowWindow());
        menu.Items.Add("Erneut durchsuchen", null, (_, _) => Dispatcher.Invoke(() => _shell!.Rescan()));
        menu.Items.Add(new Forms.ToolStripSeparator());
        var pauseItem = new Forms.ToolStripMenuItem("Automatik pausieren") { CheckOnClick = true };
        pauseItem.CheckedChanged += (_, _) =>
        {
            _session!.Automation.IsPaused = pauseItem.Checked;
            if (pauseItem.Checked) _watcher?.Pause(); else _watcher?.Resume();
        };
        menu.Items.Add(pauseItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Beenden", null, (_, _) => Shutdown());
        _trayIcon.ContextMenuStrip = menu;
    }

    private void SetUpHotkey()
    {
        _hotkeys = new GlobalHotkeyService();
        _hotkeys.Pressed += () => Dispatcher.Invoke(ToggleWindow);

        var stored = _session!.GetSetting("hotkey", "Control+Alt+Space");
        var (modifiers, key) = ParseHotkey(stored);
        var (success, message) = _hotkeys.Register(_window!, modifiers, key);
        _shell!.StatusText = message;
        if (!success) _session.SetSetting("hotkey_conflict", stored);
    }

    public static (ModifierKeys, Key) ParseHotkey(string value)
    {
        var modifiers = ModifierKeys.None;
        var key = Key.Space;
        foreach (var part in value.Split('+', StringSplitOptions.RemoveEmptyEntries))
        {
            var token = part.Trim();
            switch (token.ToLowerInvariant())
            {
                case "control" or "strg" or "ctrl": modifiers |= ModifierKeys.Control; break;
                case "alt": modifiers |= ModifierKeys.Alt; break;
                case "shift" or "umschalt": modifiers |= ModifierKeys.Shift; break;
                case "win" or "windows": modifiers |= ModifierKeys.Windows; break;
                default:
                    if (Enum.TryParse<Key>(token, ignoreCase: true, out var parsed)) key = parsed;
                    break;
            }
        }
        return (modifiers, key);
    }

    private void SetUpWatcher(WindowsScanSourceProvider sources)
    {
        _watcher = new DesktopWatcherService(_session!.Watcher, _session.Clock);
        foreach (var source in sources.GetDesktopSources())
            _watcher.Watch(source.Path);

        _watcher.BatchReady += batch => Dispatcher.Invoke(() => _shell!.HandleWatchBatch(batch));
        _watcher.PeriodicRescanDue += () => Dispatcher.Invoke(() => _shell!.Rescan());
        _watcher.Start();
    }

    private void ShowWindow()
    {
        if (_window is null) return;
        _window.Show();
        if (_window.WindowState == WindowState.Minimized) _window.WindowState = WindowState.Normal;
        _window.Activate();
        _window.FocusSearch();
    }

    private void ToggleWindow()
    {
        if (_window is null) return;
        if (_window.IsVisible && _window.IsActive) _window.Hide();
        else ShowWindow();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _watcher?.Dispose();
        _hotkeys?.Dispose();
        if (_trayIcon is not null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }
        _session?.Dispose();
        base.OnExit(e);
    }
}
