// Rolling history of the most recent audio, so a passage can be analysed
// after the fact without playing it again.
//
// Off by default and bounded: at the analysis rate, 60 seconds of mono costs
// about 5 MB. Nothing is ever written to disk.
#pragma once

#include <cstddef>
#include <mutex>
#include <vector>

namespace keydock
{

class LookbackBuffer
{
public:
    /// Allocates room for `seconds` of audio at the analysis rate. Passing 0
    /// releases the memory. Call from a worker thread, never from audio.
    void configure(float seconds);

    /// Appends analysis-rate audio, discarding the oldest samples once full.
    void append(const float* samples, size_t count);

    /// Seconds currently held, which is less than the configured length until
    /// the buffer has filled.
    float availableSeconds() const;
    float configuredSeconds() const;
    bool  enabled() const;

    /// Copies out the most recent `seconds`, oldest first. The copy is
    /// detached from the rolling buffer, so continued recording cannot
    /// overwrite a selection that is being analysed or edited.
    std::vector<float> snapshot(float seconds) const;

    /// Drops everything held without changing the configured length.
    void clear();

private:
    mutable std::mutex mutex_;
    std::vector<float> data_;      ///< circular
    size_t             capacity_ = 0;
    size_t             write_    = 0;
    size_t             filled_   = 0;
};

} // namespace keydock
