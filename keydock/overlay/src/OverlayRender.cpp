// Painting for OverlayWindow.
//
// Two surfaces: a compact bar that stays out of the way, and a settings panel
// that explains every control instead of leaving the user to guess. All icons
// are drawn with GDI primitives rather than font glyphs - relying on glyphs
// produced mojibake under MSVC and depends on which fonts are installed.
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

/// Blends towards white or black, for subtle surfaces that follow the theme.
COLORREF mix(COLORREF a, COLORREF b, double t)
{
    const auto lerp = [t](int x, int y) { return static_cast<int>(x + (y - x) * t); };
    return RGB(lerp(GetRValue(a), GetRValue(b)),
               lerp(GetGValue(a), GetGValue(b)),
               lerp(GetBValue(a), GetBValue(b)));
}

void fillRect(HDC dc, const RECT& r, COLORREF colour)
{
    HBRUSH brush = CreateSolidBrush(colour);
    FillRect(dc, &r, brush);
    DeleteObject(brush);
}

void fillRounded(HDC dc, const RECT& r, int radius, COLORREF colour)
{
    HBRUSH brush = CreateSolidBrush(colour);
    HPEN   pen   = CreatePen(PS_SOLID, 1, colour);
    auto*  oldB  = SelectObject(dc, brush);
    auto*  oldP  = SelectObject(dc, pen);
    RoundRect(dc, r.left, r.top, r.right, r.bottom, radius, radius);
    SelectObject(dc, oldB);
    SelectObject(dc, oldP);
    DeleteObject(brush);
    DeleteObject(pen);
}

void strokeRounded(HDC dc, const RECT& r, int radius, COLORREF colour)
{
    HPEN  pen  = CreatePen(PS_SOLID, 1, colour);
    auto* oldP = SelectObject(dc, pen);
    auto* oldB = SelectObject(dc, GetStockObject(NULL_BRUSH));
    RoundRect(dc, r.left, r.top, r.right, r.bottom, radius, radius);
    SelectObject(dc, oldP);
    SelectObject(dc, oldB);
    DeleteObject(pen);
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
    ScopedFont(HDC dc, int height, int weight, int letterSpacing = 0)
        : dc_(dc)
    {
        LOGFONTW lf {};
        lf.lfHeight         = -height;
        lf.lfWeight         = weight;
        lf.lfCharSet        = DEFAULT_CHARSET;
        lf.lfOutPrecision   = OUT_TT_PRECIS;
        lf.lfQuality        = CLEARTYPE_QUALITY;
        lf.lfPitchAndFamily = VARIABLE_PITCH;
        wcscpy_s(lf.lfFaceName, L"Segoe UI");
        font_ = CreateFontIndirectW(&lf);
        old_  = static_cast<HFONT>(SelectObject(dc_, font_));
        if (letterSpacing != 0)
            SetTextCharacterExtra(dc_, letterSpacing);
        spacing_ = letterSpacing;
    }
    ~ScopedFont()
    {
        if (spacing_ != 0)
            SetTextCharacterExtra(dc_, 0);
        SelectObject(dc_, old_);
        DeleteObject(font_);
    }
    HDC   dc_;
    HFONT font_ = nullptr;
    HFONT old_  = nullptr;
    int   spacing_ = 0;
};

void drawText(HDC dc, const RECT& r, const std::wstring& text,
              COLORREF colour, UINT format)
{
    SetTextColor(dc, colour);
    RECT copy = r;
    DrawTextW(dc, text.c_str(), -1, &copy, format | DT_SINGLELINE | DT_NOPREFIX);
}

int textWidth(HDC dc, const std::wstring& text)
{
    SIZE size {};
    GetTextExtentPoint32W(dc, text.c_str(), static_cast<int>(text.size()), &size);
    return size.cx;
}
} // namespace

// --- drawn icons ----------------------------------------------------------

void OverlayWindow::drawChevron(HDC dc, RECT box, bool pointsUp, COLORREF colour) const
{
    const int cx = (box.left + box.right) / 2;
    const int cy = (box.top + box.bottom) / 2;
    const int w  = std::max(3, scaled(4));
    const int h  = std::max(2, scaled(2));

    HPEN  pen  = CreatePen(PS_SOLID, std::max(1, scaled(1)), colour);
    auto* oldP = SelectObject(dc, pen);

    const POINT pts[3] =
    {
        { cx - w, pointsUp ? cy + h : cy - h },
        { cx,     pointsUp ? cy - h : cy + h },
        { cx + w, pointsUp ? cy + h : cy - h },
    };
    Polyline(dc, pts, 3);

    SelectObject(dc, oldP);
    DeleteObject(pen);
}

void OverlayWindow::drawGripDots(HDC dc, RECT box, COLORREF colour) const
{
    const int cx = (box.left + box.right) / 2;
    const int cy = (box.top + box.bottom) / 2;
    const int d  = std::max(1, scaled(2));
    const int gap = std::max(3, scaled(4));

    for (int i = -1; i <= 1; ++i)
    {
        RECT dot = makeRect(cx - d / 2, cy + i * gap - d / 2, d, d);
        fillRect(dc, dot, colour);
    }
}

