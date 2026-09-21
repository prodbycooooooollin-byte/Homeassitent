using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using Clearspace.Core.Abstractions;

namespace Clearspace.Windows;

/// <summary>
/// Loest .lnk-Dateien ueber die dokumentierte IShellLink-Schnittstelle und .url-Dateien ueber
/// ihr INI-Format auf. Es wird ausschliesslich gelesen; nichts wird gestartet und die
/// Verknuepfung wird nie zurueckgeschrieben.
/// </summary>
public sealed class ShellLinkResolver : IShortcutResolver
{
    private const int MaxPath = 260;
    private const int InfoTipSize = 1024;

    // SLGP_RAWPATH liefert den Pfad ohne Umgebungsvariablen-Aufloesung; RAWPATH zeigt,
    // ob eine Verknuepfung relativ gespeichert wurde.
    private const uint SlgpUncPriority = 0x0002;
    private const uint SlgpRawPath = 0x0004;

    // Kein UI, keine Netzwerksuche, kein Neuschreiben der Verknuepfung.
    private const uint SlrNoUpdate = 0x0008;
    private const uint SlrNoSearch = 0x0010;
    private const uint SlrNoTrack = 0x0020;
    private const uint SlrNoLinkInfo = 0x0040;
    private const uint SlrNoUi = 0x0001;

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cch,
            IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch,
            out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    public bool CanResolve(string path)
        => path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)
           || path.EndsWith(".url", StringComparison.OrdinalIgnoreCase);

    public ShortcutInfo? Resolve(string path)
    {
        if (path.EndsWith(".url", StringComparison.OrdinalIgnoreCase)) return ResolveUrl(path);
        if (!path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) return null;
        return ResolveLnk(path);
    }

    private static ShortcutInfo? ResolveLnk(string path)
    {
        ShellLink? shellLink = null;
        try
        {
            shellLink = new ShellLink();
            var link = (IShellLinkW)shellLink;
            var persist = (IPersistFile)shellLink;
            persist.Load(path, 0 /* STGM_READ */);

            // Auflosen ohne Oberflaeche, ohne Suche und ohne Aktualisierung der Datei.
            try { link.Resolve(IntPtr.Zero, SlrNoUi | SlrNoUpdate | SlrNoSearch | SlrNoTrack | SlrNoLinkInfo); }
            catch (COMException) { /* Ziel evtl. nicht erreichbar - die gespeicherten Daten genuegen */ }

            var buffer = new StringBuilder(MaxPath);
            link.GetPath(buffer, buffer.Capacity, IntPtr.Zero, SlgpUncPriority);
            var target = buffer.ToString();

            buffer.Clear();
            link.GetPath(buffer, buffer.Capacity, IntPtr.Zero, SlgpRawPath);
            var rawTarget = buffer.ToString();

            var args = new StringBuilder(InfoTipSize);
            link.GetArguments(args, args.Capacity);

            var workDir = new StringBuilder(MaxPath);
            link.GetWorkingDirectory(workDir, workDir.Capacity);

            var description = new StringBuilder(InfoTipSize);
            link.GetDescription(description, description.Capacity);

            var iconPath = new StringBuilder(MaxPath);
            link.GetIconLocation(iconPath, iconPath.Capacity, out var iconIndex);

            var protocolOrAppId = ExtractProtocol(target, args.ToString());

            var effectiveTarget = string.IsNullOrWhiteSpace(target) ? null : target;
            var relative = effectiveTarget is not null
                           && !string.IsNullOrEmpty(rawTarget)
                           && !IsRooted(rawTarget);

            return new ShortcutInfo(
                effectiveTarget,
                NullIfEmpty(args.ToString()),
                NullIfEmpty(workDir.ToString()),
                NullIfEmpty(iconPath.Length > 0 ? $"{iconPath},{iconIndex}" : string.Empty),
                NullIfEmpty(description.ToString()),
                protocolOrAppId,
                relative);
        }
        catch (COMException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        finally
        {
            if (shellLink is not null) Marshal.FinalReleaseComObject(shellLink);
        }
    }

    private static bool IsRooted(string path)
        => (path.Length >= 3 && char.IsLetter(path[0]) && path[1] == ':')
           || path.StartsWith("\\\\", StringComparison.Ordinal);

    /// <summary>Liest eine Internetverknuepfung im dokumentierten INI-Format.</summary>
    private static ShortcutInfo? ResolveUrl(string path)
    {
        try
        {
            string? url = null;
            string? iconFile = null;
            string? workDir = null;
            foreach (var raw in File.ReadLines(path))
            {
                var line = raw.Trim();
                if (line.StartsWith("URL=", StringComparison.OrdinalIgnoreCase)) url = line[4..];
                else if (line.StartsWith("IconFile=", StringComparison.OrdinalIgnoreCase)) iconFile = line[9..];
                else if (line.StartsWith("WorkingDirectory=", StringComparison.OrdinalIgnoreCase)) workDir = line[17..];
            }
            if (url is null) return null;
            var scheme = url.Contains("://", StringComparison.Ordinal)
                ? url[..(url.IndexOf("://", StringComparison.Ordinal) + 3)]
                : null;
            return new ShortcutInfo(null, null, workDir, iconFile, null, scheme ?? url, false);
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    /// <summary>Erkennt Protokollstarts wie steam://rungameid/... in Ziel oder Argumenten.</summary>
    private static string? ExtractProtocol(string target, string arguments)
    {
        foreach (var candidate in new[] { target, arguments })
        {
            if (string.IsNullOrWhiteSpace(candidate)) continue;
            var idx = candidate.IndexOf("://", StringComparison.Ordinal);
            if (idx <= 0) continue;
            var start = idx;
            while (start > 0 && (char.IsLetterOrDigit(candidate[start - 1]) || candidate[start - 1] is '.' or '-'))
                start--;
            var end = candidate.IndexOf(' ', idx);
            return end > 0 ? candidate[start..end] : candidate[start..];
        }
        return null;
    }

    private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;

    public FileMetadata? ReadMetadata(string executablePath)
    {
        try
        {
            if (!File.Exists(executablePath)) return null;
            var info = FileVersionInfo.GetVersionInfo(executablePath);
            return new FileMetadata(
                NullIfEmpty(info.CompanyName ?? string.Empty),
                NullIfEmpty(info.ProductName ?? string.Empty),
                NullIfEmpty(info.FileDescription ?? string.Empty));
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }
}
