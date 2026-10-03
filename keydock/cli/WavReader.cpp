#include "WavReader.h"

#include <cstdint>
#include <cstring>
#include <fstream>

namespace keydock::cli
{

namespace
{
uint32_t readU32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | (uint32_t(p[3]) << 24); }
uint16_t readU16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }

float sampleAt(const uint8_t* p, uint16_t format, uint16_t bits)
{
    if (format == 3)   // IEEE float
    {
        if (bits == 32)
        {
            float v;
            std::memcpy(&v, p, 4);
            return v;
        }
        if (bits == 64)
        {
            double v;
            std::memcpy(&v, p, 8);
            return static_cast<float>(v);
        }
        return 0.0f;
    }

    // PCM
    switch (bits)
    {
        case 8:   return (static_cast<int>(p[0]) - 128) / 128.0f;
        case 16:  return static_cast<int16_t>(readU16(p)) / 32768.0f;
        case 24:
        {
            int32_t v = (p[0] << 8) | (p[1] << 16) | (int32_t(p[2]) << 24);
            return (v >> 8) / 8388608.0f;
        }
        case 32:  return static_cast<int32_t>(readU32(p)) / 2147483648.0f;
        default:  return 0.0f;
    }
}
} // namespace

WavFile readWav(const std::string& path)
{
    WavFile out;

    std::ifstream in(path, std::ios::binary);
    if (! in)
    {
        out.error = "Datei nicht lesbar: " + path;
        return out;
    }

    std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(in)),
                                std::istreambuf_iterator<char>());
    if (bytes.size() < 44 || std::memcmp(bytes.data(), "RIFF", 4) != 0
        || std::memcmp(bytes.data() + 8, "WAVE", 4) != 0)
    {
        out.error = "Keine gueltige WAV-Datei (RIFF/WAVE-Kopf fehlt).";
        return out;
    }

    uint16_t format = 0, channels = 0, bits = 0;
    size_t   dataOffset = 0, dataBytes = 0;

    // Walk the chunk list rather than assuming a fixed 44-byte header:
    // exports from DAWs regularly carry extra chunks before 'data'.
    size_t pos = 12;
    while (pos + 8 <= bytes.size())
    {
        const char* id = reinterpret_cast<const char*>(bytes.data() + pos);
        const uint32_t size = readU32(bytes.data() + pos + 4);
        const size_t body = pos + 8;

        if (std::memcmp(id, "fmt ", 4) == 0 && body + 16 <= bytes.size())
        {
            format   = readU16(bytes.data() + body);
            channels = readU16(bytes.data() + body + 2);
            out.sampleRate = readU32(bytes.data() + body + 4);
            bits     = readU16(bytes.data() + body + 14);

            // WAVE_FORMAT_EXTENSIBLE carries the real format in the subformat GUID.
            if (format == 0xFFFE && body + 26 <= bytes.size())
                format = readU16(bytes.data() + body + 24);
        }
        else if (std::memcmp(id, "data", 4) == 0)
        {
            dataOffset = body;
            dataBytes  = std::min<size_t>(size, bytes.size() - body);
        }

        pos = body + size + (size & 1);   // chunks are word aligned
    }

    if (channels == 0 || bits == 0 || out.sampleRate <= 0.0 || dataBytes == 0)
    {
        out.error = "WAV-Kopf unvollstaendig (fmt- oder data-Chunk fehlt).";
        return out;
    }
    if (format != 1 && format != 3)
    {
        out.error = "Nicht unterstuetztes WAV-Format (komprimiert?). "
                    "Bitte als PCM oder Float exportieren.";
        return out;
    }

    const size_t bytesPerSample = bits / 8u;
    const size_t frameBytes     = bytesPerSample * channels;
    const size_t frames         = dataBytes / frameBytes;

    out.channels = channels;
    out.mono.resize(frames);
    for (size_t f = 0; f < frames; ++f)
    {
        float sum = 0.0f;
        for (int c = 0; c < channels; ++c)
            sum += sampleAt(bytes.data() + dataOffset + f * frameBytes
                                + static_cast<size_t>(c) * bytesPerSample,
                            format, bits);
        out.mono[f] = sum / channels;
    }

    return out;
}

} // namespace keydock::cli
