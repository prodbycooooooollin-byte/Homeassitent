#include "keydock/LookbackBuffer.h"

#include "keydock/Types.h"

#include <algorithm>
#include <cmath>

namespace keydock
{

void LookbackBuffer::configure(float seconds)
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (seconds <= 0.0f)
    {
        data_.clear();
        data_.shrink_to_fit();
        capacity_ = write_ = filled_ = 0;
        return;
    }

    const size_t wanted = static_cast<size_t>(kAnalysisSampleRate
                                              * std::min(seconds, 120.0f));
    if (wanted == capacity_)
        return;

    // A length change invalidates the contents: keeping part of it would mix
    // two different configurations.
    data_.assign(wanted, 0.0f);
    capacity_ = wanted;
    write_    = 0;
    filled_   = 0;
}

void LookbackBuffer::append(const float* samples, size_t count)
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (capacity_ == 0 || count == 0)
        return;

    // Only the last `capacity_` samples can survive, so skip the rest.
    if (count > capacity_)
    {
        samples += count - capacity_;
        count = capacity_;
    }

    for (size_t i = 0; i < count; ++i)
    {
        data_[write_] = samples[i];
        write_ = (write_ + 1) % capacity_;
    }
    filled_ = std::min(capacity_, filled_ + count);
}

float LookbackBuffer::availableSeconds() const
{
    std::lock_guard<std::mutex> lock(mutex_);
    return static_cast<float>(filled_ / kAnalysisSampleRate);
}

float LookbackBuffer::configuredSeconds() const
{
    std::lock_guard<std::mutex> lock(mutex_);
    return static_cast<float>(capacity_ / kAnalysisSampleRate);
}

bool LookbackBuffer::enabled() const
{
    std::lock_guard<std::mutex> lock(mutex_);
    return capacity_ > 0;
}

std::vector<float> LookbackBuffer::snapshot(float seconds) const
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (capacity_ == 0 || filled_ == 0 || seconds <= 0.0f)
        return {};

    const size_t wanted = std::min(filled_,
        static_cast<size_t>(kAnalysisSampleRate * seconds));
    if (wanted == 0)
        return {};

    std::vector<float> out(wanted);

    // The newest sample sits just before write_; walk back `wanted` from there.
    const size_t start = (write_ + capacity_ - wanted) % capacity_;
    for (size_t i = 0; i < wanted; ++i)
        out[i] = data_[(start + i) % capacity_];

    return out;
}

void LookbackBuffer::clear()
{
    std::lock_guard<std::mutex> lock(mutex_);
    std::fill(data_.begin(), data_.end(), 0.0f);
    write_  = 0;
    filled_ = 0;
}

} // namespace keydock
