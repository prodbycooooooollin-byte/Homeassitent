namespace Clearspace.Core.Cleanup;

/// <summary>
/// Pfadhilfen, die sowohl mit Windows-Pfaden als auch mit den Testverzeichnissen der
/// Entwicklungsumgebung umgehen. Der Trenner wird aus dem Basispfad uebernommen.
/// </summary>
public static class PathUtil
{
    public static char SeparatorOf(string path)
    {
        if (path.Contains('\\') && !path.Contains('/')) return '\\';
        if (path.Contains('/')) return '/';
        return System.IO.Path.DirectorySeparatorChar;
    }

    public static string Combine(string basePath, params string[] parts)
    {
        var sep = SeparatorOf(basePath);
        var result = basePath.TrimEnd('/', '\\');
        foreach (var part in parts)
        {
            if (string.IsNullOrEmpty(part)) continue;
            result += sep + part.Trim('/', '\\');
        }
        return result;
    }

    public static string GetFileName(string path)
    {
        var idx = path.LastIndexOfAny(new[] { '/', '\\' });
        return idx < 0 ? path : path[(idx + 1)..];
    }

    public static string GetDirectory(string path)
    {
        var idx = path.LastIndexOfAny(new[] { '/', '\\' });
        return idx < 0 ? string.Empty : path[..idx];
    }

    public static string GetFileNameWithoutExtension(string path)
    {
        var name = GetFileName(path);
        var dot = name.LastIndexOf('.');
        return dot <= 0 ? name : name[..dot];
    }

    public static string GetExtension(string path)
    {
        var name = GetFileName(path);
        var dot = name.LastIndexOf('.');
        return dot <= 0 ? string.Empty : name[dot..];
    }

    private static readonly char[] Invalid = { '<', '>', ':', '"', '/', '\\', '|', '?', '*' };

    /// <summary>Macht einen Kategorienamen als Ordnernamen verwendbar.</summary>
    public static string SanitizeFolderName(string name)
    {
        var chars = name.Select(c => Invalid.Contains(c) || char.IsControl(c) ? '_' : c).ToArray();
        var cleaned = new string(chars).Trim().TrimEnd('.');
        return cleaned.Length == 0 ? "Unbenannt" : cleaned;
    }

    /// <summary>Prueft, ob <paramref name="child"/> innerhalb von <paramref name="root"/> liegt.</summary>
    public static bool IsInside(string child, string root)
    {
        var c = child.Replace('/', '\\').TrimEnd('\\');
        var r = root.Replace('/', '\\').TrimEnd('\\');
        if (r.Length == 0) return false;
        return c.StartsWith(r, StringComparison.OrdinalIgnoreCase)
               && (c.Length == r.Length || c[r.Length] == '\\');
    }

    /// <summary>Ein Zielpfad gilt als absolut, wenn er ein Laufwerk oder eine UNC-Freigabe nennt.</summary>
    public static bool IsAbsoluteWindowsPath(string path)
        => (path.Length >= 3 && char.IsLetter(path[0]) && path[1] == ':' && (path[2] == '\\' || path[2] == '/'))
           || path.StartsWith("\\\\", StringComparison.Ordinal)
           || path.StartsWith("/", StringComparison.Ordinal);
}
