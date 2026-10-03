#include "keydock/AnalysisEngine.h"

#include <algorithm>
#include <cmath>

namespace keydock
{

AnalysisEngine::AnalysisEngine()
    : key_(kAnalysisSampleRate), tempo_(kAnalysisSampleRate)
{
    // Reserve the worst case once, so later captures never reallocate.
    buffer_.reserve(static_cast<size_t>(kAnalysisSampleRate * 60.0));
}

void AnalysisEngine::beginCapture(double hostSampleRate, float maxSeconds)
{
    hostRate_   = hostSampleRate > 0.0 ? hostSampleRate : 44100.0;
    maxSamples_ = static_cast<size_t>(kAnalysisSampleRate * std::max(1.0f, maxSeconds));
    if (buffer_.capacity() < maxSamples_)
        buffer_.reserve(maxSamples_);

    // A fresh session must not inherit a single sample from the previous one.
    buffer_.clear();
    peak_ = 0.0f;
    resampler_.reset(hostRate_, kAnalysisSampleRate);
}

void AnalysisEngine::appendHostAudio(const float* mono, size_t numSamples)
{
    if (buffer_.size() >= maxSamples_ || numSamples == 0)
        return;

    for (size_t i = 0; i < numSamples; ++i)
        peak_ = std::max(peak_, std::abs(mono[i]));

    resampler_.process(mono, numSamples, buffer_);

    if (buffer_.size() > maxSamples_)
        buffer_.resize(maxSamples_);
}

float AnalysisEngine::capturedSeconds() const
{
    return static_cast<float>(buffer_.size() / kAnalysisSampleRate);
}

bool AnalysisEngine::hasMinimumMaterial() const
{
    return capturedSeconds() >= kMinAnalysisSeconds;
}

bool AnalysisEngine::isFull() const
{
    return maxSamples_ > 0 && buffer_.size() >= maxSamples_;
}

float AnalysisEngine::peakDb() const
{
    return peak_ > 1.0e-6f ? 20.0f * std::log10(peak_) : -100.0f;
}

void AnalysisEngine::reset()
{
    buffer_.clear();
    peak_ = 0.0f;
}

AnalysisResult AnalysisEngine::analyse()
{
    AnalysisResult out;
    out.analysedSeconds = capturedSeconds();
    out.peakDb          = peakDb();

    if (buffer_.empty())
    {
        out.reason = Unsuitable::tooShort;
        out.note   = "Kein Audiomaterial erfasst.";
        return out;
    }

    // Reject material that is effectively silent rather than inventing a key.
    double rms = 0.0;
    for (float s : buffer_)
        rms += static_cast<double>(s) * s;
    rms = std::sqrt(rms / buffer_.size());

    if (rms < 1.0e-4 || out.peakDb < -60.0f)
    {
        out.reason = Unsuitable::silent;
        out.note   = "Signal zu leise - nichts zu analysieren.";
        return out;
    }

    if (out.analysedSeconds < kMinAnalysisSeconds)
    {
        out.reason = Unsuitable::tooShort;
        out.note   = "Zu wenig Audiomaterial (mindestens "
                   + std::to_string(static_cast<int>(kMinAnalysisSeconds)) + " s noetig).";
        return out;
    }

    out.key   = key_.analyse(buffer_);
    out.tempo = tempo_.analyse(buffer_);

    // A result counts as valid when at least one of the two dimensions
    // produced something. Both failing means the material is unsuitable.
    const bool haveKey   = out.key.tonal && out.key.best.tonic >= 0;
    const bool haveTempo = out.tempo.rhythmic && out.tempo.bpm > 0.0f;

    out.valid = haveKey || haveTempo;

    if (! out.valid)
    {
        out.reason = Unsuitable::noTonalContent;
        out.note   = "Material ist weder tonal noch rhythmisch auswertbar.";
    }
    else if (! haveKey)
    {
        out.reason = Unsuitable::noTonalContent;
        out.note   = out.key.note.empty()
                   ? "Keine Tonart bestimmbar (z. B. reine Drums)." : out.key.note;
    }
    else if (! haveTempo)
    {
        out.reason = Unsuitable::noRhythmicContent;
        out.note   = out.tempo.note.empty()
                   ? "Kein Tempo bestimmbar." : out.tempo.note;
    }

    return out;
}

} // namespace keydock
