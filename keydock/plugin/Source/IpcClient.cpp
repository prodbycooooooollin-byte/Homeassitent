#include "IpcClient.h"

#include <chrono>
#include <cstring>

#if defined(_WIN32)
  // NOMINMAX: windows.h otherwise defines min/max as macros, which breaks every
  // std::min / std::max call in this translation unit under MSVC.
  #ifndef NOMINMAX
    #define NOMINMAX
  #endif
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #include <windows.h>
#endif

namespace keydock
{

namespace
{
constexpr size_t kMaxQueued = 64;   // bounded: never grow without limit
}

IpcClient::IpcClient() = default;

IpcClient::~IpcClient()
{
    stop();
}

void IpcClient::start(const ipc::Hello& hello)
{
    hello_ = hello;
    quit_.store(false);
    thread_ = std::thread([this] { threadLoop(); });
}

void IpcClient::stop()
{
    if (! thread_.joinable())
        return;

    quit_.store(true);
    queueCv_.notify_all();
    thread_.join();
    closeConnection();
}

void IpcClient::enqueue(ipc::MsgType type, const void* payload, uint32_t bytes)
{
    Packet p;
    p.type = type;
    p.payload.resize(bytes);
    std::memcpy(p.payload.data(), payload, bytes);

    {
        std::lock_guard<std::mutex> lock(queueMutex_);
        // State messages are superseded by newer ones, so drop the oldest
        // rather than letting a stalled overlay build a backlog.
        while (queue_.size() >= kMaxQueued)
            queue_.pop_front();
        queue_.push_back(std::move(p));
    }
    queueCv_.notify_all();
}

void IpcClient::sendState(const ipc::StateMsg& msg)
{
    enqueue(ipc::MsgType::state, &msg, sizeof(msg));
}

void IpcClient::sendResult(const ipc::ResultMsg& msg)
{
    enqueue(ipc::MsgType::result, &msg, sizeof(msg));
}

void IpcClient::sendEditState(const ipc::EditStateMsg& msg)
{
    enqueue(ipc::MsgType::editState, &msg, sizeof(msg));
}

#if defined(_WIN32)

void IpcClient::closeConnection()
{
    if (handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE)
        CloseHandle(static_cast<HANDLE>(handle_));
    handle_ = nullptr;
    connected_.store(false);
}

bool IpcClient::connectOnce()
{
    HANDLE h = CreateFileA(ipc::kPipeName, GENERIC_READ | GENERIC_WRITE,
                           0, nullptr, OPEN_EXISTING, 0, nullptr);
    if (h == INVALID_HANDLE_VALUE)
        return false;

    DWORD mode = PIPE_READMODE_MESSAGE;
    SetNamedPipeHandleState(h, &mode, nullptr, nullptr);

    handle_ = h;
    connected_.store(true);

    // Identify ourselves before anything else, so the overlay can label the
    // instance in its selector.
    return writeRaw(ipc::MsgType::hello, &hello_, sizeof(hello_));
}

bool IpcClient::writeRaw(ipc::MsgType type, const void* payload, uint32_t bytes)
{
    if (handle_ == nullptr || bytes + sizeof(ipc::Header) > ipc::kMaxMessageBytes)
        return false;

    uint8_t buffer[ipc::kMaxMessageBytes];
    auto* header = reinterpret_cast<ipc::Header*>(buffer);
    header->magic        = ipc::kMagic;
    header->version      = ipc::kProtocolVersion;
    header->type         = static_cast<uint32_t>(type);
    header->payloadBytes = bytes;
    std::memcpy(buffer + sizeof(ipc::Header), payload, bytes);

    DWORD written = 0;
    const DWORD total = static_cast<DWORD>(sizeof(ipc::Header) + bytes);
    if (! WriteFile(static_cast<HANDLE>(handle_), buffer, total, &written, nullptr)
        || written != total)
    {
        closeConnection();
        return false;
    }
    return true;
}

void IpcClient::flushQueue()
{
    while (true)
    {
        Packet p;
        {
            std::lock_guard<std::mutex> lock(queueMutex_);
            if (queue_.empty())
                return;
            p = std::move(queue_.front());
            queue_.pop_front();
        }
        if (! writeRaw(p.type, p.payload.data(), static_cast<uint32_t>(p.payload.size())))
            return;
    }
}

void IpcClient::threadLoop()
{
    auto lastLaunchAttempt = std::chrono::steady_clock::now()
                           - std::chrono::seconds(30);

    while (! quit_.load())
    {
        if (! connected_.load())
        {
            if (! connectOnce())
            {
                const auto now = std::chrono::steady_clock::now();
                if (now - lastLaunchAttempt > std::chrono::seconds(5))
                {
                    lastLaunchAttempt = now;
                    if (onOverlayMissing)
                        onOverlayMissing();
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
                continue;
            }
        }

        flushQueue();

        // Poll for commands without blocking the writer for long.
        DWORD available = 0;
        if (! PeekNamedPipe(static_cast<HANDLE>(handle_), nullptr, 0, nullptr,
                            &available, nullptr))
        {
            closeConnection();
            continue;
        }

        if (available >= sizeof(ipc::Header))
        {
            uint8_t buffer[ipc::kMaxMessageBytes];
            DWORD   read = 0;
            if (ReadFile(static_cast<HANDLE>(handle_), buffer, sizeof(buffer),
                         &read, nullptr) && read >= sizeof(ipc::Header))
            {
                const auto* header = reinterpret_cast<const ipc::Header*>(buffer);
                if (header->magic == ipc::kMagic
                    && header->version == ipc::kProtocolVersion
                    && header->type == static_cast<uint32_t>(ipc::MsgType::command)
                    && header->payloadBytes == sizeof(ipc::CommandMsg)
                    && read >= sizeof(ipc::Header) + sizeof(ipc::CommandMsg))
                {
                    ipc::CommandMsg cmd {};
                    std::memcpy(&cmd, buffer + sizeof(ipc::Header), sizeof(cmd));
                    if (onCommand
                        && (cmd.targetInstanceId == 0
                            || cmd.targetInstanceId == hello_.instanceId))
                        onCommand(cmd);
                }
            }
            else
            {
                closeConnection();
            }
            continue;
        }

        std::unique_lock<std::mutex> lock(queueMutex_);
        queueCv_.wait_for(lock, std::chrono::milliseconds(30));
    }

    if (connected_.load())
        writeRaw(ipc::MsgType::goodbye, &hello_.instanceId, sizeof(hello_.instanceId));
}

#else   // Non-Windows: the overlay is a Windows component, so this is a stub.

void IpcClient::closeConnection() { connected_.store(false); }
bool IpcClient::connectOnce()     { return false; }
bool IpcClient::writeRaw(ipc::MsgType, const void*, uint32_t) { return false; }
void IpcClient::flushQueue()
{
    std::lock_guard<std::mutex> lock(queueMutex_);
    queue_.clear();
}

void IpcClient::threadLoop()
{
    while (! quit_.load())
    {
        flushQueue();
        std::unique_lock<std::mutex> lock(queueMutex_);
        queueCv_.wait_for(lock, std::chrono::milliseconds(100));
    }
}

#endif

} // namespace keydock
