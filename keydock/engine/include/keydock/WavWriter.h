// Minimal WAV writer for exporting an edited sample.
// 24-bit PCM: the format producers expect back in a DAW, and lossless.
#pragma once

#include <string>
#include <vector>

namespace keydock
{

/// Writes mono audio as a 24-bit PCM WAV file.
/// @returns an empty string on success, otherwise the reason it failed.
std::string writeWav24(const std::string& path,
                       const std::vector<float>& mono,
                       double sampleRate);

} // namespace keydock
