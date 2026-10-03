// Harmonic pitch-class-profile key detection.
//
// Pipeline: STFT -> spectral peak picking -> harmonically weighted HPCP
// (36 bins, i.e. 1/3 semitone) -> tuning estimation -> 12-bin chroma ->
// correlation against major/minor key profiles (Temperley + Krumhansl-Kessler).
//
// Deliberately *not* "dominant frequency": a single loudest partial is treated
// as insufficient evidence and reported as uncertain.
#pragma once

#include "keydock/Fft.h"
#include "keydock/Types.h"

#include <array>
#include <vector>

namespace keydock
{

class KeyDetector
{
public:
    explicit KeyDetector(double sampleRate = kAnalysisSampleRate);

    /// Analyses a mono buffer at the construction sample rate.
    KeyResult analyse(const std::vector<float>& mono);

    /// Exposed for tests and for the details panel.
    const std::array<float, 12>& lastChroma() const noexcept { return chroma_; }

private:
    static constexpr int kFftOrder    = 13;          // 8192 samples @ 22050 Hz
    static constexpr int kFrameSize   = 1 << kFftOrder;
    static constexpr int kHopSize     = kFrameSize / 2;
    static constexpr int kHpcpBins    = 36;          // 3 bins per semitone

    double                        sampleRate_;
    Fft                           fft_;
    std::vector<float>            window_;
    std::vector<float>            frame_;
    std::vector<float>            magnitudes_;
    std::array<float, kHpcpBins>  hpcp_ {};
    std::array<float, 12>         chroma_ {};

    void  accumulateFrame(float frameWeight);
    float estimateTuningCents() const;
};

} // namespace keydock
