using Clearspace.Core.Model;

namespace Clearspace.Core.Abstractions;

public sealed record LaunchRequest(LibraryEntry Entry, bool UserConfirmedUnknownExecutable);

public sealed record LaunchOutcome(bool Started, string? Message, bool NeedsConfirmation);

/// <summary>
/// Startet Eintraege ueber die vorgesehenen Windows-Mechanismen. Es werden niemals
/// Shell-Kommandos aus Dateinamen zusammengesetzt.
/// </summary>
public interface ILauncher
{
    LaunchOutcome Launch(LaunchRequest request);
    bool RevealInExplorer(string path);
}

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
