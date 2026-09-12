"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export function ActivityChart({ days }: { days: { date: string; activePlayers: number }[] }) {
  const [range, setRange] = useState<7 | 30>(7);
  const data = days.slice(-range).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
  }));
  const noData = days.every((d) => d.activePlayers === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivität</CardTitle>
        <div className="flex gap-1 rounded-lg bg-surface-raised p-0.5">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r ? "bg-accent-strong text-[#04140a]" : "text-ink-muted hover:text-ink"
              }`}
            >
              {r} Tage
            </button>
          ))}
        </div>
      </CardHeader>
      <CardBody>
        {noData ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            Noch keine Aktivitätsdaten - sobald der Connector Beitritte erfasst, erscheint
            hier der Verlauf.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: -20 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#6b8177", fontSize: 11 }}
                  axisLine={{ stroke: "#233028" }}
                  tickLine={false}
                  interval={range === 30 ? 3 : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#6b8177", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  cursor={{ fill: "rgba(74,222,128,0.08)" }}
                  contentStyle={{
                    background: "#182019",
                    border: "1px solid #233028",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#e8f0ea",
                  }}
                  labelStyle={{ color: "#9db3a5" }}
                  formatter={(value) => [`${value} aktive Spieler`, ""]}
                />
                <Bar dataKey="activePlayers" fill="#4ade80" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
