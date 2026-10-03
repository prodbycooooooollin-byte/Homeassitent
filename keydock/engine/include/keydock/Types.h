// KeyDock analysis engine - common result types. Pure C++17, no dependencies.
#pragma once

#include <array>
#include <string>
#include <vector>

namespace keydock
{

/// Analysis sample rate. Everything downstream of the resampler runs here.
inline constexpr double kAnalysisSampleRate = 22050.0;

enum class Confidence { none, low, medium, high };

const char* toString(Confidence c) noexcept;

struct KeyCandidate
{
    int   tonic   = -1;    ///< 0 = C .. 11 = B, -1 = undetermined
    bool  isMinor = false;
    float score   = 0.0f;  ///< profile correlation, -1..1
};

struct KeyResult
{
    KeyCandidate              best;
    std::vector<KeyCandidate> alternates;   ///< ranked, excluding `best`
    KeyCandidate              relative;               ///< always filled when best is valid
    Confidence                confidence = Confidence::none;
    float                     margin      = 0.0f;  ///< best.score - runnerUp.score
    /// How close the relative major/minor scores to the winner, 0..1.
    /// Chroma cannot separate a natural-minor loop from its relative major,
    /// so a high value here means the mode is genuinely undecidable.
    float                     relativeCloseness = 0.0f;
    float                     tuningCents = 0.0f;  ///< estimated offset from A440
    bool                      tonal       = false; ///< false => no usable pitch content
    std::string               note;
};

struct TempoCandidate
{
    float bpm      = 0.0f;
    float salience = 0.0f;   ///< 0..1, relative to the winner
};

struct TempoResult
{
    /// The tempo to display. Snapped to a whole BPM when the raw measurement
    /// is close enough that the difference is measurement noise rather than a
    /// genuinely off-grid tempo.
    float                       bpm = 0.0f;
    /// The unsnapped measurement, kept so the details view can stay honest.
    float                       bpmRaw = 0.0f;
    bool                        snappedToWholeBpm = false;
    std::vector<TempoCandidate> alternates;  ///< typically half/double/related
    Confidence                  confidence = Confidence::none;
    float                       octaveRatio = 0.0f; ///< salience(bpm/2) / salience(bpm)
    bool                        rhythmic    = false;
    std::string                 note;
};

/// Why a chunk of audio could not be analysed.
enum class Unsuitable
{
    none,
    tooShort,
    silent,
    noTonalContent,
    noRhythmicContent,
};

struct AnalysisResult
{
    bool        valid           = false;   ///< false => show "unsuitable material"
    Unsuitable  reason          = Unsuitable::none;
    KeyResult   key;
    TempoResult tempo;
    float       analysedSeconds = 0.0f;
    float       peakDb          = -100.0f;
    std::string note;
};

/// Name of a pitch class using sharps, e.g. 6 -> "F#".
const char* pitchClassName(int tonic) noexcept;
/// Camelot wheel code, e.g. (6, minor) -> "11A". Empty when tonic < 0.
std::string camelot(int tonic, bool isMinor);
/// Human readable key, e.g. "F# minor". Empty when tonic < 0.
std::string keyName(int tonic, bool isMinor);

} // namespace keydock
