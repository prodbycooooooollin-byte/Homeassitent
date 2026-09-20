#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "OverlayLauncher.h"

#include <algorithm>
#include <atomic>
#include <cstring>

#if defined(_WIN32)
  // NOMINMAX: windows.h otherwise defines min/max as macros, which breaks every
  // std::min / std::max call in this translation unit under MSVC.
  #ifndef NOMINMAX
    #define NOMINMAX
  #endif
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #include <windows.h>
#endif

namespace keydock
{

namespace
{
std::atomic<uint32_t> gInstanceCounter { 0 };

uint32_t currentProcessId()
{
#if defined(_WIN32)
    return static_cast<uint32_t>(GetCurrentProcessId());
#else
    return 0;
#endif
}

/// Copies into a fixed protocol field, always NUL terminated and never
/// overrunning. Avoids strncpy, which MSVC flags and which would not
/// terminate on truncation anyway.
void copyString(char* dest, size_t size, const juce::String& src)
{
    if (size == 0)
        return;

    const auto* utf8 = src.toRawUTF8();
    const size_t length = std::min(std::strlen(utf8), size - 1);
    std::memcpy(dest, utf8, length);
    dest[length] = '\0';
}

ipc::Confidence toIpc(Confidence c)
{
    switch (c)
    {
        case Confidence::high:   return ipc::Confidence::high;
        case Confidence::medium: return ipc::Confidence::medium;
        case Confidence::low:    return ipc::Confidence::low;
        default:                 return ipc::Confidence::none;
    }
}
} // namespace

KeyDockProcessor::KeyDockProcessor()
    : juce::AudioProcessor(BusesProperties()
          .withInput("Input",   juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    instanceIndex_ = gInstanceCounter.fetch_add(1) + 1;
    instanceId_    = (static_cast<uint64_t>(currentProcessId()) << 32) | instanceIndex_;

    controller_.onUpdate = [this] { pushStateToOverlay(); };
    controller_.onAnalysisRateAudio = [this](const float* data, size_t count)
    {
        editor_.appendToLookback(data, count);
    };

    ipc::Hello hello {};
    hello.instanceId     = instanceId_;
    hello.processId      = currentProcessId();
    hello.instanceIndex  = instanceIndex_;
    hello.hostSampleRate = getSampleRate();
    copyString(hello.hostName, sizeof(hello.hostName),
               juce::PluginHostType().getHostDescription());
    copyString(hello.displayName, sizeof(hello.displayName),
               juce::String("KeyDock ") + juce::String(static_cast<int>(instanceIndex_))
                   + " (PID " + juce::String(static_cast<int>(currentProcessId())) + ")");

    ipc_.onCommand = [this](const ipc::CommandMsg& c) { handleCommand(c); };
    ipc_.onOverlayMissing = [this]
    {
        // Only ever launch once audio has really been processed, so scanning
        // the plugin cannot pop up a window.
        if (sawRealtimeAudio_.load() || overlayRequested_.load())
            OverlayLauncher::ensureRunning();
    };
    ipc_.start(hello);

    startTimerHz(20);
}

KeyDockProcessor::~KeyDockProcessor()
{
    stopTimer();
    controller_.onUpdate = nullptr;
    ipc_.onCommand = nullptr;
    ipc_.onOverlayMissing = nullptr;
    ipc_.stop();
}

void KeyDockProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    // Analysis is passive: the plugin adds no latency to the signal path.
    // Analysis is passive and the preview replaces the output rather than
    // processing it, so neither adds latency.
    setLatencySamples(0);
    controller_.prepare(sampleRate, samplesPerBlock);
    editor_.prepare(sampleRate, samplesPerBlock);
}

void KeyDockProcessor::releaseResources()
{
    controller_.release();
}

bool KeyDockProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    const auto& in  = layouts.getMainInputChannelSet();
    const auto& out = layouts.getMainOutputChannelSet();

    if (in != out || in.isDisabled())
        return false;

    return in == juce::AudioChannelSet::mono()
        || in == juce::AudioChannelSet::stereo();
}

void KeyDockProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    // The audio is passed through completely untouched: no gain change, no
    // filtering, no buffer writes of any kind. The analyser only reads.

    // Offline rendering must not produce live results or launch windows.
    if (isNonRealtime())
        return;

    sawRealtimeAudio_.store(true, std::memory_order_relaxed);

    if (auto* head = getPlayHead())
    {
        if (const auto pos = head->getPosition())
        {
            // Read for display only. This value never enters the engine.
            if (const auto bpm = pos->getBpm())
                hostBpm_.store(*bpm, std::memory_order_relaxed);
            hostPlaying_.store(pos->getIsPlaying(), std::memory_order_relaxed);
        }
    }

    // Preview is the only thing that may change what leaves the plugin, and
    // only while the user has switched it on. It replaces the output rather
    // than processing it, so the analysis path must not see it: capturing the
    // preview would fold an edit back into the next measurement.
    if (editor_.previewActive())
    {
        editor_.renderPreview(buffer.getArrayOfWritePointers(),
                              buffer.getNumChannels(),
                              buffer.getNumSamples());
        return;
    }

    controller_.pushAudio(buffer.getArrayOfReadPointers(),
                          buffer.getNumChannels(),
                          buffer.getNumSamples());
}

