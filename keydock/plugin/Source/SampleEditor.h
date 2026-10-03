// Sample editing for the plugin: the lookback buffer, the edit session,
// preview playback and WAV export.
//
// Threading: the audio thread only reads the preview buffer and only while
// preview is on. Everything else - rendering, analysis, file writing - runs on
// the worker thread that AnalysisController already owns.
#pragma once

#include "keydock/EditSession.h"
#include "keydock/LookbackBuffer.h"
#include "KeyDockProtocol.h"

#include <atomic>
#include <mutex>
#include <string>
#include <vector>

namespace keydock
{

class SampleEditor
{
public:
    SampleEditor();

    /// Sizes the preview buffer for the host's rate. Worker thread.
    void prepare(double hostSampleRate, int maxBlockSize);

    // --- audio thread ---------------------------------------------------

    /// True when the plugin must replace its output with preview audio.
    bool previewActive() const noexcept
    {
        return previewMode_.load(std::memory_order_acquire) != 0;
    }

    /// Writes the next `numSamples` of preview audio to every channel.
    /// Realtime safe: reads a preallocated buffer, no locks, no allocation.
    void renderPreview(float* const* channels, int numChannels, int numSamples) noexcept;

    /// Feeds the lookback buffer. Called on the worker thread with
    /// analysis-rate audio, never from the audio callback.
    void appendToLookback(const float* samples, size_t count);

    // --- worker thread ---------------------------------------------------

    void setLookbackSeconds(float seconds);
    void clearLookback();
    bool lookbackEnabled() const { return lookback_.enabled(); }
    float lookbackAvailableSeconds() const { return lookback_.availableSeconds(); }
    float lookbackConfiguredSeconds() const { return lookback_.configuredSeconds(); }

    /// Takes the most recent `seconds` from the lookback buffer as the
    /// selected sample and analyses it. Returns false when there is too
    /// little material to be worth analysing.
    bool selectFromLookback(float seconds);

    /// Uses an already captured analysis buffer as the selected sample.
    void selectFromCapture(const std::vector<float>& mono, float seconds);

    void setTargetKey(int tonic, bool isMinor);
    void toggleDirection();
    void setApplyTuning(bool apply);
    void setManualCents(float cents);
    void setPreserveFormants(bool preserve);
    void setSourceKeyOverride(int tonic, bool isMinor);
    void trimSelection(float fromSeconds, float toSeconds);
    void resetEdits();

    /// 0 = off, 1 = original, 2 = edited.
    void setPreviewMode(uint32_t mode);
    uint32_t previewMode() const { return wantedPreview_.load(); }

    /// Writes the edited sample next to the user's documents.
    /// Returns an empty string on success.
    std::string exportWav();

    /// Fills the message the overlay renders from. Worker thread.
    void fillState(ipc::EditStateMsg& out) const;

    /// Drops the selection and every edit, e.g. on a sample-rate change.
    void reset();

private:
    /// Renders the current choice into the preview buffer, resampled to the
    /// host rate. Preview is muted around the swap, see the implementation.
    void refreshPreviewBuffer();

    mutable std::mutex mutex_;

    LookbackBuffer lookback_;
    EditSession    session_;

    double hostRate_ = 44100.0;

    // Preview playback, read by the audio thread.
    std::vector<float>    previewBuffer_;
    std::atomic<uint32_t> previewMode_    { 0 };   // what the audio thread obeys
    std::atomic<uint32_t> wantedPreview_  { 0 };   // what the user asked for
    std::atomic<size_t>   previewLength_  { 0 };
    mutable std::atomic<size_t> previewPos_ { 0 };

    std::string lastExportPath_, lastExportError_;
};

} // namespace keydock
