"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useClock } from "@/lib/hooks/use-clock";
import { formatClock, formatDateLong, greetingForHour } from "@/lib/format";
import { NotificationsPopover } from "./notifications-popover";
import type { Hint, WeatherInfo } from "@/lib/types";

export function DashboardHeader({ weather, hints }: { weather: WeatherInfo; hints: Hint[] }) {
  const now = useClock();

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4 sm:mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {now ? greetingForHour(now.getHours()) : "Willkommen"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {now ? formatDateLong(now) : " "}
          {now && <span className="mx-1.5 text-ink-faint">·</span>}
          {now && <span className="tabular-nums">{formatClock(now)}</span>}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2.5 rounded-xl border border-line bg-surface-raised px-3.5 py-2 sm:flex">
          <Icon name={weather.icon} size={20} className="text-accent-strong" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">{weather.temperature}°C</p>
            <p className="text-[0.7rem] text-ink-muted">{weather.description}</p>
          </div>
        </div>

        <NotificationsPopover hints={hints} />

        <Link
          href="/einstellungen"
          aria-label="Einstellungen und Profil"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          <Icon name="user" size={18} />
        </Link>
      </div>
    </div>
  );
}
