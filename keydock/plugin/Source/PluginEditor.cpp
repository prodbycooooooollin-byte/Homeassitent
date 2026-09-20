#include "PluginEditor.h"

namespace keydock
{

namespace
{
const juce::Colour kBackground { 0xff141619 };
const juce::Colour kPanel      { 0xff1b1e23 };
const juce::Colour kOutline    { 0xff2a2e35 };
const juce::Colour kText       { 0xffe6e8ec };
const juce::Colour kDim        { 0xff8b929c };
const juce::Colour kAccent     { 0xff4da3ff };

juce::String confidenceText(Confidence c)
{
    switch (c)
    {
        case Confidence::high:   return "sicher";
        case Confidence::medium: return "wahrscheinlich";
        case Confidence::low:    return "unsicher";
        default:                 return "nicht bestimmbar";
    }
}
} // namespace

KeyDockEditor::KeyDockEditor(KeyDockProcessor& p)
    : juce::AudioProcessorEditor(&p), processor_(p)
{
    auto styleLabel = [this](juce::Label& l, float size, juce::Colour colour,
                             juce::Justification just)
    {
        l.setFont(juce::Font(juce::FontOptions(size)));
        l.setColour(juce::Label::textColourId, colour);
        l.setJustificationType(just);
        addAndMakeVisible(l);
    };

    styleLabel(keyLabel_,    30.0f, kText,   juce::Justification::centredLeft);
    styleLabel(bpmLabel_,    30.0f, kText,   juce::Justification::centredLeft);
    styleLabel(statusLabel_, 13.0f, kAccent, juce::Justification::centredLeft);
    styleLabel(detailLabel_, 12.0f, kDim,    juce::Justification::centredLeft);
    styleLabel(hostLabel_,   11.0f, kDim,    juce::Justification::centredRight);

    lengthBox_.addItem("10 s", 1);
    lengthBox_.addItem("20 s", 2);
    lengthBox_.addItem("30 s", 3);
    lengthBox_.addItem("manuell stoppen", 4);
    lengthBox_.setSelectedId(2, juce::dontSendNotification);
    addAndMakeVisible(lengthBox_);

    addAndMakeVisible(analyseButton_);
    addAndMakeVisible(resetButton_);
    addAndMakeVisible(copyButton_);

    analyseButton_.onClick = [this]
    {
        const auto snap = processor_.controller().snapshot();
        const bool busy = snap.status == ipc::Status::listening
                       || snap.status == ipc::Status::waitingForAudio;
        if (busy)
        {
            processor_.requestStop();
            return;
        }

        static const float lengths[] = { 10.0f, 20.0f, 30.0f, 0.0f };
        const int index = juce::jlimit(1, 4, lengthBox_.getSelectedId()) - 1;
        processor_.requestAnalysis(lengths[index]);
    };

    resetButton_.onClick = [this] { processor_.requestReset(); };

    copyButton_.onClick = [this]
    {
        const auto& r = snapshot_.result;
        if (! snapshot_.haveResult || ! r.valid)
            return;

        juce::String text;
        if (r.key.best.tonic >= 0 && r.key.tonal)
            text << juce::String(keyName(r.key.best.tonic, r.key.best.isMinor))
                 << " (" << juce::String(camelot(r.key.best.tonic, r.key.best.isMinor)) << ")";
        if (r.tempo.bpm > 0.0f)
            text << (text.isEmpty() ? "" : " - ")
                 << juce::String(r.tempo.bpm, 1) << " BPM";
        juce::SystemClipboard::copyTextToClipboard(text);
    };

    setSize(440, 190);
    startTimerHz(15);
    updateFromSnapshot();
}

KeyDockEditor::~KeyDockEditor()
{
    stopTimer();
}

juce::String KeyDockEditor::statusText(const AnalysisController::Snapshot& s) const
{
    switch (s.status)
    {
        case ipc::Status::ready:           return "Bereit";
        case ipc::Status::waitingForAudio: return "Warte auf Audio";
        case ipc::Status::listening:
            return "Hoere zu  " + juce::String(s.capturedSeconds, 1) + " s"
                 + (s.targetSeconds > 0.0f
                        ? " / " + juce::String(s.targetSeconds, 0) + " s" : "");
        case ipc::Status::analysing:       return "Analysiere ...";
        case ipc::Status::haveResult:      return "Ergebnis";
        case ipc::Status::unsuitable:      return "Ungeeignetes Audiomaterial";
        default:                           return "Gestoppt";
    }
}

void KeyDockEditor::timerCallback()
{
    updateFromSnapshot();
}

void KeyDockEditor::updateFromSnapshot()
{
    snapshot_ = processor_.controller().snapshot();
    const auto& r = snapshot_.result;

    const bool busy = snapshot_.status == ipc::Status::listening
                   || snapshot_.status == ipc::Status::waitingForAudio;
    analyseButton_.setButtonText(busy ? "Stoppen" : "Analysieren");

    if (snapshot_.haveResult && r.valid && r.key.tonal && r.key.best.tonic >= 0)
        keyLabel_.setText(juce::String(keyName(r.key.best.tonic, r.key.best.isMinor)),
                          juce::dontSendNotification);
    else
        keyLabel_.setText("--", juce::dontSendNotification);

    if (snapshot_.haveResult && r.valid && r.tempo.bpm > 0.0f)
        bpmLabel_.setText(juce::String(r.tempo.bpm, 1) + " BPM",
                          juce::dontSendNotification);
    else
        bpmLabel_.setText("--", juce::dontSendNotification);

    statusLabel_.setText(statusText(snapshot_), juce::dontSendNotification);

    juce::String detail;
    if (snapshot_.haveResult && r.valid)
    {
        if (r.key.tonal && r.key.best.tonic >= 0)
            detail << juce::String(camelot(r.key.best.tonic, r.key.best.isMinor))
                   << " - Tonart " << confidenceText(r.key.confidence);
        if (r.tempo.bpm > 0.0f)
            detail << (detail.isEmpty() ? "" : "  |  ")
                   << "Tempo " << confidenceText(r.tempo.confidence);
    }
    if (! r.note.empty())
        detail << (detail.isEmpty() ? "" : "  |  ") << juce::String(r.note);
    detailLabel_.setText(detail, juce::dontSendNotification);

    juce::String host;
    host << "Overlay: " << (processor_.overlayConnected() ? "verbunden" : "getrennt");
    if (processor_.hostBpm() > 0.0)
        host << "   Host-Tempo: " << juce::String(processor_.hostBpm(), 2) << " BPM";
    hostLabel_.setText(host, juce::dontSendNotification);

    copyButton_.setEnabled(snapshot_.haveResult && r.valid);
}

void KeyDockEditor::paint(juce::Graphics& g)
{
    g.fillAll(kBackground);

    auto panel = getLocalBounds().reduced(10).toFloat();
    g.setColour(kPanel);
    g.fillRoundedRectangle(panel, 8.0f);
    g.setColour(kOutline);
    g.drawRoundedRectangle(panel, 8.0f, 1.0f);

    g.setColour(kDim);
    g.setFont(juce::Font(juce::FontOptions(11.0f)));
    g.drawText("KEYDOCK", 24, 18, 120, 14, juce::Justification::centredLeft);

    // Capture progress, drawn only while it means something.
    if (snapshot_.status == ipc::Status::listening && snapshot_.targetSeconds > 0.0f)
    {
        auto bar = juce::Rectangle<float>(24.0f, 150.0f,
                                          static_cast<float>(getWidth()) - 48.0f, 3.0f);
        g.setColour(kOutline);
        g.fillRoundedRectangle(bar, 1.5f);
        g.setColour(kAccent);
        g.fillRoundedRectangle(bar.withWidth(bar.getWidth() * snapshot_.progress), 1.5f);
    }
}

void KeyDockEditor::resized()
{
    auto area = getLocalBounds().reduced(24, 20);

    hostLabel_.setBounds(area.removeFromTop(16));
    area.removeFromTop(8);

    auto results = area.removeFromTop(40);
    keyLabel_.setBounds(results.removeFromLeft(results.getWidth() / 2));
    bpmLabel_.setBounds(results);

    area.removeFromTop(4);
    statusLabel_.setBounds(area.removeFromTop(18));
    detailLabel_.setBounds(area.removeFromTop(16));

    area.removeFromTop(14);
    auto controls = area.removeFromTop(28);
    analyseButton_.setBounds(controls.removeFromLeft(110));
    controls.removeFromLeft(8);
    lengthBox_.setBounds(controls.removeFromLeft(130));
    controls.removeFromLeft(8);
    resetButton_.setBounds(controls.removeFromLeft(70));
    controls.removeFromLeft(8);
    copyButton_.setBounds(controls.removeFromLeft(90));
}

} // namespace keydock
