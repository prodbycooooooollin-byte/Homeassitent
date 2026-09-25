"use client";

import { useEffect } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { formatTemperature, formatTime } from "@/lib/format";
import type { Room } from "@/lib/types";

const HEATING_SCHEDULE = [
  { label: "Morgens", time: "06:00 – 08:30", target: "21°" },
  { label: "Tagsüber", time: "08:30 – 17:00", target: "18°" },
  { label: "Abends", time: "17:00 – 22:30", target: "22°" },
  { label: "Nachts", time: "22:30 – 06:00", target: "17°" },
];

function HistoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-medium text-ink">{formatTime(label)}</p>
      <p className="text-accent-strong">{payload[0]?.value?.toFixed(1)}°C Ist</p>
      <p className="text-ink-faint">{payload[1]?.value?.toFixed(1)}°C Ziel</p>
    </div>
  );
}

export function RoomDetailModal({ room, onClose }: { room: Room | null; onClose: () => void }) {
  useEffect(() => {
    if (!room) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [room, onClose]);

  if (!room) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${room.name} Details`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface-raised p-5 shadow-card animate-fade-in [padding-bottom:calc(1.5rem+env(safe-area-inset-bottom))] sm:max-h-[85vh] sm:rounded-xl2"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-ink-muted">
              <Icon name={room.icon} size={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">{room.name}</h2>
              <p className="text-xs text-ink-muted">
                {formatTemperature(room.temperature)} · Ziel {formatTemperature(room.targetTemperature)}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-hover hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone={room.heatingStatus === "heating" ? "warn" : "neutral"}>
            <Icon name="flame" size={11} /> {room.heatingStatus === "heating" ? "Heizt" : room.heatingStatus === "off" ? "Aus" : "Bereit"}
          </Badge>
          <Badge tone="neutral">
            <Icon name="droplets" size={11} /> {room.humidity}% Feuchte
          </Badge>
          {room.windowOpen && (
            <Badge tone="warn">
              <Icon name="alert-triangle" size={11} /> Fenster offen
            </Badge>
          )}
        </div>

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Temperaturverlauf (24h)</p>
        <div className="mb-5 h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={room.history ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="roomTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3d8bfd" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3d8bfd" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(v) => formatTime(v)}
                tick={{ fill: "#5f6c85", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis tick={{ fill: "#5f6c85", fontSize: 10 }} axisLine={false} tickLine={false} width={32} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip content={<HistoryTooltip />} cursor={{ stroke: "rgba(61,139,253,0.35)" }} />
              <Line type="monotone" dataKey="target" stroke="#5f6c85" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="temperature" stroke="#3d8bfd" strokeWidth={2.2} fill="url(#roomTemp)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Heizzeiten</p>
        <ul className="space-y-2">
          {HEATING_SCHEDULE.map((slot) => (
            <li key={slot.label} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <span className="text-ink">{slot.label}</span>
              <span className="text-ink-faint">{slot.time}</span>
              <span className="font-medium text-ink">{slot.target}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
