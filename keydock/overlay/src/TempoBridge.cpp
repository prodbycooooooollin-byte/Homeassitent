#include "TempoBridge.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

#if defined(_MSC_VER)
  #pragma comment(lib, "winmm.lib")
#endif

namespace keydock
{

namespace
{
constexpr unsigned char kSysExStart = 0xF0;
constexpr unsigned char kSysExEnd   = 0xF7;

// 0x7D is the manufacturer id reserved for non-commercial and private use,
// so this cannot collide with a real device's messages.
constexpr unsigned char kManufacturer = 0x7D;
constexpr unsigned char kTagK = 0x4B;
constexpr unsigned char kTagD = 0x44;

constexpr unsigned char kOpSetTempo = 0x01;
constexpr unsigned char kOpPing     = 0x02;
} // namespace

TempoBridge::~TempoBridge()
{
    close();
}

std::vector<TempoBridge::Port> TempoBridge::availablePorts()
{
    std::vector<Port> ports;
    const UINT count = midiOutGetNumDevs();
    ports.reserve(count);

    for (UINT i = 0; i < count; ++i)
    {
        MIDIOUTCAPSW caps {};
        if (midiOutGetDevCapsW(i, &caps, sizeof(caps)) == MMSYSERR_NOERROR)
            ports.push_back({ i, caps.szPname });
    }
    return ports;
}

bool TempoBridge::open(const std::wstring& portName)
{
    close();
    if (portName.empty())
        return false;

    for (const auto& port : availablePorts())
    {
        if (port.name != portName)
            continue;

        HMIDIOUT handle = nullptr;
        if (midiOutOpen(&handle, port.index, 0, 0, CALLBACK_NULL) == MMSYSERR_NOERROR)
        {
            handle_   = handle;
            portName_ = portName;
            return true;
        }
        return false;
    }
    return false;
}

void TempoBridge::close()
{
    if (handle_ != nullptr)
    {
        midiOutReset(handle_);
        midiOutClose(handle_);
        handle_ = nullptr;
    }
    portName_.clear();
}

std::string TempoBridge::sendSysEx(const std::vector<unsigned char>& message)
{
    if (handle_ == nullptr)
        return "Kein MIDI-Port geöffnet.";

    // midiOutLongMsg needs a writable buffer that stays alive for the call.
    std::vector<unsigned char> buffer = message;

    MIDIHDR header {};
    header.lpData         = reinterpret_cast<LPSTR>(buffer.data());
    header.dwBufferLength = static_cast<DWORD>(buffer.size());
    header.dwBytesRecorded = static_cast<DWORD>(buffer.size());

    if (midiOutPrepareHeader(handle_, &header, sizeof(header)) != MMSYSERR_NOERROR)
        return "MIDI-Nachricht konnte nicht vorbereitet werden.";

    const MMRESULT result = midiOutLongMsg(handle_, &header, sizeof(header));

    // Wait for the driver to release the buffer before it goes out of scope.
    for (int i = 0; i < 200 && (header.dwFlags & MHDR_DONE) == 0; ++i)
        Sleep(1);
    midiOutUnprepareHeader(handle_, &header, sizeof(header));

    if (result != MMSYSERR_NOERROR)
        return "MIDI-Nachricht konnte nicht gesendet werden.";
    return {};
}

std::string TempoBridge::sendTempo(double bpm)
{
    // FL Studio's own tempo range. Refuse rather than clamp: a clamped value
    // would silently set a tempo the user never asked for.
    if (! (bpm >= 10.0 && bpm <= 522.0))
        return "Tempo liegt außerhalb des von FL Studio erlaubten Bereichs.";

    // BPM * 1000, the unit REC_Tempo expects, packed as four 7-bit bytes
    // because SysEx data bytes may not have the high bit set.
    const uint32_t milli = static_cast<uint32_t>(std::lround(bpm * 1000.0));

    const std::vector<unsigned char> message =
    {
        kSysExStart, kManufacturer, kTagK, kTagD, kOpSetTempo,
        static_cast<unsigned char>((milli >> 21) & 0x7F),
        static_cast<unsigned char>((milli >> 14) & 0x7F),
        static_cast<unsigned char>((milli >>  7) & 0x7F),
        static_cast<unsigned char>( milli        & 0x7F),
        kSysExEnd,
    };
    return sendSysEx(message);
}

std::string TempoBridge::sendPing()
{
    const std::vector<unsigned char> message =
    {
        kSysExStart, kManufacturer, kTagK, kTagD, kOpPing, kSysExEnd,
    };
    return sendSysEx(message);
}

} // namespace keydock
