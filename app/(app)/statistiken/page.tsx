import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { resolveDemoMode } from "@/lib/server-context";
import { computeLeaderboard, getEarliestDataDate, type LeaderboardMetric, type LeaderboardPeriod } from "@/lib/stats/leaderboards";
import { getGoalsWithProgress } from "@/lib/stats/goals";
import { getDemoLeaderboard, getDemoGoals } from "@/lib/demo/stats";
import { DemoModeBanner } from "@/components/ui/demo-badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaderboardTable } from "@/components/stats/leaderboard-table";
import { GoalsSection } from "@/components/stats/goals-section";
import { canCreateContent } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Statistiken" };

const METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: "playtimeTicks", label: "Spielzeit" },
  { key: "blocksMinedTotal", label: "Blöcke abgebaut" },
  { key: "mobKillsTotal", label: "Mobs getötet" },
  { key: "deathsTotal", label: "Tode" },
];
const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "total", label: "Gesamt" },
  { key: "week", label: "Diese Woche" },
  { key: "month", label: "Diesen Monat" },
];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; period?: string }>;
}) {
  const user = await requireUser();
  const { demoMode, server } = await resolveDemoMode();
  const sp = await searchParams;

  const metric = (METRICS.find((m) => m.key === sp.metric)?.key ?? "playtimeTicks") as LeaderboardMetric;
  const period = (PERIODS.find((p) => p.key === sp.period)?.key ?? "total") as LeaderboardPeriod;

  const [entries, goals, earliestData] = await Promise.all([
    demoMode ? Promise.resolve(getDemoLeaderboard(metric, period)) : computeLeaderboard(metric, period),
    demoMode || !server ? Promise.resolve(getDemoGoals()) : getGoalsWithProgress(server.id),
    demoMode ? Promise.resolve(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) : getEarliestDataDate(),
  ]);

  return (
    <div className="space-y-5">
      {demoMode && <DemoModeBanner />}
      <div>
        <h1 className="text-xl font-semibold text-ink">Statistiken</h1>
        <p className="text-sm text-ink-muted">
          {earliestData
            ? `Datenerfassung seit ${formatDate(earliestData)} - zeitbezogene Werte beziehen sich nur auf tatsächlich erfasste Zeiträume.`
            : "Noch keine Daten erfasst."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rangliste</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((m) => (
              <TabLink key={m.key} active={metric === m.key} href={`/statistiken?metric=${m.key}&period=${period}`}>
                {m.label}
              </TabLink>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-raised p-0.5 w-fit">
            {PERIODS.map((p) => (
              <TabLink
                key={p.key}
                active={period === p.key}
                href={`/statistiken?metric=${metric}&period=${p.key}`}
                pill
              >
                {p.label}
              </TabLink>
            ))}
          </div>
          <LeaderboardTable entries={entries} metric={metric} />
        </CardBody>
      </Card>

      <GoalsSection goals={goals} canManage={canCreateContent(user.role)} demoMode={demoMode} />
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
  pill,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  pill?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-xs font-medium transition-colors",
        pill
          ? cn("rounded-md px-2.5 py-1", active ? "bg-accent-strong text-[#04140a]" : "text-ink-muted hover:text-ink")
          : cn(
              "rounded-full border px-3 py-1.5",
              active
                ? "border-accent/30 bg-accent-soft text-accent"
                : "border-line text-ink-muted hover:bg-surface-raised",
            ),
      )}
    >
      {children}
    </Link>
  );
}
