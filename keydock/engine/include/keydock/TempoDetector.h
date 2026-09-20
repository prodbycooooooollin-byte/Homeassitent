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

    void  buildOdf(const std::vector<float>& mono);
    float combSalience(const std::vector<float>& acf, double lag) const;
    float beatGridScore(float bpm) const;
};

} // namespace keydock
