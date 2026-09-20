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

/// Quadratic interpolation through the three nearest samples.
///
/// Linear interpolation cannot be used here: it can never exceed its two
/// endpoints, so the maximum of a linearly interpolated curve always lands on
/// an integer lag. At 135 BPM the neighbouring integer lags are 136.0 and
/// 132.5 BPM, which is why the estimate used to snap to 136 and could not
/// reach 135 at all. A parabola through three samples has a genuine
/// sub-sample maximum.
float interpolateAt(const std::vector<float>& v, double x)
{
    if (x < 1.0 || x >= static_cast<double>(v.size()) - 1.0)
        return 0.0f;

    const int    i = static_cast<int>(x + 0.5);
    if (i < 1 || i + 1 >= static_cast<int>(v.size()))
        return 0.0f;

    const double d  = x - i;                       // -0.5 .. 0.5
    const double y0 = v[static_cast<size_t>(i - 1)];
    const double y1 = v[static_cast<size_t>(i)];
    const double y2 = v[static_cast<size_t>(i + 1)];

    // p(d) = y1 + d*(y2 - y0)/2 + d^2*(y0 - 2*y1 + y2)/2
    const double value = y1 + 0.5 * d * (y2 - y0)
                            + 0.5 * d * d * (y0 - 2.0 * y1 + y2);
    return static_cast<float>(value);
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

        // Read the autocorrelation exactly at the multiple. An earlier version
        // took a local maximum around it to tolerate a slightly-off period,
        // but that let every multiple drift independently and destroyed the
        // precision the higher multiples exist to provide: one ODF frame is
        // ~3.5 BPM at 135 BPM, so the smear alone cost about a whole BPM.
        sum  += kWeight[m - 1] * interpolateAt(acf, l);
        norm += kWeight[m - 1];
    }
    return norm > 0.0f ? sum / norm : 0.0f;
}

TempoDetector::GridStats TempoDetector::gridStats(float bpm) const
{
    GridStats stats;
    if (bpm <= 0.0f || odf_.empty())
        return stats;

    const double period = 60.0 * odfRate() / bpm;
    if (period < 4.0)
        return stats;

    stats.globalMean = std::accumulate(odf_.begin(), odf_.end(), 0.0f)
                     / static_cast<float>(odf_.size());
    if (stats.globalMean <= 1.0e-9f)
        return stats;

    // Allow +/- 1 ODF frame of jitter (~12 ms) when sampling the grid.
    const auto sampleAround = [this](double p)
    {
        float local = 0.0f;
        for (double d = -1.0; d <= 1.0; d += 1.0)
            local = std::max(local, interpolateAt(odf_, p + d));
        return local;
    };

    // Try every phase within one beat and keep the best-aligned one.
    double bestPhase = 0.0;
    float  bestSum   = -1.0f;
    for (double phase = 0.0; phase < period; phase += 0.5)
    {
        float sum = 0.0f;
        int   n   = 0;
        for (double p = phase; p < static_cast<double>(odf_.size()) - 2.0; p += period)
        {
            sum += sampleAround(p);
            ++n;
        }
        if (n > 0 && sum / n > bestSum)
        {
            bestSum   = sum / n;
            bestPhase = phase;
        }
    }
    if (bestSum < 0.0f)
        return stats;

    stats.onbeatMean = bestSum;

    // Halfway between the beats. If those carry comparable energy, an onset
    // sits on every other position too and the real tactus is twice as fast.
    float offSum = 0.0f;
    int   offN   = 0;
    for (double p = bestPhase + period * 0.5;
         p < static_cast<double>(odf_.size()) - 2.0; p += period)
    {
        offSum += sampleAround(p);
        ++offN;
    }
    if (offN > 0)
        stats.offbeatMean = offSum / offN;

    // Deliberately free of any period term: an earlier version multiplied by
    // the beat period, which made every slower candidate score higher and
    // biased the octave decision towards half time.
    stats.score = std::min(1.0f, stats.onbeatMean / (2.0f * stats.globalMean));
    return stats;
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

    for (double bpm = kMinBpm; bpm <= kMaxBpm; bpm += 0.05)
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

    const auto salienceAt = [&](double bpm) -> float
    {
        if (bpm < kMinBpm * 0.4 || bpm > kMaxBpm * 2.5)
            return 0.0f;
        return combSalience(acf, 60.0 * odfRate() / bpm);
    };

    // ---- Decide the metrical level on evidence, not on the prior alone ----
    // Autocorrelation is nearly blind between a tempo and its half: a backbeat
    // correlates strongly at both, and the prior then decides, which drags
    // genuinely fast material (drum & bass, trap at 140-175) down an octave.
    // The grid statistics settle it: while the positions halfway between the
    // beats carry comparable onset energy, every other onset is being ignored
    // and the real tactus is twice as fast.
    double chosenBpm = bestWeighted->bpm;
    for (int step = 0; step < 2; ++step)
    {
        const double doubled = chosenBpm * 2.0;
        if (doubled > kMaxBpm)
            break;
        if (gridStats(static_cast<float>(chosenBpm)).offbeatRatio() < 0.6f)
            break;
        chosenBpm = doubled;
    }
    const float chosenSal = salienceAt(chosenBpm);

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
    const float gridScore = gridStats(result.bpm).score;

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
