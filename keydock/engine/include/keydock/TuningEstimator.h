// Estimates how far a sample sits from equal temperament.
//
// Measures a tuning offset per frame and then asks whether those per-frame
// estimates agree. Vibrato, pitch bends, drums and material that mixes
// differently tuned instruments all produce scattered estimates, and reporting
// their average as "the" detuning would be a fabrication - so disagreement is
// reported as unreliable instead.
#pragma once

#include "keydock/Fft.h"
#include "keydock/Types.h"

#include <vector>

namespace keydock
{

struct TuningResult
{
    /// Deviation from the reference in cents, -50 .. +50.
    float      cents = 0.0f;
    /// Spread of the per-frame estimates, in cents. Large means the material
    /// has no single tuning.
    float      spreadCents = 0.0f;
    /// How many frames carried usable pitch content.
    int        usableFrames = 0;
    Confidence confidence = Confidence::none;
    /// True when a correction is worth offering at all.
    bool       reliable = false;
    std::string note;

    /// The correction that would bring the sample onto the reference.
    float suggestedCorrectionCents() const { return -cents; }
};

class TuningEstimator
{
public:
    explicit TuningEstimator(double sampleRate = kAnalysisSampleRate);

    /// @param referenceHz  concert pitch for A4; 440 by default.
    TuningResult analyse(const std::vector<float>& mono, double referenceHz = 440.0);

private:
    static constexpr int kFftOrder  = 13;          // 8192 @ 22050 Hz
    static constexpr int kFrameSize = 1 << kFftOrder;
    static constexpr int kHopSize   = kFrameSize / 2;

    double             sampleRate_;
    Fft                fft_;
    std::vector<float> window_, frame_, magnitudes_;
};

} // namespace keydock
