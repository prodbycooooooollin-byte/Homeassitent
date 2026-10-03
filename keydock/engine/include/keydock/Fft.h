// Minimal radix-2 real FFT. Self-contained so the engine can be unit tested
// on any platform without pulling in JUCE or a DSP library.
#pragma once

#include <cstddef>
#include <vector>

namespace keydock
{

class Fft
{
public:
    /// @param order  FFT size is 1 << order.
    explicit Fft(int order);

    int size() const noexcept { return size_; }

    /// Forward transform of `size()` real samples.
    /// Writes `size()/2 + 1` magnitudes into `magnitudes` (resized if needed).
    void magnitudeSpectrum(const float* input, std::vector<float>& magnitudes);

    /// In-place complex forward transform, interleaved re/im, `size()` bins.
    void forwardComplex(std::vector<float>& reim) const;

    /// In-place complex inverse transform, interleaved re/im, normalised by
    /// 1/size so forward followed by inverse is the identity.
    void inverseComplex(std::vector<float>& reim) const;

private:
    int                size_;
    int                order_;
    std::vector<int>   bitRev_;
    std::vector<float> cosTable_, sinTable_;
    std::vector<float> scratch_;
};

/// Periodic Hann window of length n.
std::vector<float> hannWindow(int n);

} // namespace keydock
