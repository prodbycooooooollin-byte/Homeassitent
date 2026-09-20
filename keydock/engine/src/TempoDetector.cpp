#include "keydock/TempoDetector.h"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace
{
constexpr double kMinBpm = 50.0;
constexpr double kMaxBpm = 200.0;

// How much better a metrically related tempo must fit before the chosen level
// counts as unsupported. Measured on the test corpus: a real mix with drums
// produces a near-tie (1.01) at its correct tempo, while held chords with no
// percussion produce 1.53 at a level only the prior favours. 1.15 separates
// the two with room on both sides.
constexpr float kAlternateOutfitsChosen = 1.15f;

float interpolateAt(const std::vector<float>& v, double x)
{
    if (x <= 0.0 || x >= static_cast<double>(v.size()) - 1.0)
        return 0.0f;
    const int   i    = static_cast<int>(x);
    const float frac = static_cast<float>(x - i);
    return v[static_cast<size_t>(i)] * (1.0f - frac)
         + v[static_cast<size_t>(i + 1)] * frac;
}

/// Weak preference for perceptually central tempi, used only to pick between
/// metrical levels that the signal itself scores almost equally.
double tempoPrior(double bpm)
{
    const double octaves = std::log2(bpm / 120.0);
    return std::exp(-0.5 * (octaves / 0.85) * (octaves / 0.85));
}
} // namespace

