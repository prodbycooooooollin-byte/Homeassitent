// Length-preserving pitch shifting.
//
// Phase vocoder time-stretch followed by a windowed-sinc resample: stretching
// by r and then replaying r times faster restores the original duration while
// moving every partial by r. Tempo and length are therefore unchanged, which
// is what transposing a sample to a target key requires.
//
// Transients get a phase reset, without which drums and plucks smear audibly.
#pragma once

#include "keydock/Fft.h"
#include "keydock/Resampler.h"
#include "keydock/Types.h"

#include <vector>

namespace keydock
{

class PitchShifter
{
public:
    explicit PitchShifter(double sampleRate = kAnalysisSampleRate);

    struct Options
    {
        /// Whole semitones to transpose by; may be negative.
        int   semitones = 0;
        /// Additional fine correction in cents; kept separate from
        /// `semitones` so a tuning fix and a key change never get folded
        /// together and applied twice.
        float cents = 0.0f;
        /// Keep the spectral envelope where it is, so a transposed voice
        /// still sounds like the same voice rather than a chipmunk.
        bool  preserveFormants = false;
    };

    /// @returns a buffer the same length as `input`.
    std::vector<float> process(const std::vector<float>& input, const Options& options);

    /// The frequency ratio a given set of options corresponds to.
    static double ratioFor(const Options& options);

    /// Changes duration by `factor` while leaving pitch alone. Public because
    /// the pitch accuracy of the whole chain depends on this staying exact,
    /// and that is worth testing directly.
    std::vector<float> timeStretch(const std::vector<float>& input, double factor);

private:
    static constexpr int kFftOrder  = 11;          // 2048 @ 22050 Hz
    static constexpr int kFrameSize = 1 << kFftOrder;
    // frameSize/8 rather than /4: the synthesis hop is the analysis hop times
    // the stretch factor, so a 2x stretch (an octave up) would leave only 50 %
    // overlap and cost about 2 cents of accuracy. At /8 even the widest shift
    // this tool offers keeps 75 % overlap.
    static constexpr int kAnalysisHop = kFrameSize / 8;

    void               spectralEnvelope(const std::vector<float>& magnitude,
                                        std::vector<float>& envelope);

    double             sampleRate_;
    Fft                fft_;
    std::vector<float> window_;

    // Preallocated working state; process() is called from a worker thread.
    std::vector<float> frame_, spectrum_, magnitude_, phase_;
    std::vector<float> lastPhase_, sumPhase_, envelope_, shiftedEnvelope_;
    Resampler          resampler_;
};

} // namespace keydock
