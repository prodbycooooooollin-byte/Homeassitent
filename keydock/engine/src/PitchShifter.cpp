#include "keydock/PitchShifter.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace
{
constexpr double kPi    = 3.14159265358979323846;
constexpr double kTwoPi = 2.0 * kPi;

/// Wraps a phase difference into -pi .. pi.
double wrapPhase(double phase)
{
    phase = std::fmod(phase + kPi, kTwoPi);
    if (phase < 0.0)
        phase += kTwoPi;
    return phase - kPi;
}
} // namespace

namespace keydock
{

PitchShifter::PitchShifter(double sampleRate)
    : sampleRate_(sampleRate), fft_(kFftOrder)
{
    window_ = hannWindow(kFrameSize);
    frame_.assign(static_cast<size_t>(kFrameSize), 0.0f);
    spectrum_.assign(static_cast<size_t>(kFrameSize) * 2, 0.0f);

    const size_t bins = static_cast<size_t>(kFrameSize / 2 + 1);
    magnitude_.assign(bins, 0.0f);
    phase_.assign(bins, 0.0f);
    lastPhase_.assign(bins, 0.0f);
    sumPhase_.assign(bins, 0.0f);
    envelope_.assign(bins, 0.0f);
    shiftedEnvelope_.assign(bins, 0.0f);
}

double PitchShifter::ratioFor(const Options& options)
{
    const double semitones = options.semitones + options.cents / 100.0;
    return std::pow(2.0, semitones / 12.0);
}

void PitchShifter::spectralEnvelope(const std::vector<float>& magnitude,
                                    std::vector<float>& envelope)
{
    // Cepstral liftering: the low quefrency part of the log spectrum is the
    // envelope (the resonances of the instrument or voice), the rest is the
    // harmonic structure that the pitch shift is supposed to move.
    const int n = kFrameSize;
    const size_t bins = magnitude.size();

    std::vector<float> work(static_cast<size_t>(n) * 2, 0.0f);
    for (size_t k = 0; k < bins; ++k)
    {
        const float logMag = std::log(std::max(1.0e-7f, magnitude[k]));
        work[2 * k] = logMag;
        // Mirror for a real cepstrum.
        if (k > 0 && k < bins - 1)
            work[2 * (static_cast<size_t>(n) - k)] = logMag;
    }

    fft_.inverseComplex(work);

    // Keep roughly the first 40 cepstral coefficients: smooth enough to be an
    // envelope, detailed enough to hold formants.
    constexpr int kLifter = 40;
    for (int q = kLifter; q < n - kLifter; ++q)
    {
        work[static_cast<size_t>(2 * q)]     = 0.0f;
        work[static_cast<size_t>(2 * q + 1)] = 0.0f;
    }

    fft_.forwardComplex(work);

    envelope.resize(bins);
    for (size_t k = 0; k < bins; ++k)
        envelope[k] = std::exp(work[2 * k]);
}

std::vector<float> PitchShifter::timeStretch(const std::vector<float>& input,
                                             double factor)
{
    const size_t bins = static_cast<size_t>(kFrameSize / 2 + 1);
    const int synthesisHop = std::max(1, static_cast<int>(std::lround(kAnalysisHop * factor)));

    std::fill(lastPhase_.begin(), lastPhase_.end(), 0.0f);
    std::fill(sumPhase_.begin(), sumPhase_.end(), 0.0f);
    // Without this the first frame's flux is measured against whatever the
    // previous call left behind, which reads as a transient every time.
    std::fill(magnitude_.begin(), magnitude_.end(), 0.0f);

    const size_t frames = input.size() > static_cast<size_t>(kFrameSize)
                        ? (input.size() - kFrameSize) / kAnalysisHop + 1 : 1;
    const size_t outputLength = static_cast<size_t>(frames) * synthesisHop + kFrameSize;

    std::vector<float> output(outputLength, 0.0f);
    std::vector<float> windowSum(outputLength, 0.0f);

    float previousFlux = 0.0f;

    for (size_t f = 0; f < frames; ++f)
    {
        const size_t start = f * kAnalysisHop;

        for (int i = 0; i < kFrameSize; ++i)
        {
            const size_t idx = start + static_cast<size_t>(i);
            const float  s   = idx < input.size() ? input[idx] : 0.0f;
            spectrum_[static_cast<size_t>(2 * i)]     = s * window_[static_cast<size_t>(i)];
            spectrum_[static_cast<size_t>(2 * i + 1)] = 0.0f;
        }

        fft_.forwardComplex(spectrum_);

        float flux = 0.0f, totalMagnitude = 0.0f;
        for (size_t k = 0; k < bins; ++k)
        {
            const float re = spectrum_[2 * k];
            const float im = spectrum_[2 * k + 1];
            const float mag = std::sqrt(re * re + im * im);
            flux += std::max(0.0f, mag - magnitude_[k]);
            totalMagnitude += mag;
            magnitude_[k] = mag;
            phase_[k]     = std::atan2(im, re);
        }

        // A sharp rise in energy is a transient. Carrying the accumulated
        // synthesis phase across one smears the attack, so start it afresh.
        //
        // The test has to be relative to the frame's own energy. An absolute
        // threshold fired on rounding noise in a steady tone, and every
        // spurious phase reset detunes the output - up to 6 cents, measured.
        const bool transient = f > 0
                            && flux > 0.45f * totalMagnitude
                            && flux > 1.5f * previousFlux;
        previousFlux = 0.6f * previousFlux + 0.4f * flux;

        for (size_t k = 0; k < bins; ++k)
        {
            const double omega = kTwoPi * static_cast<double>(k) * kAnalysisHop / kFrameSize;
            const double delta = wrapPhase(phase_[k] - lastPhase_[k] - omega);
            const double trueFreq = omega + delta;

            lastPhase_[k] = phase_[k];

            if (transient)
                sumPhase_[k] = phase_[k];
            else
                sumPhase_[k] = static_cast<float>(
                    wrapPhase(sumPhase_[k] + trueFreq * synthesisHop / kAnalysisHop));

            const float mag = magnitude_[k];
            spectrum_[2 * k]     = mag * std::cos(sumPhase_[k]);
            spectrum_[2 * k + 1] = mag * std::sin(sumPhase_[k]);
        }

        // Rebuild the negative frequencies as the conjugate mirror.
        for (size_t k = 1; k < bins - 1; ++k)
        {
            const size_t mirror = static_cast<size_t>(kFrameSize) - k;
            spectrum_[2 * mirror]     =  spectrum_[2 * k];
            spectrum_[2 * mirror + 1] = -spectrum_[2 * k + 1];
        }

        fft_.inverseComplex(spectrum_);

        const size_t outStart = f * static_cast<size_t>(synthesisHop);
        for (int i = 0; i < kFrameSize; ++i)
        {
            const size_t idx = outStart + static_cast<size_t>(i);
            if (idx >= output.size())
                break;
            const float w = window_[static_cast<size_t>(i)];
            output[idx]    += spectrum_[static_cast<size_t>(2 * i)] * w;
            windowSum[idx] += w * w;
        }
    }

    // Normalise by the overlapping window energy so the level is unchanged.
    for (size_t i = 0; i < output.size(); ++i)
        if (windowSum[i] > 1.0e-6f)
            output[i] /= windowSum[i];

    return output;
}

std::vector<float> PitchShifter::process(const std::vector<float>& input,
                                         const Options& options)
{
    const double ratio = ratioFor(options);

    if (input.empty())
        return {};

    // Nothing to do: hand back the input untouched rather than running it
    // through the vocoder and adding artefacts for no reason.
    if (std::abs(ratio - 1.0) < 1.0e-6)
        return input;

    if (static_cast<int>(input.size()) < kFrameSize * 2)
        return input;

    // Stretch by the ratio, then replay that much faster: the duration comes
    // back to where it started and every partial has moved by `ratio`.
    std::vector<float> stretched = timeStretch(input, ratio);

    resampler_.reset(1.0, 1.0 / ratio);
    std::vector<float> shifted;
    shifted.reserve(input.size() + 64);
    resampler_.process(stretched.data(), stretched.size(), shifted);
    resampler_.flush(shifted);

    // Formant correction, applied after the shift: divide out the envelope the
    // shift dragged along and multiply the original one back in.
    if (options.preserveFormants && shifted.size() >= static_cast<size_t>(kFrameSize) * 2)
    {
        const size_t bins = static_cast<size_t>(kFrameSize / 2 + 1);
        const size_t frames = (shifted.size() - kFrameSize) / kAnalysisHop + 1;

        std::vector<float> corrected(shifted.size(), 0.0f);
        std::vector<float> windowSum(shifted.size(), 0.0f);
        std::vector<float> sourceMag(bins, 0.0f);

        for (size_t f = 0; f < frames; ++f)
        {
            const size_t start = f * kAnalysisHop;

            // Envelope of the untouched source at the same position.
            for (int i = 0; i < kFrameSize; ++i)
            {
                const size_t idx = start + static_cast<size_t>(i);
                const float  s   = idx < input.size() ? input[idx] : 0.0f;
                spectrum_[static_cast<size_t>(2 * i)]     = s * window_[static_cast<size_t>(i)];
                spectrum_[static_cast<size_t>(2 * i + 1)] = 0.0f;
            }
            fft_.forwardComplex(spectrum_);
            for (size_t k = 0; k < bins; ++k)
                sourceMag[k] = std::sqrt(spectrum_[2 * k] * spectrum_[2 * k]
                                       + spectrum_[2 * k + 1] * spectrum_[2 * k + 1]);
            spectralEnvelope(sourceMag, envelope_);

            // Envelope of the shifted signal.
            for (int i = 0; i < kFrameSize; ++i)
            {
                const size_t idx = start + static_cast<size_t>(i);
                const float  s   = idx < shifted.size() ? shifted[idx] : 0.0f;
                spectrum_[static_cast<size_t>(2 * i)]     = s * window_[static_cast<size_t>(i)];
                spectrum_[static_cast<size_t>(2 * i + 1)] = 0.0f;
            }
            fft_.forwardComplex(spectrum_);
            for (size_t k = 0; k < bins; ++k)
                magnitude_[k] = std::sqrt(spectrum_[2 * k] * spectrum_[2 * k]
                                        + spectrum_[2 * k + 1] * spectrum_[2 * k + 1]);
            spectralEnvelope(magnitude_, shiftedEnvelope_);

            for (size_t k = 0; k < bins; ++k)
            {
                const float gain = std::clamp(
                    envelope_[k] / std::max(1.0e-7f, shiftedEnvelope_[k]), 0.1f, 10.0f);
                spectrum_[2 * k]     *= gain;
                spectrum_[2 * k + 1] *= gain;
            }
            for (size_t k = 1; k < bins - 1; ++k)
            {
                const size_t mirror = static_cast<size_t>(kFrameSize) - k;
                spectrum_[2 * mirror]     =  spectrum_[2 * k];
                spectrum_[2 * mirror + 1] = -spectrum_[2 * k + 1];
            }

            fft_.inverseComplex(spectrum_);

            for (int i = 0; i < kFrameSize; ++i)
            {
                const size_t idx = start + static_cast<size_t>(i);
                if (idx >= corrected.size())
                    break;
                const float w = window_[static_cast<size_t>(i)];
                corrected[idx]  += spectrum_[static_cast<size_t>(2 * i)] * w;
                windowSum[idx]  += w * w;
            }
        }

        for (size_t i = 0; i < corrected.size(); ++i)
            if (windowSum[i] > 1.0e-6f)
                corrected[i] /= windowSum[i];
            else
                corrected[i] = shifted[i];

        shifted.swap(corrected);
    }

    // The vocoder plus resampler lands within a few samples of the original
    // length; trim or pad so the caller always gets exactly what it gave.
    shifted.resize(input.size(), 0.0f);
    return shifted;
}

} // namespace keydock
