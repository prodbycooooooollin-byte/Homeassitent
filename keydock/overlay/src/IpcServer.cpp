#include "IpcServer.h"

#include <cstring>

namespace keydock
{

namespace
{
constexpr DWORD kBufferSize = ipc::kMaxMessageBytes;

/// A plugin that has not reported in for this long is treated as gone, so a
/// crashed or force-closed FL Studio does not leave a ghost in the selector.
constexpr auto kStaleAfter = std::chrono::seconds(5);
} // namespace

IpcServer::IpcServer() = default;

IpcServer::~IpcServer()
{
    stop();
}

void IpcServer::start()
{
    quit_.store(false);
    acceptThread_ = std::thread([this] { acceptLoop(); });
}

void IpcServer::stop()
{
    if (! acceptThread_.joinable() && clientThreads_.empty())
        return;

    quit_.store(true);

    // Unblock ConnectNamedPipe by connecting to ourselves once.
    HANDLE poke = CreateFileA(ipc::kPipeName, GENERIC_READ | GENERIC_WRITE,
                              0, nullptr, OPEN_EXISTING, 0, nullptr);
    if (poke != INVALID_HANDLE_VALUE)
        CloseHandle(poke);

    {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& [id, pipe] : pipes_)
            if (pipe != INVALID_HANDLE_VALUE)
                CancelIoEx(pipe, nullptr);
    }

    if (acceptThread_.joinable())
        acceptThread_.join();
    for (auto& t : clientThreads_)
        if (t.joinable())
            t.join();
    clientThreads_.clear();
}

void IpcServer::acceptLoop()
{
    while (! quit_.load())
    {
        HANDLE pipe = CreateNamedPipeA(
            ipc::kPipeName,
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            PIPE_UNLIMITED_INSTANCES,
            kBufferSize, kBufferSize, 0, nullptr);

        if (pipe == INVALID_HANDLE_VALUE)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(250));
            continue;
        }

        const BOOL connected = ConnectNamedPipe(pipe, nullptr)
                             || GetLastError() == ERROR_PIPE_CONNECTED;

        if (quit_.load() || ! connected)
        {
            CloseHandle(pipe);
            continue;
        }

        clientThreads_.emplace_back([this, pipe] { clientLoop(pipe); });
    }
}

void IpcServer::handleMessage(HANDLE pipe, const uint8_t* data, DWORD bytes,
                              uint64_t& boundId)
{
    if (bytes < sizeof(ipc::Header))
        return;

    const auto* header = reinterpret_cast<const ipc::Header*>(data);
    if (header->magic != ipc::kMagic || header->version != ipc::kProtocolVersion)
        return;
    if (bytes < sizeof(ipc::Header) + header->payloadBytes)
        return;

    const uint8_t* payload = data + sizeof(ipc::Header);
    const auto now = std::chrono::steady_clock::now();

    std::lock_guard<std::mutex> lock(mutex_);

    switch (static_cast<ipc::MsgType>(header->type))
    {
        case ipc::MsgType::hello:
        {
            if (header->payloadBytes != sizeof(ipc::Hello))
                return;
            ipc::Hello hello {};
            std::memcpy(&hello, payload, sizeof(hello));
            hello.hostName[sizeof(hello.hostName) - 1] = '\0';
            hello.displayName[sizeof(hello.displayName) - 1] = '\0';

            boundId = hello.instanceId;
            auto& info = instances_[boundId];
            info.hello     = hello;
            info.connected = true;
            info.lastSeen  = now;
            pipes_[boundId] = pipe;

            if (preferred_.load() == 0)
                preferred_.store(boundId);
            break;
        }

        case ipc::MsgType::state:
        {
            if (header->payloadBytes != sizeof(ipc::StateMsg))
                return;
            ipc::StateMsg state {};
            std::memcpy(&state, payload, sizeof(state));

            auto& info = instances_[state.instanceId];
            info.state    = state;
            info.lastSeen = now;
            info.connected = true;
            // "Most recently had audio" is what makes the default pick
            // unambiguous when several projects are open at once.
            if (state.inputPeakDb > -50.0f)
                info.lastAudio = now;
            break;
        }

        case ipc::MsgType::result:
        {
            if (header->payloadBytes != sizeof(ipc::ResultMsg))
                return;
            ipc::ResultMsg result {};
            std::memcpy(&result, payload, sizeof(result));
            result.note[sizeof(result.note) - 1] = '\0';

            auto& info = instances_[result.instanceId];
            // Drop a result that belongs to an analysis the plugin already
            // superseded: a late answer must never replace a newer one.
            if (info.haveResult && result.analysisId < info.result.analysisId)
                break;
            info.result     = result;
            info.haveResult = true;
            info.lastSeen   = now;
            break;
        }

        case ipc::MsgType::editState:
        {
            if (header->payloadBytes != sizeof(ipc::EditStateMsg))
                return;
            ipc::EditStateMsg edit {};
            std::memcpy(&edit, payload, sizeof(edit));
            edit.sourceLabel[sizeof(edit.sourceLabel) - 1]         = '\0';
            edit.tuningNote[sizeof(edit.tuningNote) - 1]           = '\0';
            edit.planExplanation[sizeof(edit.planExplanation) - 1] = '\0';
            edit.lastExportPath[sizeof(edit.lastExportPath) - 1]   = '\0';
            edit.lastExportError[sizeof(edit.lastExportError) - 1] = '\0';

            auto& info = instances_[edit.instanceId];
            info.edit      = edit;
            info.haveEdit  = true;
            info.lastSeen  = now;
            break;
        }

        case ipc::MsgType::goodbye:
        {
            if (boundId != 0)
            {
                instances_.erase(boundId);
                pipes_.erase(boundId);
            }
            break;
        }

        default:
            break;
    }
}