void OverlayWindow::drawSettingsIcon(HDC dc, RECT box, COLORREF colour) const
{
    // Three sliders: unmistakably "settings" without needing a gear glyph.
    const int w  = scaled(11);
    const int cx = (box.left + box.right) / 2;
    const int cy = (box.top + box.bottom) / 2;
    const int gap = std::max(3, scaled(4));
    const int thickness = std::max(1, scaled(1));

    const int knobAt[3] = { scaled(7), scaled(3), scaled(8) };

    for (int i = 0; i < 3; ++i)
    {
        const int y = cy + (i - 1) * gap;
        fillRect(dc, makeRect(cx - w / 2, y, w, thickness), colour);

        const int knobSize = std::max(2, scaled(3));
        fillRect(dc, makeRect(cx - w / 2 + knobAt[i] - knobSize / 2,
                              y - knobSize / 2 + thickness / 2,
                              knobSize, knobSize), colour);
    }
}

void OverlayWindow::drawConfidenceDots(HDC dc, RECT box, uint32_t confidence,
                                       COLORREF on, COLORREF off) const
{
    const int filled = static_cast<int>(confidence);   // none=0 .. high=3
    const int d   = std::max(2, scaled(3));
    const int gap = std::max(3, scaled(5));
    const int cy  = (box.top + box.bottom) / 2 - d / 2;

    for (int i = 0; i < 3; ++i)
    {
        RECT dot = makeRect(box.left + i * gap, cy, d, d);
        fillRect(dc, dot, i < filled ? on : off);
    }
}

// --- text helpers ---------------------------------------------------------

std::wstring OverlayWindow::keyText(const InstanceInfo& info) const
{
    if (! info.haveResult || info.result.valid == 0 || info.result.keyTonic < 0)
        return L"--";
    return widen(keyName(info.result.keyTonic, info.result.keyIsMinor != 0));
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
    wchar_t buffer[160];

    switch (static_cast<ipc::Status>(info.state.status))
    {
        case ipc::Status::ready:
            return L"Bereit – Wiedergabe starten und „Analysieren“ drücken";
        case ipc::Status::waitingForAudio:
            return L"Warte auf Audio …";
        case ipc::Status::listening:
            if (info.state.targetSeconds > 0.0f)
                std::swprintf(buffer, 160, L"Höre zu – %.0f s (endet früher, sobald stabil)",
                              info.state.capturedSeconds);
            else
                std::swprintf(buffer, 160, L"Höre zu – %.0f s",
                              info.state.capturedSeconds);
            return buffer;
        case ipc::Status::analysing:
            return L"Analysiere …";
        case ipc::Status::haveResult:
            std::swprintf(buffer, 160, L"Fertig nach %.0f s",
                          info.result.analysedSeconds);
            return buffer;
        case ipc::Status::unsuitable:
            return L"Material nicht auswertbar";
        default:
            return L"Gestoppt";
    }
}

// --- paint ----------------------------------------------------------------

void OverlayWindow::onPaint()
{
    // A new analysis always starts from the measured tempo. Without this the
    // half/double choice from the previous take silently carried over and
    // multiplied the next reading.
    {
        InstanceInfo info;
        if (currentInstance(info) && info.haveResult
            && info.result.analysisId != bpmFactorAnalysisId_)
        {
            bpmFactorAnalysisId_ = info.result.analysisId;
            bpmDisplayFactor_    = 1.0f;
        }
    }

    PAINTSTRUCT ps {};
    HDC screenDc = BeginPaint(hwnd_, &ps);

    RECT client {};
    GetClientRect(hwnd_, &client);
    const int w = client.right, h = client.bottom;

    HDC     memDc  = CreateCompatibleDC(screenDc);
    HBITMAP bitmap = CreateCompatibleBitmap(screenDc, w, h);
    HBITMAP oldBmp = static_cast<HBITMAP>(SelectObject(memDc, bitmap));

    SetBkMode(memDc, TRANSPARENT);
    fillRect(memDc, client, toCOLORREF(settings_.theme.background));

    zones_.clear();
    hoverHelp_.clear();

    const int barH = scaled(40);
    paintBar(memDc, makeRect(0, 0, w, barH));

    if (settings_.detailsOpen)
        paintDetails(memDc, makeRect(0, barH, w, h - barH));

    strokeRounded(memDc, RECT { 0, 0, w, h }, scaled(8),
                  toCOLORREF(settings_.theme.outline));

    BitBlt(screenDc, 0, 0, w, h, memDc, 0, 0, SRCCOPY);

    SelectObject(memDc, oldBmp);
    DeleteObject(bitmap);
    DeleteDC(memDc);
    EndPaint(hwnd_, &ps);
}

