// Deterministic synthetic material for the engine tests.
#pragma once

#include <string>
#include <vector>

namespace keydock::test
{

/// Chord progression rendered with a mildly bright harmonic timbre.
/// `degreesSemitones` holds chord roots relative to `tonicPc`.
std::vector<float> renderProgression(int tonicPc,
                                     bool minor,
                                     double bpm,
                                     double seconds,
                                     double sampleRate,
                                     unsigned seed = 1);

/// Natural-minor loop (i - VI - III - VII) whose pitch-class content is
/// identical to the relative major. Used to verify that the engine surfaces
/// the ambiguity instead of claiming certainty.
std::vector<float> renderAmbiguousMinorLoop(int tonicPc, double bpm, double seconds,
                                            double sampleRate, unsigned seed = 4);

/// Percussive click track with no stable pitch content.
std::vector<float> renderDrumLoop(double bpm, double seconds, double sampleRate,
                                  unsigned seed = 2);

/// Sum of two signals, second scaled by `gain`.
std::vector<float> mix(const std::vector<float>& a, const std::vector<float>& b, float gain);

std::vector<float> renderSilence(double seconds, double sampleRate);
std::vector<float> renderWhiteNoise(double seconds, double sampleRate, unsigned seed = 3);
std::vector<float> renderSingleTone(double freq, double seconds, double sampleRate);

} // namespace keydock::test
