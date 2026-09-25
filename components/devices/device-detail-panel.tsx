"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { SidePanel } from "@/components/ui/side-panel";
import { DeviceStatusBadge } from "./device-status-badge";
import { formatKwh, formatRelativeTime, formatTime, formatWatt } from "@/lib/format";
import { DEVICE_TYPE_LABEL } from "@/lib/device-meta";
import { useApp } from "@/lib/state/app-context";
import type { Automation, Device, Room } from "@/lib/types";

const TIMER_OPTIONS = [15, 30, 60, 120];

function HistoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-medium text-ink">{formatTime(label)}</p>
      <p className="text-accent-strong">{formatWatt(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export function DeviceDetailPanel({
  device,
  room,
  automations,
  onClose,
}: {
  device: Device | null;
  room?: Room;
  automations: Automation[];
  onClose: () => void;
}) {
  const { toggleDevice, setDeviceTimer } = useApp();
  const [scheduleEnabled, setScheduleEnabled] = useState(false);

  const relatedAutomations = device
    ? automations.filter((a) => device.automationIds?.includes(a.id))
    : [];

  return (
    <SidePanel open={device !== null} title={device?.name ?? ""} onClose={onClose}>
      {device && (
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised text-ink-muted">
                <Icon name={device.icon} size={19} />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{DEVICE_TYPE_LABEL[device.type]}</p>
                <p className="text-xs text-ink-faint">{room?.name ?? device.roomId}</p>
              </div>
            </div>
            {device.controllable ? (
              <Toggle checked={device.isOn} onChange={() => void toggleDevice(device.id)} label={`${device.name} schalten`} />
            ) : (
              <DeviceStatusBadge status={device.status} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-ink-muted">Aktueller Verbrauch</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatWatt(device.currentPowerW)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs text-ink-muted">Verbrauch heute</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatKwh(device.todayEnergyKwh)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DeviceStatusBadge status={device.status} />
            <Badge tone="neutral">
              <Icon name="clock" size={11} />
              Zuletzt geändert: {formatRelativeTime(device.lastChanged)}
            </Badge>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Verlauf (24h)</p>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={device.history ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="deviceHistory" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3d8bfd" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3d8bfd" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="time" tickFormatter={(v) => formatTime(v)} tick={{ fill: "#5f6c85", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} minTickGap={40} />
                  <YAxis tick={{ fill: "#5f6c85", fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<HistoryTooltip />} cursor={{ stroke: "rgba(61,139,253,0.35)" }} />
                  <Area type="monotone" dataKey="value" stroke="#3d8bfd" strokeWidth={2} fill="url(#deviceHistory)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {device.controllable && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Timer</p>
              <div className="grid grid-cols-4 gap-2">
                {TIMER_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => void setDeviceTimer(device.id, minutes)}
                    className="flex h-10 items-center justify-center rounded-lg border border-line bg-surface-raised text-xs font-medium text-ink hover:bg-surface-hover active:scale-95"
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
              {device.timerMinutesLeft !== undefined && (
                <p className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                  <span>Timer aktiv: {device.timerMinutesLeft} Min. verbleibend</span>
                  <button className="text-accent-strong hover:underline" onClick={() => void setDeviceTimer(device.id, null)}>
                    Stoppen
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
            <div>
              <p className="text-sm font-medium text-ink">Zeitplan</p>
              <p className="text-xs text-ink-faint">Täglich 07:00 – 22:00 aktiv</p>
            </div>
            <Toggle checked={scheduleEnabled} onChange={setScheduleEnabled} label="Zeitplan aktivieren" size="sm" />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Automationen</p>
            {relatedAutomations.length === 0 ? (
              <p className="text-xs text-ink-faint">Dieses Gerät wird in keiner Automation verwendet.</p>
            ) : (
              <ul className="space-y-2">
                {relatedAutomations.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line bg-surface p-3">
                    <p className="text-sm font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-ink-faint">{a.trigger}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SidePanel>
  );
}
