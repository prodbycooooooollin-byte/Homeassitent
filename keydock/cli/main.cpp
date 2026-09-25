// keydock-analyze - offline WAV analysis with the exact same engine the
// plugin uses. Lets you check KeyDock's accuracy against tracks whose key
// and tempo you already know, without building the VST3 or opening FL Studio.
#include "WavReader.h"

#include "keydock/AnalysisEngine.h"
#include "keydock/Types.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace keydock;

namespace
{
void printUsage()
{
    std::printf(
        "keydock-analyze - Key- und BPM-Analyse einer WAV-Datei\n\n"
        "Verwendung:\n"
        "  keydock-analyze <datei.wav> [weitere.wav ...] [Optionen]\n\n"
        "Optionen:\n"
        "  --seconds N   Nur die ersten N Sekunden auswerten (Standard: alles)\n"
        "  --offset N    Erst ab Sekunde N auswerten (Standard: 0)\n"
        "  --csv         Ausgabe als CSV-Zeile statt als Bericht\n"
        "  --help        Diese Hilfe\n\n"
        "Hinweis: Dies analysiert eine Datei. Das Plugin analysiert stattdessen\n"
        "das Signal, das live an seinem Mixer-Slot ankommt - beide Quellen\n"
        "koennen unterschiedliche Ergebnisse liefern.\n");
}

const char* confidenceWord(Confidence c)
{
    switch (c)
    {
        case Confidence::high:   return "sicher";
        case Confidence::medium: return "wahrscheinlich";
        case Confidence::low:    return "unsicher";
        default:                 return "nicht bestimmbar";
    }
}

void report(const std::string& path, const cli::WavFile& wav, const AnalysisResult& r)
{
    std::printf("\n%s\n", path.c_str());
    std::printf("  Quelle        Datei, %.1f s, %.0f Hz, %d Kanal/Kanaele\n",
                wav.seconds(), wav.sampleRate, wav.channels);

    if (! r.valid)
    {
        std::printf("  Ergebnis      KEIN ERGEBNIS - %s\n",
                    r.note.empty() ? "ungeeignetes Material" : r.note.c_str());
        return;
    }

    if (r.key.tonal && r.key.best.tonic >= 0)
    {
        std::printf("  Tonart        %-10s  %-4s  (%s)\n",
                    keyName(r.key.best.tonic, r.key.best.isMinor).c_str(),
                    camelot(r.key.best.tonic, r.key.best.isMinor).c_str(),
                    confidenceWord(r.key.confidence));
        if (r.key.relative.tonic >= 0)
            std::printf("  Parallele     %-10s  %-4s  (Aehnlichkeit %.2f)\n",
                        keyName(r.key.relative.tonic, r.key.relative.isMinor).c_str(),
                        camelot(r.key.relative.tonic, r.key.relative.isMinor).c_str(),
                        r.key.relativeCloseness);
    }
    else
    {
        std::printf("  Tonart        --  (%s)\n",
                    r.key.note.empty() ? "nicht bestimmbar" : r.key.note.c_str());
    }

    if (r.tempo.bpm > 0.0f)
    {
        std::printf("  Tempo         %.1f BPM  (%s)\n",
                    r.tempo.bpm, confidenceWord(r.tempo.confidence));
        if (! r.tempo.alternates.empty())
        {
            std::printf("  Alternativen  ");
            for (const auto& alt : r.tempo.alternates)
                std::printf("%.1f (%.2f)  ", alt.bpm, alt.salience);
            std::printf("\n");
        }
    }
    else
    {
        std::printf("  Tempo         --  (%s)\n",
                    r.tempo.note.empty() ? "nicht bestimmbar" : r.tempo.note.c_str());
    }

    std::printf("  Stimmung      %+.1f Cent gegenueber A440\n", r.key.tuningCents);
    std::printf("  Analysiert    %.1f s, Spitzenpegel %.1f dBFS\n",
                r.analysedSeconds, r.peakDb);
    if (! r.note.empty())
        std::printf("  Hinweis       %s\n", r.note.c_str());
}

void reportCsv(const std::string& path, const AnalysisResult& r)
{
    std::printf("%s,%s,%s,%s,%.1f,%s,%.1f\n",
                path.c_str(),
                r.valid && r.key.tonal ? keyName(r.key.best.tonic, r.key.best.isMinor).c_str() : "",
                r.valid && r.key.tonal ? camelot(r.key.best.tonic, r.key.best.isMinor).c_str() : "",
                confidenceWord(r.key.confidence),
                r.valid ? r.tempo.bpm : 0.0f,
                confidenceWord(r.tempo.confidence),
                r.analysedSeconds);
}
} // namespace

int main(int argc, char** argv)
{
    std::vector<std::string> files;
    double maxSeconds = 0.0, offsetSeconds = 0.0;
    bool   csv = false;

    for (int i = 1; i < argc; ++i)
    {
        const std::string arg = argv[i];
        if (arg == "--help" || arg == "-h")           { printUsage(); return 0; }
        else if (arg == "--csv")                      { csv = true; }
        else if (arg == "--seconds" && i + 1 < argc)  { maxSeconds = std::atof(argv[++i]); }
        else if (arg == "--offset" && i + 1 < argc)   { offsetSeconds = std::atof(argv[++i]); }
        else if (! arg.empty() && arg[0] == '-')
        {
            std::fprintf(stderr, "Unbekannte Option: %s\n", arg.c_str());
            return 2;
        }
        else                                          { files.push_back(arg); }
    }

    if (files.empty())
    {
        printUsage();
        return 2;
    }

    if (csv)
        std::printf("datei,tonart,camelot,tonart_sicherheit,bpm,bpm_sicherheit,sekunden\n");

    int failures = 0;
    for (const auto& path : files)
    {
        const auto wav = cli::readWav(path);
        if (! wav.ok())
        {
            std::fprintf(stderr, "%s: %s\n", path.c_str(),
                         wav.error.empty() ? "leere Datei" : wav.error.c_str());
            ++failures;
            continue;
        }

        // Trim to the requested window before the engine sees anything.
        const size_t from = std::min(wav.mono.size(),
            static_cast<size_t>(offsetSeconds * wav.sampleRate));
        size_t to = wav.mono.size();
        if (maxSeconds > 0.0)
            to = std::min(to, from + static_cast<size_t>(maxSeconds * wav.sampleRate));

        const std::vector<float> slice(wav.mono.begin() + static_cast<long>(from),
                                       wav.mono.begin() + static_cast<long>(to));

        // Same engine, same path as the plugin: feed at the file's rate and
        // let the engine resample onto the analysis rate.
        AnalysisEngine engine;
        engine.beginCapture(wav.sampleRate,
                            static_cast<float>(slice.size() / wav.sampleRate) + 1.0f);

        constexpr size_t kBlock = 512;
        for (size_t i = 0; i < slice.size(); i += kBlock)
            engine.appendHostAudio(slice.data() + i, std::min(kBlock, slice.size() - i));

        const auto result = engine.analyse();

        if (csv)
            reportCsv(path, result);
        else
            report(path, wav, result);
    }

    if (! csv)
        std::printf("\n");
    return failures > 0 ? 1 : 0;
}
