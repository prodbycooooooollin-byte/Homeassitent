// Engine acceptance tests. These run on any platform and cover the claims
// that matter most: no invented results, real audio tempo, clean isolation
// between analyses.
#include "TestSignals.h"

#include "keydock/AnalysisEngine.h"
#include "keydock/PitchShifter.h"
#include "keydock/RingBuffer.h"
#include "keydock/Types.h"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using namespace keydock;

namespace
{
int gFailures = 0;
int gChecks   = 0;

void check(bool ok, const std::string& what, const std::string& detail = {})
{
    ++gChecks;
    if (ok)
    {
        std::printf("  [ ok ] %s\n", what.c_str());
    }
    else
    {
        ++gFailures;
        std::printf("  [FAIL] %s%s%s\n", what.c_str(),
                    detail.empty() ? "" : "  --  ", detail.c_str());
    }
}

std::string describe(const AnalysisResult& r)
{
    std::string s = "valid=" + std::to_string(r.valid);
    if (r.key.best.tonic >= 0)
        s += " key=" + keyName(r.key.best.tonic, r.key.best.isMinor)
           + "(" + toString(r.key.confidence) + ", margin="
           + std::to_string(r.key.margin) + ")";
    else
        s += " key=none";
    s += " bpm=" + std::to_string(r.tempo.bpm)
       + "(" + toString(r.tempo.confidence) + ")";
    if (! r.note.empty())
        s += " note=\"" + r.note + "\"";
    return s;
}

/// Runs a buffer through the engine exactly like the plugin does:
/// host rate in, block by block, resampled onto the analysis rate.
AnalysisResult runThroughEngine(AnalysisEngine& engine,
                                const std::vector<float>& hostAudio,
                                double hostRate,
                                float maxSeconds)
{
    engine.beginCapture(hostRate, maxSeconds);
    const size_t block = 512;
    for (size_t i = 0; i < hostAudio.size(); i += block)
    {
        const size_t n = std::min(block, hostAudio.size() - i);
        engine.appendHostAudio(hostAudio.data() + i, n);
    }
    return engine.analyse();
}
} // namespace

