// The frameless overlay that docks to the top-right of the FL Studio window.
//
// Window style rationale:
//   WS_EX_NOACTIVATE  - never takes keyboard focus, so Space still reaches FL
//   WS_EX_TOOLWINDOW  - no taskbar entry, no Alt-Tab entry
//   WS_EX_TOPMOST     - stays above FL, but is hidden whenever FL is not the
//                       foreground application, so it never floats over other
//                       programs
// The window is exactly the size of its own UI and uses a rounded region, so
// there is no invisible area that could swallow clicks meant for FL Studio.
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

#include "HostTracker.h"
#include "IpcServer.h"
#include "Settings.h"

#include <string>
#include <vector>

namespace keydock
{

class OverlayWindow
{
public:
    OverlayWindow(IpcServer& server, Settings& settings);
    ~OverlayWindow();

    bool create(HINSTANCE instance);
    HWND handle() const { return hwnd_; }

    /// Recomputes position and visibility from the tracked host window.
    void refreshPlacement();
    void requestRepaint();

private:
    enum class HitTarget
    {
        none, dragHandle, analyse, lengthCycle, details, settings,
        resizeGrip, instancePicker, halfTime, doubleTime, reset, copy,
        themeCycle, modeToggle, camelotToggle, scaleDown, scaleUp
    };

    struct HitZone
    {
        RECT      rect {};
        HitTarget target = HitTarget::none;
    };

    static LRESULT CALLBACK wndProc(HWND, UINT, WPARAM, LPARAM);
    LRESULT handleMessage(UINT msg, WPARAM wParam, LPARAM lParam);

    void onPaint();
    void onLeftDown(POINT pt);
    void onLeftUp();
    void onMouseMove(POINT pt);
    void activate(HitTarget target);

    // --- layout / rendering helpers ---
    int   scaled(int dip) const;
    int   currentHeight() const;
    void  paintBar(HDC dc, RECT bounds);
    void  paintDetails(HDC dc, RECT bounds);
    void  addZone(RECT r, HitTarget target);
    HitTarget hitTest(POINT pt) const;

    std::wstring statusLine(const InstanceInfo& info) const;
    std::wstring keyText(const InstanceInfo& info) const;
    std::wstring bpmText(const InstanceInfo& info) const;
    bool  currentInstance(InstanceInfo& out) const;

    IpcServer& server_;
    Settings&  settings_;
    HostTracker tracker_;

    HWND  hwnd_ = nullptr;
    UINT  dpi_  = 96;

    std::vector<HitZone> zones_;
    HitTarget hot_ = HitTarget::none;

    bool   dragging_  = false;
    bool   resizing_  = false;
    POINT  dragStart_ {};
    int    dragStartAnchorRight_ = 0;
    int    dragStartAnchorTop_   = 0;
    int    dragStartWidth_       = 0;

    /// Display-only multiplier applied to the measured BPM by the half/double
    /// buttons. It never changes the analysis and never touches FL's tempo.
    float  bpmDisplayFactor_ = 1.0f;
    uint32_t bpmFactorAnalysisId_ = 0;

    int    themeIndex_ = 0;
    bool   visible_    = false;
};

} // namespace keydock
