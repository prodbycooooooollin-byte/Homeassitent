#include "keydock/KeyTransposer.h"

#include <cmath>

namespace keydock
{

TransposePlan planTranspose(int sourceTonic, bool sourceIsMinor,
                            int targetTonic, bool targetIsMinor)
{
    TransposePlan plan;
    plan.sourceTonic   = sourceTonic;
    plan.sourceIsMinor = sourceIsMinor;
    plan.targetTonic   = targetTonic;
    plan.targetIsMinor = targetIsMinor;

    if (sourceTonic < 0 || sourceTonic > 11)
    {
        plan.explanation = "Ausgangstonart unbekannt - bitte analysieren oder "
                           "manuell setzen.";
        return plan;
    }
    if (targetTonic < 0 || targetTonic > 11)
    {
        plan.explanation = "Keine Zieltonart gewählt.";
        return plan;
    }

    // Smallest signed interval from source to target, in -5..+6.
    int interval = (targetTonic - sourceTonic) % 12;
    if (interval < 0)
        interval += 12;
    const int down = interval - 12;                  // -12..-1
    plan.semitones = std::abs(interval) <= std::abs(down) ? interval : down;
    plan.alternativeSemitones = plan.semitones == interval ? down : interval;

    if (sourceIsMinor != targetIsMinor)
    {
        // Transposing shifts every note by the same amount, so the pattern of
        // whole and half steps - which is what makes a key major or minor -
        // cannot change. Say so instead of shifting anyway and calling it
        // done.
        plan.possible         = false;
        plan.reachableTonic   = (sourceTonic + plan.semitones + 12) % 12;
        plan.reachableIsMinor = sourceIsMinor;

        plan.explanation =
            std::string("Durch Transponieren lässt sich ")
            + (sourceIsMinor ? "Moll nicht in Dur" : "Dur nicht in Moll")
            + " verwandeln. Mit " + (plan.semitones >= 0 ? "+" : "")
            + std::to_string(plan.semitones) + " Halbtönen entsteht "
            + keyName(plan.reachableTonic, plan.reachableIsMinor)
            + ", nicht " + keyName(targetTonic, targetIsMinor) + ".";
        return plan;
    }

    plan.possible         = true;
    plan.reachableTonic   = targetTonic;
    plan.reachableIsMinor = targetIsMinor;

    if (plan.semitones == 0)
        plan.explanation = "Sample steht bereits in "
                         + keyName(targetTonic, targetIsMinor) + ".";
    else
        plan.explanation = keyName(sourceTonic, sourceIsMinor) + " nach "
                         + keyName(targetTonic, targetIsMinor) + ": "
                         + (plan.semitones > 0 ? "+" : "")
                         + std::to_string(plan.semitones) + " Halbtöne.";
    return plan;
}

} // namespace keydock
