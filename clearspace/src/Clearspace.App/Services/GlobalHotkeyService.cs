using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;

namespace Clearspace.App.Services;

/// <summary>
/// Globaler Tastenkuerzel ueber die dokumentierten Funktionen RegisterHotKey/UnregisterHotKey.
/// Konflikte werden erkannt und gemeldet, statt still zu scheitern.
/// </summary>
public sealed class GlobalHotkeyService : IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const int HotkeyId = 0xC1EA;

    [Flags]
    private enum Modifiers : uint
    {
        Alt = 0x0001,
        Control = 0x0002,
        Shift = 0x0004,
        Win = 0x0008,
        NoRepeat = 0x4000
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private HwndSource? _source;
    private bool _registered;

    public event Action? Pressed;

    /// <summary>Registriert den Kuerzel. Gibt eine verstaendliche Meldung zurueck, wenn er belegt ist.</summary>
    public (bool Success, string Message) Register(Window window, ModifierKeys modifiers, Key key)
    {
        Unregister();

        var handle = new WindowInteropHelper(window).EnsureHandle();
        _source = HwndSource.FromHwnd(handle);
        _source?.AddHook(WndProc);

        var flags = (uint)Modifiers.NoRepeat;
        if (modifiers.HasFlag(ModifierKeys.Alt)) flags |= (uint)Modifiers.Alt;
        if (modifiers.HasFlag(ModifierKeys.Control)) flags |= (uint)Modifiers.Control;
        if (modifiers.HasFlag(ModifierKeys.Shift)) flags |= (uint)Modifiers.Shift;
        if (modifiers.HasFlag(ModifierKeys.Windows)) flags |= (uint)Modifiers.Win;

        var virtualKey = (uint)KeyInterop.VirtualKeyFromKey(key);
        _registered = RegisterHotKey(handle, HotkeyId, flags, virtualKey);

        return _registered
            ? (true, $"Tastenkuerzel aktiv: {Describe(modifiers, key)}")
            : (false, $"Das Tastenkuerzel {Describe(modifiers, key)} ist bereits von einem anderen Programm belegt. " +
                      "Bitte waehle eine andere Kombination.");
    }

    public static string Describe(ModifierKeys modifiers, Key key)
    {
        var parts = new List<string>();
        if (modifiers.HasFlag(ModifierKeys.Control)) parts.Add("Strg");
        if (modifiers.HasFlag(ModifierKeys.Alt)) parts.Add("Alt");
        if (modifiers.HasFlag(ModifierKeys.Shift)) parts.Add("Umschalt");
        if (modifiers.HasFlag(ModifierKeys.Windows)) parts.Add("Windows");
        parts.Add(key.ToString());
        return string.Join(" + ", parts);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HotkeyId)
        {
            Pressed?.Invoke();
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void Unregister()
    {
        if (_source is null) return;
        if (_registered) UnregisterHotKey(_source.Handle, HotkeyId);
        _source.RemoveHook(WndProc);
        _registered = false;
    }

    public void Dispose() => Unregister();
}
