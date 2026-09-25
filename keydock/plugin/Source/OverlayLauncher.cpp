#include "OverlayLauncher.h"
#include "KeyDockProtocol.h"

#if defined(_WIN32)
  // NOMINMAX: windows.h otherwise defines min/max as macros, which breaks every
  // std::min / std::max call in this translation unit under MSVC.
  #ifndef NOMINMAX
    #define NOMINMAX
  #endif
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #include <windows.h>
#endif

#include <juce_core/juce_core.h>

namespace keydock
{

namespace
{
/// The overlay ships next to the .vst3 bundle, so it is found relative to the
/// loaded module rather than through a registry key or the PATH.
///
/// On Windows a VST3 is a bundle, so currentApplicationFile points at
///   <VST3 folder>/KeyDock.vst3/Contents/x86_64-win/KeyDock.vst3
/// while the overlay sits four levels up, next to the bundle:
///   <VST3 folder>/KeyDockOverlay.exe
/// A plain (non-bundle) layout puts it one level up instead, so walk outwards
/// rather than assuming either shape.
juce::File overlayFile()
{
    const auto module = juce::File::getSpecialLocation(
        juce::File::currentApplicationFile);

    juce::File directory = module.getParentDirectory();

    // 5 levels covers the bundle layout (4) with one to spare; stop at the
    // filesystem root so a malformed path cannot loop.
    for (int level = 0; level < 5; ++level)
    {
        const auto candidate = directory.getChildFile("KeyDockOverlay.exe");
        if (candidate.existsAsFile())
            return candidate;

        const auto parent = directory.getParentDirectory();
        if (parent == directory)
            break;
        directory = parent;
    }

    // Nothing found: report the documented install location, which is what the
    // editor shows when it explains that the overlay is missing.
    auto bundle = module;
    for (int level = 0; level < 4 && bundle.getParentDirectory() != bundle; ++level)
        bundle = bundle.getParentDirectory();
    return bundle.getChildFile("KeyDockOverlay.exe");
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
