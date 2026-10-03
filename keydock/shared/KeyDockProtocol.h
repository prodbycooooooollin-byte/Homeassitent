// KeyDock - shared IPC protocol between the VST3 plugin and the overlay app.
// Header-only, POD-only, no dependencies. Must compile in both projects.
#pragma once

#include <cstdint>
#include <cstring>

namespace keydock::ipc
{

inline constexpr char     kPipeName[]      = "\\\\.\\pipe\\KeyDock.v1";
inline constexpr char     kSingletonMutex[] = "Local\\KeyDock.Overlay.Singleton.v1";
inline constexpr uint32_t kProtocolVersion = 2;
inline constexpr uint32_t kMagic           = 0x4B44434Bu; // 'KDCK'
inline constexpr uint32_t kMaxMessageBytes = 4096;

enum class MsgType : uint32_t
{
    hello        = 1,  // plugin -> overlay, once per connection
    state        = 2,  // plugin -> overlay, periodic
    result       = 3,  // plugin -> overlay, when an analysis completes
    goodbye      = 4,  // plugin -> overlay, on destruction
    editState    = 5,  // plugin -> overlay, sample editing state
    command      = 10, // overlay -> plugin
    ack          = 11, // overlay -> plugin
};

// Mirrors keydock::Status in the engine; kept as a plain int for ABI stability.
enum class Status : uint32_t
{
    ready          = 0,
    waitingForAudio= 1,
    listening      = 2,
    analysing      = 3,
    haveResult     = 4,
    unsuitable     = 5,
    stopped        = 6,
};

enum class Confidence : uint32_t { none = 0, low = 1, medium = 2, high = 3 };

enum class CommandId : uint32_t
{
    startAnalysis = 1,  // param0 = max capture seconds (0 = manual stop)
    stopCapture   = 2,  // stop capturing now, analyse what we have
    cancel        = 3,  // abort, back to ready
    reset         = 4,  // clear result + buffers
    ping          = 5,
    setActive     = 6,  // param0 != 0 -> the instance the overlay drives

    // --- lookback -----------------------------------------------------
    setLookbackSeconds = 20, // param0 = 0 disables and frees the memory
    analyseLookback    = 21, // param0 = seconds to take from the buffer
    clearLookback      = 22,

    // --- sample editing ------------------------------------------------
    setTargetKey        = 30, // param1 = tonic (-1 clears), param2 = isMinor
    toggleDirection     = 31,
    setApplyTuning      = 32, // param2 != 0
    setManualCents      = 33, // param0 = cents
    setPreserveFormants = 34, // param2 != 0
    setSourceKeyOverride= 35, // param1 = tonic (-1 clears), param2 = isMinor
    trimSelection       = 36, // param0 = from s, param1 = to s
    resetEdits          = 37,
    exportWav           = 38,

    /// param2: 0 = off, 1 = play the original, 2 = play the edited version.
    /// Preview is the only thing besides an explicit live effect that is
    /// allowed to change what leaves the plugin.
    setPreviewMode      = 40,
};

enum class PreviewMode : uint32_t { off = 0, original = 1, edited = 2 };

#pragma pack(push, 1)

struct Header
{
    uint32_t magic;      // kMagic
    uint32_t version;    // kProtocolVersion
    uint32_t type;       // MsgType
    uint32_t payloadBytes;
};

struct Hello
{
    uint64_t instanceId;      // unique per plugin instance, stable for its lifetime
    uint32_t processId;       // host pid
    uint32_t instanceIndex;   // n-th instance inside that process
    double   hostSampleRate;
    char     hostName[64];    // e.g. "FL Studio (64 Bit)"
    char     displayName[64]; // e.g. "FL Studio 3124 - Instance 1"
};

struct AltKey
{
    int32_t  tonic;     // 0..11, -1 = none
    uint32_t isMinor;   // 0 = major, 1 = minor
    float    score;     // relative score 0..1 vs. the winner
};

struct AltTempo
{
    float bpm;
    float score;        // relative salience 0..1 vs. the winner
};

struct StateMsg
{
    uint64_t instanceId;
    uint32_t status;          // Status
    uint32_t analysisId;      // monotonically increasing; 0 = none
    float    progress;        // 0..1 within the current phase
    float    capturedSeconds;
    float    targetSeconds;   // 0 = manual stop
    float    inputPeakDb;     // -100 .. 0, for the level indicator
    double   hostBpm;         // host transport tempo, DISPLAY ONLY, never a result
    uint32_t hostPlaying;
};

struct ResultMsg
{
    uint64_t instanceId;
    uint32_t analysisId;      // must match the analysis the overlay asked for
    uint32_t valid;           // 0 = "unsuitable material", fields below are meaningless

    int32_t  keyTonic;        // 0=C .. 11=B, -1 = undetermined
    uint32_t keyIsMinor;
    uint32_t keyConfidence;   // Confidence
    float    keyMargin;       // raw score margin, for the details panel only

    float    bpm;             // 0 = undetermined
    uint32_t bpmConfidence;   // Confidence
    float    bpmOctaveRatio;  // salience(half) / salience(chosen), diagnostics

    float    analysedSeconds;
    float    tuningCents;     // estimated deviation from A440
    uint32_t sourceIsLive;    // 1 = live capture, 0 = file analysis (future)

    AltKey   altKeys[3];
    AltTempo altTempos[3];

    char     note[96];        // short human-readable caveat, may be empty
};

struct CommandMsg
{
    uint64_t targetInstanceId; // 0 = broadcast
    uint32_t commandId;        // CommandId
    float    param0;
    float    param1;
    int32_t  param2;
};

/// Everything about the currently selected sample and the edit applied to it.
/// Sent whenever any of it changes, so the overlay can always say which source
/// is selected and whether what is playing is the original or the edit.
struct EditStateMsg
{
    uint64_t instanceId;

    // --- lookback ---
    uint32_t lookbackEnabled;
    float    lookbackConfiguredSeconds;
    float    lookbackAvailableSeconds;

    // --- selected source ---
    uint32_t hasSource;
    float    sourceSeconds;
    char     sourceLabel[64];

    // --- source analysis (always of the untouched source) ---
    int32_t  sourceTonic;          // -1 = unknown
    uint32_t sourceIsMinor;
    uint32_t sourceKeyOverridden;
    float    sourceBpm;

    // --- tuning ---
    float    tuningCents;
    float    tuningSpreadCents;
    uint32_t tuningConfidence;     // Confidence
    uint32_t tuningReliable;
    char     tuningNote[96];

    // --- target key / plan ---
    int32_t  targetTonic;          // -1 = none chosen
    uint32_t targetIsMinor;
    uint32_t planPossible;
    int32_t  planSemitones;
    int32_t  planAlternativeSemitones;
    uint32_t usingAlternative;
    char     planExplanation[160];

    // --- what will actually be applied ---
    int32_t  appliedSemitones;
    float    appliedCents;
    uint32_t applyTuningCorrection;
    float    manualCents;
    uint32_t preserveFormants;
    uint32_t hasEdit;

    // --- preview / live ---
    uint32_t previewMode;          // PreviewMode
    uint32_t livePitchActive;

    // --- last export ---
    char     lastExportPath[200];
    char     lastExportError[120];
};

#pragma pack(pop)

static_assert(sizeof(Header) == 16, "protocol header must stay 16 bytes");

} // namespace keydock::ipc
