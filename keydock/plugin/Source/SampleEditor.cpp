#include "SampleEditor.h"

#include "keydock/Resampler.h"
#include "keydock/WavWriter.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <thread>

#if defined(_WIN32)
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
/// Longest sample the editor will hold, bounding both memory and render time.
constexpr float kMaxSelectionSeconds = 60.0f;

/// Shortest selection worth analysing, matching the engine's own minimum.
constexpr float kMinSelectionSeconds = 4.0f;

void copyString(char* dest, size_t size, const std::string& src)
{
    if (size == 0)
        return;
    const size_t n = std::min(src.size(), size - 1);
    std::memcpy(dest, src.data(), n);
    dest[n] = '\0';
}

/// Documents folder, or the working directory if it cannot be determined.
std::string exportDirectory()
{
#if defined(_WIN32)
    wchar_t wide[MAX_PATH * 2] = {};
    const DWORD n = GetEnvironmentVariableW(L"USERPROFILE", wide, MAX_PATH * 2);
    if (n > 0 && n < MAX_PATH * 2)
    {
        char utf8[MAX_PATH * 4] = {};
        if (WideCharToMultiByte(CP_UTF8, 0, wide, -1, utf8, sizeof(utf8),
                                nullptr, nullptr) > 0)
        {
            std::string dir = std::string(utf8) + "\\Documents\\KeyDock";
            CreateDirectoryA(dir.c_str(), nullptr);
            return dir;
        }
    }
#endif
    return ".";
}
} // namespace

SampleEditor::SampleEditor() = default;

void SampleEditor::prepare(double hostSampleRate, int)
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (hostSampleRate > 0.0)
        hostRate_ = hostSampleRate;

    previewBuffer_.assign(static_cast<size_t>(hostRate_ * kMaxSelectionSeconds), 0.0f);
    previewLength_.store(0);
    previewPos_.store(0);
}

void SampleEditor::reset()
{
    previewMode_.store(0, std::memory_order_release);
    wantedPreview_.store(0);

    std::lock_guard<std::mutex> lock(mutex_);
    session_.setSource({}, {});
    lookback_.clear();
    previewLength_.store(0);
    previewPos_.store(0);
    lastExportPath_.clear();
    lastExportError_.clear();
}

// --- audio thread ---------------------------------------------------------

void SampleEditor::renderPreview(float* const* channels, int numChannels,
                                 int numSamples) noexcept
{
    const size_t length = previewLength_.load(std::memory_order_acquire);
    if (length == 0 || numChannels <= 0 || numSamples <= 0)
        return;

    size_t pos = previewPos_.load(std::memory_order_relaxed);

    for (int i = 0; i < numSamples; ++i)
    {
        const float s = pos < length ? previewBuffer_[pos] : 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
            channels[ch][i] = s;

        // Loop, so a short sample can be judged without restarting it.
        if (++pos >= length)
            pos = 0;
    }

    previewPos_.store(pos, std::memory_order_relaxed);
}

// --- worker thread --------------------------------------------------------

void SampleEditor::appendToLookback(const float* samples, size_t count)
{
    lookback_.append(samples, count);
}

void SampleEditor::setLookbackSeconds(float seconds)
{
    lookback_.configure(std::clamp(seconds, 0.0f, kMaxSelectionSeconds));
}

void SampleEditor::clearLookback()
{
    lookback_.clear();
}

bool SampleEditor::selectFromLookback(float seconds)
{
    auto snapshot = lookback_.snapshot(std::clamp(seconds, 0.0f, kMaxSelectionSeconds));
    if (static_cast<float>(snapshot.size() / kAnalysisSampleRate) < kMinSelectionSeconds)
        return false;

    const float held = static_cast<float>(snapshot.size() / kAnalysisSampleRate);

    {
        std::lock_guard<std::mutex> lock(mutex_);
        session_.setSource(std::move(snapshot),
                           "Rückblick " + std::to_string(static_cast<int>(held)) + " s");
        session_.analyseSource();
    }
    refreshPreviewBuffer();
    return true;
}

void SampleEditor::selectFromCapture(const std::vector<float>& mono, float seconds)
{
    {
        std::lock_guard<std::mutex> lock(mutex_);
        session_.setSource(mono,
                           "Aufnahme " + std::to_string(static_cast<int>(seconds)) + " s");
        session_.analyseSource();
    }
    refreshPreviewBuffer();
}

void SampleEditor::setTargetKey(int tonic, bool isMinor)
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.setTargetKey(tonic, isMinor); }
    refreshPreviewBuffer();
}

void SampleEditor::toggleDirection()
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.useAlternativeDirection(); }
    refreshPreviewBuffer();
}

void SampleEditor::setApplyTuning(bool apply)
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.setApplyTuningCorrection(apply); }
    refreshPreviewBuffer();
}

void SampleEditor::setManualCents(float cents)
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.setManualCents(cents); }
    refreshPreviewBuffer();
}

void SampleEditor::setPreserveFormants(bool preserve)
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.setPreserveFormants(preserve); }
    refreshPreviewBuffer();
}

void SampleEditor::setSourceKeyOverride(int tonic, bool isMinor)
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.setSourceKeyOverride(tonic, isMinor); }
    refreshPreviewBuffer();
}

