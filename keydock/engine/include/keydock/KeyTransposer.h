// Works out how to get from a detected key to a target key.
//
// The hard truth this encodes: transposing moves every pitch by the same
// interval, so it can turn C major into D major but never into C minor.
// Mode is a property of the intervals inside the scale, not of its position.
#pragma once

#include "keydock/Types.h"

#include <string>

namespace keydock
{

struct TransposePlan
{
    /// True when the target is reachable by transposing at all.
    bool  possible = false;

    /// Semitones to shift; the smallest move that reaches the target.
    int   semitones = 0;

    /// The same target one octave the other way, e.g. -5 instead of +7.
    /// Offered so a shift can be kept inside a comfortable range.
    int   alternativeSemitones = 0;

    int   sourceTonic = -1;
    bool  sourceIsMinor = false;
    int   targetTonic = -1;
    bool  targetIsMinor = false;

    /// Set when the modes differ: what is actually reachable instead.
    int   reachableTonic = -1;
    bool  reachableIsMinor = false;

    std::string explanation;
};

/// @param sourceTonic  0..11, or -1 when the key is unknown.
TransposePlan planTranspose(int sourceTonic, bool sourceIsMinor,
                            int targetTonic, bool targetIsMinor);

} // namespace keydock
