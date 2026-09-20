// Overlay settings, persisted as a flat key=value file under
// %APPDATA%\KeyDock\overlay.cfg. Deliberately dependency-free.
#pragma once

#include <cstdint>
#include <map>
#include <cstdint>
#include <string>

namespace keydock
{

struct Theme
{
    uint32_t background = 0xF21B1E23;  // AARRGGBB
    uint32_t text       = 0xFFE6E8EC;
    uint32_t dimText    = 0xFF8B929C;
    uint32_t accent     = 0xFF4DA3FF;
    uint32_t outline    = 0xFF2E333B;
    std::string name    = "KeyDock Dark";
};

struct Settings
{
    /// Anchoring mode. Docked positions relative to the FL Studio main window;
    /// floating keeps an absolute desktop position for toolbar presets that
    /// leave no free space.
    enum class Mode { docked, floating };

    Mode   mode          = Mode::docked;

    /// Docked: offset in DIPs from the FL main window's top-right corner.
    /// The default clears the window's caption buttons; anchorTop of 6 put
    /// the bar straight over FL Studio's close button.
    int    anchorRight   = 24;
    int    anchorTop     = 46;

    /// Floating: absolute virtual-desktop position in DIPs.
    int    floatX        = 200;
    int    floatY        = 200;

    int    width         = 430;   // DIPs
    int    scalePercent  = 100;   // extra user scaling on top of the system DPI
    int    opacityPercent = 96;   // window opacity, 40..100
    bool   showCamelot   = true;
    bool   detailsOpen   = false;
    /// Upper bound, not a fixed duration: the analysis stops as soon as the
    /// result is stable.
    float  captureSeconds = 30.0f;

    /// Rolling history length in seconds; 0 keeps the feature off, which is
    /// the default so an existing project behaves exactly as before.
    float  lookbackSeconds = 0.0f;

    /// MIDI output that the FL Studio tempo script listens on. Empty means
    /// tempo handover is unavailable and the UI says so.
    std::wstring tempoPortName;

    Theme  theme;

    void load();
    void save() const;

    static std::string configPath();

private:
    std::map<std::string, std::string> raw_;
};

/// Built-in themes the settings panel cycles through.
int         numBuiltInThemes();
Theme       builtInTheme(int index);

} // namespace keydock