int main()
{
    const double hostRate = 44100.0;
    AnalysisEngine engine;

    // ---------------------------------------------------------------
    std::printf("\n== Key detection on clearly tonal material ==\n");
    {
        // C major, 120 BPM.
        auto audio = test::renderProgression(0, false, 120.0, 20.0, hostRate);
        auto r = runThroughEngine(engine, audio, hostRate, 20.0f);
        check(r.valid && r.key.best.tonic == 0 && ! r.key.best.isMinor,
              "C major progression is detected as C major", describe(r));
        check(r.key.confidence != Confidence::none,
              "C major yields a non-zero confidence bucket", describe(r));
    }
    {
        // F# minor with a major V, 90 BPM.
        auto audio = test::renderProgression(6, true, 90.0, 20.0, hostRate);
        auto r = runThroughEngine(engine, audio, hostRate, 20.0f);
        check(r.valid && r.key.best.tonic == 6 && r.key.best.isMinor,
              "F# minor progression is detected as F# minor", describe(r));
        check(camelot(6, true) == "11A", "Camelot for F# minor is 11A", camelot(6, true));
    }

    std::printf("\n== Relative-key ambiguity is surfaced, not papered over ==\n");
    {
        // i - VI - III - VII in F# minor: pitch-class identical to A major.
        auto audio = test::renderAmbiguousMinorLoop(6, 100.0, 20.0, hostRate);
        auto r = runThroughEngine(engine, audio, hostRate, 20.0f);

        const bool eitherReading =
            (r.key.best.tonic == 6 && r.key.best.isMinor) ||
            (r.key.best.tonic == 9 && ! r.key.best.isMinor);
        check(eitherReading, "ambiguous loop lands on F# minor or its relative A major",
              describe(r));
        check(r.key.relativeCloseness > 0.72f,
              "the relative key is recognised as an equally good fit",
              std::to_string(r.key.relativeCloseness));
        check(r.key.confidence != Confidence::high,
              "an undecidable mode never reports high confidence", describe(r));
        check(! r.key.note.empty(), "the ambiguity is explained to the user", r.key.note);

        const int relTonic = r.key.best.isMinor ? (r.key.best.tonic + 3) % 12
                                                : (r.key.best.tonic + 9) % 12;
        check(r.key.relative.tonic == relTonic
              && r.key.relative.isMinor == ! r.key.best.isMinor,
              "the relative key is offered as an alternative",
              keyName(r.key.relative.tonic, r.key.relative.isMinor));
    }

    // ---------------------------------------------------------------
    std::printf("\n== Tempo from the audio, not from a host setting ==\n");
    for (double bpm : { 90.0, 128.0, 140.0 })
    {
        auto drums = test::renderDrumLoop(bpm, 20.0, hostRate);
        auto r = runThroughEngine(engine, drums, hostRate, 20.0f);

        const bool exact  = std::abs(r.tempo.bpm - bpm) < 2.0;
        const bool octave = std::abs(r.tempo.bpm - bpm * 2.0) < 3.0
                         || std::abs(r.tempo.bpm - bpm * 0.5) < 2.0;
        check(exact, "drum loop at " + std::to_string(static_cast<int>(bpm))
                     + " BPM is detected (octave-correct: "
                     + (octave ? "half/double" : "no") + ")", describe(r));
    }
    std::printf("\n== BPM precision and metrical level ==\n");
    {
        // Snapping must not swallow a genuinely off-grid tempo.
        auto mix = test::mix(test::renderProgression(9, true, 137.5, 22.0, hostRate),
                             test::renderDrumLoop(137.5, 22.0, hostRate), 0.8f);
        auto r = runThroughEngine(engine, mix, hostRate, 22.0f);
        check(! r.tempo.snappedToWholeBpm && std::abs(r.tempo.bpm - 137.5f) < 0.5f,
              "a genuine 137.5 BPM tempo is left unsnapped",
              std::to_string(r.tempo.bpm));
    }
    {
        // Reported from FL Studio: a 135 BPM beat displayed as 136. The cause
        // was linear interpolation of the autocorrelation, whose maximum can
        // only ever land on an integer lag - and the lags either side of
        // 135 BPM are 136.0 and 132.5, so 135 was unreachable.
        for (double bpm : { 90.0, 120.0, 128.0, 135.0, 140.0, 174.0 })
        {
            auto mix = test::mix(test::renderProgression(9, true, bpm, 22.0, hostRate),
                                 test::renderDrumLoop(bpm, 22.0, hostRate), 0.8f);
            auto r = runThroughEngine(engine, mix, hostRate, 22.0f);

            // Reported from FL Studio: a 140 BPM loop showing 139.9 reads as
            // wrong even though it is within measurement error.
            check(r.tempo.bpm == static_cast<float>(bpm),
                  "full mix at " + std::to_string(static_cast<int>(bpm))
                      + " BPM reports exactly that",
                  std::to_string(r.tempo.bpm) + " (raw "
                      + std::to_string(r.tempo.bpmRaw) + ")");
        }
    }
    {
        // Held chords with no percussion: the onset function is almost empty,
        // so the metrical level is decided by the prior rather than by the
        // audio. That must not be reported as a confident tempo.
        auto pad = test::renderProgression(0, false, 120.0, 20.0, hostRate);
        auto r = runThroughEngine(engine, pad, hostRate, 20.0f);

        float strongestAlt = 0.0f;
        for (const auto& alt : r.tempo.alternates)
            strongestAlt = std::max(strongestAlt, alt.salience);

        check(r.tempo.confidence == Confidence::none
              || r.tempo.confidence == Confidence::low,
              "chords without drums never yield a confident tempo", describe(r));
        check(strongestAlt <= 1.0f || ! r.tempo.note.empty(),
              "a better-fitting alternate is explained, not hidden", r.tempo.note);
    }
    {
        // Same audio tempo, wildly different "project tempo": the engine has
        // no access to a host tempo at all, which is the point.
        auto audio = test::mix(test::renderProgression(0, false, 128.0, 20.0, hostRate),
                               test::renderDrumLoop(128.0, 20.0, hostRate), 0.8f);
        auto r = runThroughEngine(engine, audio, hostRate, 20.0f);
        check(std::abs(r.tempo.bpm - 128.0) < 2.5,
              "full mix at 128 BPM is measured from the audio", describe(r));
    }

    // ---------------------------------------------------------------
    std::printf("\n== No invented results on unsuitable material ==\n");
    {
        auto r = runThroughEngine(engine, test::renderSilence(20.0, hostRate), hostRate, 20.0f);
        check(! r.valid && r.reason == Unsuitable::silent,
              "silence is reported as unsuitable, not as a key", describe(r));
    }
    {
        auto r = runThroughEngine(engine, test::renderWhiteNoise(20.0, hostRate),
                                  hostRate, 20.0f);
        check(r.key.confidence == Confidence::none || ! r.key.tonal,
              "white noise does not produce a confident key", describe(r));
    }
    {
        auto r = runThroughEngine(engine, test::renderSingleTone(440.0, 20.0, hostRate),
                                  hostRate, 20.0f);
        check(r.key.confidence != Confidence::high,
              "a single sustained tone is never a high-confidence key", describe(r));
        check(r.tempo.confidence != Confidence::high,
              "a single sustained tone is never a high-confidence tempo", describe(r));
    }
    {
        auto drums = test::renderDrumLoop(128.0, 20.0, hostRate);
        auto r = runThroughEngine(engine, drums, hostRate, 20.0f);
        check(r.key.confidence != Confidence::high,
              "drums alone never yield a high-confidence key", describe(r));
    }
    {
        auto tooShort = test::renderProgression(0, false, 120.0, 2.0, hostRate);
        auto r = runThroughEngine(engine, tooShort, hostRate, 20.0f);
        check(! r.valid && r.reason == Unsuitable::tooShort,
              "2 s of audio is refused as too short", describe(r));
    }

    // ---------------------------------------------------------------
    std::printf("\n== Separate analyses do not bleed into each other ==\n");
    {
        auto a = test::renderProgression(0, false, 120.0, 20.0, hostRate);   // C major
        auto b = test::renderProgression(6, true, 90.0, 20.0, hostRate);     // F# minor

        auto r1 = runThroughEngine(engine, a, hostRate, 20.0f);
        auto r2 = runThroughEngine(engine, b, hostRate, 20.0f);
        auto r3 = runThroughEngine(engine, a, hostRate, 20.0f);

        check(r1.key.best.tonic == 0 && ! r1.key.best.isMinor
              && r2.key.best.tonic == 6 && r2.key.best.isMinor,
              "a second capture is not contaminated by the first",
              describe(r1) + " | " + describe(r2));
        check(r3.key.best.tonic == r1.key.best.tonic
              && r3.key.best.isMinor == r1.key.best.isMinor,
              "re-running the first signal reproduces the first result", describe(r3));
    }

    // ---------------------------------------------------------------
    std::printf("\n== Sample-rate independence ==\n");
    {
        for (double rate : { 44100.0, 48000.0, 96000.0 })
        {
            auto audio = test::renderProgression(6, true, 90.0, 16.0, rate);
            auto r = runThroughEngine(engine, audio, rate, 16.0f);
            check(r.key.best.tonic == 6 && r.key.best.isMinor,
                  "F# minor survives a host rate of " + std::to_string(static_cast<int>(rate)),
                  describe(r));
        }
    }

    // ---------------------------------------------------------------
    std::printf("\n== Pitch shifting preserves length and lands on pitch ==\n");
    {
        const double rate = kAnalysisSampleRate;
        auto tone = test::renderSingleTone(440.0, 8.0, rate);

        // Autocorrelation rather than an FFT peak: a bin peak is only accurate
        // to a few cents, which is the size of the error being measured.
        const auto measureHz = [](const std::vector<float>& x, double sr, double near)
        {
            const size_t n = x.size(), from = n / 4;
            const size_t to = std::min(n, from + static_cast<size_t>(sr * 2.0));
            const double lag0 = sr / near;
            const int lo = static_cast<int>(lag0 * 0.7), hi = static_cast<int>(lag0 * 1.4);
            const auto ac = [&](int lag)
            {
                double acc = 0.0;
                for (size_t i = from; i + lag < to; ++i)
                    acc += static_cast<double>(x[i]) * x[i + lag];
                return acc;
            };
            int best = lo; double bestValue = -1.0e30;
            for (int l = lo; l <= hi; ++l)
            {
                const double v = ac(l);
                if (v > bestValue) { bestValue = v; best = l; }
            }
            const double a = ac(best - 1), b = ac(best), c = ac(best + 1);
            const double d = (a - 2 * b + c) != 0.0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0.0;
            return sr / (best + d);
        };

        double worstCents = 0.0;
        for (int semitones : { -12, -7, -3, -1, 1, 3, 5, 12 })
        {
            PitchShifter shifter(rate);
            PitchShifter::Options options;
            options.semitones = semitones;
            const auto out = shifter.process(tone, options);

            const double expected = 440.0 * std::pow(2.0, semitones / 12.0);
            const double cents = 1200.0 * std::log2(measureHz(out, rate, expected) / expected);
            worstCents = std::max(worstCents, std::abs(cents));

            check(out.size() == tone.size(),
                  "shifting by " + std::to_string(semitones)
                      + " semitones keeps the length exactly");
        }
        check(worstCents < 0.5,
              "every semitone shift lands within half a cent",
              "worst " + std::to_string(worstCents) + " cents");

        // The tuning correction has to be accurate at the scale it corrects.
        double worstFine = 0.0;
        for (float cents : { -50.0f, -23.0f, 23.0f, 50.0f })
        {
            PitchShifter shifter(rate);
            PitchShifter::Options options;
            options.cents = cents;
            const auto out = shifter.process(tone, options);
            const double expected = 440.0 * std::pow(2.0, cents / 1200.0);
            worstFine = std::max(worstFine, std::abs(
                1200.0 * std::log2(measureHz(out, rate, expected) / expected)));
        }
        check(worstFine < 0.5, "cent-sized corrections land within half a cent",
              "worst " + std::to_string(worstFine) + " cents");

        // Semitones and cents are separate settings; applying both must shift
        // by their sum exactly once.
        {
            PitchShifter shifter(rate);
            PitchShifter::Options options;
            options.semitones = 2;
            options.cents     = -23.0f;
            const auto out = shifter.process(tone, options);
            const double expected = 440.0 * std::pow(2.0, (2.0 - 0.23) / 12.0);
            const double cents = 1200.0 * std::log2(measureHz(out, rate, expected) / expected);
            check(std::abs(cents) < 0.5,
                  "a semitone shift and a cent correction combine once, not twice",
                  std::to_string(cents) + " cents off");
        }

        {
            PitchShifter shifter(rate);
            PitchShifter::Options options;   // no shift at all
            const auto out = shifter.process(tone, options);
            check(out == tone, "no shift returns the input untouched");
        }
    }
    {
        // The musical claim: transposing really changes the key.
        const double rate = kAnalysisSampleRate;
        auto cMajor = test::renderProgression(0, false, 120.0, 18.0, rate);

        PitchShifter shifter(rate);
        PitchShifter::Options options;
        options.semitones = 1;
        const auto shifted = shifter.process(cMajor, options);

        KeyDetector detector(rate);
        const auto before = detector.analyse(cMajor);
        const auto after  = detector.analyse(shifted);

        check(before.best.tonic == 0 && after.best.tonic == 1
              && after.best.isMinor == before.best.isMinor,
              "C major transposed up one semitone is detected as C# major",
              keyName(before.best.tonic, before.best.isMinor) + " -> "
                  + keyName(after.best.tonic, after.best.isMinor));
    }

    std::printf("\n== Capture plumbing ==\n");
    {
        RingBuffer ring;
        ring.prepare(1024);
        std::vector<float> in(700, 0.5f), out(2048, 0.0f);
        const size_t pushed = ring.push(in.data(), in.size());
        const size_t popped = ring.pop(out.data(), out.size());
        check(pushed == 700 && popped == 700 && out[699] == 0.5f,
              "ring buffer round-trips a partial block");

        ring.push(in.data(), in.size());
        ring.clear();
        check(ring.available() == 0, "ring buffer clear() drops queued audio");

        // Overflow must drop, never block or grow.
        ring.prepare(256);
        const size_t overflow = ring.push(in.data(), in.size());
        check(overflow == 256, "ring buffer drops the excess instead of allocating",
              std::to_string(overflow));
    }
    {
        AnalysisEngine e;
        e.beginCapture(44100.0, 10.0f);
        auto audio = test::renderProgression(0, false, 120.0, 30.0, 44100.0);
        e.appendHostAudio(audio.data(), audio.size());
        check(e.isFull() && e.capturedSeconds() <= 10.05f,
              "capture is hard-bounded by the configured length",
              std::to_string(e.capturedSeconds()));
    }

    std::printf("\n%d checks, %d failures\n", gChecks, gFailures);
    return gFailures == 0 ? 0 : 1;
}