void IpcServer::clientLoop(HANDLE pipe)
{
    std::vector<uint8_t> buffer(kBufferSize);
    uint64_t boundId = 0;

    while (! quit_.load())
    {
        DWORD read = 0;
        if (! ReadFile(pipe, buffer.data(), static_cast<DWORD>(buffer.size()),
                       &read, nullptr) || read == 0)
            break;

        handleMessage(pipe, buffer.data(), read, boundId);

        if (onChanged)
            onChanged();
    }

    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (boundId != 0)
        {
            auto it = instances_.find(boundId);
            if (it != instances_.end())
                it->second.connected = false;
            pipes_.erase(boundId);
        }
    }

    DisconnectNamedPipe(pipe);
    CloseHandle(pipe);

    if (onChanged)
        onChanged();
}

std::vector<InstanceInfo> IpcServer::instances() const
{
    std::lock_guard<std::mutex> lock(mutex_);
    const auto now = std::chrono::steady_clock::now();

    std::vector<InstanceInfo> out;
    out.reserve(instances_.size());
    for (const auto& [id, info] : instances_)
        if (info.connected && now - info.lastSeen < kStaleAfter)
            out.push_back(info);
    return out;
}

bool IpcServer::activeInstance(InstanceInfo& out) const
{
    const auto list = instances();
    if (list.empty())
        return false;

    const uint64_t preferred = preferred_.load();
    for (const auto& info : list)
    {
        if (info.hello.instanceId == preferred)
        {
            out = info;
            return true;
        }
    }

    // The preferred instance is gone: fall back to whichever saw audio last.
    const InstanceInfo* best = &list.front();
    for (const auto& info : list)
        if (info.lastAudio > best->lastAudio)
            best = &info;
    out = *best;
    return true;
}

void IpcServer::setPreferredInstance(uint64_t id)
{
    preferred_.store(id);
}

void IpcServer::sendCommand(uint64_t instanceId, ipc::CommandId id,
                            float param0, float param1, int32_t param2)
{
    ipc::CommandMsg cmd {};
    cmd.targetInstanceId = instanceId;
    cmd.commandId        = static_cast<uint32_t>(id);
    cmd.param0           = param0;
    cmd.param1           = param1;
    cmd.param2           = param2;

    uint8_t buffer[sizeof(ipc::Header) + sizeof(ipc::CommandMsg)];
    auto* header = reinterpret_cast<ipc::Header*>(buffer);
    header->magic        = ipc::kMagic;
    header->version      = ipc::kProtocolVersion;
    header->type         = static_cast<uint32_t>(ipc::MsgType::command);
    header->payloadBytes = sizeof(cmd);
    std::memcpy(buffer + sizeof(ipc::Header), &cmd, sizeof(cmd));

    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = pipes_.find(instanceId);
    if (it == pipes_.end() || it->second == INVALID_HANDLE_VALUE)
        return;

    DWORD written = 0;
    WriteFile(it->second, buffer, sizeof(buffer), &written, nullptr);
}

} // namespace keydock
