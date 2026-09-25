"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/lib/state/app-context";
import type { EnergyPoint, TimeRange } from "@/lib/types";
import { formatTime } from "@/lib/format";

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "today", label: "Heute" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
];

const UNIT_BY_RANGE: Record<TimeRange, string> = {
  live: "kW",
  today: "kW",
  week: "kWh",
  month: "kWh",
  year: "kWh",
};

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  const previous = payload[1]?.value;
  const isIsoTime = typeof label === "string" && label.includes("T");
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-medium text-ink">{isIsoTime ? formatTime(label) : label}</p>
      <p className="text-accent-strong">
        {value?.toFixed?.(2)} {unit}
      </p>
      {previous !== undefined && (
        <p className="text-ink-faint">Vorperiode: {previous?.toFixed?.(2)} {unit}</p>
      )}
    </div>
  );
}

export function ConsumptionChart() {
  const { fetchEnergyHistory } = useApp();
  const [range, setRange] = useState<TimeRange>("today");
  const [data, setData] = useState<EnergyPoint[] | null>(null);
  const [showCompare, setShowCompare] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetchEnergyHistory(range).then((points) => {
      if (!cancelled) setData(points);
    });
    return () => {
      cancelled = true;
    };
  }, [range, fetchEnergyHistory]);

  const unit = UNIT_BY_RANGE[range];
  const hasComparison = useMemo(() => data?.some((p) => p.previous !== undefined) ?? false, [data]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} />
        {hasComparison && (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={showCompare}
              onChange={(e) => setShowCompare(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-accent"
            />
            Vorperiode vergleichen
          </label>
        )}
      </div>

      {!data ? (
        <Skeleton className="h-56 w-full sm:h-64" />
      ) : (
        <div className="h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3d8bfd" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3d8bfd" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(v) => (typeof v === "string" && v.includes("T") ? formatTime(v) : v)}
                tick={{ fill: "#5f6c85", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "#5f6c85", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: "rgba(61,139,253,0.35)" }} />
              {showCompare && hasComparison && (
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="#5f6c85"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3d8bfd"
                strokeWidth={2.2}
                fill="url(#fillValue)"
                dot={false}
                activeDot={{ r: 4, fill: "#3d8bfd" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
