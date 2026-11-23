"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { EnergyByCategory } from "@/lib/types";
import { formatKwh } from "@/lib/format";

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as EnergyByCategory;
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-card">
      <p className="font-medium text-ink">{item.label}</p>
      <p className="text-ink-muted">{formatKwh(item.valueKwh)}</p>
    </div>
  );
}

export function DonutChart({ data }: { data: EnergyByCategory[] }) {
  const total = data.reduce((sum, d) => sum + d.valueKwh, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="valueKwh"
              nameKey="label"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-semibold text-ink">{formatKwh(total)}</p>
          <p className="text-[0.65rem] text-ink-faint">Gesamt</p>
        </div>
      </div>

      <ul className="flex w-full flex-1 flex-col gap-2">
        {data.map((entry) => (
          <li key={entry.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="truncate text-ink-muted">{entry.label}</span>
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums">{formatKwh(entry.valueKwh)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
