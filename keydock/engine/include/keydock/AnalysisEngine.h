// Capture + analysis orchestration.
//
// Lives entirely on a worker thread. The audio thread never touches this
// class; it only pushes into a RingBuffer that the worker drains.
#pragma once

#include "keydock/KeyDetector.h"
#include "keydock/Resampler.h"
#include "keydock/TempoDetector.h"
#include "keydock/Types.h"

#include <vector>

namespace keydock
{

class AnalysisEngine
{
public:
    AnalysisEngine();

    /// Discards every previously captured sample and starts a new session.
    /// `maxSeconds` bounds the memory the capture may ever use.
    void beginCapture(double hostSampleRate, float maxSeconds);

    /// Appends host-rate mono audio, resampling onto the analysis rate.
    /// Stops accepting data once maxSeconds is reached.
    void appendHostAudio(const float* mono, size_t numSamples);

    /// Seconds of usable (non-silent) audio captured so far.
    float capturedSeconds() const;

    /// True once enough material exists for the shortest useful analysis.
    bool hasMinimumMaterial() const;

    /// True once maxSeconds of audio has been captured.
    bool isFull() const;

    /// Runs key + tempo detection over everything captured. Does not clear
    /// the buffer, so a caller may analyse progressively.
    AnalysisResult analyse();

    /// Frees the capture buffer back to its reserved capacity.
    void reset();

    /// Peak level of the captured material in dBFS.
    float peakDb() const;

    static constexpr float kMinAnalysisSeconds = 4.0f;

private:
    KeyDetector        key_;
    TempoDetector      tempo_;
    Resampler          resampler_;
    std::vector<float> buffer_;
    size_t             maxSamples_  = 0;
    double             hostRate_    = 44100.0;
    float              peak_        = 0.0f;
};

} // namespace keydock
