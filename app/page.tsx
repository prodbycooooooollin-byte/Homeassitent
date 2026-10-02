"use client";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { EnergyFlow } from "@/components/dashboard/energy-flow";
import { ConsumptionChart } from "@/components/dashboard/consumption-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { TopDevices } from "@/components/dashboard/top-devices";
import { HintsCard } from "@/components/dashboard/hints-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useApp } from "@/lib/state/app-context";
import { formatCurrency, formatKw, formatKwh } from "@/lib/format";

export default function DashboardPage() {
  const { snapshot, loading, settings } = useApp();

  if (loading || !snapshot) {
    return (
      <div className="space-y-5">
        <div className="h-16" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonCard />
      </div>
    );
  }

  const { houseStatus, weather, hints, quickActions, devices, rooms } = snapshot;
  const showSolar = settings.solarEnabled && houseStatus.solarPowerKw !== undefined;
  const showBattery = settings.batteryEnabled && houseStatus.batteryPercent !== undefined;
  const visibleQuickActions = quickActions.filter(
    (a) => a.visible && settings.quickActionIds.includes(a.type),
  );
  const estimatedCostToday = houseStatus.todayEnergyKwh * settings.pricePerKwh;

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardHeader weather={weather} hints={hints} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon="zap" label="Aktueller Verbrauch" value={formatKw(houseStatus.currentPowerKw)} tone="accent" />
        <StatCard
          icon="activity"
          label="Heute verbraucht"
          value={formatKwh(houseStatus.todayEnergyKwh)}
          sub={formatCurrency(estimatedCostToday, settings.currency)}
          tone="neutral"
        />
        <StatCard
          icon={houseStatus.gridPowerKw >= 0 ? "arrow-down" : "arrow-up"}
          label={houseStatus.gridPowerKw >= 0 ? "Netzbezug" : "Netzeinspeisung"}
          value={formatKw(Math.abs(houseStatus.gridPowerKw))}
          tone={houseStatus.gridPowerKw >= 0 ? "accent" : "good"}
        />
        <StatCard icon="plug-zap" label="Aktive Geräte" value={`${houseStatus.activeDevicesCount}`} tone="good" />

        {showSolar && (
          <StatCard icon="sun" label="Solarproduktion" value={formatKw(houseStatus.solarPowerKw ?? 0)} tone="warn" />
        )}
        {showBattery && (
          <StatCard
            icon="battery-charging"
            label="Batteriestand"
            value={`${houseStatus.batteryPercent}%`}
            sub={
              houseStatus.batteryPowerKw
                ? `${houseStatus.batteryPowerKw >= 0 ? "Lädt" : "Entlädt"} · ${formatKw(Math.abs(houseStatus.batteryPowerKw))}`
                : undefined
            }
            tone="good"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Energiefluss</CardTitle>
        </CardHeader>
        <CardContent>
          <EnergyFlow status={houseStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stromverbrauch</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsumptionChart />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schnellaktionen</CardTitle>
        </CardHeader>
        <CardContent>
          <QuickActions actions={visibleQuickActions} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Größte Verbraucher</CardTitle>
          </CardHeader>
          <CardContent>
            <TopDevices devices={devices} rooms={rooms} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hinweise & Empfehlungen</CardTitle>
          </CardHeader>
          <CardContent>
            <HintsCard hints={hints} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
