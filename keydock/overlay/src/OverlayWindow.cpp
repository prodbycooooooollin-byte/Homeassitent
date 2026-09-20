#include "OverlayWindow.h"

#include "keydock/Types.h"

#include <windowsx.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cwchar>

namespace keydock
{

namespace
{
constexpr wchar_t kClassName[] = L"KeyDockOverlayWindow";
constexpr UINT    kTimerId     = 1;
constexpr int     kBarHeightDip     = 36;
constexpr int     kDetailHeightDip  = 118;
constexpr int     kMinWidthDip      = 300;
constexpr int     kMaxWidthDip      = 900;

BYTE alphaOf(uint32_t argb) { return static_cast<BYTE>((argb >> 24) & 0xFF); }

} // namespace

OverlayWindow::OverlayWindow(IpcServer& server, Settings& settings)
    : server_(server), settings_(settings)
{
    for (int i = 0; i < numBuiltInThemes(); ++i)
        if (builtInTheme(i).name == settings_.theme.name)
            themeIndex_ = i;
}

OverlayWindow::~OverlayWindow()
{
    tracker_.stop();
    if (hwnd_ != nullptr)
        DestroyWindow(hwnd_);
}

int OverlayWindow::scaled(int dip) const
{
    const double systemScale = static_cast<double>(dpi_) / 96.0;
    const double userScale   = settings_.scalePercent / 100.0;
    return static_cast<int>(std::lround(dip * systemScale * userScale));
}

int OverlayWindow::currentHeight() const
{
    return scaled(kBarHeightDip + (settings_.detailsOpen ? kDetailHeightDip : 0));
}

bool OverlayWindow::create(HINSTANCE instance)
{
    WNDCLASSEXW wc {};
    wc.cbSize        = sizeof(wc);
    wc.lpfnWndProc   = &OverlayWindow::wndProc;
    wc.hInstance     = instance;
    wc.hCursor       = LoadCursor(nullptr, IDC_ARROW);
    wc.lpszClassName = kClassName;
    RegisterClassExW(&wc);

    hwnd_ = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
        kClassName, L"KeyDock",
        WS_POPUP,
        0, 0, 100, 100,
        nullptr, nullptr, instance, this);

    if (hwnd_ == nullptr)
        return false;

    SetLayeredWindowAttributes(hwnd_, 0, alphaOf(settings_.theme.background), LWA_ALPHA);

    tracker_.setOverlayWindow(hwnd_);
    tracker_.onHostChanged = [this]
    {
        // The hook runs on a system thread: only post, never draw from here.
        if (hwnd_ != nullptr)
            PostMessageW(hwnd_, WM_APP + 1, 0, 0);
    };
    tracker_.start();

    server_.onChanged = [this]
    {
        if (hwnd_ != nullptr)
            PostMessageW(hwnd_, WM_APP + 2, 0, 0);
    };

    SetTimer(hwnd_, kTimerId, 100, nullptr);
    refreshPlacement();
    return true;
}

void OverlayWindow::requestRepaint()
{
    if (hwnd_ != nullptr)
        InvalidateRect(hwnd_, nullptr, FALSE);
}

void OverlayWindow::refreshPlacement()
{
    if (hwnd_ == nullptr)
        return;

    RECT current {};
    GetWindowRect(hwnd_, &current);

    const auto host = tracker_.poll(current);

    // Hide whenever FL Studio is gone, minimised, in the background, showing
    // a menu, or covering our area with one of its own dialogs.
    const bool shouldShow = host.present && ! host.minimised && host.inContext
                         && ! host.menuOpen && ! host.obscured;

    if (! shouldShow)
    {
        if (visible_)
        {
            ShowWindow(hwnd_, SW_HIDE);
            visible_ = false;
        }
        return;
    }

    dpi_ = host.dpi;

    const int width  = scaled(settings_.width);
    const int height = currentHeight();

    int x = 0, y = 0;
    if (settings_.mode == Settings::Mode::docked)
    {
        // Anchored to the host window's top-right corner, so the overlay
        // follows moves, resizes and maximising for free.
        x = host.frame.right - scaled(settings_.anchorRight) - width;
        y = host.frame.top   + scaled(settings_.anchorTop);
    }
    else
    {
        const double scale = static_cast<double>(dpi_) / 96.0;
        x = static_cast<int>(std::lround(settings_.floatX * scale));
        y = static_cast<int>(std::lround(settings_.floatY * scale));
    }

    // Keep the whole window on a real monitor even after a layout change.
    const HMONITOR monitor = MonitorFromPoint(POINT { x + width / 2, y + height / 2 },
                                              MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi {};
    mi.cbSize = sizeof(MONITORINFO);
    if (GetMonitorInfoW(monitor, &mi))
    {
        x = std::clamp<int>(x, mi.rcWork.left, mi.rcWork.right - width);
        y = std::clamp<int>(y, mi.rcWork.top,  mi.rcWork.bottom - height);
    }

    SetWindowPos(hwnd_, HWND_TOPMOST, x, y, width, height,
                 SWP_NOACTIVATE | SWP_SHOWWINDOW);

    // Rounded region: the corners outside it stay click-through.
    HRGN region = CreateRoundRectRgn(0, 0, width + 1, height + 1,
                                     scaled(8), scaled(8));
    SetWindowRgn(hwnd_, region, TRUE);   // window owns the region now

    visible_ = true;
    requestRepaint();
}

// --- message handling -----------------------------------------------------

LRESULT CALLBACK OverlayWindow::wndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    OverlayWindow* self = nullptr;

    if (msg == WM_NCCREATE)
    {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lParam);
        self = static_cast<OverlayWindow*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        self->hwnd_ = hwnd;
    }
    else
    {
        self = reinterpret_cast<OverlayWindow*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }

    if (self != nullptr)
        return self->handleMessage(msg, wParam, lParam);

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

