using Clearspace.Core.Model;

namespace Clearspace.Core.Categorization;

/// <summary>
/// Standardkatalog der Hauptbereiche. Unterkategorien existieren im Katalog, werden in der
/// Oberflaeche aber nur angezeigt, wenn sie tatsaechlich Inhalte haben.
/// </summary>
public static class CategoryCatalog
{
    public const string Inbox = "inbox";

    public static IReadOnlyList<Category> CreateDefaults()
    {
        var list = new List<Category>();
        int order = 0;

        void Add(string id, string name, string? parent, string icon, string? folder = null, bool system = false)
            => list.Add(new Category
            {
                Id = id, Name = name, ParentId = parent, Icon = icon,
                SortOrder = order++, FolderName = folder, IsSystem = system
            });

        Add("music", "Musikproduktion", null, "music", "Musik");
        Add("music.daw", "DAWs und Aufnahme", "music", "record");
        Add("music.instruments", "Instrumente und Synthesizer", "music", "piano");
        Add("music.effects", "Effekte, Mixing und Mastering", "music", "sliders");
        Add("music.samples", "Samples, Drumkits und Loops", "music", "waveform");
        Add("music.presets", "Presets und Soundbanks", "music", "bookmark");
        Add("music.projects", "Projekte, Beats und Exporte", "music", "file-music");
        Add("music.audiotools", "Audioanalyse und Bearbeitung", "music", "activity");
        Add("music.plugins", "Plugin-Dateien", "music", "plug");
        Add("music.management", "Lizenzen und Plugin-Verwaltung", "music", "key");
        Add("music.devices", "Audiointerface und MIDI", "music", "midi");

        Add("gaming", "Gaming", null, "gamepad", "Gaming");
        Add("gaming.games", "Spiele", "gaming", "gamepad");
        Add("gaming.launchers", "Launcher und Bibliotheken", "gaming", "library");
        Add("gaming.mods", "Mods und Servertools", "gaming", "wrench");
        Add("gaming.tools", "Aufnahme, Overlays und Hilfsprogramme", "gaming", "layers");

        Add("content", "Content Creation", null, "sparkles", "Kreativ");
        Add("content.streaming", "Streaming und Aufnahme", "content", "video");
        Add("content.video", "Videoschnitt und Animation", "content", "film");
        Add("content.graphics", "Bild, Design und 3D", "content", "image");
        Add("content.assets", "Assets und Content-Projekte", "content", "package");

        Add("communication", "Kommunikation und Community", null, "chat", "Kommunikation");
        Add("browser", "Browser und Recherche", null, "globe", "Browser");
        Add("work", "Arbeit und Organisation", null, "briefcase", "Arbeit");
        Add("dev", "Entwicklung und Technik", null, "code", "Entwicklung");
        Add("system", "System und Geraete", null, "settings", "System");
        Add("system.devices", "Geraete und Treiber", "system", "usb");
        Add("files", "Dokumente und Dateien", null, "document", "Dokumente");
        Add("files.archives", "Archive", "files", "archive");
        Add("files.installers", "Installationsdateien", "files", "download");
        Add("files.media", "Medien", "files", "photo");

        list.Add(new Category
        {
            Id = Inbox, Name = "Noch zuordnen", ParentId = null, Icon = "inbox",
            SortOrder = 1000, IsSystem = true, FolderName = null
        });
        return list;
    }

    /// <summary>Liefert die Elternkette einer Kategorie inklusive ihrer selbst.</summary>
    public static IEnumerable<string> AncestorChain(IReadOnlyDictionary<string, Category> byId, string categoryId)
    {
        var current = categoryId;
        var guard = 0;
        while (current is not null && byId.TryGetValue(current, out var cat) && guard++ < 32)
        {
            yield return cat.Id;
            current = cat.ParentId;
        }
    }

    /// <summary>Der Hauptbereich (oberste Ebene) einer Kategorie.</summary>
    public static string RootOf(IReadOnlyDictionary<string, Category> byId, string categoryId)
        => AncestorChain(byId, categoryId).LastOrDefault() ?? categoryId;
}