void OverlayWindow::paintBar(HDC dc, RECT bounds)
{
    const auto& theme = settings_.theme;
    const COLORREF text    = toCOLORREF(theme.text);
    const COLORREF dim     = toCOLORREF(theme.dimText);
    const COLORREF accent  = toCOLORREF(theme.accent);
    const COLORREF surface = mix(toCOLORREF(theme.background), text, 0.07);
    const COLORREF outline = toCOLORREF(theme.outline);

    InstanceInfo info;
    const bool have = currentInstance(info);
    const bool haveResult = have && info.haveResult && info.result.valid != 0;

    const int top = bounds.top;
    const int barH = bounds.bottom - bounds.top;
    int x = scaled(10);

    // --- drag handle: an accent bar doubling as the brand mark ----------
    {
        RECT handle = makeRect(x, top + scaled(12), scaled(3), barH - scaled(24));
        fillRounded(dc, handle, scaled(2), accent);
        addZone(makeRect(x - scaled(6), top, scaled(15), barH), HitTarget::dragHandle);
        x += scaled(13);
    }

    // --- lookback: analyse what already played ---------------------------
    {
        const bool ready = have && info.edit.lookbackEnabled != 0
                        && info.edit.lookbackAvailableSeconds >= 4.0f;

        RECT button = makeRect(x, top + scaled(8), scaled(30), barH - scaled(16));
        if (hot_ == HitTarget::lookbackTake)
            fillRounded(dc, button, scaled(5), surface);
        strokeRounded(dc, button, scaled(5), ready ? outline : mix(outline, surface, 0.5));

        // A back-arrow drawn from primitives, same reason as the other icons.
        {
            const int cx = (button.left + button.right) / 2;
            const int cy = (button.top + button.bottom) / 2;
            const int r  = scaled(5);
            HPEN pen = CreatePen(PS_SOLID, std::max(1, scaled(1)),
                                 ready ? (hot_ == HitTarget::lookbackTake ? accent : text) : dim);
            auto* oldPen = SelectObject(dc, pen);
            auto* oldBrush = SelectObject(dc, GetStockObject(NULL_BRUSH));
            Arc(dc, cx - r, cy - r, cx + r, cy + r, cx, cy - r, cx - r, cy);
            const POINT head[3] = { { cx - r + scaled(3), cy - scaled(1) },
                                    { cx - r,             cy + scaled(2) },
                                    { cx - r - scaled(3), cy - scaled(1) } };
            Polyline(dc, head, 3);
            SelectObject(dc, oldPen);
            SelectObject(dc, oldBrush);
            DeleteObject(pen);
        }
        addZone(button, HitTarget::lookbackTake);
        x += scaled(36);
    }

    // --- primary action --------------------------------------------------
    {
        const auto status = have ? static_cast<ipc::Status>(info.state.status)
                                 : ipc::Status::ready;
        const bool busy = status == ipc::Status::listening
                       || status == ipc::Status::waitingForAudio
                       || status == ipc::Status::analysing;

        RECT button = makeRect(x, top + scaled(8), scaled(88), barH - scaled(16));
        const bool hot = hot_ == HitTarget::analyse;

        if (busy)
        {
            fillRounded(dc, button, scaled(5), surface);
            strokeRounded(dc, button, scaled(5), hot ? accent : outline);
        }
        else
        {
            fillRounded(dc, button, scaled(5),
                        hot ? mix(accent, RGB(255, 255, 255), 0.18) : accent);
        }

        ScopedFont font(dc, scaled(12), FW_SEMIBOLD);
        drawText(dc, button, busy ? L"Stoppen" : L"Analysieren",
                 busy ? text : toCOLORREF(theme.background),
                 DT_CENTER | DT_VCENTER);

        addZone(button, HitTarget::analyse);
        x += scaled(96);
    }

    // --- KEY -------------------------------------------------------------
    {
        {
            ScopedFont caps(dc, scaled(8), FW_SEMIBOLD, scaled(1));
            drawText(dc, makeRect(x, top + scaled(7), scaled(60), scaled(10)),
                     L"TONART", dim, DT_LEFT | DT_TOP);
        }
        ScopedFont value(dc, scaled(16), FW_SEMIBOLD);
        const auto key = have ? keyText(info) : L"--";
        drawText(dc, makeRect(x, top + scaled(17), scaled(104), scaled(18)),
                 key, haveResult ? text : dim, DT_LEFT | DT_VCENTER);

        const int keyW = std::min(scaled(104), textWidth(dc, key) + scaled(6));

        // Camelot as a chip next to the key, clearly secondary.
        if (settings_.showCamelot && haveResult && info.result.keyTonic >= 0)
        {
            const auto code = widen(camelot(info.result.keyTonic,
                                            info.result.keyIsMinor != 0));
            ScopedFont chipFont(dc, scaled(9), FW_SEMIBOLD);
            const int cw = textWidth(dc, code) + scaled(10);
            RECT chip = makeRect(x + keyW, top + scaled(19), cw, scaled(14));
            fillRounded(dc, chip, scaled(4), surface);
            drawText(dc, chip, code, accent, DT_CENTER | DT_VCENTER);
        }

        if (haveResult)
            drawConfidenceDots(dc, makeRect(x, top + scaled(9), scaled(20), scaled(6)),
                               info.result.keyConfidence, accent,
                               mix(toCOLORREF(theme.background), dim, 0.35));

        x += scaled(118);
    }

    // --- BPM --------------------------------------------------------------
    {
        {
            ScopedFont caps(dc, scaled(8), FW_SEMIBOLD, scaled(1));
            drawText(dc, makeRect(x, top + scaled(7), scaled(50), scaled(10)),
                     L"TEMPO", dim, DT_LEFT | DT_TOP);
        }
        ScopedFont value(dc, scaled(16), FW_SEMIBOLD);
        const auto bpm = have ? bpmText(info) : L"--";
        drawText(dc, makeRect(x, top + scaled(17), scaled(56), scaled(18)),
                 bpm, haveResult ? text : dim, DT_LEFT | DT_VCENTER);
        const int bpmW = std::min(scaled(56), textWidth(dc, bpm) + scaled(4));

        {
            ScopedFont unit(dc, scaled(9), FW_NORMAL);
            drawText(dc, makeRect(x + bpmW, top + scaled(21), scaled(30), scaled(12)),
                     L"BPM", dim, DT_LEFT | DT_VCENTER);
        }

        // Make a non-neutral half/double choice impossible to miss.
        if (haveResult && std::abs(bpmDisplayFactor_ - 1.0f) > 0.01f)
        {
            ScopedFont chipFont(dc, scaled(8), FW_SEMIBOLD);
            const std::wstring tag = bpmDisplayFactor_ > 1.0f ? L"×2" : L"÷2";
            RECT chip = makeRect(x + bpmW + scaled(28), top + scaled(20),
                                 scaled(20), scaled(13));
            fillRounded(dc, chip, scaled(3), accent);
            drawText(dc, chip, tag, toCOLORREF(theme.background),
                     DT_CENTER | DT_VCENTER);
        }

        if (haveResult)
            drawConfidenceDots(dc, makeRect(x, top + scaled(9), scaled(20), scaled(6)),
                               info.result.bpmConfidence, accent,
                               mix(toCOLORREF(theme.background), dim, 0.35));

        x += scaled(92);

        // One-shot handover to FL Studio's project tempo. Disabled without a
        // valid result, so it can never set something meaningless.
        {
            const bool usable = haveResult && info.result.bpm > 0.0f;
            RECT tick = makeRect(x - scaled(26), top + scaled(12), scaled(18), scaled(16));
            if (hot_ == HitTarget::applyTempo && usable)
                fillRounded(dc, tick, scaled(3), surface);

            HPEN pen = CreatePen(PS_SOLID, std::max(1, scaled(2)),
                                 usable ? (hot_ == HitTarget::applyTempo ? accent : dim)
                                        : mix(toCOLORREF(theme.background), dim, 0.45));
            auto* oldPen = SelectObject(dc, pen);
            const int cx = (tick.left + tick.right) / 2;
            const int cy = (tick.top + tick.bottom) / 2;
            const POINT check[3] = { { cx - scaled(4), cy },
                                     { cx - scaled(1), cy + scaled(3) },
                                     { cx + scaled(4), cy - scaled(4) } };
            Polyline(dc, check, 3);
            SelectObject(dc, oldPen);
            DeleteObject(pen);

            if (usable)
                addZone(tick, HitTarget::applyTempo);
        }
    }

    // --- status -----------------------------------------------------------
    {
        const int iconsX = bounds.right - scaled(56);
        const int available = iconsX - x - scaled(10);
        if (available > scaled(70))
        {
            ScopedFont font(dc, scaled(10), FW_NORMAL);
            const auto line = have ? statusLine(info)
                                   : L"Kein KeyDock-Plugin verbunden";
            const bool active = have
                && (info.state.status == static_cast<uint32_t>(ipc::Status::analysing)
                 || info.state.status == static_cast<uint32_t>(ipc::Status::listening));
            drawText(dc, makeRect(x, top, available, barH), line,
                     active ? accent : dim,
                     DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS);
        }
    }

    // --- settings toggle + resize grip -------------------------------------
    {
        RECT toggle = makeRect(bounds.right - scaled(52), top + scaled(9),
                               scaled(24), barH - scaled(18));
        if (hot_ == HitTarget::details)
            fillRounded(dc, toggle, scaled(4),
                        mix(toCOLORREF(theme.background), toCOLORREF(theme.text), 0.1));
        drawSettingsIcon(dc, toggle,
                         hot_ == HitTarget::details || settings_.detailsOpen
                             ? accent : dim);
        addZone(toggle, HitTarget::details);

        RECT chevron = makeRect(bounds.right - scaled(28), top + scaled(9),
                                scaled(14), barH - scaled(18));
        drawChevron(dc, chevron, settings_.detailsOpen, dim);
        addZone(chevron, HitTarget::details);

        RECT grip = makeRect(bounds.right - scaled(14), top, scaled(14), barH);
        drawGripDots(dc, grip, mix(toCOLORREF(theme.background), dim, 0.55));
        addZone(grip, HitTarget::resizeGrip);
    }

    // --- short confirmation, e.g. after a tempo handover ---------------------
    if (! toast_.empty())
    {
        ScopedFont font(dc, scaled(10), FW_SEMIBOLD);
        const int w = textWidth(dc, toast_) + scaled(18);
        RECT box = makeRect(std::max<int>(scaled(8), bounds.right - w - scaled(58)),
                            top + scaled(9), w, barH - scaled(18));
        fillRounded(dc, box, scaled(4), accent);
        drawText(dc, box, toast_, toCOLORREF(theme.background),
                 DT_CENTER | DT_VCENTER);
    }

    // --- capture progress ---------------------------------------------------
    if (have && info.state.status == static_cast<uint32_t>(ipc::Status::listening)
        && info.state.targetSeconds > 0.0f)
    {
        RECT track = makeRect(0, bounds.bottom - scaled(2), bounds.right, scaled(2));
        fillRect(dc, track, outline);
        RECT fill = track;
        fill.right = static_cast<LONG>(track.right
                        * std::clamp(info.state.progress, 0.0f, 1.0f));
        fillRect(dc, fill, accent);
    }
}

