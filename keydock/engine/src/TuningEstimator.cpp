#include "keydock/TuningEstimator.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace
{
constexpr double kPi = 3.14159265358979323846;
}

namespace keydock
{

TuningEstimator::TuningEstimator(double sampleRate)
    : sampleRate_(sampleRate), fft_(kFftOrder)
{
    window_ = hannWindow(kFrameSize);
    frame_.resize(static_cast<size_t>(kFrameSize));
}

TuningResult TuningEstimator::analyse(const std::vector<float>& mono,
                                      double referenceHz)
{
    TuningResult result;

    if (referenceHz < 380.0 || referenceHz > 500.0)
        referenceHz = 440.0;

    if (static_cast<int>(mono.size()) < kFrameSize * 2)
    {
        result.note = "Zu kurz für eine Stimmungsmessung.";
        return result;
    }

    const double binHz  = sampleRate_ / kFrameSize;
    const int    minBin = std::max(2, static_cast<int>(65.0 / binHz));    // ~C2
    const int    maxBin = static_cast<int>(2000.0 / binHz);

    // Each frame contributes a unit vector at twice its semitone offset angle,
    // so +50 and -50 cents land in the same place - they are the same tuning
    // seen from the two neighbouring semitones.
    std::vector<float> frameCents;
    frameCents.reserve(mono.size() / kHopSize + 1);

    // Counted separately so "no usable frames" can be told apart from "plenty
    // of audio, but its partials never agree on a tuning".
    int tonalFrames = 0;

    for (size_t start = 0; start + kFrameSize <= mono.size(); start += kHopSize)
    {
        float rms = 0.0f;
        for (int i = 0; i < kFrameSize; ++i)
        {
            const float s = mono[start + static_cast<size_t>(i)];
            rms += s * s;
            frame_[static_cast<size_t>(i)] = s * window_[static_cast<size_t>(i)];
        }
        if (std::sqrt(rms / kFrameSize) < 1.0e-4f)
            continue;

        fft_.magnitudeSpectrum(frame_.data(), magnitudes_);

        const int top = std::min(maxBin, static_cast<int>(magnitudes_.size()) - 2);
        float peak = 0.0f;
        for (int i = minBin; i <= top; ++i)
            peak = std::max(peak, magnitudes_[static_cast<size_t>(i)]);
        if (peak <= 1.0e-6f)
            continue;

        // Weighted circular mean over the strong partials of this frame.
        double sumSin = 0.0, sumCos = 0.0, weightSum = 0.0;
        for (int i = minBin; i <= top; ++i)
        {
            const float m  = magnitudes_[static_cast<size_t>(i)];
            const float lo = magnitudes_[static_cast<size_t>(i - 1)];
            const float hi = magnitudes_[static_cast<size_t>(i + 1)];
            if (m < peak * 0.15f || m <= lo || m < hi)
                continue;

            const float denom = lo - 2.0f * m + hi;
            const float delta = std::abs(denom) > 1.0e-12f
                              ? 0.5f * (lo - hi) / denom : 0.0f;
            const double freq = (i + delta) * binHz;
            if (freq < 65.0)
                continue;

            const double semitones = 12.0 * std::log2(freq / referenceHz);
            const double offset    = semitones - std::round(semitones);   // -0.5..0.5
            const double angle     = 2.0 * kPi * offset;                  // full turn

            sumSin += m * std::sin(angle);
            sumCos += m * std::cos(angle);
            weightSum += m;
        }

        if (weightSum <= 1.0e-6)
            continue;

        ++tonalFrames;

        const double length = std::sqrt(sumSin * sumSin + sumCos * sumCos) / weightSum;
        // A frame whose partials disagree with each other is not evidence of a
        // tuning; it is noise or a chord of differently tuned instruments.
        if (length < 0.55)
            continue;

        const double angle = std::atan2(sumSin, sumCos);
        frameCents.push_back(static_cast<float>(angle / (2.0 * kPi) * 100.0));
    }

    result.usableFrames = static_cast<int>(frameCents.size());
    if (result.usableFrames < 6)
    {
        result.note = tonalFrames >= 6
            ? "Kein einheitliches Stimmungsbild - die Obertöne widersprechen "
              "sich, etwa bei verschieden gestimmten Instrumenten."
            : "Zu wenig tonales Material für eine Stimmungsmessung.";
        return result;
    }

    // Combine the per-frame estimates circularly too, so a sample sitting near
    // the +-50 cent boundary is not averaged to zero.
    double sumSin = 0.0, sumCos = 0.0;
    for (float c : frameCents)
    {
        const double angle = c / 100.0 * 2.0 * kPi;
        sumSin += std::sin(angle);
        sumCos += std::cos(angle);
    }
    const double meanLength = std::sqrt(sumSin * sumSin + sumCos * sumCos)
                            / frameCents.size();
    const double meanAngle  = std::atan2(sumSin, sumCos);

    result.cents = static_cast<float>(meanAngle / (2.0 * kPi) * 100.0);

    // Circular standard deviation, expressed in cents.
    const double spread = meanLength > 1.0e-9
                        ? std::sqrt(-2.0 * std::log(meanLength)) : 10.0;
    result.spreadCents = static_cast<float>(std::min(50.0, spread / (2.0 * kPi) * 100.0));

    if (meanLength > 0.85 && result.usableFrames >= 12)
        result.confidence = Confidence::high;
    else if (meanLength > 0.7)
        result.confidence = Confidence::medium;
    else if (meanLength > 0.5)
        result.confidence = Confidence::low;
    else
        result.confidence = Confidence::none;

    result.reliable = result.confidence >= Confidence::medium;

    if (! result.reliable)
    {
        result.note = "Keine einheitliche Verstimmung - z. B. Vibrato, "
                      "Pitch-Bends oder verschieden gestimmte Instrumente.";
    }
    else if (std::abs(result.cents) < 3.0f)
    {
        result.note = "Sample ist sauber gestimmt.";
    }
    else
    {
        result.note = std::string("Sample liegt ")
                    + (result.cents > 0.0f ? "zu hoch" : "zu tief") + ".";
    }

    return result;
}

} // namespace keydock
