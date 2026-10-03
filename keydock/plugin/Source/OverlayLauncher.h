// Starts the overlay companion app on demand.
//
// Deliberately lazy: the overlay is only launched once real-time audio has
// been seen or the user asked for an analysis, so a plugin scan never spawns
// a window. A named mutex makes sure several plugin instances - and several
// FL Studio processes - end up with exactly one overlay.
#pragma once

#include <string>

namespace keydock
{

class OverlayLauncher
{
public:
    /// Launches the overlay if it is not already running. Safe to call often;
    /// the call is cheap and idempotent. Never called from the audio thread.
    /// @returns false when the executable could not be found or started.
    static bool ensureRunning();

    /// Absolute path the launcher looks for, for diagnostics in the editor.
    static std::string expectedExecutablePath();
};

} // namespace keydock
