// Exercises the capture state machine on a real worker thread, with a
// simulated audio thread pushing blocks. This is the plugin's actual
// AnalysisController - only JUCE's AudioProcessor wrapper is absent.
#include "TestSignals.h"

#include "AnalysisController.h"
#include "keydock/Types.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>

using namespace keydock;

namespace
{
int gFailures = 0;
int gChecks   = 0;

void check(bool ok, const std::string& what, const std::string& detail = {})
{
    ++gChecks;
    std::printf("  [%s] %s%s%s\n", ok ? " ok " : "FAIL", what.c_str(),
                detail.empty() ? "" : "  --  ", detail.c_str());
    if (! ok)
        ++gFailures;
}

constexpr double kRate  = 44100.0;
constexpr int    kBlock = 512;

/// Feeds audio the way a host would, but faster than real time. The pacing
/// keeps the ring buffer from overflowing, exactly as a real host's 1x rate
/// would.
void feed(AnalysisController& c, const std::vector<float>& mono, double speedup = 16.0,
          const std::atomic<bool>* abort = nullptr)
{
    const size_t chunk = static_cast<size_t>(kRate * 0.25);
    const auto sleepPerChunk = std::chrono::microseconds(
        static_cast<long long>(0.25e6 / speedup));

    for (size_t i = 0; i < mono.size(); i += chunk)
    {
        if (abort != nullptr && abort->load())
            return;
        const size_t n = std::min(chunk, mono.size() - i);
        for (size_t j = 0; j < n; j += kBlock)
        {
            const int blockSize = static_cast<int>(std::min<size_t>(kBlock, n - j));
            const float* ptr = mono.data() + i + j;
            const float* channels[2] = { ptr, ptr };
            c.pushAudio(channels, 2, blockSize);
        }
        std::this_thread::sleep_for(sleepPerChunk);
    }
}

bool waitForStatus(AnalysisController& c, ipc::Status wanted, int timeoutMs)
{
    const auto deadline = std::chrono::steady_clock::now()
                        + std::chrono::milliseconds(timeoutMs);
    while (std::chrono::steady_clock::now() < deadline)
    {
        const auto s = c.snapshot();
        if (s.status == wanted)
            return true;
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return false;
}

bool waitForResult(AnalysisController& c, AnalysisController::Snapshot& out, int timeoutMs)
{
    const auto deadline = std::chrono::steady_clock::now()
                        + std::chrono::milliseconds(timeoutMs);
    while (std::chrono::steady_clock::now() < deadline)
    {
        out = c.snapshot();
        if (out.haveResult && (out.status == ipc::Status::haveResult
                            || out.status == ipc::Status::unsuitable))
            return true;
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    out = c.snapshot();
    return false;
}
} // namespace

int main()
{
    const auto cMajor  = test::renderProgression(0, false, 120.0, 14.0, kRate);
    const auto fsMinor = test::renderProgression(6, true,  90.0, 14.0, kRate);
    const auto silence = test::renderSilence(3.0, kRate);

    std::printf("\n== The analyser only reads the audio it is given ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);

        std::vector<float> block(kBlock);
        for (int i = 0; i < kBlock; ++i)
            block[static_cast<size_t>(i)] = std::sin(i * 0.05f);
        const std::vector<float> original = block;

        const float* channels[2] = { block.data(), block.data() };
        c.startAnalysis(10.0f);
        std::this_thread::sleep_for(std::chrono::milliseconds(60));
        for (int rep = 0; rep < 50; ++rep)
            c.pushAudio(channels, 2, kBlock);

        check(block == original,
              "pushAudio leaves the caller's buffer bit-identical");
    }

    std::printf("\n== Idle instances capture nothing ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);
        feed(c, cMajor, 64.0);
        const auto s = c.snapshot();
        check(! s.haveResult && s.status == ipc::Status::ready,
              "audio arriving before Analysieren is not captured",
              std::to_string(static_cast<int>(s.status)));
    }

    std::printf("\n== Waiting for audio instead of analysing silence ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);
        c.startAnalysis(8.0f);

        std::thread feeder([&] { feed(c, silence, 8.0); });
        const bool waited = waitForStatus(c, ipc::Status::waitingForAudio, 1500);
        feeder.join();
        check(waited, "a silent input holds the state at 'Warte auf Audio'");

        // Now give it something audible; the silent lead-in must not count.
        std::thread feeder2([&] { feed(c, cMajor); });
        AnalysisController::Snapshot s;
        const bool got = waitForResult(c, s, 8000);
        feeder2.join();

        check(got && s.result.valid && s.result.key.best.tonic == 0,
              "analysis starts at the first audible sample",
              got ? keyName(s.result.key.best.tonic, s.result.key.best.isMinor)
                  : "timed out");
    }

    std::printf("\n== A new analysis discards the previous capture ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);

        // Start on C major, then interrupt part-way with a new analysis.
        // The first feeder is stopped and joined first: a real host has a
        // single audio thread, so two feeders would mix two samples together
        // and test nothing.
        std::atomic<bool> abortFirst { false };
        c.startAnalysis(12.0f);
        std::thread first([&] { feed(c, cMajor, 16.0, &abortFirst); });
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
        abortFirst.store(true);
        first.join();

        const uint32_t firstId = c.snapshot().analysisId;

        c.startAnalysis(10.0f);
        std::thread second([&] { feed(c, fsMinor); });
        AnalysisController::Snapshot s;
        const bool got = waitForResult(c, s, 10000);
        second.join();

        check(got && s.analysisId != firstId,
              "the restart produces a new analysis id",
              std::to_string(s.analysisId) + " vs " + std::to_string(firstId));
        check(got && s.result.valid && s.result.key.best.tonic == 6
              && s.result.key.best.isMinor,
              "the second sample is not contaminated by the first",
              got ? keyName(s.result.key.best.tonic, s.result.key.best.isMinor)
                  : "timed out");
    }

    std::printf("\n== Cancel leaves no stale result behind ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);
        c.startAnalysis(12.0f);

        std::thread feeder([&] { feed(c, cMajor); });
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        c.cancel();
        feeder.join();

        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        const auto s = c.snapshot();
        check(! s.haveResult,
              "a cancelled analysis never publishes a result");

        // A late result from the cancelled run must not appear afterwards.
        std::this_thread::sleep_for(std::chrono::milliseconds(800));
        check(! c.snapshot().haveResult,
              "no late result arrives after the cancel");
    }

    std::printf("\n== Manual stop analyses what was captured ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);
        c.startAnalysis(0.0f);        // 0 = capture until stopped

        std::thread feeder([&] { feed(c, cMajor); });
        feeder.join();
        c.stopCaptureAndAnalyse();

        AnalysisController::Snapshot s;
        const bool got = waitForResult(c, s, 8000);
        check(got && s.result.valid && s.result.key.best.tonic == 0,
              "manual stop yields a result from the captured audio",
              got ? keyName(s.result.key.best.tonic, s.result.key.best.isMinor)
                  : "timed out");
    }

    std::printf("\n== Reset clears the displayed result ==\n");
    {
        AnalysisController c;
        c.prepare(kRate, kBlock);
        c.startAnalysis(10.0f);
        std::thread feeder([&] { feed(c, cMajor); });
        AnalysisController::Snapshot s;
        waitForResult(c, s, 8000);
        feeder.join();

        c.reset();
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        const auto after = c.snapshot();
        check(! after.haveResult && after.status == ipc::Status::ready,
              "reset returns the instance to 'Bereit'");
    }

    std::printf("\n%d checks, %d failures\n", gChecks, gFailures);
    return gFailures == 0 ? 0 : 1;
}
