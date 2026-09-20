// Owns the capture state machine and the analysis worker thread.
//
// Threading contract:
//   audio thread   -> pushAudio() only. Lock-free, allocation-free.
//   worker thread  -> drains the ring buffer, resamples, runs the engine.
//   message thread -> startAnalysis()/stop()/reset()/snapshot().
#pragma once

#include "keydock/AnalysisEngine.h"
#include "keydock/RingBuffer.h"
#include "KeyDockProtocol.h"

#include <atomic>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

namespace keydock
{

class AnalysisController
{
public:
    struct Snapshot
    {
        ipc::Status    status          = ipc::Status::ready;
        uint32_t       analysisId      = 0;
        float          progress        = 0.0f;
        float          capturedSeconds = 0.0f;
        float          targetSeconds   = 0.0f;
        float          inputPeakDb     = -100.0f;
        bool           haveResult      = false;
        AnalysisResult result;
    };

    AnalysisController();
    ~AnalysisController();

    /// Non-realtime. Sizes every buffer the audio thread will ever need.
    void prepare(double sampleRate, int maxBlockSize);
    void release();

    /// Realtime safe: sums to mono and pushes into the ring buffer.
    /// Never allocates, never locks, never touches the file system.
    void pushAudio(const float* const* channels, int numChannels, int numSamples) noexcept;

    /// Starts a fresh analysis.
    /// @param maxSeconds  upper bound on how long to listen; 0 means "until
    ///                    stopped". The analysis finishes as soon as the
    ///                    result stops changing, so a clear loop typically
    ///                    completes well before this bound.
    void startAnalysis(float maxSeconds);
    /// Stops capturing now and analyses whatever was captured.
    void stopCaptureAndAnalyse();
    /// Abandons the current analysis without producing a result.
    void cancel();
    /// Clears the current result and all captured audio.
    void reset();

    Snapshot snapshot() const;

    /// Called on the worker thread whenever the state or the result changes.
    /// Used to push updates to the overlay; must not block.
    std::function<void()> onUpdate;

    /// Receives analysis-rate mono audio on the worker thread, for the
    /// lookback buffer. Set before prepare(); must not block.
    std::function<void(const float*, size_t)> onAnalysisRateAudio;

    /// Keeps the audio thread pushing into the ring buffer even when no
    /// analysis is running, so the lookback buffer can be filled.
    void setLookbackActive(bool active) { lookbackActive_.store(active); }

    /// The audio that was just analysed, at the analysis rate, so it can be
    /// handed to the sample editor. Empty when no capture has completed.
    std::vector<float> lastCapturedAudio() const;

    /// Restores a result that was saved with the project.
    void restoreResult(const AnalysisResult& r, uint32_t analysisId);

private:
    void workerLoop();
    void publish(const Snapshot& s);

    mutable std::mutex      mutex_;
    Snapshot                snapshot_;

    AnalysisEngine          engine_;
    RingBuffer              ring_;
    std::vector<float>      monoScratch_;   // audio thread, preallocated
    std::vector<float>      drainScratch_;  // worker thread, preallocated

    std::thread             worker_;
    std::condition_variable wake_;
    std::mutex              wakeMutex_;
    std::atomic<bool>       quit_ { false };

    std::atomic<double>     sampleRate_ { 44100.0 };
    std::atomic<float>      audioPeak_  { 0.0f };

    // Capture control, written by the message thread, read by the worker.
    std::atomic<uint32_t>   requestedId_  { 0 };   // bumped on every startAnalysis
    std::atomic<uint32_t>   acceptedId_   { 0 };   // last id the worker picked up
    std::atomic<float>      requestedSeconds_ { 20.0f };
    std::atomic<bool>       capturing_    { false };
    std::atomic<bool>       stopRequested_{ false };
    std::atomic<bool>       resetRequested_{ false };
    std::atomic<bool>       lookbackActive_{ false };

    Resampler               lookbackResampler_;
    std::vector<float>      lookbackScratch_;

    mutable std::mutex      capturedMutex_;
    std::vector<float>      lastCaptured_;

    /// Progressive evaluation: re-analyse every so often and stop as soon as
    /// two consecutive evaluations agree. Waiting for a fixed duration made
    /// every analysis feel equally slow no matter how obvious the material.
    static constexpr float kFirstEvaluationSeconds = 5.0f;
    static constexpr float kEvaluationIntervalSeconds = 2.0f;

    bool  resultsAgree(const AnalysisResult& a, const AnalysisResult& b) const;
};

} // namespace keydock