namespace keydock
{

TempoDetector::TempoDetector(double sampleRate)
    : sampleRate_(sampleRate), fft_(kFftOrder)
{
    window_ = hannWindow(kFrameSize);
    frame_.resize(static_cast<size_t>(kFrameSize));

    // Logarithmically spaced bands from 30 Hz to just below Nyquist.
    bandEdges_.resize(static_cast<size_t>(kNumBands + 1));
    const double lo = 30.0, hi = std::min(10000.0, sampleRate_ * 0.45);
    const double binHz = sampleRate_ / kFrameSize;
    for (int b = 0; b <= kNumBands; ++b)
    {
        const double f = lo * std::pow(hi / lo, static_cast<double>(b) / kNumBands);
        bandEdges_[static_cast<size_t>(b)] = std::max(1, static_cast<int>(f / binHz));
    }
    prevBands_.assign(static_cast<size_t>(kNumBands), 0.0f);
}

void TempoDetector::buildOdf(const std::vector<float>& mono)
{
    odf_.clear();
    std::fill(prevBands_.begin(), prevBands_.end(), 0.0f);

    const int numBins = kFrameSize / 2 + 1;
    std::vector<float> bands(static_cast<size_t>(kNumBands));

    for (size_t start = 0; start + kFrameSize <= mono.size(); start += kHopSize)
    {
        for (int i = 0; i < kFrameSize; ++i)
            frame_[static_cast<size_t>(i)] =
                mono[start + static_cast<size_t>(i)] * window_[static_cast<size_t>(i)];

        fft_.magnitudeSpectrum(frame_.data(), magnitudes_);

        float flux = 0.0f;
        for (int b = 0; b < kNumBands; ++b)
        {
            const int b0 = bandEdges_[static_cast<size_t>(b)];
            const int b1 = std::min(numBins - 1, bandEdges_[static_cast<size_t>(b + 1)]);

            float sum = 0.0f;
            for (int i = b0; i <= b1; ++i)
                sum += magnitudes_[static_cast<size_t>(i)];

            // Log compression keeps quiet onsets visible next to loud ones.
            const float e = std::log1p(1000.0f * sum);
            bands[static_cast<size_t>(b)] = e;
            flux += std::max(0.0f, e - prevBands_[static_cast<size_t>(b)]);
        }

        prevBands_ = bands;
        odf_.push_back(flux);
    }

    if (odf_.size() < 8)
        return;

    // The first frame's flux is meaningless (previous frame was all zeros).
    odf_[0] = odf_.size() > 1 ? odf_[1] : 0.0f;

    // Adaptive mean removal over ~1.5 s, then half-wave rectify.
    const int win = std::max(3, static_cast<int>(odfRate() * 1.5));
    std::vector<float> smoothed(odf_.size());
    for (size_t i = 0; i < odf_.size(); ++i)
    {
        const size_t a = i > static_cast<size_t>(win / 2) ? i - win / 2 : 0;
        const size_t b = std::min(odf_.size() - 1, i + static_cast<size_t>(win / 2));
        float sum = 0.0f;
        for (size_t k = a; k <= b; ++k)
            sum += odf_[k];
        smoothed[i] = sum / static_cast<float>(b - a + 1);
    }
    for (size_t i = 0; i < odf_.size(); ++i)
        odf_[i] = std::max(0.0f, odf_[i] - smoothed[i]);

    // Unit variance so salience values are comparable across material.
    const float mean = std::accumulate(odf_.begin(), odf_.end(), 0.0f)
                     / static_cast<float>(odf_.size());
    float var = 0.0f;
    for (float v : odf_)
        var += (v - mean) * (v - mean);
    var = std::sqrt(var / static_cast<float>(odf_.size()));
    if (var > 1.0e-9f)
        for (auto& v : odf_)
            v /= var;
}

float TempoDetector::combSalience(const std::vector<float>& acf, double lag) const
{
    // Sum the autocorrelation at the beat period and its first multiples;
    // a genuine pulse produces peaks at all of them.
    constexpr int   kMultiples = 4;
    constexpr float kWeight[kMultiples] = { 1.0f, 0.75f, 0.5f, 0.35f };

    float sum = 0.0f, norm = 0.0f;
    for (int m = 1; m <= kMultiples; ++m)
    {
        const double l = lag * m;
        if (l >= static_cast<double>(acf.size()) - 1.0)
            break;
        // Take a small local max so a slightly-off period still scores.
        float best = 0.0f;
        for (double d = -1.0; d <= 1.0; d += 0.5)
            best = std::max(best, interpolateAt(acf, l + d));
        sum  += kWeight[m - 1] * best;
        norm += kWeight[m - 1];
    }
    return norm > 0.0f ? sum / norm : 0.0f;
}

float TempoDetector::beatGridScore(float bpm) const
{
    if (bpm <= 0.0f || odf_.empty())
        return 0.0f;

    const double period = 60.0 * odfRate() / bpm;
    if (period < 2.0)
        return 0.0f;

    const float total = std::accumulate(odf_.begin(), odf_.end(), 0.0f);
    if (total <= 1.0e-9f)
        return 0.0f;

    // Try every phase within one beat period and keep the best alignment.
    float best = 0.0f;
    for (double phase = 0.0; phase < period; phase += 0.5)
    {
        float sum = 0.0f;
        int   hits = 0;
        for (double p = phase; p < static_cast<double>(odf_.size()) - 1.0; p += period)
        {
            // Allow +/- 1 ODF frame of jitter (~12 ms).
            float local = 0.0f;
            for (double d = -1.0; d <= 1.0; d += 1.0)
                local = std::max(local, interpolateAt(odf_, p + d));
            sum += local;
            ++hits;
        }
        if (hits > 0)
            best = std::max(best, sum / total * static_cast<float>(period) / 3.0f);
    }
    return std::min(1.0f, best);
}

TempoResult TempoDetector::analyse(const std::vector<float>& mono)
{
    TempoResult result;

    const double minSeconds = 4.0;
    if (static_cast<double>(mono.size()) / sampleRate_ < minSeconds)
    {
        result.note = "Zu kurz fuer eine belastbare Temposchaetzung.";
        return result;
    }

    buildOdf(mono);
    if (odf_.size() < static_cast<size_t>(odfRate() * 3.0))
    {
        result.note = "Zu kurz fuer eine belastbare Temposchaetzung.";
        return result;
    }

    // ---- Is there a pulse at all? --------------------------------------
    const float odfMean = std::accumulate(odf_.begin(), odf_.end(), 0.0f)
                        / static_cast<float>(odf_.size());
    const int   strongFrames = static_cast<int>(
        std::count_if(odf_.begin(), odf_.end(), [&](float v) { return v > 2.0f * odfMean; }));
    const double seconds = static_cast<double>(mono.size()) / sampleRate_;
    const double onsetsPerSecond = strongFrames / seconds;

    if (odfMean < 1.0e-4f || onsetsPerSecond < 0.5)
    {
        result.note = "Kein verwertbarer Rhythmus erkennbar.";
        return result;
    }

    // ---- Autocorrelation of the ODF ------------------------------------
    const int maxLag = static_cast<int>(60.0 * odfRate() / kMinBpm) * 4 + 4;
    const int n      = static_cast<int>(odf_.size());
    const int lags   = std::min(maxLag, n - 1);

    std::vector<float> acf(static_cast<size_t>(lags + 1), 0.0f);
    for (int l = 0; l <= lags; ++l)
    {
        float sum = 0.0f;
        for (int i = 0; i + l < n; ++i)
            sum += odf_[static_cast<size_t>(i)] * odf_[static_cast<size_t>(i + l)];
        // Unbiased-ish normalisation so long lags are not penalised.
        acf[static_cast<size_t>(l)] = sum / static_cast<float>(n - l);
    }
    if (acf[0] > 1.0e-9f)
    {
        const float a0 = acf[0];
        for (auto& v : acf)
            v /= a0;
    }

    // ---- Salience over the tempo grid ----------------------------------
    struct Cand { double bpm; float salience; float weighted; };
    std::vector<Cand> grid;
    grid.reserve(1600);

    for (double bpm = kMinBpm; bpm <= kMaxBpm; bpm += 0.1)
    {
        const double lag = 60.0 * odfRate() / bpm;
        const float  s   = combSalience(acf, lag);
        grid.push_back({ bpm, s, static_cast<float>(s * tempoPrior(bpm)) });
    }

    const auto bestWeighted = std::max_element(
        grid.begin(), grid.end(),
        [](const Cand& a, const Cand& b) { return a.weighted < b.weighted; });

    if (bestWeighted == grid.end() || bestWeighted->salience <= 0.0f)
    {
        result.note = "Kein verwertbarer Rhythmus erkennbar.";
        return result;
    }

    const double chosenBpm = bestWeighted->bpm;
    const float  chosenSal = bestWeighted->salience;

    const auto salienceAt = [&](double bpm) -> float
    {
        if (bpm < kMinBpm * 0.4 || bpm > kMaxBpm * 2.5)
            return 0.0f;
        return combSalience(acf, 60.0 * odfRate() / bpm);
    };

    result.bpm         = static_cast<float>(chosenBpm);
    result.rhythmic    = true;
    result.octaveRatio = chosenSal > 1.0e-9f ? salienceAt(chosenBpm * 0.5) / chosenSal : 0.0f;

    // ---- Metrically related alternates ---------------------------------
    // These only change the interpretation of the same pulse; the UI offers
    // them as half/double-time toggles and never rewrites the host tempo.
    const double relatedRatios[] = { 0.5, 2.0, 2.0 / 3.0, 1.5 };
    for (double r : relatedRatios)
    {
        const double b = chosenBpm * r;
        if (b < 40.0 || b > 260.0)
            continue;
        const float s = salienceAt(b);
        result.alternates.push_back({ static_cast<float>(b),
                                      chosenSal > 1.0e-9f ? s / chosenSal : 0.0f });
    }
    std::sort(result.alternates.begin(), result.alternates.end(),
              [](const TempoCandidate& a, const TempoCandidate& b)
              { return a.salience > b.salience; });
    if (result.alternates.size() > 3)
        result.alternates.resize(3);

    // ---- Confidence -----------------------------------------------------
    const float gridScore = beatGridScore(result.bpm);

    // How much does the winner stand out from unrelated tempi?
    float offPeak = 0.0f;
    for (const auto& c : grid)
    {
        const double ratio = c.bpm / chosenBpm;
        const double oct   = std::log2(ratio);
        const bool   related = std::abs(oct) < 0.08 || std::abs(oct - 1.0) < 0.08
                            || std::abs(oct + 1.0) < 0.08
                            || std::abs(ratio - 1.5) < 0.05 || std::abs(ratio - 2.0 / 3.0) < 0.05;
        if (! related)
            offPeak = std::max(offPeak, c.salience);
    }
    const float contrast = chosenSal > 1.0e-9f ? (chosenSal - offPeak) / chosenSal : 0.0f;

    if (contrast > 0.35f && gridScore > 0.45f)
        result.confidence = Confidence::high;
    else if (contrast > 0.18f && gridScore > 0.25f)
        result.confidence = Confidence::medium;
    else if (contrast > 0.06f)
        result.confidence = Confidence::low;
    else
        result.confidence = Confidence::none;

    // The contrast measure deliberately ignores metrically related tempi, so
    // on its own it cannot see that a *related* level fits the signal better
    // than the one the prior picked. Material without percussion - pads, held
    // chords - lands exactly there, and would otherwise be reported with a
    // confidence the evidence does not support.
    float strongestAlternate = 0.0f;
    for (const auto& alt : result.alternates)
        strongestAlternate = std::max(strongestAlternate, alt.salience);

    const auto cap = [&result](Confidence ceiling)
    {
        if (result.confidence > ceiling)
            result.confidence = ceiling;
    };

    if (strongestAlternate > kAlternateOutfitsChosen)
    {
        // A related level fits the onsets better than the chosen one: only the
        // tempo prior separates them, which is not evidence.
        cap(Confidence::low);
        result.note = "Metrische Ebene unklar - eine Alternative passt besser "
                      "zum Signal als der angezeigte Wert.";
    }
    else if (strongestAlternate > 0.85f || result.octaveRatio > 0.85f)
    {
        cap(Confidence::medium);
        result.note = "Half-/Double-Time ist mehrdeutig - Alternative pruefen.";
    }
    else if (result.confidence == Confidence::none)
    {
        result.note = "Rhythmus zu schwach fuer eine sichere Tempoangabe.";
    }

    return result;
}

} // namespace keydock