void KeyDockProcessor::processBlock(juce::AudioBuffer<double>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(buffer);
    // Double-precision hosts still get untouched audio; the analyser simply
    // skips these blocks rather than allocating a conversion buffer here.
}

void KeyDockProcessor::requestAnalysis(float seconds)
{
    overlayRequested_.store(true);
    OverlayLauncher::ensureRunning();
    setCaptureSeconds(seconds);
    controller_.startAnalysis(seconds);
}

void KeyDockProcessor::requestStop()  { controller_.stopCaptureAndAnalyse(); }
void KeyDockProcessor::requestReset() { controller_.reset(); }

void KeyDockProcessor::handleCommand(const ipc::CommandMsg& cmd)
{
    switch (static_cast<ipc::CommandId>(cmd.commandId))
    {
        case ipc::CommandId::startAnalysis: requestAnalysis(cmd.param0); break;
        case ipc::CommandId::stopCapture:   requestStop();               break;
        case ipc::CommandId::cancel:        controller_.cancel();        break;
        case ipc::CommandId::reset:         requestReset();              break;

        case ipc::CommandId::setLookbackSeconds:
            editor_.setLookbackSeconds(cmd.param0);
            controller_.setLookbackActive(editor_.lookbackEnabled());
            break;
        case ipc::CommandId::clearLookback:
            editor_.clearLookback();
            break;
        case ipc::CommandId::analyseLookback:
            editor_.selectFromLookback(cmd.param0);
            break;

        case ipc::CommandId::setTargetKey:
            editor_.setTargetKey(static_cast<int>(cmd.param1), cmd.param2 != 0);
            break;
        case ipc::CommandId::toggleDirection:
            editor_.toggleDirection();
            break;
        case ipc::CommandId::setApplyTuning:
            editor_.setApplyTuning(cmd.param2 != 0);
            break;
        case ipc::CommandId::setManualCents:
            editor_.setManualCents(cmd.param0);
            break;
        case ipc::CommandId::setPreserveFormants:
            editor_.setPreserveFormants(cmd.param2 != 0);
            break;
        case ipc::CommandId::setSourceKeyOverride:
            editor_.setSourceKeyOverride(static_cast<int>(cmd.param1), cmd.param2 != 0);
            break;
        case ipc::CommandId::trimSelection:
            editor_.trimSelection(cmd.param0, cmd.param1);
            break;
        case ipc::CommandId::resetEdits:
            editor_.resetEdits();
            break;
        case ipc::CommandId::exportWav:
            editor_.exportWav();
            break;
        case ipc::CommandId::setPreviewMode:
            editor_.setPreviewMode(static_cast<uint32_t>(cmd.param2));
            break;

        default: break;
    }

    pushEditStateToOverlay();
}

void KeyDockProcessor::pushEditStateToOverlay()
{
    if (! ipc_.isConnected())
        return;

    ipc::EditStateMsg msg {};
    msg.instanceId = instanceId_;
    editor_.fillState(msg);
    ipc_.sendEditState(msg);
}

void KeyDockProcessor::timerCallback()
{
    pushStateToOverlay();
    pushEditStateToOverlay();
}

void KeyDockProcessor::pushStateToOverlay()
{
    if (! ipc_.isConnected())
        return;

    const auto snap = controller_.snapshot();

    ipc::StateMsg state {};
    state.instanceId      = instanceId_;
    state.status          = static_cast<uint32_t>(snap.status);
    state.analysisId      = snap.analysisId;
    state.progress        = snap.progress;
    state.capturedSeconds = snap.capturedSeconds;
    state.targetSeconds   = snap.targetSeconds;
    state.inputPeakDb     = snap.inputPeakDb;
    state.hostBpm         = hostBpm_.load();
    state.hostPlaying     = hostPlaying_.load() ? 1u : 0u;
    ipc_.sendState(state);

    // Send the result once per analysis, not on every tick.
    if (! snap.haveResult || snap.analysisId == lastSentAnalysisId_.load())
        return;
    lastSentAnalysisId_.store(snap.analysisId);

    // A completed capture becomes the sample the editor works on, so a
    // transpose acts on exactly the audio that was measured.
    if (snap.result.valid)
    {
        auto captured = controller_.lastCapturedAudio();
        if (! captured.empty())
            editor_.selectFromCapture(captured, snap.result.analysedSeconds);
    }

    const auto& r = snap.result;

    ipc::ResultMsg msg {};
    msg.instanceId      = instanceId_;
    msg.analysisId      = snap.analysisId;
    msg.valid           = r.valid ? 1u : 0u;
    msg.keyTonic        = r.key.tonal ? r.key.best.tonic : -1;
    msg.keyIsMinor      = r.key.best.isMinor ? 1u : 0u;
    msg.keyConfidence   = static_cast<uint32_t>(toIpc(r.key.confidence));
    msg.keyMargin       = r.key.margin;
    msg.bpm             = r.tempo.bpm;
    msg.bpmConfidence   = static_cast<uint32_t>(toIpc(r.tempo.confidence));
    msg.bpmOctaveRatio  = r.tempo.octaveRatio;
    msg.analysedSeconds = r.analysedSeconds;
    msg.tuningCents     = r.key.tuningCents;
    msg.sourceIsLive    = 1u;

    // The relative key is always the first alternative offered.
    size_t slot = 0;
    if (r.key.relative.tonic >= 0 && slot < 3)
        msg.altKeys[slot++] = { r.key.relative.tonic,
                                r.key.relative.isMinor ? 1u : 0u,
                                r.key.relativeCloseness };
    for (const auto& alt : r.key.alternates)
    {
        if (slot >= 3)
            break;
        if (alt.tonic == r.key.relative.tonic && alt.isMinor == r.key.relative.isMinor)
            continue;
        const float rel = r.key.best.score > 1.0e-6f ? alt.score / r.key.best.score : 0.0f;
        msg.altKeys[slot++] = { alt.tonic, alt.isMinor ? 1u : 0u, rel };
    }
    for (; slot < 3; ++slot)
        msg.altKeys[slot] = { -1, 0u, 0.0f };

    slot = 0;
    for (const auto& alt : r.tempo.alternates)
    {
        if (slot >= 3)
            break;
        msg.altTempos[slot++] = { alt.bpm, alt.salience };
    }
    for (; slot < 3; ++slot)
        msg.altTempos[slot] = { 0.0f, 0.0f };

    copyString(msg.note, sizeof(msg.note), juce::String(r.note));
    ipc_.sendResult(msg);
}

