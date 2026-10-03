// Single-producer / single-consumer lock-free float FIFO.
// The audio thread is the producer, the analysis worker is the consumer.
// Capacity is fixed at construction: no allocation after prepare().
#pragma once

#include <atomic>
#include <cstddef>
#include <vector>

namespace keydock
{

class RingBuffer
{
public:
    RingBuffer() = default;

    /// Allocates `capacity` samples. Call from a non-realtime thread only.
    void prepare(size_t capacity)
    {
        data_.assign(capacity + 1, 0.0f);
        read_.store(0, std::memory_order_relaxed);
        write_.store(0, std::memory_order_relaxed);
    }

    /// Realtime safe. Returns the number of samples actually written;
    /// a full buffer drops the remainder rather than blocking.
    size_t push(const float* src, size_t n) noexcept
    {
        if (data_.empty())
            return 0;

        const size_t cap   = data_.size();
        const size_t write = write_.load(std::memory_order_relaxed);
        const size_t read  = read_.load(std::memory_order_acquire);
        const size_t free  = (read + cap - write - 1) % cap;
        const size_t count = n < free ? n : free;

        for (size_t i = 0; i < count; ++i)
            data_[(write + i) % cap] = src[i];

        write_.store((write + count) % cap, std::memory_order_release);
        return count;
    }

    /// Consumer side. Returns the number of samples read.
    size_t pop(float* dst, size_t n) noexcept
    {
        if (data_.empty())
            return 0;

        const size_t cap   = data_.size();
        const size_t read  = read_.load(std::memory_order_relaxed);
        const size_t write = write_.load(std::memory_order_acquire);
        const size_t avail = (write + cap - read) % cap;
        const size_t count = n < avail ? n : avail;

        for (size_t i = 0; i < count; ++i)
            dst[i] = data_[(read + i) % cap];

        read_.store((read + count) % cap, std::memory_order_release);
        return count;
    }

    size_t available() const noexcept
    {
        if (data_.empty())
            return 0;
        const size_t cap = data_.size();
        return (write_.load(std::memory_order_acquire) + cap
                - read_.load(std::memory_order_acquire)) % cap;
    }

    /// Consumer side only; discards everything currently queued.
    void clear() noexcept
    {
        read_.store(write_.load(std::memory_order_acquire), std::memory_order_release);
    }

private:
    std::vector<float>  data_;
    std::atomic<size_t> read_ { 0 };
    std::atomic<size_t> write_ { 0 };
};

} // namespace keydock
