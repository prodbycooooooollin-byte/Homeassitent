#include "keydock/KeyDetector.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace
{
constexpr double kPi = 3.14159265358979323846;

// Temperley (2001) key profiles, derived from the Kostka-Payne corpus.
constexpr float kTemperleyMajor[12] =
    { 5.0f, 2.0f, 3.5f, 2.0f, 4.5f, 4.0f, 2.0f, 4.5f, 2.0f, 3.5f, 1.5f, 4.0f };
constexpr float kTemperleyMinor[12] =
    { 5.0f, 2.0f, 3.5f, 4.5f, 2.0f, 4.0f, 2.0f, 4.5f, 3.5f, 2.0f, 1.5f, 4.0f };

// Krumhansl-Kessler probe-tone profiles.
constexpr float kKrumhanslMajor[12] =
    { 6.35f, 2.23f, 3.48f, 2.33f, 4.38f, 4.09f, 2.52f, 5.19f, 2.39f, 3.66f, 2.29f, 2.88f };
constexpr float kKrumhanslMinor[12] =
    { 6.33f, 2.68f, 3.52f, 5.38f, 2.60f, 3.53f, 2.54f, 4.75f, 3.98f, 2.69f, 3.34f, 3.17f };

// Above this ratio the relative key fits the chroma essentially as well as the
// winner, so the major/minor decision is not supported by the evidence.
// Measured on the engine test corpus: progressions with a clear tonic land at
// 0.57-0.66, natural-minor loops that are pitch-class identical to their
// relative major land at 0.78. See engine/tests/EngineTests.cpp.
constexpr float kRelativeAmbiguityThreshold = 0.72f;

float pearson(const float* a, const float* b, int n)
{
    float ma = 0.0f, mb = 0.0f;
    for (int i = 0; i < n; ++i) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;

    float num = 0.0f, da = 0.0f, db = 0.0f;
    for (int i = 0; i < n; ++i)
    {
        const float x = a[i] - ma;
        const float y = b[i] - mb;
        num += x * y; da += x * x; db += y * y;
    }
    const float den = std::sqrt(da * db);
    return den > 1.0e-9f ? num / den : 0.0f;
}
} // namespace

