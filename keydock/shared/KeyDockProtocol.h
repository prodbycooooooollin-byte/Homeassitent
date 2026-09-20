// KeyDock - shared IPC protocol between the VST3 plugin and the overlay app.
// Header-only, POD-only, no dependencies. Must compile in both projects.
#pragma once

#include <cstdint>
#include <cstring>

namespace keydock::ipc
{

inline constexpr char     kPipeName[]      = "\\\\.\\pipe\\KeyDock.v1";
inline constexpr char     kSingletonMutex[] = "Local\\KeyDock.Overlay.Singleton.v1";
inline constexpr uint32_t kProtocolVersion = 1;
inline constexpr uint32_t kMagic           = 0x4B44434Bu; // 'KDCK'
inline constexpr uint32_t kMaxMessageBytes = 4096;

enum class MsgType : uint32_t
{
    hello        = 1,  // plugin -> overlay, once per connection
    state        = 2,  // plugin -> overlay, periodic
    result       = 3,  // plugin -> overlay, when an analysis completes
    goodbye      = 4,  // plugin -> overlay, on destruction
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
    startAnalysis = 1, // param0 = capture seconds (0 = manual stop)
    stopCapture   = 2, // stop capturing now, analyse what we have
    cancel        = 3, // abort, back to ready
    reset         = 4, // clear result + buffers
    ping          = 5,
    setActive     = 6, // param0 != 0 -> this instance is the one the overlay drives
};

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
};

#pragma pack(pop)

static_assert(sizeof(Header) == 16, "protocol header must stay 16 bytes");

} // namespace keydock::ipc
