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

    /// @param seconds  capture length; 0 means "capture until stopped".
    void startAnalysis(float seconds);
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
};

} // namespace keydock
