#include "keydock/Fft.h"

#include <cmath>

namespace keydock
{

Fft::Fft(int order) : size_(1 << order), order_(order)
{
    bitRev_.resize(static_cast<size_t>(size_));
    for (int i = 0; i < size_; ++i)
    {
        int rev = 0;
        for (int b = 0; b < order_; ++b)
            rev |= ((i >> b) & 1) << (order_ - 1 - b);
        bitRev_[static_cast<size_t>(i)] = rev;
    }

    cosTable_.resize(static_cast<size_t>(size_ / 2));
    sinTable_.resize(static_cast<size_t>(size_ / 2));
    for (int i = 0; i < size_ / 2; ++i)
    {
        const double a = -2.0 * 3.14159265358979323846 * i / size_;
        cosTable_[static_cast<size_t>(i)] = static_cast<float>(std::cos(a));
        sinTable_[static_cast<size_t>(i)] = static_cast<float>(std::sin(a));
    }

    scratch_.resize(static_cast<size_t>(size_) * 2);
}

void Fft::forwardComplex(std::vector<float>& reim) const
{
    // Bit-reversal permutation.
    for (int i = 0; i < size_; ++i)
    {
        const int j = bitRev_[static_cast<size_t>(i)];
        if (j > i)
        {
            std::swap(reim[static_cast<size_t>(2 * i)],     reim[static_cast<size_t>(2 * j)]);
            std::swap(reim[static_cast<size_t>(2 * i + 1)], reim[static_cast<size_t>(2 * j + 1)]);
        }
    }

    for (int len = 2; len <= size_; len <<= 1)
    {
        const int half = len / 2;
        const int step = size_ / len;
        for (int i = 0; i < size_; i += len)
        {
            for (int k = 0; k < half; ++k)
            {
                const size_t t = static_cast<size_t>(k * step);
                const float  wr = cosTable_[t];
                const float  wi = sinTable_[t];

                const size_t a = static_cast<size_t>(2 * (i + k));
                const size_t b = static_cast<size_t>(2 * (i + k + half));

                const float xr = reim[b] * wr - reim[b + 1] * wi;
                const float xi = reim[b] * wi + reim[b + 1] * wr;

                reim[b]     = reim[a]     - xr;
                reim[b + 1] = reim[a + 1] - xi;
                reim[a]     += xr;
                reim[a + 1] += xi;
            }
        }
    }
}

void Fft::magnitudeSpectrum(const float* input, std::vector<float>& magnitudes)
{
    for (int i = 0; i < size_; ++i)
    {
        scratch_[static_cast<size_t>(2 * i)]     = input[i];
        scratch_[static_cast<size_t>(2 * i + 1)] = 0.0f;
    }

    forwardComplex(scratch_);

    const size_t bins = static_cast<size_t>(size_ / 2 + 1);
    magnitudes.resize(bins);
    for (size_t i = 0; i < bins; ++i)
    {
        const float re = scratch_[2 * i];
        const float im = scratch_[2 * i + 1];
        magnitudes[i] = std::sqrt(re * re + im * im);
    }
}

std::vector<float> hannWindow(int n)
{
    std::vector<float> w(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i)
        w[static_cast<size_t>(i)] =
            static_cast<float>(0.5 - 0.5 * std::cos(2.0 * 3.14159265358979323846 * i / n));
    return w;
}

} // namespace keydock
