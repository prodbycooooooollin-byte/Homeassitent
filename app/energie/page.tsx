"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { DonutChart } from "@/components/energy/donut-chart";
import { TopConsumersBars } from "@/components/energy/top-consumers-bars";
import { ConsumptionChart } from "@/components/dashboard/consumption-chart";
import { useApp } from "@/lib/state/app-context";
import { computeEnergyStats } from "@/lib/energy-stats";
import { downloadEnergyCsv } from "@/lib/csv";
import { formatCurrency, formatKwh } from "@/lib/format";
import type { EnergyByCategory, EnergyPoint, TimeRange } from "@/lib/types";

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "today", label: "Heute" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
];

export default function EnergiePage() {
  const { snapshot, loading, settings, updateSettings, fetchEnergyHistory, fetchEnergyBreakdown } = useApp();
  const [range, setRange] = useState<TimeRange>("today");
  const [points, setPoints] = useState<EnergyPoint[] | null>(null);
  const [breakdown, setBreakdown] = useState<{ byDevice: EnergyByCategory[]; byRoom: EnergyByCategory[] } | null>(null);
  const [priceInput, setPriceInput] = useState(settings.pricePerKwh.toString());

  useEffect(() => {
    // Client verbindet noch (siehe AppProvider) - Effekt läuft erneut, sobald `loading` false wird.
    if (loading) return;
    let cancelled = false;
    setPoints(null);
    fetchEnergyHistory(range).then((p) => {
      if (!cancelled) setPoints(p);
    });
    return () => {
      cancelled = true;
    };
  }, [range, fetchEnergyHistory, loading]);

  useEffect(() => {
    if (loading) return;
    fetchEnergyBreakdown().then(setBreakdown);
  }, [fetchEnergyBreakdown, loading]);

  useEffect(() => {
    setPriceInput(settings.pricePerKwh.toString());
  }, [settings.pricePerKwh]);

  if (loading || !snapshot) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  const { houseStatus, devices, rooms } = snapshot;
  const stats = points ? computeEnergyStats(points) : null;
  const cost = stats ? stats.total * settings.pricePerKwh : 0;
  const showSolar = settings.solarEnabled && houseStatus.solarPowerKw !== undefined;
  const unit = range === "today" ? "kW" : "kWh";

  function commitPrice() {
    const value = parseFloat(priceInput.replace(",", "."));
    if (!Number.isNaN(value) && value > 0) {
      updateSettings({ pricePerKwh: Math.round(value * 1000) / 1000 });
    } else {
      setPriceInput(settings.pricePerKwh.toString());
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Energie"
        description="Verbrauch, Kosten und Verteilung im Detail."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => points && downloadEnergyCsv(points, `energie-${range}.csv`)}
            disabled={!points}
          >
            <Icon name="download" size={15} className="mr-1.5" />
            CSV exportieren
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} />
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs text-ink-muted">
          Strompreis
          <input
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            inputMode="decimal"
            aria-label="Strompreis pro kWh"
            className="w-14 bg-transparent text-right text-ink outline-none"
          />
          €/kWh
        </label>
      </div>

      {!stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon="activity"
            label={`Verbrauch (${RANGE_OPTIONS.find((r) => r.value === range)?.label})`}
            value={formatKwh(stats.total)}
            tone="accent"
          />
          <StatCard icon="zap" label="Geschätzte Kosten" value={formatCurrency(cost, settings.currency)} tone="neutral" />
          <StatCard icon="trending-up" label="Spitzenverbrauch" value={`${stats.peak.toFixed(2)} ${unit}`} tone="warn" />
          <StatCard
            icon="gauge"
            label="Ø Verbrauch"
            value={`${stats.average.toFixed(2)} ${unit}`}
            trend={
              stats.comparisonPercent !== null
                ? {
                    direction: stats.comparisonPercent >= 0 ? "up" : "down",
                    label: `${stats.comparisonPercent >= 0 ? "+" : ""}${stats.comparisonPercent.toFixed(0)}% vs. Vorperiode`,
                  }
                : undefined
            }
            tone="good"
          />
        </div>
      )}

      {showSolar && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon="sun" label="Solarproduktion" value={formatKwh(houseStatus.solarTodayKwh ?? 0)} tone="warn" />
          <StatCard icon="leaf" label="Eigenverbrauch" value={formatKwh(houseStatus.selfConsumptionTodayKwh ?? 0)} tone="good" />
          <StatCard icon="arrow-up" label="Einspeisung" value={formatKwh(houseStatus.feedInTodayKwh ?? 0)} tone="good" />
          <StatCard icon="arrow-down" label="Netzbezug" value={formatKwh(houseStatus.gridImportTodayKwh ?? 0)} tone="accent" />
          {settings.batteryEnabled && houseStatus.batteryPercent !== undefined && (
            <StatCard icon="battery-charging" label="Batteriestand" value={`${houseStatus.batteryPercent}%`} tone="good" />
          )}
          <StatCard icon="shield-check" label="Autarkiegrad" value={`${houseStatus.autarkyPercent ?? 0}%`} tone="accent" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
          <CardDescription>Zeitraum oben wählbar · berühren für exakte Werte</CardDescription>
        </CardHeader>
        <CardContent>
          <ConsumptionChart />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Verbrauch nach Gerät</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown ? <DonutChart data={breakdown.byDevice} /> : <Skeleton className="h-44 w-full" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Verbrauch nach Raum</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown ? <DonutChart data={breakdown.byRoom} /> : <Skeleton className="h-44 w-full" />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Größte Verbraucher heute</CardTitle>
        </CardHeader>
        <CardContent>
          <TopConsumersBars devices={devices} rooms={rooms} />
        </CardContent>
      </Card>
    </div>
  );
}
