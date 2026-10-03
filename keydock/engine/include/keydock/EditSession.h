// Holds one captured sample and everything derived from it.
//
// The rule this class enforces: analysis always runs on the untouched source.
// The semitone shift and the cent correction are stored separately and applied
// together in a single pass, so a tuning fix can never be counted twice, and
// re-editing never stacks on a previous edit.
#pragma once

#include "keydock/KeyDetector.h"
#include "keydock/KeyTransposer.h"
#include "keydock/PitchShifter.h"
#include "keydock/TempoDetector.h"
#include "keydock/TuningEstimator.h"
#include "keydock/Types.h"

#include <string>
#include <vector>

namespace keydock
{

class EditSession
{
public:
    EditSession();

    /// Replaces the source audio and clears every derived value.
    /// `label` says where it came from, e.g. "Aufnahme 20 s" or
    /// "Rückblick 15 s", so the UI can always name the selected source.
    void setSource(std::vector<float> mono, const std::string& label);

    bool  hasSource() const { return ! source_.empty(); }
    float sourceSeconds() const;
    const std::string& sourceLabel() const { return label_; }

    /// Trims the source to a sub-range, in seconds. Used by the detail view to
    /// crop a lookback selection. Analysis results are cleared.
    void trimSource(float fromSeconds, float toSeconds);

    /// Runs key, tempo and tuning analysis on the untouched source.
    void analyseSource(double referenceHz = 440.0);

    const AnalysisResult& analysis() const { return analysis_; }
    const TuningResult&   tuning() const   { return tuning_; }

    /// Overrides the detected key, for when detection was uncertain.
    void setSourceKeyOverride(int tonic, bool isMinor);
    bool keyIsOverridden() const { return keyOverridden_; }
    int  effectiveSourceTonic() const;
    bool effectiveSourceIsMinor() const;

    /// Chooses the target key and computes the plan. -1 clears it.
    void setTargetKey(int tonic, bool isMinor);
    const TransposePlan& plan() const { return plan_; }

    /// Picks the other octave direction for the same target.
    void useAlternativeDirection();
    bool usingAlternativeDirection() const { return useAlternative_; }

    /// Enables the cent correction the tuning estimate suggests.
    void setApplyTuningCorrection(bool apply);
    bool applyingTuningCorrection() const { return applyTuning_; }

    /// Manual cent offset on top of everything else.
    void setManualCents(float cents);
    float manualCents() const { return manualCents_; }

    void setPreserveFormants(bool preserve);
    bool preservingFormants() const { return preserveFormants_; }

    /// Semitones and cents that will actually be applied.
    int   effectiveSemitones() const;
    float effectiveCents() const;
    bool  hasEdit() const;

    /// Renders the edited audio, or returns the source when nothing is set.
    /// Result is cached until an edit parameter changes.
    const std::vector<float>& rendered();

    /// The untouched source, for A/B comparison.
    const std::vector<float>& source() const { return source_; }

    /// Drops every edit but keeps the source and its analysis.
    void resetEdits();

    /// Suggested file name, e.g. "KeyDock_F#min_to_Amin_+3st.wav".
    std::string suggestedFileName() const;

private:
    void invalidateRender();

    std::vector<float> source_;
    std::vector<float> rendered_;
    std::string        label_;
    bool               renderValid_ = false;

    AnalysisResult analysis_;
    TuningResult   tuning_;
    TransposePlan  plan_;

    bool  keyOverridden_ = false;
    int   overrideTonic_ = -1;
    bool  overrideMinor_ = false;

    int   targetTonic_ = -1;
    bool  targetMinor_ = false;
    bool  useAlternative_ = false;

    bool  applyTuning_ = false;
    float manualCents_ = 0.0f;
    bool  preserveFormants_ = false;

    KeyDetector     key_;
    TempoDetector   tempo_;
    TuningEstimator tuner_;
    PitchShifter    shifter_;
};

} // namespace keydock
