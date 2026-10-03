#include "AnalysisController.h"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace keydock
{

namespace
{
/// Longest capture the UI offers, plus headroom. Bounds worst-case memory:
/// at the 22.05 kHz analysis rate this is ~5 MB.
constexpr float kMaxCaptureSeconds = 60.0f;

/// The audio thread may run ahead of the worker by this much before samples
/// are dropped. Dropping is correct here: the alternative is blocking audio.
constexpr double kRingSeconds = 2.0;
} // namespace

AnalysisController::AnalysisController()
{
    worker_ = std::thread([this] { workerLoop(); });
}

AnalysisController::~AnalysisController()
{
    quit_.store(true);
    wake_.notify_all();
    if (worker_.joinable())
        worker_.join();
}

void AnalysisController::prepare(double sampleRate, int maxBlockSize)
{
    sampleRate_.store(sampleRate > 0.0 ? sampleRate : 44100.0);

    // Everything the audio thread touches is sized here, once.
    monoScratch_.assign(static_cast<size_t>(std::max(maxBlockSize, 1)), 0.0f);
    ring_.prepare(static_cast<size_t>(sampleRate * kRingSeconds));
    drainScratch_.assign(static_cast<size_t>(sampleRate * 0.25), 0.0f);

    lookbackResampler_.reset(sampleRate_.load(), kAnalysisSampleRate);
    lookbackScratch_.clear();
    lookbackScratch_.reserve(static_cast<size_t>(kAnalysisSampleRate * 0.5));

    // A sample-rate change invalidates anything captured at the old rate.
    cancel();
}

void AnalysisController::release()
{
    cancel();
}

void AnalysisController::pushAudio(const float* const* channels,
                                   int numChannels, int numSamples) noexcept
{
    if (numChannels <= 0 || numSamples <= 0)
        return;

    // Track the level even when idle, so the UI can show that signal is present.
    float peak = 0.0f;
    const float scale = 1.0f / static_cast<float>(numChannels);
    const int   limit = std::min(numSamples, static_cast<int>(monoScratch_.size()));

    for (int i = 0; i < limit; ++i)
    {
        float sum = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
            sum += channels[ch][i];
        const float m = sum * scale;
        monoScratch_[static_cast<size_t>(i)] = m;
        peak = std::max(peak, std::abs(m));
    }

    // Decaying peak hold; plain store is fine, only the UI reads it.
    const float previous = audioPeak_.load(std::memory_order_relaxed);
    audioPeak_.store(std::max(peak, previous * 0.92f), std::memory_order_relaxed);

    // Also push while idle when the lookback buffer wants audio; the worker
    // decides where the samples go.
    if (capturing_.load(std::memory_order_relaxed)
        || lookbackActive_.load(std::memory_order_relaxed))
        ring_.push(monoScratch_.data(), static_cast<size_t>(limit));
}

void AnalysisController::startAnalysis(float maxSeconds)
{
    requestedSeconds_.store(std::clamp(maxSeconds, 0.0f, kMaxCaptureSeconds));
    stopRequested_.store(false);
    resetRequested_.store(false);
    // A new id invalidates any analysis still in flight: a late result from
    // the previous run can no longer overwrite this one.
    requestedId_.fetch_add(1);
    wake_.notify_all();
}

void AnalysisController::stopCaptureAndAnalyse()
{
    stopRequested_.store(true);
    wake_.notify_all();
}

void AnalysisController::cancel()
{
    requestedId_.fetch_add(1);
    acceptedId_.store(requestedId_.load());
    capturing_.store(false);
    stopRequested_.store(false);

    Snapshot s;
    s.analysisId = requestedId_.load();
    publish(s);
}

void AnalysisController::reset()
{
    resetRequested_.store(true);
    cancel();
}

std::vector<float> AnalysisController::lastCapturedAudio() const
{
    std::lock_guard<std::mutex> lock(capturedMutex_);
    return lastCaptured_;
}

AnalysisController::Snapshot AnalysisController::snapshot() const
{
    std::lock_guard<std::mutex> lock(mutex_);
    Snapshot s = snapshot_;
    s.inputPeakDb = [this]
    {
        const float p = audioPeak_.load(std::memory_order_relaxed);
        return p > 1.0e-5f ? 20.0f * std::log10(p) : -100.0f;
    }();
    return s;
}

void AnalysisController::publish(const Snapshot& s)
{
    {
        std::lock_guard<std::mutex> lock(mutex_);
        snapshot_ = s;
    }
    if (onUpdate)
        onUpdate();
}

void AnalysisController::restoreResult(const AnalysisResult& r, uint32_t analysisId)
{
    Snapshot s;
    s.status     = r.valid ? ipc::Status::haveResult : ipc::Status::unsuitable;
    s.analysisId = analysisId;
    s.haveResult = true;
    s.result     = r;
    s.progress   = 1.0f;
    s.capturedSeconds = r.analysedSeconds;
    publish(s);
}

bool AnalysisController::resultsAgree(const AnalysisResult& a,
                                      const AnalysisResult& b) const
{
    if (! a.valid || ! b.valid)
        return false;

    const bool keyAgrees = a.key.tonal && b.key.tonal
                        && a.key.best.tonic == b.key.best.tonic
                        && a.key.best.isMinor == b.key.best.isMinor;

    // Half a BPM is the engine's demonstrated accuracy, so anything inside
    // that is the same answer rather than a drifting one.
    const bool tempoAgrees = a.tempo.bpm > 0.0f && b.tempo.bpm > 0.0f
                          && std::abs(a.tempo.bpm - b.tempo.bpm) <= 0.5f;

    // Only settle once both dimensions are decided and neither is a guess.
    return keyAgrees && tempoAgrees
        && a.key.confidence   >= Confidence::medium
        && b.key.confidence   >= Confidence::medium
        && a.tempo.confidence >= Confidence::medium
        && b.tempo.confidence >= Confidence::medium;
}

void AnalysisController::workerLoop()
{
    Snapshot state;
    uint32_t activeId = 0;
    float    target   = 0.0f;
    bool     sawAudio = false;

    AnalysisResult previousInterim;
    bool           haveInterim = false;
    float          lastEvaluationSeconds = 0.0f;

    while (! quit_.load())
    {
        {
            std::unique_lock<std::mutex> lock(wakeMutex_);
            wake_.wait_for(lock, std::chrono::milliseconds(25));
        }
        if (quit_.load())
            break;

        // ---- Did the message thread ask for a new analysis? ------------
        const uint32_t wanted = requestedId_.load();
        if (wanted != acceptedId_.load())
        {
            acceptedId_.store(wanted);
            activeId = wanted;
            target   = requestedSeconds_.load();
            sawAudio = false;
            haveInterim = false;
            lastEvaluationSeconds = 0.0f;
            previousInterim = AnalysisResult {};

            // Hard reset: no sample of the previous take may survive.
            ring_.clear();
            engine_.beginCapture(sampleRate_.load(), target > 0.0f ? target
                                                                  : kMaxCaptureSeconds);

            if (resetRequested_.exchange(false))
            {
                state = Snapshot {};
                state.analysisId = activeId;
                capturing_.store(false);
                publish(state);
                continue;
            }

            state = Snapshot {};
            state.analysisId    = activeId;
            state.targetSeconds = target;
            state.status        = ipc::Status::waitingForAudio;
            capturing_.store(true);
            publish(state);
            continue;
        }

        // ---- Feed the lookback buffer while idle -----------------------
        if (! capturing_.load())
        {
            if (lookbackActive_.load() && onAnalysisRateAudio)
            {
                while (true)
                {
                    const size_t n = ring_.pop(drainScratch_.data(), drainScratch_.size());
                    if (n == 0)
                        break;
                    lookbackScratch_.clear();
                    lookbackResampler_.process(drainScratch_.data(), n, lookbackScratch_);
                    if (! lookbackScratch_.empty())
                        onAnalysisRateAudio(lookbackScratch_.data(), lookbackScratch_.size());
                }
            }
            continue;
        }

        // ---- Drain the ring buffer into the engine ---------------------
        size_t drained = 0;
        while (true)
        {
            const size_t n = ring_.pop(drainScratch_.data(), drainScratch_.size());
            if (n == 0)
                break;
            drained += n;

            // The same samples also keep the lookback buffer current, so a
            // recording and the rolling history never disagree.
            if (lookbackActive_.load() && onAnalysisRateAudio)
            {
                lookbackScratch_.clear();
                lookbackResampler_.process(drainScratch_.data(), n, lookbackScratch_);
                if (! lookbackScratch_.empty())
                    onAnalysisRateAudio(lookbackScratch_.data(), lookbackScratch_.size());
            }

            if (! sawAudio)
            {
                // Wait for something audible rather than analysing silence.
                float peak = 0.0f;
                for (size_t i = 0; i < n; ++i)
                    peak = std::max(peak, std::abs(drainScratch_[i]));
                if (peak > 0.0015f)   // about -56 dBFS
                {
                    sawAudio = true;
                    // Restart the capture at the first audible sample so a long
                    // silent lead-in does not eat the analysis window.
                    engine_.beginCapture(sampleRate_.load(),
                                         target > 0.0f ? target : kMaxCaptureSeconds);
                }
                else
                {
                    continue;   // drop silent lead-in
                }
            }

            engine_.appendHostAudio(drainScratch_.data(), n);
        }

        const bool full    = target > 0.0f && engine_.capturedSeconds() >= target;
        const bool stopNow = stopRequested_.exchange(false);

        if (! sawAudio)
        {
            state.status   = ipc::Status::waitingForAudio;
            state.progress = 0.0f;
            publish(state);
            continue;
        }

        if (! full && ! stopNow)
        {
            const float captured = engine_.capturedSeconds();

            // Progressive evaluation: as soon as there is enough material,
            // analyse what we have every couple of seconds and finish early
            // once two consecutive evaluations give the same answer.
            if (captured >= kFirstEvaluationSeconds
                && captured - lastEvaluationSeconds >= kEvaluationIntervalSeconds)
            {
                lastEvaluationSeconds = captured;

                state.status = ipc::Status::analysing;
                publish(state);

                AnalysisResult interim = engine_.analyse();

                // A newer request arrived while we were analysing.
                if (requestedId_.load() != activeId)
                    continue;

                if (haveInterim && resultsAgree(previousInterim, interim))
                {
                    capturing_.store(false);
                    state.status          = ipc::Status::haveResult;
                    state.result          = interim;
                    state.haveResult      = true;
                    state.progress        = 1.0f;
                    state.capturedSeconds = interim.analysedSeconds;
                    publish(state);
                    continue;
                }

                previousInterim = interim;
                haveInterim     = true;
            }

            if (drained > 0 || state.status != ipc::Status::listening)
            {
                state.status          = ipc::Status::listening;
                state.capturedSeconds = captured;
                state.progress        = target > 0.0f
                                      ? std::min(1.0f, captured / target)
                                      : 0.0f;
                publish(state);
            }
            continue;
        }

        // ---- Analyse ----------------------------------------------------
        capturing_.store(false);
        state.status   = ipc::Status::analysing;
        state.progress = 0.0f;
        publish(state);

        AnalysisResult result = engine_.analyse();

        // A newer request arrived while we were analysing: throw this away.
        if (requestedId_.load() != activeId)
            continue;

        {
            // Keep the analysed audio so the sample editor can work on
            // exactly what was measured, not a fresh recording of it.
            std::lock_guard<std::mutex> lock(capturedMutex_);
            lastCaptured_ = engine_.capturedAudio();
        }

        state.status          = result.valid ? ipc::Status::haveResult
                                             : ipc::Status::unsuitable;
        state.result          = result;
        state.haveResult      = true;
        state.progress        = 1.0f;
        state.capturedSeconds = result.analysedSeconds;
        publish(state);
    }
}

} // namespace keydock
