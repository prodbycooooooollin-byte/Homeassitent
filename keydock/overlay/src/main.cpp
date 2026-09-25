// KeyDock overlay companion app.
//
// Runs as a single instance for the whole machine session, serves every
// KeyDock plugin instance over one named pipe, and draws the docked bar.
// It owns no audio and never touches FL Studio's process memory.
// NOMINMAX: windows.h otherwise defines min/max as macros, which breaks every
// std::min / std::max call in this translation unit under MSVC.
#ifndef NOMINMAX
  #define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include "IpcServer.h"
#include "OverlayWindow.h"
#include "Settings.h"
#include "KeyDockProtocol.h"

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int)
{
    // One overlay per session. A second launch simply exits, so several
    // plugin instances - or several FL Studio processes - cannot stack
    // overlays on top of each other.
    HANDLE singleton = CreateMutexA(nullptr, TRUE, keydock::ipc::kSingletonMutex);
    if (singleton == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
        return 0;

    // Per-monitor DPI v2: the overlay must rescale when FL Studio is dragged
    // to a monitor with a different scaling factor.
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    keydock::Settings settings;
    settings.load();

    keydock::IpcServer server;
    server.start();

    keydock::OverlayWindow window(server, settings);
    if (! window.create(instance))
    {
        server.stop();
        ReleaseMutex(singleton);
        CloseHandle(singleton);
        return 1;
    }

    MSG msg {};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0)
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    server.onChanged = nullptr;
    server.stop();
    settings.save();

    ReleaseMutex(singleton);
    CloseHandle(singleton);
    return static_cast<int>(msg.wParam);
}
