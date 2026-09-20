// Named-pipe server. One overlay serves every plugin instance in every
// running FL Studio process, so the UI can say which instance it is driving.
#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include "KeyDockProtocol.h"

#include <atomic>
#include <chrono>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace keydock
{

struct InstanceInfo
{
    ipc::Hello      hello {};
    ipc::StateMsg   state {};
    ipc::ResultMsg  result {};
    bool            haveResult = false;
    bool            connected  = true;
    std::chrono::steady_clock::time_point lastSeen {};
    std::chrono::steady_clock::time_point lastAudio {};
};

class IpcServer
{
public:
    IpcServer();
    ~IpcServer();

    void start();
    void stop();

    /// Snapshot of every connected plugin instance, ordered by instance id.
    std::vector<InstanceInfo> instances() const;

    /// The instance the overlay currently drives: the user's explicit pick if
    /// it is still connected, otherwise the one that most recently had audio.
    bool activeInstance(InstanceInfo& out) const;
    void setPreferredInstance(uint64_t id);
    uint64_t preferredInstance() const { return preferred_.load(); }

    void sendCommand(uint64_t instanceId, ipc::CommandId id, float param0);

    /// Raised on a worker thread whenever state or a result arrives.
    std::function<void()> onChanged;

private:
    void acceptLoop();
    void clientLoop(HANDLE pipe);
    void handleMessage(HANDLE pipe, const uint8_t* data, DWORD bytes, uint64_t& boundId);

    mutable std::mutex                  mutex_;
    std::map<uint64_t, InstanceInfo>    instances_;
    std::map<uint64_t, HANDLE>          pipes_;

    std::thread                         acceptThread_;
    std::vector<std::thread>            clientThreads_;
    std::atomic<bool>                   quit_ { false };
    std::atomic<uint64_t>               preferred_ { 0 };
    HANDLE                              pendingPipe_ = INVALID_HANDLE_VALUE;
};

} // namespace keydock
