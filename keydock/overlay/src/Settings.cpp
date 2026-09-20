#include "Settings.h"

// NOMINMAX: windows.h otherwise defines min/max as macros, which breaks every
// std::min / std::max call in this translation unit under MSVC.
#ifndef NOMINMAX
  #define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <cstdio>
#include <fstream>
#include <sstream>

namespace keydock
{

namespace
{
const Theme kThemes[] =
{
    { 0xF21B1E23, 0xFFE6E8EC, 0xFF8B929C, 0xFF4DA3FF, 0xFF2E333B, "KeyDock Dark" },
    { 0xF2101114, 0xFFEDEFF2, 0xFF7C838D, 0xFFFF9A3C, 0xFF24282E, "Graphite Amber" },
    { 0xF2161B18, 0xFFE4EDE6, 0xFF7E8C83, 0xFF4CD08A, 0xFF27302B, "Studio Green" },
    { 0xF21A1620, 0xFFECE7F2, 0xFF8C8599, 0xFFB07CFF, 0xFF302938, "Violet Ink" },
    { 0xF2F2F3F5, 0xFF16181C, 0xFF5F666F, 0xFF2668D8, 0xFFD5D8DD, "Light Desk" },
};

/// %APPDATA% rather than SHGetKnownFolderPath: same directory, but it keeps
/// the overlay free of an ole32/uuid dependency for one path lookup.
std::string appDataDir()
{
    wchar_t wide[MAX_PATH * 2] = {};
    const DWORD n = GetEnvironmentVariableW(L"APPDATA", wide, MAX_PATH * 2);
    if (n == 0 || n >= MAX_PATH * 2)
        return {};

    char utf8[MAX_PATH * 4] = {};
    if (WideCharToMultiByte(CP_UTF8, 0, wide, -1, utf8, sizeof(utf8), nullptr, nullptr) == 0)
        return {};
    return utf8;
}

uint32_t parseColour(const std::string& s, uint32_t fallback)
{
    try { return static_cast<uint32_t>(std::stoul(s, nullptr, 16)); }
    catch (...) { return fallback; }
}
} // namespace

int   numBuiltInThemes()          { return static_cast<int>(sizeof(kThemes) / sizeof(Theme)); }
Theme builtInTheme(int index)
{
    if (index < 0 || index >= numBuiltInThemes())
        index = 0;
    return kThemes[index];
}

std::string Settings::configPath()
{
    const auto base = appDataDir();
    if (base.empty())
        return "overlay.cfg";
    return base + "\\KeyDock\\overlay.cfg";
}

void Settings::load()
{
    std::ifstream in(configPath());
    if (! in)
        return;

    std::string line;
    while (std::getline(in, line))
    {
        const auto eq = line.find('=');
        if (eq == std::string::npos || line.empty() || line[0] == '#')
            continue;
        raw_[line.substr(0, eq)] = line.substr(eq + 1);
    }

    const auto num = [this](const char* key, int fallback)
    {
        const auto it = raw_.find(key);
        if (it == raw_.end())
            return fallback;
        try { return std::stoi(it->second); } catch (...) { return fallback; }
    };

    mode           = num("mode", 0) == 1 ? Mode::floating : Mode::docked;
    anchorRight    = num("anchorRight", anchorRight);
    anchorTop      = num("anchorTop", anchorTop);
    floatX         = num("floatX", floatX);
    floatY         = num("floatY", floatY);
    width          = num("width", width);
    scalePercent   = num("scalePercent", scalePercent);
    showCamelot    = num("showCamelot", 1) != 0;
    detailsOpen    = num("detailsOpen", 0) != 0;
    captureSeconds = static_cast<float>(num("captureSeconds", 20));

    if (raw_.count("themeName"))   theme.name       = raw_["themeName"];
    if (raw_.count("background"))  theme.background = parseColour(raw_["background"], theme.background);
    if (raw_.count("text"))        theme.text       = parseColour(raw_["text"], theme.text);
    if (raw_.count("dimText"))     theme.dimText    = parseColour(raw_["dimText"], theme.dimText);
    if (raw_.count("accent"))      theme.accent     = parseColour(raw_["accent"], theme.accent);
    if (raw_.count("outline"))     theme.outline    = parseColour(raw_["outline"], theme.outline);

    // Guard against a corrupted or hand-edited file leaving an unusable window.
    if (width < 280)  width = 280;
    if (width > 1200) width = 1200;
    if (scalePercent < 70)  scalePercent = 70;
    if (scalePercent > 200) scalePercent = 200;
}

void Settings::save() const
{
    const auto path = configPath();
    const auto slash = path.find_last_of('\\');
    if (slash != std::string::npos)
    {
        std::string dir = path.substr(0, slash);
        CreateDirectoryA(dir.c_str(), nullptr);
    }

    std::ofstream out(path, std::ios::trunc);
    if (! out)
        return;

    char buffer[64];
    const auto hex = [&buffer](uint32_t v)
    {
        std::snprintf(buffer, sizeof(buffer), "%08X", v);
        return std::string(buffer);
    };

    out << "# KeyDock overlay settings\n";
    out << "mode="           << (mode == Mode::floating ? 1 : 0) << "\n";
    out << "anchorRight="    << anchorRight    << "\n";
    out << "anchorTop="      << anchorTop      << "\n";
    out << "floatX="         << floatX         << "\n";
    out << "floatY="         << floatY         << "\n";
    out << "width="          << width          << "\n";
    out << "scalePercent="   << scalePercent   << "\n";
    out << "showCamelot="    << (showCamelot ? 1 : 0) << "\n";
    out << "detailsOpen="    << (detailsOpen ? 1 : 0) << "\n";
    out << "captureSeconds=" << static_cast<int>(captureSeconds) << "\n";
    out << "themeName="      << theme.name     << "\n";
    out << "background="     << hex(theme.background) << "\n";
    out << "text="           << hex(theme.text)       << "\n";
    out << "dimText="        << hex(theme.dimText)    << "\n";
    out << "accent="         << hex(theme.accent)     << "\n";
    out << "outline="        << hex(theme.outline)    << "\n";
}

} // namespace keydock