void OverlayWindow::paintDetails(HDC dc, RECT bounds)
{
    const auto& theme = settings_.theme;
    const COLORREF text    = toCOLORREF(theme.text);
    const COLORREF dim     = toCOLORREF(theme.dimText);
    const COLORREF accent  = toCOLORREF(theme.accent);
    const COLORREF outline = toCOLORREF(theme.outline);
    const COLORREF surface = mix(toCOLORREF(theme.background), text, 0.06);

    fillRect(dc, makeRect(bounds.left, bounds.top,
                          bounds.right - bounds.left, 1), outline);

    InstanceInfo info;
    const bool have = currentInstance(info);
    const bool haveResult = have && info.haveResult && info.result.valid != 0;

    const int left   = scaled(14);
    const int right  = bounds.right - scaled(14);
    const int labelW = scaled(118);
    int y = bounds.top + scaled(10);

    const auto sectionHeader = [&](const wchar_t* title)
    {
        ScopedFont font(dc, scaled(8), FW_SEMIBOLD, scaled(2));
        drawText(dc, makeRect(left, y, right - left, scaled(12)), title, accent,
                 DT_LEFT | DT_VCENTER);
        y += scaled(15);
    };

    /// One settings row: a label, a control strip on the right, and a line of
    /// plain German underneath saying what the control actually does.
    const auto rowLabel = [&](const wchar_t* label, const wchar_t* help)
    {
        ScopedFont font(dc, scaled(10), FW_SEMIBOLD);
        drawText(dc, makeRect(left, y, labelW, scaled(16)), label, text,
                 DT_LEFT | DT_VCENTER);
        ScopedFont small(dc, scaled(9), FW_NORMAL);
        drawText(dc, makeRect(left, y + scaled(15), right - left, scaled(12)),
                 help, dim, DT_LEFT | DT_TOP | DT_END_ELLIPSIS);
    };

    int segX = 0;
    const auto beginSegments = [&]() { segX = left + labelW; };

    /// A segmented option. The selected one is filled, so the current state is
    /// readable at a glance rather than having to be remembered.
    const auto segment = [&](const wchar_t* label, HitTarget target, bool selected)
    {
        ScopedFont font(dc, scaled(9), selected ? FW_SEMIBOLD : FW_NORMAL);
        const int w = textWidth(dc, label) + scaled(14);
        RECT box = makeRect(segX, y, w, scaled(17));

        if (selected)
            fillRounded(dc, box, scaled(4), accent);
        else if (hot_ == target)
            fillRounded(dc, box, scaled(4), surface);
        strokeRounded(dc, box, scaled(4), selected ? accent : outline);

        drawText(dc, box, label, selected ? toCOLORREF(theme.background) : text,
                 DT_CENTER | DT_VCENTER);
        addZone(box, target);
        segX += w + scaled(4);
    };

    const auto endRow = [&]() { y += scaled(30); };

    // ---------------- ANALYSE ----------------
    sectionHeader(L"ANALYSE");
    rowLabel(L"Maximale Dauer",
             L"Obergrenze. KeyDock hört früher auf, sobald das Ergebnis stabil bleibt.");
    beginSegments();
    segment(L"10 s", HitTarget::len10, std::abs(settings_.captureSeconds - 10.0f) < 0.1f);
    segment(L"20 s", HitTarget::len20, std::abs(settings_.captureSeconds - 20.0f) < 0.1f);
    segment(L"30 s", HitTarget::len30, std::abs(settings_.captureSeconds - 30.0f) < 0.1f);
    segment(L"Bis ich stoppe", HitTarget::lenManual, settings_.captureSeconds <= 0.0f);
    endRow();

    // ---------------- ERGEBNIS ----------------
    sectionHeader(L"ERGEBNIS");

    rowLabel(L"Tempo-Ablesung",
             L"Ändert nur die Anzeige, nie die Analyse und nie das Projekttempo.");
    beginSegments();
    segment(L"Halbes Tempo", HitTarget::tempoHalf, bpmDisplayFactor_ < 0.99f);
    segment(L"Gemessen", HitTarget::tempoNormal,
            std::abs(bpmDisplayFactor_ - 1.0f) <= 0.01f);
    segment(L"Doppeltes Tempo", HitTarget::tempoDouble, bpmDisplayFactor_ > 1.01f);
    endRow();

    rowLabel(L"Camelot-Code",
             L"DJ-Notation wie 11A – gleiche Zahl heißt harmonisch mischbar.");
    beginSegments();
    segment(L"Anzeigen", HitTarget::camelotOn, settings_.showCamelot);
    segment(L"Ausblenden", HitTarget::camelotOff, ! settings_.showCamelot);
    endRow();

    {
        wchar_t help[192];
        if (haveResult)
        {
            std::swprintf(help, 192, L"Legt „%s%s%.1f BPM“ in die Zwischenablage.",
                          keyText(info).c_str(), L" – ",
                          info.result.bpm * bpmDisplayFactor_);
        }
        else
        {
            std::swprintf(help, 192,
                          L"Legt Tonart und Tempo als Text in die Zwischenablage.");
        }
        rowLabel(L"Ergebnis", help);
    }
    beginSegments();
    segment(L"Kopieren", HitTarget::copy, false);
    segment(L"Verwerfen", HitTarget::reset, false);
    endRow();

    // ---------------- RÜCKBLICK ----------------
    sectionHeader(L"RÜCKBLICK");
    {
        wchar_t help[192];
        if (have && info.edit.lookbackEnabled != 0)
            std::swprintf(help, 192,
                          L"Läuft mit – %.0f s von %.0f s aufgezeichnet. "
                          L"Der Pfeil oben analysiert sie.",
                          info.edit.lookbackAvailableSeconds,
                          info.edit.lookbackConfiguredSeconds);
        else
            std::swprintf(help, 192,
                          L"Zeichnet mit, damit Gehörtes nachträglich "
                          L"analysierbar ist. Nichts wird gespeichert.");
        rowLabel(L"Mitschnitt", help);
    }
    beginSegments();
    segment(L"Aus", HitTarget::lookbackOff, settings_.lookbackSeconds <= 0.0f);
    segment(L"15 s", HitTarget::lookback15,
            std::abs(settings_.lookbackSeconds - 15.0f) < 0.1f);
    segment(L"30 s", HitTarget::lookback30,
            std::abs(settings_.lookbackSeconds - 30.0f) < 0.1f);
    segment(L"60 s", HitTarget::lookback60,
            std::abs(settings_.lookbackSeconds - 60.0f) < 0.1f);
    segment(L"Leeren", HitTarget::lookbackClear, false);
    endRow();

    // ---------------- SAMPLE ----------------
    paintSampleSection(dc, y, left, right, have ? &info : nullptr);

    // ---------------- FENSTER ----------------
    sectionHeader(L"FENSTER");

    rowLabel(L"Position",
             L"Angeheftet folgt dem FL-Studio-Fenster. Frei bleibt fest auf dem Bildschirm.");
    beginSegments();
    segment(L"Angeheftet", HitTarget::modeDocked,
            settings_.mode == Settings::Mode::docked);
    segment(L"Frei", HitTarget::modeFloating,
            settings_.mode == Settings::Mode::floating);
    segment(L"Zurücksetzen", HitTarget::resetPosition, false);
    endRow();

    {
        wchar_t help[128];
        std::swprintf(help, 128, L"Aktuell %d %% – zusätzlich zur Windows-Skalierung.",
                      settings_.scalePercent);
        rowLabel(L"Größe", help);
    }
    beginSegments();
    segment(L"Kleiner", HitTarget::scaleDown, false);
    segment(L"Größer", HitTarget::scaleUp, false);
    endRow();

    {
        wchar_t help[128];
        std::swprintf(help, 128, L"Aktuell %d %% – niedriger heißt durchscheinender.",
                      settings_.opacityPercent);
        rowLabel(L"Deckkraft", help);
    }
    beginSegments();
    segment(L"Schwächer", HitTarget::opacityDown, false);
    segment(L"Stärker", HitTarget::opacityUp, false);
    endRow();

    {
        wchar_t help[128];
        std::swprintf(help, 128, L"Farbschema: %s", widen(theme.name).c_str());
        rowLabel(L"Design", help);
    }
    beginSegments();
    segment(L"Vorheriges", HitTarget::themePrev, false);
    segment(L"Nächstes", HitTarget::themeNext, false);
    endRow();

    // ---------------- Status footer ----------------
    {
        fillRect(dc, makeRect(left, y, right - left, 1), outline);
        y += scaled(8);

        ScopedFont font(dc, scaled(9), FW_NORMAL);

        std::wstring line;
        if (! have)
        {
            line = L"Kein Plugin verbunden – KeyDock auf einen Master-Slot legen.";
        }
        else if (haveResult)
        {
            wchar_t buffer[256];
            std::swprintf(buffer, 256,
                          L"Tonart %s · Tempo %s · %.0f s analysiert · Projekttempo %.2f BPM (nur Anzeige)",
                          confidenceWord(info.result.keyConfidence),
                          confidenceWord(info.result.bpmConfidence),
                          info.result.analysedSeconds,
                          info.state.hostBpm);
            line = buffer;
        }
        else if (info.haveResult)
        {
            line = widen(info.result.note);
        }
        else
        {
            line = L"Noch keine Analyse gestartet.";
        }

        drawText(dc, makeRect(left, y, right - left, scaled(13)), line, dim,
                 DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS);
        y += scaled(14);

        if (haveResult && info.result.note[0] != '\0')
        {
            drawText(dc, makeRect(left, y, right - left, scaled(13)),
                     widen(info.result.note), accent,
                     DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS);
            y += scaled(14);
        }

        const auto list = server_.instances();
        if (list.size() > 1)
        {
            size_t index = 0;
            for (size_t i = 0; i < list.size(); ++i)
                if (list[i].hello.instanceId == server_.preferredInstance())
                    index = i;

            wchar_t buffer[128];
            std::swprintf(buffer, 128, L"Instanz %d von %d – klicken zum Wechseln: %s",
                          static_cast<int>(index + 1), static_cast<int>(list.size()),
                          widen(info.hello.displayName).c_str());

            RECT row = makeRect(left, y, right - left, scaled(14));
            drawText(dc, row, buffer, hot_ == HitTarget::instancePicker ? accent : dim,
                     DT_LEFT | DT_VCENTER | DT_END_ELLIPSIS);
            addZone(row, HitTarget::instancePicker);
        }
    }
}