void SampleEditor::trimSelection(float fromSeconds, float toSeconds)
{
    {
        std::lock_guard<std::mutex> lock(mutex_);
        session_.trimSource(fromSeconds, toSeconds);
        session_.analyseSource();
    }
    refreshPreviewBuffer();
}

void SampleEditor::resetEdits()
{
    { std::lock_guard<std::mutex> lock(mutex_); session_.resetEdits(); }
    refreshPreviewBuffer();
}

void SampleEditor::setPreviewMode(uint32_t mode)
{
    wantedPreview_.store(mode > 2 ? 0 : mode);
    refreshPreviewBuffer();
}

void SampleEditor::refreshPreviewBuffer()
{
    // Mute first. The audio thread only touches previewBuffer_ while
    // previewMode_ is non-zero, so muting and letting the in-flight block
    // finish makes the buffer safe to rewrite without a lock on the audio
    // path. Two block periods is ample at any realistic buffer size.
    previewMode_.store(0, std::memory_order_release);
    std::this_thread::sleep_for(std::chrono::milliseconds(40));

    const uint32_t wanted = wantedPreview_.load();

    std::lock_guard<std::mutex> lock(mutex_);

    if (wanted == 0 || ! session_.hasSource())
    {
        previewLength_.store(0, std::memory_order_release);
        previewPos_.store(0);
        return;
    }

    const std::vector<float>& analysisRate =
        wanted == 2 ? session_.rendered() : session_.source();

    // The selection lives at the analysis rate; the preview has to come out at
    // the host rate or it would play back at the wrong speed and pitch.
    Resampler resampler;
    resampler.reset(kAnalysisSampleRate, hostRate_);

    std::vector<float> atHostRate;
    atHostRate.reserve(static_cast<size_t>(analysisRate.size() * hostRate_
                                           / kAnalysisSampleRate) + 64);
    resampler.process(analysisRate.data(), analysisRate.size(), atHostRate);
    resampler.flush(atHostRate);

    const size_t n = std::min(atHostRate.size(), previewBuffer_.size());
    std::copy(atHostRate.begin(), atHostRate.begin() + static_cast<long>(n),
              previewBuffer_.begin());

    previewPos_.store(0);
    previewLength_.store(n, std::memory_order_release);
    previewMode_.store(wanted, std::memory_order_release);
}

std::string SampleEditor::exportWav()
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (! session_.hasSource())
    {
        lastExportError_ = "Kein Ausschnitt ausgewählt.";
        return lastExportError_;
    }

    const std::string path = exportDirectory() + "\\" + session_.suggestedFileName();

    // The edited version at the analysis rate. The original file on disk, if
    // there was one, is untouched: this only ever writes a new file.
    const auto error = writeWav24(path, session_.rendered(), kAnalysisSampleRate);

    lastExportError_ = error;
    lastExportPath_  = error.empty() ? path : std::string {};
    return error;
}

void SampleEditor::fillState(ipc::EditStateMsg& out) const
{
    std::lock_guard<std::mutex> lock(mutex_);

    out.lookbackEnabled           = lookback_.enabled() ? 1u : 0u;
    out.lookbackConfiguredSeconds = lookback_.configuredSeconds();
    out.lookbackAvailableSeconds  = lookback_.availableSeconds();

    out.hasSource     = session_.hasSource() ? 1u : 0u;
    out.sourceSeconds = session_.sourceSeconds();
    copyString(out.sourceLabel, sizeof(out.sourceLabel), session_.sourceLabel());

    out.sourceTonic         = session_.effectiveSourceTonic();
    out.sourceIsMinor       = session_.effectiveSourceIsMinor() ? 1u : 0u;
    out.sourceKeyOverridden = session_.keyIsOverridden() ? 1u : 0u;
    out.sourceBpm           = session_.analysis().tempo.bpm;

    const auto& tuning = session_.tuning();
    out.tuningCents       = tuning.cents;
    out.tuningSpreadCents = tuning.spreadCents;
    out.tuningConfidence  = static_cast<uint32_t>(tuning.confidence);
    out.tuningReliable    = tuning.reliable ? 1u : 0u;
    copyString(out.tuningNote, sizeof(out.tuningNote), tuning.note);

    const auto& plan = session_.plan();
    out.targetTonic              = plan.targetTonic;
    out.targetIsMinor            = plan.targetIsMinor ? 1u : 0u;
    out.planPossible             = plan.possible ? 1u : 0u;
    out.planSemitones            = plan.semitones;
    out.planAlternativeSemitones = plan.alternativeSemitones;
    out.usingAlternative         = session_.usingAlternativeDirection() ? 1u : 0u;
    copyString(out.planExplanation, sizeof(out.planExplanation), plan.explanation);

    out.appliedSemitones      = session_.effectiveSemitones();
    out.appliedCents          = session_.effectiveCents();
    out.applyTuningCorrection = session_.applyingTuningCorrection() ? 1u : 0u;
    out.manualCents           = session_.manualCents();
    out.preserveFormants      = session_.preservingFormants() ? 1u : 0u;
    out.hasEdit               = session_.hasEdit() ? 1u : 0u;

    out.previewMode     = wantedPreview_.load();
    out.livePitchActive = 0u;   // no live pitch effect in this version

    copyString(out.lastExportPath,  sizeof(out.lastExportPath),  lastExportPath_);
    copyString(out.lastExportError, sizeof(out.lastExportError), lastExportError_);
}

} // namespace keydock