// --- State ---------------------------------------------------------------

void KeyDockProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ValueTree tree("KeyDock");
    tree.setProperty("version", 1, nullptr);
    tree.setProperty("captureSeconds", captureSeconds_.load(), nullptr);

    const auto snap = controller_.snapshot();
    if (snap.haveResult)
    {
        // Keep the last result with the project so reopening shows what the
        // session ended on, clearly marked as a restored value.
        juce::ValueTree result("Result");
        const auto& r = snap.result;
        result.setProperty("valid",        r.valid, nullptr);
        result.setProperty("keyTonic",     r.key.tonal ? r.key.best.tonic : -1, nullptr);
        result.setProperty("keyIsMinor",   r.key.best.isMinor, nullptr);
        result.setProperty("keyConf",      static_cast<int>(r.key.confidence), nullptr);
        result.setProperty("keyMargin",    r.key.margin, nullptr);
        result.setProperty("relTonic",     r.key.relative.tonic, nullptr);
        result.setProperty("relIsMinor",   r.key.relative.isMinor, nullptr);
        result.setProperty("relCloseness", r.key.relativeCloseness, nullptr);
        result.setProperty("bpm",          r.tempo.bpm, nullptr);
        result.setProperty("bpmConf",      static_cast<int>(r.tempo.confidence), nullptr);
        result.setProperty("seconds",      r.analysedSeconds, nullptr);
        result.setProperty("tuningCents",  r.key.tuningCents, nullptr);
        result.setProperty("note",         juce::String(r.note), nullptr);
        tree.appendChild(result, nullptr);
    }

    juce::MemoryOutputStream stream(destData, false);
    tree.writeToStream(stream);
}

void KeyDockProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    const auto tree = juce::ValueTree::readFromData(data, static_cast<size_t>(sizeInBytes));
    if (! tree.isValid() || tree.getType().toString() != "KeyDock")
        return;

    captureSeconds_.store(static_cast<float>(tree.getProperty("captureSeconds", 30.0)));

    const auto stored = tree.getChildWithName("Result");
    if (! stored.isValid())
        return;

    AnalysisResult r;
    r.valid                   = stored.getProperty("valid", false);
    r.key.best.tonic          = stored.getProperty("keyTonic", -1);
    r.key.best.isMinor        = stored.getProperty("keyIsMinor", false);
    r.key.tonal               = r.key.best.tonic >= 0;
    r.key.confidence          = static_cast<Confidence>(static_cast<int>(
                                    stored.getProperty("keyConf", 0)));
    r.key.margin              = stored.getProperty("keyMargin", 0.0);
    r.key.relative.tonic      = stored.getProperty("relTonic", -1);
    r.key.relative.isMinor    = stored.getProperty("relIsMinor", false);
    r.key.relativeCloseness   = stored.getProperty("relCloseness", 0.0);
    r.tempo.bpm               = stored.getProperty("bpm", 0.0);
    r.tempo.rhythmic          = r.tempo.bpm > 0.0f;
    r.tempo.confidence        = static_cast<Confidence>(static_cast<int>(
                                    stored.getProperty("bpmConf", 0)));
    r.analysedSeconds         = stored.getProperty("seconds", 0.0);
    r.key.tuningCents         = stored.getProperty("tuningCents", 0.0);
    r.note                    = stored.getProperty("note", "").toString().toStdString();

    controller_.restoreResult(r, 0);
}

juce::AudioProcessorEditor* KeyDockProcessor::createEditor()
{
    return new KeyDockEditor(*this);
}

} // namespace keydock

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new keydock::KeyDockProcessor();
}
