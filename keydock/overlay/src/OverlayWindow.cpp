#include "OverlayWindow.h"

#include "keydock/Types.h"

#include <dwmapi.h>
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
constexpr int     kBarHeightDip     = 40;
// Measured against what paintDetails actually lays out:
//   10 padding + 3 section headers (15) + 8 rows (30) + footer (~50).
constexpr int     kDetailHeightDip  = 350;
constexpr int     kMinWidthDip      = 300;
constexpr int     kMaxWidthDip      = 900;

std::wstring widenUtf8(const std::string& s)
{
    if (s.empty())
        return {};
    const int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    if (n <= 1)
        return {};
    std::wstring out(static_cast<size_t>(n - 1), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, out.data(), n);
    return out;
}
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

/// The settings panel needs more width than the bar to lay its rows out.
int OverlayWindow::currentWidth() const
{
    const int minimum = settings_.detailsOpen ? 560 : kMinWidthDip;
    return scaled(std::max(settings_.width, minimum));
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

    applyOpacity();

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

void OverlayWindow::applyOpacity()
{
    if (hwnd_ == nullptr)
        return;
    const int percent = std::clamp(settings_.opacityPercent, 40, 100);
    SetLayeredWindowAttributes(hwnd_, 0,
                               static_cast<BYTE>(percent * 255 / 100), LWA_ALPHA);
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

    const int width  = currentWidth();
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

    if (settings_.mode == Settings::Mode::docked)
    {
        // Never sit on the minimise/maximise/close buttons. DWM reports where
        // they actually are, which beats guessing a caption height that
        // changes with theme and DPI.
        RECT caption {};
        if (SUCCEEDED(DwmGetWindowAttribute(host.hwnd, DWMWA_CAPTION_BUTTON_BOUNDS,
                                            &caption, sizeof(caption)))
            && caption.bottom > caption.top)
        {
            // Window-relative, so lift it into screen coordinates.
            const LONG captionBottom = host.frame.top + caption.bottom;
            const LONG captionLeft   = host.frame.left + caption.left;

            const bool overlapsHorizontally = (x + width) > captionLeft;
            if (overlapsHorizontally && y < captionBottom)
                y = captionBottom + scaled(4);
        }
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

    const auto send = [&](ipc::CommandId id, float param)
    {
        if (have)
            server_.sendCommand(info.hello.instanceId, id, param);
    };

    const auto setLength = [&](float seconds)
    {
        settings_.captureSeconds = seconds;
        settings_.save();
    };

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
            send(busy ? ipc::CommandId::stopCapture : ipc::CommandId::startAnalysis,
                 settings_.captureSeconds);
            bpmDisplayFactor_ = 1.0f;
            break;
        }

        case HitTarget::len10:     setLength(10.0f); break;
        case HitTarget::len20:     setLength(20.0f); break;
        case HitTarget::len30:     setLength(30.0f); break;
        case HitTarget::lenManual: setLength(0.0f);  break;

        case HitTarget::details:
            settings_.detailsOpen = ! settings_.detailsOpen;
            settings_.save();
            refreshPlacement();
            break;

        case HitTarget::reset:
            send(ipc::CommandId::reset, 0.0f);
            bpmDisplayFactor_ = 1.0f;
            break;

        case HitTarget::copy:
        {
            if (! have || ! info.haveResult || info.result.valid == 0)
                break;

            // Written the way a producer would paste it into a file name or a
            // project note.
            std::wstring text;
            if (info.result.keyTonic >= 0)
            {
                text = widenUtf8(keyName(info.result.keyTonic,
                                         info.result.keyIsMinor != 0));
                if (settings_.showCamelot)
                    text += L" (" + widenUtf8(camelot(info.result.keyTonic,
                                                      info.result.keyIsMinor != 0)) + L")";
            }
            if (info.result.bpm > 0.0f)
            {
                wchar_t buffer[32];
                std::swprintf(buffer, 32, L"%.1f BPM",
                              info.result.bpm * bpmDisplayFactor_);
                if (! text.empty())
                    text += L" - ";
                text += buffer;
            }
            if (text.empty())
                break;

            if (OpenClipboard(hwnd_))
            {
                EmptyClipboard();
                const size_t bytes = (text.size() + 1) * sizeof(wchar_t);
                if (HGLOBAL mem = GlobalAlloc(GMEM_MOVEABLE, bytes))
                {
                    std::memcpy(GlobalLock(mem), text.c_str(), bytes);
                    GlobalUnlock(mem);
                    SetClipboardData(CF_UNICODETEXT, mem);
                }
                CloseClipboard();
            }
            break;
        }

        // Half/double time change the displayed interpretation only. They do
        // not re-run the analysis and they never write FL Studio's tempo.
        // Absolute rather than multiplying: an earlier version multiplied
        // without limit, so two taps turned 136 BPM into 544.
        case HitTarget::tempoHalf:   bpmDisplayFactor_ = 0.5f; break;
        case HitTarget::tempoNormal: bpmDisplayFactor_ = 1.0f; break;
        case HitTarget::tempoDouble: bpmDisplayFactor_ = 2.0f; break;

        case HitTarget::camelotOn:
        case HitTarget::camelotOff:
            settings_.showCamelot = (target == HitTarget::camelotOn);
            settings_.save();
            break;

        case HitTarget::themePrev:
        case HitTarget::themeNext:
        {
            const int count = numBuiltInThemes();
            themeIndex_ = (themeIndex_ + (target == HitTarget::themeNext ? 1 : count - 1))
                        % count;
            settings_.theme = builtInTheme(themeIndex_);
            settings_.save();
            break;
        }

        case HitTarget::modeDocked:
        case HitTarget::modeFloating:
        {
            const auto wanted = target == HitTarget::modeDocked
                              ? Settings::Mode::docked : Settings::Mode::floating;
            if (settings_.mode == wanted)
                break;

            // Switching to floating keeps the window where it currently is.
            if (wanted == Settings::Mode::floating)
            {
                RECT r {};
                GetWindowRect(hwnd_, &r);
                const double scale = static_cast<double>(dpi_) / 96.0;
                settings_.floatX = static_cast<int>(r.left / scale);
                settings_.floatY = static_cast<int>(r.top / scale);
            }
            settings_.mode = wanted;
            settings_.save();
            refreshPlacement();
            break;
        }

        case HitTarget::resetPosition:
        {
            // A stored position from an older version outranks a better
            // default, so this is the way back without editing a file.
            const Settings defaults;
            settings_.mode        = defaults.mode;
            settings_.anchorRight = defaults.anchorRight;
            settings_.anchorTop   = defaults.anchorTop;
            settings_.width       = defaults.width;
            settings_.save();
            refreshPlacement();
            break;
        }

        case HitTarget::scaleDown:
        case HitTarget::scaleUp:
            settings_.scalePercent = std::clamp(
                settings_.scalePercent + (target == HitTarget::scaleUp ? 10 : -10),
                70, 200);
            settings_.save();
            refreshPlacement();
            break;

        case HitTarget::opacityDown:
        case HitTarget::opacityUp:
            settings_.opacityPercent = std::clamp(
                settings_.opacityPercent + (target == HitTarget::opacityUp ? 8 : -8),
                40, 100);
            settings_.save();
            applyOpacity();
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
