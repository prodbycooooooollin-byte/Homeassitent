#include "keydock/Resampler.h"

#include <algorithm>
#include <cmath>

namespace
{
constexpr double kPi = 3.14159265358979323846;

double sinc(double x)
{
    if (std::abs(x) < 1.0e-9)
        return 1.0;
    return std::sin(kPi * x) / (kPi * x);
}

// Kaiser window, beta chosen for roughly -80 dB stopband.
double besselI0(double x)
{
    double sum = 1.0, term = 1.0;
    for (int k = 1; k < 32; ++k)
    {
        term *= (x * x) / (4.0 * k * k);
        sum  += term;
        if (term < 1.0e-12 * sum)
            break;
    }
    return sum;
}
} // namespace

namespace keydock
{

void Resampler::reset(double inRate, double outRate)
{
    ratio_       = outRate / inRate;
    passthrough_ = std::abs(ratio_ - 1.0) < 1.0e-6;
    // Anti-alias at the lower of the two Nyquist limits, with a small guard band.
    cutoff_      = passthrough_ ? 0.5 : std::min(0.5, 0.5 * ratio_) * 0.92;
    halfWidth_   = passthrough_ ? 1 : 24;
    history_.assign(static_cast<size_t>(2 * halfWidth_ + 2), 0.0f);
    pos_ = static_cast<double>(halfWidth_);
}

float Resampler::interpolate(double position) const
{
    const int    centre = static_cast<int>(std::floor(position));
    const double frac   = position - centre;
    const double beta   = 8.6;
    const double denom  = besselI0(beta);

    double acc = 0.0, norm = 0.0;
    for (int k = -halfWidth_ + 1; k <= halfWidth_; ++k)
    {
        const int idx = centre + k;
        if (idx < 0 || idx >= static_cast<int>(history_.size()))
            continue;

        const double x = k - frac;
        const double t = x / halfWidth_;
        if (std::abs(t) >= 1.0)
            continue;

        const double w = besselI0(beta * std::sqrt(1.0 - t * t)) / denom;
        const double h = 2.0 * cutoff_ * sinc(2.0 * cutoff_ * x) * w;

        acc  += h * history_[static_cast<size_t>(idx)];
        norm += h;
    }

    if (norm > 1.0e-9)
        acc /= norm;
    return static_cast<float>(acc);
}

void Resampler::process(const float* in, size_t numSamples, std::vector<float>& out)
{
    if (passthrough_)
    {
        out.insert(out.end(), in, in + numSamples);
        return;
    }

    for (size_t i = 0; i < numSamples; ++i)
    {
        history_.push_back(in[i]);

        // Emit every output sample whose input position now has full support.
        while (pos_ + halfWidth_ < static_cast<double>(history_.size()) - 1.0)
        {
            out.push_back(interpolate(pos_));
            pos_ += 1.0 / ratio_;
        }

        // Keep the history window bounded.
        const size_t keepFrom = static_cast<size_t>(std::max(0.0, pos_ - halfWidth_ - 2.0));
        if (keepFrom > 4096)
        {
            history_.erase(history_.begin(),
                           history_.begin() + static_cast<long>(keepFrom));
            pos_ -= static_cast<double>(keepFrom);
        }
    }
}

void Resampler::flush(std::vector<float>& out)
{
    if (passthrough_)
        return;

    const std::vector<float> tail(static_cast<size_t>(halfWidth_ + 1), 0.0f);
    process(tail.data(), tail.size(), out);
}

} // namespace keydock
