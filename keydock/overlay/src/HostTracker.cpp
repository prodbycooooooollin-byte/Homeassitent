#include "HostTracker.h"

#include <algorithm>
#include <psapi.h>

namespace keydock
{

HostTracker* HostTracker::instance_ = nullptr;

const std::vector<std::wstring>& HostTracker::hostExecutables()
{
    // FL Studio ships both a 64-bit and a legacy 32-bit executable; the
    // installer name has varied across versions, so match a small set.
    static const std::vector<std::wstring> names =
    {
        L"fl64.exe", L"fl.exe", L"flstudio.exe", L"fl studio.exe"
    };
    return names;
}

namespace
{
std::wstring processExeName(DWORD pid)
{
    HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (proc == nullptr)
        return {};

    wchar_t path[MAX_PATH] = {};
    DWORD   size = MAX_PATH;
    std::wstring name;
    if (QueryFullProcessImageNameW(proc, 0, path, &size))
    {
        std::wstring full(path, size);
        const auto slash = full.find_last_of(L'\\');
        name = slash == std::wstring::npos ? full : full.substr(slash + 1);
        std::transform(name.begin(), name.end(), name.begin(), ::towlower);
    }
    CloseHandle(proc);
    return name;
}

struct EnumContext
{
    const HostTracker* tracker = nullptr;
    DWORD preferredPid = 0;
    HWND  best = nullptr;
    LONG  bestArea = 0;
    HWND  foreground = nullptr;
};

BOOL CALLBACK enumProc(HWND hwnd, LPARAM param);
} // namespace

bool HostTracker::isHostProcess(DWORD pid) const
{
    const auto name = processExeName(pid);
    if (name.empty())
        return false;
    const auto& names = hostExecutables();
    return std::find(names.begin(), names.end(), name) != names.end();
}

namespace
{
BOOL CALLBACK enumProc(HWND hwnd, LPARAM param)
{
    auto* ctx = reinterpret_cast<EnumContext*>(param);

    if (! IsWindowVisible(hwnd) || GetWindow(hwnd, GW_OWNER) != nullptr)
        return TRUE;

    const LONG_PTR style   = GetWindowLongPtrW(hwnd, GWL_STYLE);
    const LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if ((exStyle & WS_EX_TOOLWINDOW) != 0 || (style & WS_CHILD) != 0)
        return TRUE;

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid == 0)
        return TRUE;

    if (ctx->preferredPid != 0 && pid != ctx->preferredPid)
        return TRUE;

    // Cheap rejects first; the process-name query is the expensive part.
    if (GetWindowTextLengthW(hwnd) == 0)
        return TRUE;

    RECT r {};
    if (! GetWindowRect(hwnd, &r))
        return TRUE;
    const LONG area = (r.right - r.left) * (r.bottom - r.top);
    if (area < 200 * 200)
        return TRUE;

    if (! ctx->tracker->preferredProcess() && ! ctx->preferredPid)
    {
        // fall through to the name check below
    }

    // The tracker's member function is private to the class, so re-check here.
    const auto name = processExeName(pid);
    const auto& names = HostTracker::hostExecutables();
    if (std::find(names.begin(), names.end(), name) == names.end())
        return TRUE;

    // Prefer the foreground window, otherwise the largest candidate.
    if (hwnd == ctx->foreground)
    {
        ctx->best = hwnd;
        ctx->bestArea = 0x7FFFFFFF;
        return FALSE;
    }
    if (area > ctx->bestArea)
    {
        ctx->best = hwnd;
        ctx->bestArea = area;
    }
    return TRUE;
}
} // namespace

HostTracker::HostTracker()
{
    instance_ = this;
}

HostTracker::~HostTracker()
{
    stop();
    instance_ = nullptr;
}

