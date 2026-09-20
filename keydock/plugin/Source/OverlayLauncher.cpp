#include "OverlayLauncher.h"
#include "KeyDockProtocol.h"

#if defined(_WIN32)
  #define WIN32_LEAN_AND_MEAN
  #include <windows.h>
#endif

#include <juce_core/juce_core.h>

namespace keydock
{

namespace
{
/// The overlay ships next to the .vst3 bundle, so it is found relative to the
/// loaded module rather than through a registry key or the PATH.
juce::File overlayFile()
{
    const auto module = juce::File::getSpecialLocation(
        juce::File::currentApplicationFile);

    // Typical layout:
    //   <VST3 folder>/KeyDock.vst3/...        (bundle)
    //   <VST3 folder>/KeyDockOverlay.exe
    const juce::File candidates[] =
    {
        module.getParentDirectory().getChildFile("KeyDockOverlay.exe"),
        module.getChildFile("Contents").getChildFile("x86_64-win")
              .getChildFile("KeyDockOverlay.exe"),
        module.getParentDirectory().getParentDirectory()
              .getChildFile("KeyDockOverlay.exe"),
    };

    for (const auto& f : candidates)
        if (f.existsAsFile())
            return f;

    return candidates[0];
}
} // namespace

std::string OverlayLauncher::expectedExecutablePath()
{
    return overlayFile().getFullPathName().toStdString();
}

#if defined(_WIN32)

bool OverlayLauncher::ensureRunning()
{
    // One overlay per machine session. If the mutex already exists, another
    // instance (or another FL Studio process) has already started it.
    HANDLE mutex = CreateMutexA(nullptr, FALSE, ipc::kSingletonMutex);
    if (mutex == nullptr)
        return false;

    const bool alreadyRunning = (GetLastError() == ERROR_ALREADY_EXISTS);
    // Release our claim immediately: the overlay itself holds the real one.
    CloseHandle(mutex);

    if (alreadyRunning)
        return true;

    const auto exe = overlayFile();
    if (! exe.existsAsFile())
        return false;

    STARTUPINFOW si {};
    si.cb          = sizeof(si);
    si.dwFlags     = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_SHOWNOACTIVATE;   // never steal focus from FL Studio

    PROCESS_INFORMATION pi {};
    auto path = exe.getFullPathName().toWideCharPointer();
    std::wstring commandLine = std::wstring(L"\"") + path + L"\"";

    const BOOL ok = CreateProcessW(nullptr, commandLine.data(), nullptr, nullptr,
                                   FALSE, CREATE_NO_WINDOW, nullptr, nullptr,
                                   &si, &pi);
    if (ok)
    {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    return ok != FALSE;
}

#else

bool OverlayLauncher::ensureRunning() { return false; }

#endif

} // namespace keydock
