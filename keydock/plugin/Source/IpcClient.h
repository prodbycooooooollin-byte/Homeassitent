// Named-pipe client that talks to the KeyDock overlay.
//
// Never called from the audio thread. A dropped or missing overlay is a
// non-event for the plugin: audio keeps flowing and the built-in editor keeps
// working, the client just retries the connection in the background.
#pragma once

#include "KeyDockProtocol.h"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace keydock
{

class IpcClient
{
public:
    IpcClient();
    ~IpcClient();

    /// Starts the background connect/read loop.
    void start(const ipc::Hello& hello);
    void stop();

    void sendState(const ipc::StateMsg& msg);
    void sendResult(const ipc::ResultMsg& msg);

    bool isConnected() const noexcept { return connected_.load(); }

    /// Invoked on the IPC reader thread. Keep it short and non-blocking.
    std::function<void(const ipc::CommandMsg&)> onCommand;

    /// Called when the client gives up finding an overlay, so the plugin can
    /// launch one. Invoked on the IPC thread, at most once every few seconds.
    std::function<void()> onOverlayMissing;

private:
    void threadLoop();
    bool connectOnce();
    void closeConnection();
    bool writeRaw(ipc::MsgType type, const void* payload, uint32_t bytes);
    void enqueue(ipc::MsgType type, const void* payload, uint32_t bytes);
    void flushQueue();

    struct Packet
    {
        ipc::MsgType         type;
        std::vector<uint8_t> payload;
    };

    ipc::Hello              hello_ {};
    std::thread             thread_;
    std::atomic<bool>       quit_ { false };
    std::atomic<bool>       connected_ { false };

    std::mutex              queueMutex_;
    std::condition_variable queueCv_;
    std::deque<Packet>      queue_;

    void*                   handle_ = nullptr;   // HANDLE on Windows
};

} // namespace keydock
