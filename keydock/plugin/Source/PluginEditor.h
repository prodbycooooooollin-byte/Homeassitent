#pragma once

#include "PluginProcessor.h"

#include <juce_gui_basics/juce_gui_basics.h>

namespace keydock
{

/// Compact in-plugin view. Mirrors the overlay so KeyDock stays usable when
/// the overlay is disabled, not yet connected, or running in floating mode.
class KeyDockEditor : public juce::AudioProcessorEditor,
                      private juce::Timer
{
public:
    explicit KeyDockEditor(KeyDockProcessor&);
    ~KeyDockEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void updateFromSnapshot();
    juce::String statusText(const AnalysisController::Snapshot&) const;

    KeyDockProcessor& processor_;

    juce::TextButton  analyseButton_ { "Analysieren" };
    juce::TextButton  resetButton_   { "Reset" };
    juce::TextButton  copyButton_    { "Kopieren" };
    juce::ComboBox    lengthBox_;
    juce::Label       keyLabel_, bpmLabel_, statusLabel_, detailLabel_, hostLabel_;

    AnalysisController::Snapshot snapshot_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(KeyDockEditor)
};

} // namespace keydock
