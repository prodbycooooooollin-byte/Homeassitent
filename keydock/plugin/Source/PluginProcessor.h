#pragma once

#include "AnalysisController.h"
#include "IpcClient.h"
#include "KeyDockProtocol.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>

namespace keydock
{

class KeyDockProcessor : public juce::AudioProcessor,
                         private juce::Timer
{
public:
    KeyDockProcessor();
    ~KeyDockProcessor() override;

    // --- AudioProcessor -------------------------------------------------
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlock(juce::AudioBuffer<double>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override                     { return true; }

    const juce::String getName() const override         { return "KeyDock"; }
    bool acceptsMidi() const override                   { return false; }
    bool producesMidi() const override                  { return false; }
    bool isMidiEffect() const override                  { return false; }
    double getTailLengthSeconds() const override        { return 0.0; }

    int getNumPrograms() override                       { return 1; }
    int getCurrentProgram() override                    { return 0; }
    void setCurrentProgram(int) override                {}
    const juce::String getProgramName(int) override     { return "Default"; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;

    // --- KeyDock --------------------------------------------------------
    AnalysisController& controller() noexcept           { return controller_; }

    void requestAnalysis(float seconds);
    void requestStop();
    void requestReset();

    float captureSeconds() const noexcept   { return captureSeconds_.load(); }
    void  setCaptureSeconds(float s)        { captureSeconds_.store(s); }

    /// Host transport tempo. Display only - it is never used as a result and
    /// never reaches the analysis engine.
    double hostBpm() const noexcept         { return hostBpm_.load(); }
    bool   hostPlaying() const noexcept     { return hostPlaying_.load(); }

    bool overlayConnected() const noexcept  { return ipc_.isConnected(); }
    uint64_t instanceId() const noexcept    { return instanceId_; }

private:
    void timerCallback() override;
    void pushStateToOverlay();
    void handleCommand(const ipc::CommandMsg& cmd);

    AnalysisController  controller_;
    IpcClient           ipc_;

    uint64_t            instanceId_ = 0;
    uint32_t            instanceIndex_ = 0;

    std::atomic<float>  captureSeconds_ { 20.0f };
    std::atomic<double> hostBpm_        { 0.0 };
    std::atomic<bool>   hostPlaying_    { false };
    std::atomic<bool>   overlayRequested_ { false };
    std::atomic<uint32_t> lastSentAnalysisId_ { 0 };

    /// Set once real-time processing has actually happened. Guards the
    /// overlay launch so a plugin scan never opens a window.
    std::atomic<bool>   sawRealtimeAudio_ { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(KeyDockProcessor)
};

} // namespace keydock
