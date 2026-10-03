using Clearspace.Core.Library;
using Clearspace.Core.Model;
using Clearspace.Presentation.Common;
using Clearspace.Presentation.Services;

namespace Clearspace.Presentation.ViewModels;

public sealed class EntryItemViewModel : ObservableObject
{
    private readonly LibraryService _library;
    private EntryView _view;

    public EntryItemViewModel(LibraryService library, EntryView view)
    {
        _library = library;
        _view = view;
    }

    public LibraryEntry Entry => _view.Entry;
    public string Id => Entry.Id;
    public string DisplayName => Entry.DisplayName;
    public string TypeLabel => Labels.EntryType(Entry.Type);
    public string Path => Entry.Path;

    /// <summary>Pfad, aus dem das Originalicon gewonnen wird (Verknuepfungsziel bevorzugt).</summary>
    public string IconSourcePath => Entry.IconLocation ?? Entry.TargetPath ?? Entry.Path;

    public string CategoryLabel => _library.Categories.TryGetValue(_view.Primary.CategoryId, out var c)
        ? c.Name : _view.Primary.CategoryId;

    public string ConfidenceLabel => Labels.Confidence(_view.Primary.Confidence);
    public Confidence Confidence => _view.Primary.Confidence;

    /// <summary>Kurze Begruendung der Zuordnung, z. B. "Produktbeschreibung nennt Audiointerface".</summary>
    public string ReasonLabel => $"{CategoryLabel}: {_view.Primary.Reason} ({Labels.AssignmentSource(_view.Primary.Source)}, {ConfidenceLabel})";

    public IReadOnlyList<string> AllCategoryLabels => _view.Assignments
        .Select(a => _library.Categories.TryGetValue(a.CategoryId, out var c) ? c.Name : a.CategoryId)
        .Distinct()
        .ToList();

    public bool IsFavorite
    {
        get => Entry.IsFavorite;
        set { _library.SetFavorite(Id, value); OnPropertyChanged(); }
    }

    public bool IsLaunchable => Entry.IsLaunchable;
    public bool IsProtected => _view.IsProtected;
    public bool KeepOnDesktop => _view.KeepOnDesktop;
    public bool IsInbox => _view.Primary.CategoryId == Core.Categorization.CategoryCatalog.Inbox;

    public string TagsText => string.Join(", ", Entry.Tags);

    /// <summary>Hinweis fuer Eintraege, die nicht direkt gestartet werden koennen.</summary>
    public string? NonLaunchableHint => Entry.Type switch
    {
        EntryType.PluginFile => "Plugin - kein eigenstaendiges Programm. Ordner oeffnen oder Manager nutzen.",
        EntryType.PresetFile => "Preset - wird in der zugehoerigen Software geladen.",
        EntryType.SampleFile => "Sample - Teil einer Klangbibliothek.",
        _ => null
    };

    public void Refresh(EntryView view)
    {
        _view = view;
        OnPropertyChanged(nameof(DisplayName));
        OnPropertyChanged(nameof(CategoryLabel));
        OnPropertyChanged(nameof(ReasonLabel));
        OnPropertyChanged(nameof(AllCategoryLabels));
        OnPropertyChanged(nameof(IsInbox));
        OnPropertyChanged(nameof(TagsText));
        OnPropertyChanged(nameof(IsFavorite));
    }
}