namespace keydock
{

KeyDetector::KeyDetector(double sampleRate)
    : sampleRate_(sampleRate), fft_(kFftOrder)
{
    window_ = hannWindow(kFrameSize);
    frame_.resize(static_cast<size_t>(kFrameSize));
}

void KeyDetector::accumulateFrame(float frameWeight)
{
    const int    numBins  = static_cast<int>(magnitudes_.size());
    const double binHz    = sampleRate_ / kFrameSize;
    const int    minBin   = std::max(2, static_cast<int>(55.0 / binHz));   // ~A1
    const int    maxBin   = std::min(numBins - 2, static_cast<int>(5000.0 / binHz));

    float maxMag = 0.0f;
    for (int i = minBin; i <= maxBin; ++i)
        maxMag = std::max(maxMag, magnitudes_[static_cast<size_t>(i)]);
    if (maxMag <= 1.0e-7f)
        return;

    // Peaks well below the frame maximum carry almost no harmonic information
    // and mostly add noise to the profile.
    const float peakFloor = maxMag * 0.02f;

    // Sub-harmonic weights: a measured peak may be the h-th harmonic of the
    // actual fundamental, so each peak also votes for f/h.
    constexpr int   kNumHarmonics = 4;
    constexpr float kHarmonicWeight[kNumHarmonics] = { 1.0f, 0.55f, 0.32f, 0.18f };

    std::array<float, kHpcpBins> frameHpcp {};

    for (int i = minBin; i <= maxBin; ++i)
    {
        const float m  = magnitudes_[static_cast<size_t>(i)];
        const float lo = magnitudes_[static_cast<size_t>(i - 1)];
        const float hi = magnitudes_[static_cast<size_t>(i + 1)];
        if (m < peakFloor || m <= lo || m < hi)
            continue;

        // Parabolic interpolation for a sub-bin accurate peak frequency.
        const float denom = lo - 2.0f * m + hi;
        const float delta = std::abs(denom) > 1.0e-12f ? 0.5f * (lo - hi) / denom : 0.0f;
        const double freq = (i + delta) * binHz;
        if (freq < 55.0)
            continue;

        for (int h = 0; h < kNumHarmonics; ++h)
        {
            const double f0 = freq / (h + 1);
            if (f0 < 27.5)
                break;

            const double midi = 69.0 + 12.0 * std::log2(f0 / 440.0);
            double       pc   = std::fmod(midi, 12.0);
            if (pc < 0.0) pc += 12.0;

            const double binPos = pc * (kHpcpBins / 12.0);
            const float  weight = m * kHarmonicWeight[h];

            // Spread over the two neighbouring bins so tuning offsets survive.
            const int   b0   = static_cast<int>(std::floor(binPos));
            const float frac = static_cast<float>(binPos - b0);
            frameHpcp[static_cast<size_t>(((b0 % kHpcpBins) + kHpcpBins) % kHpcpBins)]
                += weight * (1.0f - frac);
            frameHpcp[static_cast<size_t>((((b0 + 1) % kHpcpBins) + kHpcpBins) % kHpcpBins)]
                += weight * frac;
        }
    }

    // Normalise per frame so loud sections do not dominate the whole profile.
    const float frameMax = *std::max_element(frameHpcp.begin(), frameHpcp.end());
    if (frameMax <= 1.0e-9f)
        return;

    for (size_t b = 0; b < kHpcpBins; ++b)
        hpcp_[b] += frameHpcp[b] / frameMax * frameWeight;
}

float KeyDetector::estimateTuningCents() const
{
    // Circular mean over the three sub-bins of each semitone.
    double sumSin = 0.0, sumCos = 0.0;
    for (int b = 0; b < kHpcpBins; ++b)
    {
        const double phase = 2.0 * kPi * (b % 3) / 3.0;
        sumSin += hpcp_[static_cast<size_t>(b)] * std::sin(phase);
        sumCos += hpcp_[static_cast<size_t>(b)] * std::cos(phase);
    }

    if (std::abs(sumSin) < 1.0e-9 && std::abs(sumCos) < 1.0e-9)
        return 0.0f;

    double angle = std::atan2(sumSin, sumCos);           // -pi .. pi
    double frac  = angle / (2.0 * kPi) * 3.0;            // in sub-bins
    // Fold to -1.5 .. 1.5 sub-bins, i.e. -50 .. +50 cents.
    while (frac >  1.5) frac -= 3.0;
    while (frac < -1.5) frac += 3.0;
    return static_cast<float>(frac / 3.0 * 100.0);
}

KeyResult KeyDetector::analyse(const std::vector<float>& mono)
{
    KeyResult result;
    hpcp_.fill(0.0f);
    chroma_.fill(0.0f);

    if (static_cast<int>(mono.size()) < kFrameSize)
    {
        result.note = "Zu wenig Audiomaterial fuer eine Tonartanalyse.";
        return result;
    }

    // ---- STFT / HPCP accumulation -------------------------------------
    size_t frames = 0;
    for (size_t start = 0; start + kFrameSize <= mono.size(); start += kHopSize)
    {
        float rms = 0.0f;
        for (int i = 0; i < kFrameSize; ++i)
        {
            const float s = mono[start + static_cast<size_t>(i)];
            rms += s * s;
            frame_[static_cast<size_t>(i)] = s * window_[static_cast<size_t>(i)];
        }
        rms = std::sqrt(rms / kFrameSize);

        // Skip near-silent frames instead of letting them dilute the profile.
        if (rms < 1.0e-4f)
            continue;

        fft_.magnitudeSpectrum(frame_.data(), magnitudes_);
        accumulateFrame(1.0f);
        ++frames;
    }

    if (frames < 4)
    {
        result.note = "Zu wenig nutzbares Signal (fast durchgehend Stille).";
        return result;
    }

    result.tuningCents = estimateTuningCents();

    // ---- Fold the 36-bin HPCP onto 12 chroma bins, tuning-aligned ------
    const double shift = result.tuningCents / 100.0 * 3.0;  // in sub-bins
    for (int b = 0; b < kHpcpBins; ++b)
    {
        double src = b + shift;
        // Bilinear read-back so the tuning correction is not quantised.
        const int   i0   = static_cast<int>(std::floor(src));
        const float frac = static_cast<float>(src - i0);
        const auto  wrap = [](int i) { return ((i % kHpcpBins) + kHpcpBins) % kHpcpBins; };
        const float v    = hpcp_[static_cast<size_t>(wrap(i0))]     * (1.0f - frac)
                         + hpcp_[static_cast<size_t>(wrap(i0 + 1))] * frac;
        chroma_[static_cast<size_t>(b / 3)] += v;
    }

    const float chromaMax = *std::max_element(chroma_.begin(), chroma_.end());
    if (chromaMax <= 1.0e-9f)
    {
        result.note = "Kein verwertbarer harmonischer Inhalt.";
        return result;
    }
    for (auto& c : chroma_)
        c /= chromaMax;

    // ---- Tonality gates ------------------------------------------------
    const float chromaMean = std::accumulate(chroma_.begin(), chroma_.end(), 0.0f) / 12.0f;

    // Flatness: a flat profile (noise, unpitched drums) has mean close to max.
    const float flatness = chromaMean;                      // max is 1 after scaling
    const int   activeBins = static_cast<int>(
        std::count_if(chroma_.begin(), chroma_.end(), [](float c) { return c > 0.5f; }));

    if (flatness > 0.80f)
    {
        result.note = "Kein tonaler Inhalt erkennbar (z. B. Drums oder Rauschen).";
        return result;
    }
    if (activeBins < 2)
    {
        result.note = "Nur ein einzelner Ton - daraus laesst sich keine Tonart ableiten.";
        result.tonal = false;
        return result;
    }

    result.tonal = true;

    // ---- Correlate against all 24 key profiles -------------------------
    struct Scored { int tonic; bool minor; float score; };
    std::vector<Scored> scores;
    scores.reserve(24);

    std::array<float, 12> rotated {};
    for (int tonic = 0; tonic < 12; ++tonic)
    {
        for (int mode = 0; mode < 2; ++mode)
        {
            const bool   minor = (mode == 1);
            const float* tp    = minor ? kTemperleyMinor : kTemperleyMajor;
            const float* kp    = minor ? kKrumhanslMinor : kKrumhanslMajor;

            for (int i = 0; i < 12; ++i)
                rotated[static_cast<size_t>(i)] = chroma_[static_cast<size_t>((i + tonic) % 12)];

            // Ensemble of two independent profile sets: neither alone is a
            // reliable discriminator for popular-music material.
            const float s = 0.5f * (pearson(rotated.data(), tp, 12)
                                  + pearson(rotated.data(), kp, 12));
            scores.push_back({ tonic, minor, s });
        }
    }

    std::sort(scores.begin(), scores.end(),
              [](const Scored& a, const Scored& b) { return a.score > b.score; });

    result.best = { scores[0].tonic, scores[0].minor, scores[0].score };
    result.margin = scores[0].score - scores[1].score;

    for (size_t i = 1; i < scores.size() && i <= 3; ++i)
        result.alternates.push_back({ scores[i].tonic, scores[i].minor, scores[i].score });

    // ---- The relative key is always worth showing -----------------------
    // A natural-minor progression and its relative major share every pitch
    // class, so the pitch-class profile alone cannot decide between them.
    // Rather than hide that, always report the relative key and let its
    // score cap how confident we are allowed to sound.
    const int relTonic = result.best.isMinor ? (result.best.tonic + 3) % 12
                                             : (result.best.tonic + 9) % 12;
    const bool relMinor = ! result.best.isMinor;
    for (const auto& s : scores)
    {
        if (s.tonic == relTonic && s.minor == relMinor)
        {
            result.relative = { s.tonic, s.minor, s.score };
            break;
        }
    }
    if (result.best.score > 1.0e-6f)
        result.relativeCloseness =
            std::max(0.0f, std::min(1.0f, result.relative.score / result.best.score));

    // ---- Confidence, deliberately coarse -------------------------------
    // These are ordinal buckets from the score margin, NOT a calibrated
    // probability. Do not present them as a percentage.
    if (result.best.score < 0.55f)
        result.confidence = Confidence::none;
    else if (result.margin > 0.12f && result.best.score > 0.75f)
        result.confidence = Confidence::high;
    else if (result.margin > 0.06f)
        result.confidence = Confidence::medium;
    else if (result.margin > 0.02f)
        result.confidence = Confidence::low;
    else
        result.confidence = Confidence::none;

    // Never claim high confidence while the relative key is almost as good a
    // fit: the tonic would then be a guess, not a measurement.
    if (result.relativeCloseness > kRelativeAmbiguityThreshold
        && result.confidence == Confidence::high)
        result.confidence = Confidence::medium;

    // ---- Typical ambiguities worth naming ------------------------------
    if (! result.alternates.empty())
    {
        const auto& runnerUp = result.alternates.front();
        // Tonics, not modes - the outer relMinor above is a bool.
        const int   relativeMinorTonic = (result.best.tonic + 9) % 12;
        const int   relativeMajorTonic = (result.best.tonic + 3) % 12;

        const bool relative =
            (! result.best.isMinor && runnerUp.isMinor
                && runnerUp.tonic == relativeMinorTonic) ||
            (result.best.isMinor && ! runnerUp.isMinor
                && runnerUp.tonic == relativeMajorTonic);
        const bool parallel =
            runnerUp.tonic == result.best.tonic && runnerUp.isMinor != result.best.isMinor;

        if (result.relativeCloseness > kRelativeAmbiguityThreshold)
            result.note = "Tonvorrat passt genauso gut zur Parallele "
                        + keyName(result.relative.tonic, result.relative.isMinor)
                        + " - Dur/Moll nicht sicher trennbar.";
        else if (relative && result.margin < 0.08f)
            result.note = "Dur/Moll-Parallele liegt dicht dahinter - Alternative pruefen.";
        else if (parallel && result.margin < 0.08f)
            result.note = "Varianttonart (gleicher Grundton) liegt dicht dahinter.";
        else if (result.confidence == Confidence::none)
            result.note = "Mehrdeutig - moeglicher Tonartwechsel oder wenig tonales Material.";
    }

    return result;
}

} // namespace keydock
