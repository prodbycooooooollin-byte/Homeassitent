#include "keydock/Types.h"

namespace keydock
{

const char* toString(Confidence c) noexcept
{
    switch (c)
    {
        case Confidence::high:   return "High";
        case Confidence::medium: return "Medium";
        case Confidence::low:    return "Low";
        default:                 return "Uncertain";
    }
}

const char* pitchClassName(int tonic) noexcept
{
    static const char* names[12] = { "C", "C#", "D", "D#", "E", "F",
                                     "F#", "G", "G#", "A", "A#", "B" };
    if (tonic < 0 || tonic > 11)
        return "--";
    return names[tonic];
}

std::string keyName(int tonic, bool isMinor)
{
    if (tonic < 0 || tonic > 11)
        return {};
    return std::string(pitchClassName(tonic)) + (isMinor ? " minor" : " major");
}

std::string camelot(int tonic, bool isMinor)
{
    if (tonic < 0 || tonic > 11)
        return {};

    // Camelot numbers walk the circle of fifths. 8B = C major, 8A = A minor.
    // Index by pitch class; positions were derived from the circle of fifths
    // starting at C (8B) and moving up a fifth for each increment.
    static const int majorNumber[12] = { 8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1 };
    static const int minorNumber[12] = { 5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10 };

    const int n = isMinor ? minorNumber[tonic] : majorNumber[tonic];
    return std::to_string(n) + (isMinor ? "A" : "B");
}

} // namespace keydock
