#include "keydock/WavWriter.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>

namespace keydock
{

namespace
{
void put32(std::vector<uint8_t>& out, uint32_t v)
{
    out.push_back(static_cast<uint8_t>(v & 0xFF));
    out.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
    out.push_back(static_cast<uint8_t>((v >> 16) & 0xFF));
    out.push_back(static_cast<uint8_t>((v >> 24) & 0xFF));
}

void put16(std::vector<uint8_t>& out, uint16_t v)
{
    out.push_back(static_cast<uint8_t>(v & 0xFF));
    out.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
}

void putTag(std::vector<uint8_t>& out, const char* tag)
{
    out.insert(out.end(), tag, tag + 4);
}
} // namespace

std::string writeWav24(const std::string& path,
                       const std::vector<float>& mono,
                       double sampleRate)
{
    if (mono.empty())
        return "Kein Audiomaterial zum Speichern.";
    if (sampleRate <= 0.0)
        return "Ungültige Samplerate.";

    constexpr int channels = 1;
    constexpr int bits     = 24;
    constexpr int bytesPerSample = bits / 8;

    const uint32_t dataBytes = static_cast<uint32_t>(mono.size() * bytesPerSample);

    std::vector<uint8_t> header;
    header.reserve(44);
    putTag(header, "RIFF");
    put32(header, 36 + dataBytes);
    putTag(header, "WAVE");
    putTag(header, "fmt ");
    put32(header, 16);
    put16(header, 1);                                        // PCM
    put16(header, channels);
    put32(header, static_cast<uint32_t>(std::lround(sampleRate)));
    put32(header, static_cast<uint32_t>(std::lround(sampleRate)) * channels * bytesPerSample);
    put16(header, channels * bytesPerSample);
    put16(header, bits);
    putTag(header, "data");
    put32(header, dataBytes);

    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    if (! out)
        return "Datei konnte nicht geschrieben werden: " + path;

    out.write(reinterpret_cast<const char*>(header.data()),
              static_cast<std::streamsize>(header.size()));

    std::vector<uint8_t> body;
    body.reserve(dataBytes);
    for (float s : mono)
    {
        // Clamp rather than wrap: a transposed sample can exceed full scale.
        const float clamped = std::clamp(s, -1.0f, 1.0f);
        const int32_t v = static_cast<int32_t>(std::lround(clamped * 8388607.0f));
        body.push_back(static_cast<uint8_t>(v & 0xFF));
        body.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
        body.push_back(static_cast<uint8_t>((v >> 16) & 0xFF));
    }
    out.write(reinterpret_cast<const char*>(body.data()),
              static_cast<std::streamsize>(body.size()));

    if (! out)
        return "Schreiben unvollständig: " + path;
    return {};
}

} // namespace keydock
