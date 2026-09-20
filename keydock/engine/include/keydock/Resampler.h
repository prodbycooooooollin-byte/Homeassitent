// Windowed-sinc resampler used only on the analysis path, never on the
// audio output path. Runs on the worker thread, so allocation is fine here.
#pragma once

#include <vector>

namespace keydock
{

class Resampler
{
public:
    /// @param inRate   source sample rate
    /// @param outRate  target sample rate (kAnalysisSampleRate)
    void reset(double inRate, double outRate);

    /// Streams `in` through the resampler, appending to `out`.
    /// Internal history is kept between calls so block boundaries are seamless.
    void process(const float* in, size_t numSamples, std::vector<float>& out);

    /// Flushes the remaining tail. Call once at the end of a capture.
    void flush(std::vector<float>& out);

    double ratio() const noexcept { return ratio_; }

private:
    double             ratio_ = 1.0;   ///< outRate / inRate
    double             pos_   = 0.0;   ///< fractional read position in history_
    int                halfWidth_ = 16;
    double             cutoff_ = 0.5;  ///< normalised to the input rate
    std::vector<float> history_;
    bool               passthrough_ = false;

    float interpolate(double position) const;
};

} // namespace keydock
