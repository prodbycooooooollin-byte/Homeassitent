// Tempo estimation from a multi-band spectral-flux onset detection function.
//
// Pipeline: STFT -> log-compressed band energies -> half-wave rectified flux
// -> adaptive mean removal -> autocorrelation -> comb-filter salience with a
// weak log-normal tempo prior -> beat-grid phase check.
//
// Half/double-time is treated as a first-class ambiguity: the alternates list
// always carries the octave-related candidates with their salience.
#pragma once

#include "keydock/Fft.h"
#include "keydock/Types.h"

#include <vector>

namespace keydock
{

class TempoDetector
{
public:
    explicit TempoDetector(double sampleRate = kAnalysisSampleRate);

    TempoResult analyse(const std::vector<float>& mono);

    /// Exposed for tests.
    const std::vector<float>& lastOdf() const noexcept { return odf_; }
    double odfRate() const noexcept { return sampleRate_ / kHopSize; }

private:
    static constexpr int kFftOrder  = 10;        // 1024 samples @ 22050 Hz
    static constexpr int kFrameSize = 1 << kFftOrder;
    static constexpr int kHopSize   = 256;       // -> 86.13 Hz ODF rate
    static constexpr int kNumBands  = 24;

    double             sampleRate_;
    Fft                fft_;
    std::vector<float> window_;
    std::vector<float> frame_;
    std::vector<float> magnitudes_;
    std::vector<int>   bandEdges_;
    std::vector<float> prevBands_;
    std::vector<float> odf_;

    /// Onset energy on the beat grid versus halfway between beats, measured
    /// at the best-fitting phase. Comparable offbeat energy means the grid is
    /// an octave too slow.
    struct GridStats
    {
        float onbeatMean  = 0.0f;
        float offbeatMean = 0.0f;
        float globalMean  = 0.0f;
        float score       = 0.0f;   ///< 0..1, how much beats stand out
        float offbeatRatio() const
        {
            return onbeatMean > 1.0e-9f ? offbeatMean / onbeatMean : 0.0f;
        }
    };

    void      buildOdf(const std::vector<float>& mono);
    float     combSalience(const std::vector<float>& acf, double lag) const;
    GridStats gridStats(float bpm) const;
};

} // namespace keydock
