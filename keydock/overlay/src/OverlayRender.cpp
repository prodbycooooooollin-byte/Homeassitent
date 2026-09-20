// Painting for OverlayWindow. Kept apart from the window/lifecycle logic so
// the layout can be reworked without touching the Win32 plumbing.
#include "OverlayWindow.h"

#include "keydock/Types.h"

#include <algorithm>
#include <cstdio>
#include <cwchar>

namespace keydock
{

namespace
{
COLORREF toCOLORREF(uint32_t argb)
{
    return RGB((argb >> 16) & 0xFF, (argb >> 8) & 0xFF, argb & 0xFF);
}

void fillRect(HDC dc, const RECT& r, COLORREF colour)
{
    HBRUSH brush = CreateSolidBrush(colour);
    FillRect(dc, &r, brush);
    DeleteObject(brush);
}

void frameRect(HDC dc, const RECT& r, COLORREF colour)
{
    HBRUSH brush = CreateSolidBrush(colour);
    FrameRect(dc, &r, brush);
    DeleteObject(brush);
}

RECT makeRect(int x, int y, int w, int h) { return RECT { x, y, x + w, y + h }; }

std::wstring widen(const std::string& s)
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

const wchar_t* confidenceWord(uint32_t c)
{
    switch (static_cast<ipc::Confidence>(c))
    {
        case ipc::Confidence::high:   return L"sicher";
        case ipc::Confidence::medium: return L"wahrscheinlich";
        case ipc::Confidence::low:    return L"unsicher";
        default:                      return L"nicht bestimmbar";
    }
}

/// Scoped font that restores the previous selection.
struct ScopedFont
{
    ScopedFont(HDC dc, int height, int weight, bool italic = false)
        : dc_(dc)
    {
        font_ = CreateFontW(-height, 0, 0, 0, weight, italic ? TRUE : FALSE,
                            FALSE, FALSE, DEFAULT_CHARSET, OUT_TT_PRECIS,
                            CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                            VARIABLE_PITCH, L"Segoe UI");
        old_ = static_cast<HFONT>(SelectObject(dc_, font_));
    }
    ~ScopedFont()
    {
        SelectObject(dc_, old_);
        DeleteObject(font_);
    }
    HDC   dc_;
    HFONT font_ = nullptr;
    HFONT old_  = nullptr;
};

void drawText(HDC dc, const RECT& r, const std::wstring& text,
              COLORREF colour, UINT format)
{
    SetTextColor(dc, colour);
    RECT copy = r;
    DrawTextW(dc, text.c_str(), -1, &copy, format | DT_SINGLELINE | DT_NOPREFIX);
}
} // namespace

std::wstring OverlayWindow::keyText(const InstanceInfo& info) const
{
    if (! info.haveResult || info.result.valid == 0 || info.result.keyTonic < 0)
        return L"--";

    std::wstring text = widen(keyName(info.result.keyTonic,
                                      info.result.keyIsMinor != 0));
    if (settings_.showCamelot)
        text += L"  " + widen(camelot(info.result.keyTonic,
                                      info.result.keyIsMinor != 0));
    return text;
}

std::wstring OverlayWindow::bpmText(const InstanceInfo& info) const
{
    if (! info.haveResult || info.result.valid == 0 || info.result.bpm <= 0.0f)
        return L"--";

    wchar_t buffer[32];
    std::swprintf(buffer, 32, L"%.1f", info.result.bpm * bpmDisplayFactor_);
    return buffer;
}

std::wstring OverlayWindow::statusLine(const InstanceInfo& info) const
{
    wchar_t buffer[128];

    switch (static_cast<ipc::Status>(info.state.status))
    {
        case ipc::Status::ready:
            return L"Bereit";
        case ipc::Status::waitingForAudio:
            return L"Warte auf Audio";
        case ipc::Status::listening:
            if (info.state.targetSeconds > 0.0f)
                std::swprintf(buffer, 128, L"Hoere zu  %.0f / %.0f s",
                              info.state.capturedSeconds, info.state.targetSeconds);
            else
                std::swprintf(buffer, 128, L"Hoere zu  %.0f s",
                              info.state.capturedSeconds);
            return buffer;
        case ipc::Status::analysing:
            return L"Analysiere ...";
        case ipc::Status::haveResult:
            std::swprintf(buffer, 128, L"Ergebnis  -  %.0f s analysiert",
                          info.result.analysedSeconds);
            return buffer;
        case ipc::Status::unsuitable:
            return L"Zu wenig bzw. ungeeignetes Audiomaterial";
        default:
            return L"Gestoppt";
    }
}

void OverlayWindow::onPaint()
{
    PAINTSTRUCT ps {};
    HDC screenDc = BeginPaint(hwnd_, &ps);

    RECT client {};
    GetClientRect(hwnd_, &client);
    const int w = client.right, h = client.bottom;

    // Double buffered: everything is drawn into a memory DC first.
    HDC     memDc  = CreateCompatibleDC(screenDc);
    HBITMAP bitmap = CreateCompatibleBitmap(screenDc, w, h);
    HBITMAP oldBmp = static_cast<HBITMAP>(SelectObject(memDc, bitmap));

    SetBkMode(memDc, TRANSPARENT);
    fillRect(memDc, client, toCOLORREF(settings_.theme.background));

    zones_.clear();

    RECT bar = makeRect(0, 0, w, scaled(36));
    paintBar(memDc, bar);

    if (settings_.detailsOpen)
    {
        RECT details = makeRect(0, scaled(36), w, h - scaled(36));
        paintDetails(memDc, details);
    }

    frameRect(memDc, client, toCOLORREF(settings_.theme.outline));

    BitBlt(screenDc, 0, 0, w, h, memDc, 0, 0, SRCCOPY);

    SelectObject(memDc, oldBmp);
    DeleteObject(bitmap);
    DeleteDC(memDc);
    EndPaint(hwnd_, &ps);
}

void OverlayWindow::paintBar(HDC dc, RECT bounds)
{
    const auto& theme = settings_.theme;
    const COLORREF text   = toCOLORREF(theme.text);
    const COLORREF dim    = toCOLORREF(theme.dimText);
    const COLORREF accent = toCOLORREF(theme.accent);

    InstanceInfo info;
    const bool have = currentInstance(info);

    int x = scaled(8);
    const int centreY = bounds.top + (bounds.bottom - bounds.top) / 2;
    const int rowH = scaled(20);
    const auto row = [&](int width) { return makeRect(x, centreY - rowH / 2, width, rowH); };

    // --- drag handle ---------------------------------------------------
    {
        RECT handle = makeRect(x, bounds.top + scaled(10), scaled(6), scaled(16));
        fillRect(dc, handle, accent);
        addZone(makeRect(x - scaled(4), bounds.top, scaled(14),
                         bounds.bottom - bounds.top), HitTarget::dragHandle);
        x += scaled(14);
    }

    // --- analyse button -------------------------------------------------
    {
        const auto status = have ? static_cast<ipc::Status>(info.state.status)
                                 : ipc::Status::ready;
        const bool busy = status == ipc::Status::listening
                       || status == ipc::Status::waitingForAudio;

        RECT button = makeRect(x, bounds.top + scaled(7),
                               scaled(84), bounds.bottom - bounds.top - scaled(14));
        fillRect(dc, button, hot_ == HitTarget::analyse
                                ? accent : toCOLORREF(theme.outline));

        ScopedFont font(dc, scaled(12), FW_SEMIBOLD);
        drawText(dc, button, busy ? L"Stoppen" : L"Analysieren",
                 hot_ == HitTarget::analyse ? toCOLORREF(theme.background) : text,
                 DT_CENTER | DT_VCENTER);

        addZone(button, HitTarget::analyse);
        x += scaled(90);
    }

    // --- key ------------------------------------------------------------
    {
        ScopedFont font(dc, scaled(17), FW_SEMIBOLD);
        const auto key = have ? keyText(info) : L"--";
        RECT r = row(scaled(118));
        drawText(dc, r, key, text, DT_LEFT | DT_VCENTER);
        x += scaled(122);
    }

    // --- bpm --------------------------------------------------------------
    {
        ScopedFont font(dc, scaled(17), FW_SEMIBOLD);
        RECT r = row(scaled(58));
        drawText(dc, r, have ? bpmText(info) : L"--", text, DT_RIGHT | DT_VCENTER);
        x += scaled(60);

        ScopedFont small(dc, scaled(10), FW_NORMAL);
        RECT unit = row(scaled(28));
        drawText(dc, unit, L"BPM", dim, DT_LEFT | DT_VCENTER);
        x += scaled(30);
    }

    // --- status, filling whatever space is left ---------------------------
    {
        const int detailsX = bounds.right - scaled(50);
        const int available = detailsX - x - scaled(8);
        if (available > scaled(60))
        {
            ScopedFont font(dc, scaled(11), FW_NORMAL);
            RECT r = row(available);
            const auto line = have ? statusLine(info) : L"Kein Plugin verbunden";
            drawText(dc, r, line,
                     have && info.state.status == static_cast<uint32_t>(ipc::Status::analysing)
                         ? accent : dim,
                     DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS);
        }
    }

    // --- details toggle and resize grip -----------------------------------
    {
        RECT toggle = makeRect(bounds.right - scaled(46), bounds.top + scaled(7),
                               scaled(22), bounds.bottom - bounds.top - scaled(14));
        ScopedFont font(dc, scaled(12), FW_NORMAL);
        drawText(dc, toggle, settings_.detailsOpen ? L"⌃" : L"⌄",
                 hot_ == HitTarget::details ? accent : dim, DT_CENTER | DT_VCENTER);
        addZone(toggle, HitTarget::details);

        RECT grip = makeRect(bounds.right - scaled(16), bounds.top,
                             scaled(16), bounds.bottom - bounds.top);
        ScopedFont gripFont(dc, scaled(12), FW_NORMAL);
        drawText(dc, grip, L"⋮", dim, DT_CENTER | DT_VCENTER);
        addZone(grip, HitTarget::resizeGrip);
    }

    // --- capture progress -------------------------------------------------
    if (have && info.state.status == static_cast<uint32_t>(ipc::Status::listening)
        && info.state.targetSeconds > 0.0f)
    {
        RECT track = makeRect(0, bounds.bottom - scaled(2),
                              bounds.right, scaled(2));
        fillRect(dc, track, toCOLORREF(theme.outline));
        RECT fill = track;
        fill.right = static_cast<LONG>(track.right
                        * std::clamp(info.state.progress, 0.0f, 1.0f));
        fillRect(dc, fill, accent);
    }
}

void OverlayWindow::paintDetails(HDC dc, RECT bounds)
{
    const auto& theme = settings_.theme;
    const COLORREF text   = toCOLORREF(theme.text);
    const COLORREF dim    = toCOLORREF(theme.dimText);
    const COLORREF accent = toCOLORREF(theme.accent);

    RECT divider = makeRect(bounds.left, bounds.top, bounds.right - bounds.left, 1);
    fillRect(dc, divider, toCOLORREF(theme.outline));

    InstanceInfo info;
    const bool have = currentInstance(info);

    int y = bounds.top + scaled(8);
    const int left = scaled(12);
    const int lineH = scaled(15);

    const auto line = [&](const std::wstring& label, const std::wstring& value,
                          COLORREF valueColour)
    {
        ScopedFont font(dc, scaled(10), FW_NORMAL);
        drawText(dc, makeRect(left, y, scaled(96), lineH), label, dim,
                 DT_LEFT | DT_VCENTER);
        drawText(dc, makeRect(left + scaled(100), y,
                              bounds.right - left - scaled(112), lineH),
                 value, valueColour, DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS);
        y += lineH;
    };

    if (! have)
    {
        line(L"Status", L"Kein KeyDock-Plugin verbunden. Plugin auf dem Master einsetzen.", dim);
    }
    else
    {
        const auto& r = info.result;

        // Confidence is an ordinal bucket, never a percentage.
        if (info.haveResult && r.valid != 0)
        {
            line(L"Sicherheit",
                 std::wstring(L"Tonart ") + confidenceWord(r.keyConfidence)
                     + L"  |  Tempo " + confidenceWord(r.bpmConfidence),
                 text);

            std::wstring alts;
            for (const auto& alt : r.altKeys)
            {
                if (alt.tonic < 0)
                    continue;
                if (! alts.empty())
                    alts += L",  ";
                alts += widen(keyName(alt.tonic, alt.isMinor != 0));
            }
            line(L"Alternativen", alts.empty() ? L"keine" : alts, dim);

            std::wstring tempoAlts;
            wchar_t buffer[32];
            for (const auto& alt : r.altTempos)
            {
                if (alt.bpm <= 0.0f)
                    continue;
                if (! tempoAlts.empty())
                    tempoAlts += L",  ";
                std::swprintf(buffer, 32, L"%.1f", alt.bpm);
                tempoAlts += buffer;
            }
            line(L"Tempo-Optionen", tempoAlts.empty() ? L"keine" : tempoAlts, dim);

            if (r.note[0] != '\0')
                line(L"Hinweis", widen(r.note), accent);
        }
        else
        {
            line(L"Ergebnis", info.haveResult
                     ? widen(r.note) : L"Noch keine Analyse gestartet.", dim);
        }

        // Host tempo is shown next to, never instead of, the measured tempo.
        wchar_t host[96];
        std::swprintf(host, 96, L"%.2f BPM (nur Anzeige, kein Analyseergebnis)",
                      info.state.hostBpm);
        line(L"Projekt-Tempo", info.state.hostBpm > 0.0 ? host : L"unbekannt", dim);

        line(L"Instanz", widen(info.hello.displayName), dim);
    }

    // --- buttons ---------------------------------------------------------
    y = bounds.bottom - scaled(26);
    int x = left;

    const auto button = [&](const std::wstring& label, HitTarget target, int widthDip)
    {
        RECT r = makeRect(x, y, scaled(widthDip), scaled(18));
        fillRect(dc, r, hot_ == target ? accent : toCOLORREF(theme.outline));
        ScopedFont font(dc, scaled(10), FW_NORMAL);
        drawText(dc, r, label,
                 hot_ == target ? toCOLORREF(theme.background) : text,
                 DT_CENTER | DT_VCENTER);
        addZone(r, target);
        x += scaled(widthDip + 5);
    };

    wchar_t lengthLabel[24];
    if (settings_.captureSeconds > 0.0f)
        std::swprintf(lengthLabel, 24, L"%.0f s", settings_.captureSeconds);
    else
        std::swprintf(lengthLabel, 24, L"manuell");

    button(lengthLabel, HitTarget::lengthCycle, 46);
    button(L"1/2", HitTarget::halfTime, 30);
    button(L"x2",  HitTarget::doubleTime, 30);
    button(L"Reset", HitTarget::reset, 44);
    button(L"Kopieren", HitTarget::copy, 56);
    button(settings_.mode == Settings::Mode::docked ? L"Angeheftet" : L"Frei",
           HitTarget::modeToggle, 62);
    button(L"Theme", HitTarget::themeCycle, 46);
    button(settings_.showCamelot ? L"Camelot an" : L"Camelot aus",
           HitTarget::camelotToggle, 66);
    button(L"-", HitTarget::scaleDown, 20);
    button(L"+", HitTarget::scaleUp, 20);

    const auto list = server_.instances();
    if (list.size() > 1)
    {
        wchar_t label[32];
        std::swprintf(label, 32, L"Instanz %d/%d", 1, static_cast<int>(list.size()));
        button(label, HitTarget::instancePicker, 70);
    }
}

} // namespace keydock
