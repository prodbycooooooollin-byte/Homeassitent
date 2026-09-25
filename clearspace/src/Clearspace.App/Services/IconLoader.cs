using System.Collections.Concurrent;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Imaging;

namespace Clearspace.App.Services;

/// <summary>
/// Laedt Originalicons asynchron ueber SHGetFileInfo. Ergebnisse werden zwischengespeichert,
/// damit die Oberflaeche nie blockiert.
/// </summary>
public static class IconLoader
{
    private static readonly ConcurrentDictionary<string, BitmapSource?> Cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly SemaphoreSlim Throttle = new(4);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
    }

    private const uint SHGFI_ICON = 0x000000100;
    private const uint SHGFI_LARGEICON = 0x000000000;
    private const uint SHGFI_USEFILEATTRIBUTES = 0x000000010;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes,
        ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    public static async Task<BitmapSource?> LoadAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        if (Cache.TryGetValue(path, out var cached)) return cached;

        await Throttle.WaitAsync().ConfigureAwait(false);
        try
        {
            var result = await Task.Run(() => Load(path)).ConfigureAwait(false);
            Cache[path] = result;
            return result;
        }
        finally
        {
            Throttle.Release();
        }
    }

    private static BitmapSource? Load(string path)
    {
        // Bei Icon-Angaben der Form "datei.exe,3" nur den Dateianteil verwenden.
        var file = path;
        var comma = file.LastIndexOf(',');
        if (comma > 2 && !Directory.Exists(file)) file = file[..comma];
        file = file.Trim('"');

        var info = new SHFILEINFO();
        // USEFILEATTRIBUTES verhindert Zugriffe auf nicht verfuegbare oder Cloud-Dateien.
        var useAttributes = !File.Exists(file) && !Directory.Exists(file);
        var flags = SHGFI_ICON | SHGFI_LARGEICON | (useAttributes ? SHGFI_USEFILEATTRIBUTES : 0);

        var handle = SHGetFileInfo(file, 0x80 /* FILE_ATTRIBUTE_NORMAL */, ref info,
            (uint)Marshal.SizeOf<SHFILEINFO>(), flags);
        if (handle == IntPtr.Zero || info.hIcon == IntPtr.Zero) return null;

        try
        {
            var source = Imaging.CreateBitmapSourceFromHIcon(info.hIcon, Int32Rect.Empty,
                BitmapSizeOptions.FromEmptyOptions());
            source.Freeze();
            return source;
        }
        catch (COMException) { return null; }
        catch (ArgumentException) { return null; }
        finally
        {
            DestroyIcon(info.hIcon);
        }
    }
}
