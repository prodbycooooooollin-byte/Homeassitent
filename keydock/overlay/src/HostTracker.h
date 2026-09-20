// Finds and follows the FL Studio main window.
//
// Uses only documented, read-only Win32 APIs: window enumeration, WinEvent
// hooks and DPI queries. It never subclasses FL Studio windows, never injects
// code and never modifies the host's toolbar - all of which would be fragile
// and break on every FL Studio update.
#pragma once

// NOMINMAX: windows.h otherwise defines min/max as macros, which breaks every
// std::min / std::max call in this translation unit under MSVC.
#ifndef NOMINMAX
  #define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <functional>
#include <string>
#include <vector>

namespace keydock
{

struct HostWindowState
{
    HWND hwnd        = nullptr;
    RECT frame       {};        ///< window rect in physical screen pixels
    UINT dpi         = 96;
    bool present     = false;   ///< a matching FL Studio window exists
    bool minimised   = false;
    bool inContext   = false;   ///< FL Studio (or our overlay) is in the foreground
    bool obscured    = false;   ///< an FL popup/dialog covers the overlay area
    bool menuOpen    = false;
    DWORD processId  = 0;
};

class HostTracker
{
public:
    HostTracker();
    ~HostTracker();

    /// Executable names that count as an FL Studio main process.
    static const std::vector<std::wstring>& hostExecutables();

    void start();
    void stop();

    /// Re-scans and recomputes the state. Cheap enough to call on a timer.
    /// @param overlayRect  current overlay rect, used for the occlusion test.
    HostWindowState poll(const RECT& overlayRect);

    /// Restricts tracking to one process, so several FL Studio instances
    /// stay unambiguous. 0 means "whichever one is in front".
    void setPreferredProcess(DWORD pid) { preferredPid_ = pid; }
    DWORD preferredProcess() const      { return preferredPid_; }

    /// Raised from the WinEvent hook when the tracked window moves or the
    /// foreground changes, so the overlay can reposition without waiting for
    /// its timer.
    std::function<void()> onHostChanged;

    /// The overlay's own window, excluded from the context/occlusion tests.
    void setOverlayWindow(HWND h) { overlayHwnd_ = h; }

private:
    static void CALLBACK winEventProc(HWINEVENTHOOK, DWORD event, HWND hwnd,
                                      LONG idObject, LONG idChild, DWORD, DWORD);
    static HostTracker* instance_;

    HWND  findMainWindow() const;
    bool  isHostProcess(DWORD pid) const;

    std::vector<HWINEVENTHOOK> hooks_;
    HWND  overlayHwnd_  = nullptr;
    HWND  tracked_      = nullptr;
    DWORD preferredPid_ = 0;
    bool  menuOpen_     = false;
};

} // namespace keydock
