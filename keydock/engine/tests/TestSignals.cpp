#include "TestSignals.h"

#include <cmath>
#include <random>

namespace
{
constexpr double kPi = 3.14159265358979323846;

double midiToHz(double midi) { return 440.0 * std::pow(2.0, (midi - 69.0) / 12.0); }
} // namespace

namespace keydock::test
{

std::vector<float> renderSilence(double seconds, double sampleRate)
{
    return std::vector<float>(static_cast<size_t>(seconds * sampleRate), 0.0f);
}

std::vector<float> renderWhiteNoise(double seconds, double sampleRate, unsigned seed)
{
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-0.3f, 0.3f);
    std::vector<float> out(static_cast<size_t>(seconds * sampleRate));
    for (auto& s : out)
        s = dist(rng);
    return out;
}

std::vector<float> renderSingleTone(double freq, double seconds, double sampleRate)
{
    std::vector<float> out(static_cast<size_t>(seconds * sampleRate));
    for (size_t i = 0; i < out.size(); ++i)
        out[i] = 0.4f * static_cast<float>(std::sin(2.0 * kPi * freq * i / sampleRate));
    return out;
}

std::vector<float> renderProgression(int tonicPc, bool minor, double bpm,
                                     double seconds, double sampleRate, unsigned seed)
{
    // major: I - V - vi - IV
    // minor: i - iv - V - i, i.e. harmonic minor. The major V introduces the
    // raised leading tone, which is what actually separates a minor key from
    // its relative major; a natural-minor loop such as i - VI - III - VII is
    // pitch-class identical to the relative major and is covered by
    // renderAmbiguousMinorLoop() instead.
    static const int majorRoots[4] = { 0, 7, 9, 5 };
    static const int minorRoots[4] = { 0, 5, 7, 0 };
    static const int majorTriad[3] = { 0, 4, 7 };
    static const int minorTriad[3] = { 0, 3, 7 };

    std::mt19937 rng(seed);
    std::uniform_real_distribution<double> jitter(-0.002, 0.002);

    const size_t n = static_cast<size_t>(seconds * sampleRate);
    std::vector<float> out(n, 0.0f);

    const double barSeconds = 4.0 * 60.0 / bpm;   // one chord per 4/4 bar
    const size_t barSamples = static_cast<size_t>(barSeconds * sampleRate);
    if (barSamples == 0)
        return out;

    for (size_t start = 0, bar = 0; start < n; start += barSamples, ++bar)
    {
        const int root = minor ? minorRoots[bar % 4] : majorRoots[bar % 4];
        // In minor only the V chord is major; in major only vi is minor.
        const bool chordMinor = minor ? (bar % 4 != 2)
                                      : (bar % 4 == 2);
        const int* triad = chordMinor ? minorTriad : majorTriad;

        const size_t end = std::min(n, start + barSamples);
        for (int v = 0; v < 3; ++v)
        {
            const double midi = 48.0 + tonicPc + root + triad[v];
            const double f0   = midiToHz(midi) * (1.0 + jitter(rng));

            // Four harmonics with a gentle roll-off -> realistic HPCP input.
            for (int h = 1; h <= 4; ++h)
            {
                const double amp = 0.16 / (h * h);
                for (size_t i = start; i < end; ++i)
                {
                    const double t   = static_cast<double>(i - start) / sampleRate;
                    const double env = std::exp(-1.1 * t) * (1.0 - std::exp(-t * 200.0));
                    out[i] += static_cast<float>(amp * env
                                * std::sin(2.0 * kPi * f0 * h * (i / sampleRate)));
                }
            }
        }
    }
    return out;
}

std::vector<float> renderDrumLoop(double bpm, double seconds, double sampleRate, unsigned seed)
{
    std::mt19937 rng(seed);
    std::normal_distribution<float> noise(0.0f, 1.0f);

    const size_t n = static_cast<size_t>(seconds * sampleRate);
    std::vector<float> out(n, 0.0f);

    const double beatSeconds = 60.0 / bpm;
    const size_t beatSamples = static_cast<size_t>(beatSeconds * sampleRate);
    if (beatSamples == 0)
        return out;

    for (size_t beat = 0, start = 0; start < n; ++beat, start += beatSamples)
    {
        const bool kick  = (beat % 4 == 0 || beat % 4 == 2);
        const double decay = kick ? 45.0 : 120.0;
        const double gain  = kick ? 0.9 : 0.55;

        const size_t len = std::min(n - start, static_cast<size_t>(0.25 * sampleRate));
        for (size_t i = 0; i < len; ++i)
        {
            const double t   = static_cast<double>(i) / sampleRate;
            const double env = std::exp(-decay * t);
            if (kick)
            {
                // Pitch-dropping sine: percussive, no stable pitch class.
                const double f = 110.0 * std::exp(-28.0 * t) + 42.0;
                out[start + i] += static_cast<float>(gain * env * std::sin(2.0 * kPi * f * t));
            }
            else
            {
                out[start + i] += static_cast<float>(gain * env * 0.5 * noise(rng));
            }
        }
    }
    return out;
}

std::vector<float> renderAmbiguousMinorLoop(int tonicPc, double bpm, double seconds,
                                           double sampleRate, unsigned seed)
{
    // i - VI - III - VII in natural minor. Every pitch class it contains also
    // belongs to the relative major, so chroma alone cannot separate the two.
    static const int roots[4]      = { 0, 8, 3, 10 };
    static const bool isMinor[4]   = { true, false, false, false };
    static const int majorTriad[3] = { 0, 4, 7 };
    static const int minorTriad[3] = { 0, 3, 7 };

    std::mt19937 rng(seed);
    std::uniform_real_distribution<double> jitter(-0.002, 0.002);

    const size_t n = static_cast<size_t>(seconds * sampleRate);
    std::vector<float> out(n, 0.0f);

    const size_t barSamples = static_cast<size_t>(4.0 * 60.0 / bpm * sampleRate);
    if (barSamples == 0)
        return out;

    for (size_t start = 0, bar = 0; start < n; start += barSamples, ++bar)
    {
        const int* triad = isMinor[bar % 4] ? minorTriad : majorTriad;
        const size_t end = std::min(n, start + barSamples);
        for (int v = 0; v < 3; ++v)
        {
            const double f0 = midiToHz(48.0 + tonicPc + roots[bar % 4] + triad[v])
                            * (1.0 + jitter(rng));
            for (int h = 1; h <= 4; ++h)
            {
                const double amp = 0.16 / (h * h);
                for (size_t i = start; i < end; ++i)
                {
                    const double t   = static_cast<double>(i - start) / sampleRate;
                    const double env = std::exp(-1.1 * t) * (1.0 - std::exp(-t * 200.0));
                    out[i] += static_cast<float>(amp * env
                                * std::sin(2.0 * kPi * f0 * h * (i / sampleRate)));
                }
            }
        }
    }
    return out;
}

std::vector<float> mix(const std::vector<float>& a, const std::vector<float>& b, float gain)
{
    std::vector<float> out = a;
    const size_t n = std::min(a.size(), b.size());
    for (size_t i = 0; i < n; ++i)
        out[i] += b[i] * gain;
    return out;
}

} // namespace keydock::test
