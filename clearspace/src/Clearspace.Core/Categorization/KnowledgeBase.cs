using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Clearspace.Core.Model;

namespace Clearspace.Core.Categorization;

public sealed class KnowledgeRule
{
    [JsonPropertyName("match")] public string[] Match { get; set; } = Array.Empty<string>();
    [JsonPropertyName("categories")] public string[] Categories { get; set; } = Array.Empty<string>();
    [JsonPropertyName("confidence")] public string Confidence { get; set; } = "Low";
    [JsonPropertyName("reason")] public string Reason { get; set; } = string.Empty;

    public Confidence ConfidenceValue => Confidence switch
    {
        "High" => Model.Confidence.High,
        "Medium" => Model.Confidence.Medium,
        _ => Model.Confidence.Low
    };
}

public sealed class KnowledgeData
{
    [JsonPropertyName("products")] public List<KnowledgeRule> Products { get; set; } = new();
    [JsonPropertyName("publishers")] public List<KnowledgeRule> Publishers { get; set; } = new();
    [JsonPropertyName("keywords")] public List<KnowledgeRule> Keywords { get; set; } = new();
    [JsonPropertyName("pathHints")] public List<KnowledgeRule> PathHints { get; set; } = new();
    [JsonPropertyName("protocols")] public List<KnowledgeRule> Protocols { get; set; } = new();
}

/// <summary>Lokale Zuordnungstabelle. Wird als eingebettete Ressource ausgeliefert, offline nutzbar.</summary>
public static class KnowledgeBase
{
    private static KnowledgeData? _cached;

    public static KnowledgeData Load()
    {
        if (_cached is not null) return _cached;
        var asm = Assembly.GetExecutingAssembly();
        var name = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("knowledge.json", StringComparison.OrdinalIgnoreCase));
        if (name is null) return _cached = new KnowledgeData();
        using var stream = asm.GetManifestResourceStream(name)!;
        _cached = JsonSerializer.Deserialize<KnowledgeData>(stream) ?? new KnowledgeData();
        return _cached;
    }

    public static KnowledgeData LoadFrom(string json)
        => JsonSerializer.Deserialize<KnowledgeData>(json) ?? new KnowledgeData();
}