void HostTracker::start()
{
    const DWORD flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;

    // Window movement and size changes of the tracked host window.
    hooks_.push_back(SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE,
                                     EVENT_OBJECT_LOCATIONCHANGE,
                                     nullptr, winEventProc, 0, 0, flags));
    // Foreground changes decide whether the overlay may be visible at all.
    hooks_.push_back(SetWinEventHook(EVENT_SYSTEM_FOREGROUND,
                                     EVENT_SYSTEM_FOREGROUND,
                                     nullptr, winEventProc, 0, 0, flags));
    // Minimise/restore.
    hooks_.push_back(SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART,
                                     EVENT_SYSTEM_MINIMIZEEND,
                                     nullptr, winEventProc, 0, 0, flags));
    // Menus must never be covered by the overlay.
    hooks_.push_back(SetWinEventHook(EVENT_SYSTEM_MENUSTART,
                                     EVENT_SYSTEM_MENUPOPUPEND,
                                     nullptr, winEventProc, 0, 0, flags));
    hooks_.push_back(SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_DESTROY,
                                     nullptr, winEventProc, 0, 0, flags));
}

void HostTracker::stop()
{
    for (auto h : hooks_)
        if (h != nullptr)
            UnhookWinEvent(h);
    hooks_.clear();
}

void CALLBACK HostTracker::winEventProc(HWINEVENTHOOK, DWORD event, HWND hwnd,
                                        LONG idObject, LONG, DWORD, DWORD)
{
    auto* self = instance_;
    if (self == nullptr)
        return;

    if (event == EVENT_SYSTEM_MENUSTART || event == EVENT_SYSTEM_MENUPOPUPSTART)
        self->menuOpen_ = true;
    else if (event == EVENT_SYSTEM_MENUEND || event == EVENT_SYSTEM_MENUPOPUPEND)
        self->menuOpen_ = false;

    // LOCATIONCHANGE fires for every caret and cursor move in the system, so
    // filter down to top-level window moves before doing any work.
    if (event == EVENT_OBJECT_LOCATIONCHANGE
        && (idObject != OBJID_WINDOW || hwnd != self->tracked_))
        return;

    if (self->onHostChanged)
        self->onHostChanged();
}

HWND HostTracker::findMainWindow() const
{
    EnumContext ctx;
    ctx.tracker      = this;
    ctx.preferredPid = preferredPid_;
    ctx.foreground   = GetForegroundWindow();
    EnumWindows(enumProc, reinterpret_cast<LPARAM>(&ctx));
    return ctx.best;
}

HostWindowState HostTracker::poll(const RECT& overlayRect)
{
    HostWindowState state;
    state.menuOpen = menuOpen_;

    HWND hwnd = tracked_;
    if (hwnd == nullptr || ! IsWindow(hwnd))
        hwnd = findMainWindow();

    if (hwnd == nullptr || ! IsWindow(hwnd))
    {
        tracked_ = nullptr;
        return state;   // present = false: FL Studio is gone, hide everything
    }

    tracked_      = hwnd;
    state.hwnd    = hwnd;
    state.present = true;
    GetWindowThreadProcessId(hwnd, &state.processId);

    state.minimised = IsIconic(hwnd) != 0 || ! IsWindowVisible(hwnd);
    GetWindowRect(hwnd, &state.frame);

    // Per-monitor DPI: GetDpiForWindow follows the window across monitors.
    state.dpi = GetDpiForWindow(hwnd);
    if (state.dpi == 0)
        state.dpi = 96;

    // The overlay belongs to FL Studio's visual context, so it is only shown
    // while FL Studio - or the overlay itself - owns the foreground.
    const HWND fg = GetForegroundWindow();
    DWORD fgPid = 0;
    if (fg != nullptr)
        GetWindowThreadProcessId(fg, &fgPid);
    state.inContext = (fg == overlayHwnd_) || (fgPid != 0 && fgPid == state.processId);

    // Do not cover FL Studio's own dialogs and popups.
    if (state.inContext && fg != nullptr && fg != hwnd && fg != overlayHwnd_)
    {
        RECT fgRect {}, intersection {};
        if (GetWindowRect(fg, &fgRect)
            && IntersectRect(&intersection, &fgRect, &overlayRect))
        {
            state.obscured = true;
        }
    }

    return state;
}

} // namespace keydock