void OverlayWindow::paintSampleSection(HDC dc, int& y, int left, int right,
                                       const InstanceInfo* info)
{
    const auto& theme = settings_.theme;
    const COLORREF text    = toCOLORREF(theme.text);
    const COLORREF dim     = toCOLORREF(theme.dimText);
    const COLORREF accent  = toCOLORREF(theme.accent);
    const COLORREF outline = toCOLORREF(theme.outline);
    const COLORREF surface = mix(toCOLORREF(theme.background), text, 0.06);

    const int labelW = scaled(118);

    const auto sectionHeader = [&](const wchar_t* title)
    {
        ScopedFont font(dc, scaled(8), FW_SEMIBOLD, scaled(2));
        drawText(dc, makeRect(left, y, right - left, scaled(12)), title, accent,
                 DT_LEFT | DT_VCENTER);
        y += scaled(15);
    };

    const auto rowLabel = [&](const wchar_t* label, const wchar_t* help)
    {
        ScopedFont font(dc, scaled(10), FW_SEMIBOLD);
        drawText(dc, makeRect(left, y, labelW, scaled(16)), label, text,
                 DT_LEFT | DT_VCENTER);
        ScopedFont small(dc, scaled(9), FW_NORMAL);
        drawText(dc, makeRect(left, y + scaled(15), right - left, scaled(12)),
                 help, dim, DT_LEFT | DT_TOP | DT_END_ELLIPSIS);
    };

    int segX = 0;
    const auto beginSegments = [&]() { segX = left + labelW; };

    const auto segment = [&](const wchar_t* label, HitTarget target, bool selected,
                             bool enabled = true)
    {
        ScopedFont font(dc, scaled(9), selected ? FW_SEMIBOLD : FW_NORMAL);
        const int w = textWidth(dc, label) + scaled(14);
        RECT box = makeRect(segX, y, w, scaled(17));

        if (selected && enabled)
            fillRounded(dc, box, scaled(4), accent);
        else if (hot_ == target && enabled)
            fillRounded(dc, box, scaled(4), surface);
        strokeRounded(dc, box, scaled(4),
                      selected && enabled ? accent
                                          : (enabled ? outline : mix(outline, surface, 0.6)));

        drawText(dc, box, label,
                 ! enabled ? mix(toCOLORREF(theme.background), dim, 0.5)
                           : (selected ? toCOLORREF(theme.background) : text),
                 DT_CENTER | DT_VCENTER);
        if (enabled)
            addZone(box, target);
        segX += w + scaled(4);
    };

    const auto endRow = [&]() { y += scaled(30); };

    const bool hasSample = info != nullptr && info->haveEdit
                        && info->edit.hasSource != 0;

    sectionHeader(L"SAMPLE BEARBEITEN");

    // --- which source is selected, and what it was measured as ---------
    {
        wchar_t help[224];
        if (! hasSample)
        {
            std::swprintf(help, 224,
                          L"Noch kein Ausschnitt. Analysieren oder den "
                          L"Rückblick-Pfeil benutzen.");
        }
        else
        {
            const auto sourceKey = info->edit.sourceTonic >= 0
                ? widen(keyName(info->edit.sourceTonic, info->edit.sourceIsMinor != 0))
                : std::wstring(L"unbekannt");
            std::swprintf(help, 224, L"%s · %.0f s · erkannt als %s%s",
                          widen(info->edit.sourceLabel).c_str(),
                          info->edit.sourceSeconds, sourceKey.c_str(),
                          info->edit.sourceKeyOverridden ? L" (von Hand gesetzt)" : L"");
        }
        rowLabel(L"Quelle", help);
    }
    beginSegments();
    segment(L"Tonart −", HitTarget::sourceKeyPrev, false, hasSample);
    segment(L"Tonart +", HitTarget::sourceKeyNext, false, hasSample);
    segment(hasSample && info->edit.sourceIsMinor ? L"Moll" : L"Dur",
            HitTarget::sourceModeToggle, false, hasSample);
    segment(L"Automatisch", HitTarget::sourceKeyAuto,
            hasSample && info->edit.sourceKeyOverridden == 0, hasSample);
    endRow();

    // --- target key ----------------------------------------------------
    {
        wchar_t help[224];
        if (hasSample && info->edit.targetTonic >= 0)
        {
            if (info->edit.planPossible)
                std::swprintf(help, 224, L"%s  →  %+d Halbtöne",
                              widen(info->edit.planExplanation).c_str(),
                              info->edit.appliedSemitones);
            else
                std::swprintf(help, 224, L"%s", widen(info->edit.planExplanation).c_str());
        }
        else
        {
            std::swprintf(help, 224,
                          L"Zieltonart wählen – das Sample wird wirklich "
                          L"transponiert, Länge und Tempo bleiben gleich.");
        }
        rowLabel(L"Zieltonart", help);
    }
    beginSegments();
    {
        wchar_t label[24];
        if (targetTonic_ >= 0)
            std::swprintf(label, 24, L"%s %s",
                          widen(pitchClassName(targetTonic_)).c_str(),
                          targetIsMinor_ ? L"Moll" : L"Dur");
        else
            std::wcscpy(label, L"keine");

        segment(L"−", HitTarget::targetKeyPrev, false, hasSample);
        segment(label, HitTarget::targetModeToggle, targetTonic_ >= 0, hasSample);
        segment(L"+", HitTarget::targetKeyNext, false, hasSample);
        segment(L"Andere Richtung", HitTarget::directionToggle,
                hasSample && info->edit.usingAlternative != 0,
                hasSample && info->edit.planPossible != 0);
        segment(L"Keine", HitTarget::targetClear, false, hasSample);
    }
    endRow();

    // --- tuning ---------------------------------------------------------
    {
        wchar_t help[224];
        if (hasSample && info->edit.tuningReliable)
            std::swprintf(help, 224,
                          L"%+.0f Cent gegenüber A440 – Korrektur wäre %+.0f Cent. "
                          L"Manuell: %+.0f Cent.",
                          info->edit.tuningCents, -info->edit.tuningCents,
                          info->edit.manualCents);
        else if (hasSample)
            std::swprintf(help, 224, L"%s", widen(info->edit.tuningNote).c_str());
        else
            std::swprintf(help, 224,
                          L"Misst, ob das Sample zwischen den Halbtönen liegt.");
        rowLabel(L"Feinstimmung", help);
    }
    beginSegments();
    segment(L"Korrigieren", HitTarget::tuningApply,
            hasSample && info->edit.applyTuningCorrection != 0,
            hasSample && info->edit.tuningReliable != 0);
    segment(L"Aus", HitTarget::tuningOff,
            hasSample && info->edit.applyTuningCorrection == 0, hasSample);
    segment(L"Cent −", HitTarget::centsDown, false, hasSample);
    segment(L"Cent +", HitTarget::centsUp, false, hasSample);
    segment(L"Formanten", HitTarget::formantsToggle,
            hasSample && info->edit.preserveFormants != 0, hasSample);
    endRow();

    // --- preview and export ---------------------------------------------
    {
        wchar_t help[256];
        if (! hasSample)
        {
            std::swprintf(help, 256, L"Vorhören ersetzt den Master-Ausgang, "
                                     L"solange es eingeschaltet ist.");
        }
        else if (info->edit.lastExportError[0] != '\0')
        {
            std::swprintf(help, 256, L"Export fehlgeschlagen: %s",
                          widen(info->edit.lastExportError).c_str());
        }
        else if (info->edit.lastExportPath[0] != '\0')
        {
            std::swprintf(help, 256, L"Gespeichert: %s",
                          widen(info->edit.lastExportPath).c_str());
        }
        else
        {
            std::swprintf(help, 256,
                          L"Angewendet: %+d Halbtöne, %+.0f Cent. "
                          L"Vorhören ersetzt den Master-Ausgang.",
                          info->edit.appliedSemitones, info->edit.appliedCents);
        }
        rowLabel(L"Vorhören", help);
    }
    beginSegments();
    segment(L"Aus", HitTarget::previewOff,
            ! hasSample || info->edit.previewMode == 0, hasSample);
    segment(L"Original", HitTarget::previewOriginal,
            hasSample && info->edit.previewMode == 1, hasSample);
    segment(L"Bearbeitet", HitTarget::previewEdited,
            hasSample && info->edit.previewMode == 2,
            hasSample && info->edit.hasEdit != 0);
    segment(L"Als WAV speichern", HitTarget::exportWav, false, hasSample);
    segment(L"Verwerfen", HitTarget::editReset, false, hasSample);
    endRow();

    // --- tempo handover ---------------------------------------------------
    sectionHeader(L"TEMPO AN FL STUDIO");
    {
        wchar_t help[256];
        if (tempoBridge_.isOpen())
            std::swprintf(help, 256,
                          L"Port: %s – das Häkchen neben der BPM-Zahl setzt "
                          L"das Projekttempo.",
                          tempoBridge_.openPortName().c_str());
        else
            std::swprintf(help, 256,
                          L"Kein MIDI-Port gewählt. Einrichtung: "
                          L"docs/07-neue-funktionen.md");
        rowLabel(L"MIDI-Port", help);
    }
    beginSegments();
    {
        std::wstring label = tempoBridge_.isOpen()
            ? tempoBridge_.openPortName() : std::wstring(L"keiner");
        if (label.size() > 22)
            label = label.substr(0, 21) + L"…";
        segment(label.c_str(), HitTarget::tempoPortNext, tempoBridge_.isOpen());
        segment(L"Verbindung testen", HitTarget::tempoPortTest, false,
                tempoBridge_.isOpen());
    }
    endRow();
}

} // namespace keydock
