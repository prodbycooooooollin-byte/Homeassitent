// Sends the measured tempo to FL Studio.
//
// VST3 has no way for a plugin to write the host tempo - the process context
// is read-only by design. FL Studio's MIDI Controller Scripting API does
// expose it, so KeyDock ships a small script (integration/FLStudio) and
// talks to it over MIDI. That needs a virtual MIDI port, which Windows has no
// public API to create, so the user installs one (loopMIDI or similar) once.
//
// If no port is selected, tempo handover is simply unavailable and the UI
// says so rather than pretending.
#pragma once

#ifndef NOMINMAX
  #define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <mmsystem.h>   // midiOut* lives here, not in windows.h

#include <string>
#include <vector>

namespace keydock
{

class TempoBridge
{
public:
    ~TempoBridge();

    struct Port
    {
        unsigned int index = 0;
        std::wstring name;
    };

    /// Every MIDI output Windows knows about.
    static std::vector<Port> availablePorts();

    /// Opens a port by name. An empty name closes the current one.
    /// @returns true when a port is open afterwards.
    bool open(const std::wstring& portName);
    void close();

    bool isOpen() const { return handle_ != nullptr; }
    const std::wstring& openPortName() const { return portName_; }

    /// Sends the tempo. @returns an empty string on success, otherwise why not.
    std::string sendTempo(double bpm);

    /// Sends a ping so the script can confirm it is receiving.
    std::string sendPing();

private:
    std::string sendSysEx(const std::vector<unsigned char>& message);

    HMIDIOUT     handle_ = nullptr;
    std::wstring portName_;
};

} // namespace keydock
