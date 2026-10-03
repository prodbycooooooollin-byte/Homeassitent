#include "keydock/EditSession.h"

#include <algorithm>
#include <cmath>

namespace keydock
{

EditSession::EditSession()
    : key_(kAnalysisSampleRate), tempo_(kAnalysisSampleRate),
      tuner_(kAnalysisSampleRate), shifter_(kAnalysisSampleRate)
{
}

void EditSession::setSource(std::vector<float> mono, const std::string& label)
{
    source_ = std::move(mono);
    label_  = label;

    // A new source must not inherit anything from the previous one: neither an
    // analysis, nor a key override, nor an edit.
    analysis_ = AnalysisResult {};
    tuning_   = TuningResult {};
    plan_     = TransposePlan {};
    keyOverridden_ = false;
    overrideTonic_ = -1;
    overrideMinor_ = false;
    targetTonic_   = -1;
    targetMinor_   = false;
    useAlternative_ = false;
    applyTuning_   = false;
    manualCents_   = 0.0f;
    invalidateRender();
}

float EditSession::sourceSeconds() const
{
    return static_cast<float>(source_.size() / kAnalysisSampleRate);
}

void EditSession::trimSource(float fromSeconds, float toSeconds)
{
    if (source_.empty())
        return;

    const size_t total = source_.size();
    size_t from = static_cast<size_t>(std::max(0.0f, fromSeconds) * kAnalysisSampleRate);
    size_t to   = static_cast<size_t>(std::max(0.0f, toSeconds) * kAnalysisSampleRate);
    from = std::min(from, total);
    to   = std::min(std::max(to, from), total);

    if (to - from < static_cast<size_t>(kAnalysisSampleRate * 0.5))
        return;   // refuse to crop away everything

    std::vector<float> cropped(source_.begin() + static_cast<long>(from),
                               source_.begin() + static_cast<long>(to));
    setSource(std::move(cropped), label_);
}

void EditSession::analyseSource(double referenceHz)
{
    if (source_.empty())
        return;

    // Always the untouched source: analysing a rendered version would fold a
    // correction back into the measurement it came from.
    analysis_ = AnalysisResult {};
    analysis_.analysedSeconds = sourceSeconds();

    double rms = 0.0;
    float peak = 0.0f;
    for (float s : source_)
    {
        rms += static_cast<double>(s) * s;
        peak = std::max(peak, std::abs(s));
    }
    rms = std::sqrt(rms / source_.size());
    analysis_.peakDb = peak > 1.0e-6f ? 20.0f * std::log10(peak) : -100.0f;

    if (rms < 1.0e-4 || analysis_.peakDb < -60.0f)
    {
        analysis_.reason = Unsuitable::silent;
        analysis_.note   = "Ausschnitt ist zu leise.";
        tuning_ = TuningResult {};
        return;
    }

    analysis_.key   = key_.analyse(source_);
    analysis_.tempo = tempo_.analyse(source_);
    analysis_.valid = (analysis_.key.tonal && analysis_.key.best.tonic >= 0)
                   || (analysis_.tempo.rhythmic && analysis_.tempo.bpm > 0.0f);

    tuning_ = tuner_.analyse(source_, referenceHz);

    // Recompute the plan against the fresh analysis.
    setTargetKey(targetTonic_, targetMinor_);
}

void EditSession::setSourceKeyOverride(int tonic, bool isMinor)
{
    keyOverridden_ = tonic >= 0 && tonic <= 11;
    overrideTonic_ = keyOverridden_ ? tonic : -1;
    overrideMinor_ = isMinor;
    setTargetKey(targetTonic_, targetMinor_);
}

int EditSession::effectiveSourceTonic() const
{
    if (keyOverridden_)
        return overrideTonic_;
    return analysis_.key.tonal ? analysis_.key.best.tonic : -1;
}

bool EditSession::effectiveSourceIsMinor() const
{
    return keyOverridden_ ? overrideMinor_ : analysis_.key.best.isMinor;
}

void EditSession::setTargetKey(int tonic, bool isMinor)
{
    targetTonic_ = tonic;
    targetMinor_ = isMinor;
    plan_ = planTranspose(effectiveSourceTonic(), effectiveSourceIsMinor(),
                          targetTonic_, targetMinor_);
    invalidateRender();
}

void EditSession::useAlternativeDirection()
{
    useAlternative_ = ! useAlternative_;
    invalidateRender();
}

void EditSession::setApplyTuningCorrection(bool apply)
{
    applyTuning_ = apply;
    invalidateRender();
}

void EditSession::setManualCents(float cents)
{
    manualCents_ = std::clamp(cents, -100.0f, 100.0f);
    invalidateRender();
}

void EditSession::setPreserveFormants(bool preserve)
{
    preserveFormants_ = preserve;
    invalidateRender();
}

int EditSession::effectiveSemitones() const
{
    // A plan that is not possible contributes nothing: refusing to transpose is
    // the point, not silently shifting to the wrong mode.
    if (! plan_.possible)
        return 0;
    return useAlternative_ ? plan_.alternativeSemitones : plan_.semitones;
}

float EditSession::effectiveCents() const
{
    // The measured deviation is corrected at most once, and the manual offset
    // is added on top rather than replacing it.
    float cents = manualCents_;
    if (applyTuning_ && tuning_.reliable)
        cents += tuning_.suggestedCorrectionCents();
    return std::clamp(cents, -150.0f, 150.0f);
}

bool EditSession::hasEdit() const
{
    return effectiveSemitones() != 0 || std::abs(effectiveCents()) > 0.01f;
}

const std::vector<float>& EditSession::rendered()
{
    if (renderValid_)
        return rendered_;

    if (! hasEdit() || source_.empty())
    {
        rendered_ = source_;
        renderValid_ = true;
        return rendered_;
    }

    PitchShifter::Options options;
    options.semitones = effectiveSemitones();
    options.cents     = effectiveCents();
    options.preserveFormants = preserveFormants_;

    // One pass over the untouched source, never over a previous render.
    rendered_ = shifter_.process(source_, options);
    renderValid_ = true;
    return rendered_;
}

void EditSession::resetEdits()
{
    targetTonic_ = -1;
    targetMinor_ = false;
    useAlternative_ = false;
    applyTuning_ = false;
    manualCents_ = 0.0f;
    preserveFormants_ = false;
    plan_ = planTranspose(effectiveSourceTonic(), effectiveSourceIsMinor(), -1, false);
    invalidateRender();
}

void EditSession::invalidateRender()
{
    renderValid_ = false;
    rendered_.clear();
}

std::string EditSession::suggestedFileName() const
{
    std::string name = "KeyDock";

    const int tonic = effectiveSourceTonic();
    if (tonic >= 0)
    {
        name += "_" + std::string(pitchClassName(tonic))
              + (effectiveSourceIsMinor() ? "min" : "maj");
    }

    if (plan_.possible && plan_.targetTonic >= 0)
    {
        name += "_to_" + std::string(pitchClassName(plan_.targetTonic))
              + (plan_.targetIsMinor ? "min" : "maj");
    }

    const int semitones = effectiveSemitones();
    if (semitones != 0)
        name += "_" + std::string(semitones > 0 ? "+" : "") + std::to_string(semitones) + "st";

    const float cents = effectiveCents();
    if (std::abs(cents) >= 0.5f)
        name += "_" + std::string(cents > 0 ? "+" : "")
              + std::to_string(static_cast<int>(std::lround(cents))) + "ct";

    // '#' is legal on Windows but awkward in shells and file dialogs.
    std::replace(name.begin(), name.end(), '#', 's');
    return name + ".wav";
}

} // namespace keydock