LRESULT OverlayWindow::handleMessage(UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
        // Clicking the overlay must never pull focus away from FL Studio,
        // otherwise Space and every other shortcut would stop working.
        case WM_MOUSEACTIVATE:
            return MA_NOACTIVATE;

        case WM_TIMER:
            refreshPlacement();
            return 0;

        case WM_APP + 1:          // host window moved / foreground changed
            refreshPlacement();
            return 0;

        case WM_APP + 2:          // new state or result from a plugin
            requestRepaint();
            return 0;

        case WM_DPICHANGED:
            dpi_ = HIWORD(wParam);
            refreshPlacement();
            return 0;

        case WM_PAINT:
            onPaint();
            return 0;

        case WM_ERASEBKGND:
            return 1;             // fully painted in WM_PAINT, no flicker

        case WM_LBUTTONDOWN:
        {
            POINT pt { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            onLeftDown(pt);
            return 0;
        }

        case WM_LBUTTONUP:
            onLeftUp();
            return 0;

        case WM_MOUSEMOVE:
        {
            POINT pt { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            onMouseMove(pt);
            return 0;
        }

        case WM_MOUSELEAVE:
            hot_ = HitTarget::none;
            requestRepaint();
            return 0;

        case WM_DESTROY:
            settings_.save();
            PostQuitMessage(0);
            return 0;

        default:
            break;
    }

    return DefWindowProcW(hwnd_, msg, wParam, lParam);
}

// --- interaction ----------------------------------------------------------

bool OverlayWindow::currentInstance(InstanceInfo& out) const
{
    return server_.activeInstance(out);
}

void OverlayWindow::addZone(RECT r, HitTarget target)
{
    zones_.push_back({ r, target });
}

OverlayWindow::HitTarget OverlayWindow::hitTest(POINT pt) const
{
    for (const auto& z : zones_)
        if (PtInRect(&z.rect, pt))
            return z.target;
    return HitTarget::none;
}

void OverlayWindow::onLeftDown(POINT pt)
{
    const auto target = hitTest(pt);

    if (target == HitTarget::dragHandle || target == HitTarget::resizeGrip)
    {
        POINT screen = pt;
        ClientToScreen(hwnd_, &screen);
        dragStart_ = screen;
        dragStartAnchorRight_ = settings_.anchorRight;
        dragStartAnchorTop_   = settings_.anchorTop;
        dragStartWidth_       = settings_.width;
        dragging_ = target == HitTarget::dragHandle;
        resizing_ = target == HitTarget::resizeGrip;
        SetCapture(hwnd_);
        return;
    }

    activate(target);
}

void OverlayWindow::onLeftUp()
{
    if (dragging_ || resizing_)
    {
        dragging_ = resizing_ = false;
        ReleaseCapture();
        // The position is only worth persisting once the user lets go.
        settings_.save();
    }
}

void OverlayWindow::onMouseMove(POINT pt)
{
    if (dragging_ || resizing_)
    {
        POINT screen = pt;
        ClientToScreen(hwnd_, &screen);

        const double scale = (static_cast<double>(dpi_) / 96.0)
                           * (settings_.scalePercent / 100.0);
        const int dx = static_cast<int>((screen.x - dragStart_.x) / scale);
        const int dy = static_cast<int>((screen.y - dragStart_.y) / scale);

        if (resizing_)
        {
            settings_.width = std::clamp(dragStartWidth_ + dx, kMinWidthDip, kMaxWidthDip);
        }
        else if (settings_.mode == Settings::Mode::docked)
        {
            // anchorRight grows leftwards, hence the sign flip.
            settings_.anchorRight = std::max(0, dragStartAnchorRight_ - dx);
            settings_.anchorTop   = std::max(0, dragStartAnchorTop_ + dy);
        }
        else
        {
            settings_.floatX = dragStartAnchorRight_ + dx;
            settings_.floatY = dragStartAnchorTop_ + dy;
        }

        refreshPlacement();
        return;
    }

    const auto target = hitTest(pt);
    if (target != hot_)
    {
        hot_ = target;
        TRACKMOUSEEVENT tme { sizeof(tme), TME_LEAVE, hwnd_, 0 };
        TrackMouseEvent(&tme);
        requestRepaint();
    }
}

void OverlayWindow::activate(HitTarget target)
{
    InstanceInfo info;
    const bool have = currentInstance(info);

    switch (target)
    {
        case HitTarget::analyse:
        {
            if (! have)
                break;
            const auto status = static_cast<ipc::Status>(info.state.status);
            const bool busy = status == ipc::Status::listening
                           || status == ipc::Status::waitingForAudio;
            // Starting a fresh analysis always discards the previous capture;
            // that reset happens in the plugin, not here.
            server_.sendCommand(info.hello.instanceId,
                                busy ? ipc::CommandId::stopCapture
                                     : ipc::CommandId::startAnalysis,
                                settings_.captureSeconds);
            bpmDisplayFactor_ = 1.0f;
            break;
        }

        case HitTarget::lengthCycle:
        {
            static const float lengths[] = { 10.0f, 20.0f, 30.0f, 0.0f };
            int index = 0;
            for (int i = 0; i < 4; ++i)
                if (std::abs(lengths[i] - settings_.captureSeconds) < 0.1f)
                    index = i;
            settings_.captureSeconds = lengths[(index + 1) % 4];
            settings_.save();
            break;
        }

        case HitTarget::details:
            settings_.detailsOpen = ! settings_.detailsOpen;
            settings_.save();
            refreshPlacement();
            break;

        case HitTarget::reset:
            if (have)
                server_.sendCommand(info.hello.instanceId, ipc::CommandId::reset, 0.0f);
            bpmDisplayFactor_ = 1.0f;
            break;

        case HitTarget::copy:
        {
            if (! have || ! info.haveResult || info.result.valid == 0)
                break;

            wchar_t text[160] = {};
            const auto& r = info.result;
            std::wstring keyPart = keyText(info);
            std::swprintf(text, 160, L"%s - %.1f BPM",
                          keyPart.c_str(), r.bpm * bpmDisplayFactor_);

            if (OpenClipboard(hwnd_))
            {
                EmptyClipboard();
                const size_t bytes = (std::wcslen(text) + 1) * sizeof(wchar_t);
                if (HGLOBAL mem = GlobalAlloc(GMEM_MOVEABLE, bytes))
                {
                    std::memcpy(GlobalLock(mem), text, bytes);
                    GlobalUnlock(mem);
                    SetClipboardData(CF_UNICODETEXT, mem);
                }
                CloseClipboard();
            }
            break;
        }

        // Half/double time change the displayed interpretation only. They do
        // not re-run the analysis and they never write FL Studio's tempo.
        case HitTarget::halfTime:
            bpmDisplayFactor_ = bpmDisplayFactor_ * 0.5f;
            break;
        case HitTarget::doubleTime:
            bpmDisplayFactor_ = bpmDisplayFactor_ * 2.0f;
            break;

        case HitTarget::themeCycle:
            themeIndex_ = (themeIndex_ + 1) % numBuiltInThemes();
            settings_.theme = builtInTheme(themeIndex_);
            SetLayeredWindowAttributes(hwnd_, 0,
                                       alphaOf(settings_.theme.background), LWA_ALPHA);
            settings_.save();
            break;

        case HitTarget::modeToggle:
        {
            // Switching to floating keeps the window where it currently is.
            RECT r {};
            GetWindowRect(hwnd_, &r);
            const double scale = static_cast<double>(dpi_) / 96.0;
            if (settings_.mode == Settings::Mode::docked)
            {
                settings_.mode   = Settings::Mode::floating;
                settings_.floatX = static_cast<int>(r.left / scale);
                settings_.floatY = static_cast<int>(r.top / scale);
            }
            else
            {
                settings_.mode = Settings::Mode::docked;
            }
            settings_.save();
            refreshPlacement();
            break;
        }

        case HitTarget::camelotToggle:
            settings_.showCamelot = ! settings_.showCamelot;
            settings_.save();
            break;

        case HitTarget::scaleDown:
            settings_.scalePercent = std::max(70, settings_.scalePercent - 10);
            settings_.save();
            refreshPlacement();
            break;

        case HitTarget::scaleUp:
            settings_.scalePercent = std::min(200, settings_.scalePercent + 10);
            settings_.save();
            refreshPlacement();
            break;

        case HitTarget::instancePicker:
        {
            // Cycle through the connected instances so it is always explicit
            // which plugin the overlay is driving.
            const auto list = server_.instances();
            if (list.size() < 2)
                break;
            size_t index = 0;
            for (size_t i = 0; i < list.size(); ++i)
                if (list[i].hello.instanceId == server_.preferredInstance())
                    index = i;
            server_.setPreferredInstance(
                list[(index + 1) % list.size()].hello.instanceId);
            break;
        }

        default:
            break;
    }

    requestRepaint();
}

} // namespace keydock
