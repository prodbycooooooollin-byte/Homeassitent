// Minimal RIFF/WAVE reader for the offline analysis CLI.
// Supports PCM 8/16/24/32-bit and IEEE float 32/64-bit, mono or multichannel.
#pragma once

#include <string>
#include <vector>

namespace keydock::cli
{

struct WavFile
{
    std::vector<float> mono;        ///< channels averaged
    double             sampleRate = 0.0;
    int                channels   = 0;
    std::string        error;       ///< empty on success

    bool ok() const { return error.empty() && ! mono.empty(); }
    double seconds() const { return sampleRate > 0.0 ? mono.size() / sampleRate : 0.0; }
};

WavFile readWav(const std::string& path);

} // namespace keydock::cli
