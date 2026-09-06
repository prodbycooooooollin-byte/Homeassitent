"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { LayoutDashboard, Gamepad2, Tv, BarChart3, ScrollText, Users, MonitorPlay, Settings, Eye } from "lucide-react";
import { useRoomState } from "@/lib/client/room-state-context";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { ConnectionBanner } from "@/components/ui/connection-banner";
import { ChallengeTimer } from "@/components/rooms/challenge-timer";
import { NotificationBell } from "@/components/rooms/notification-bell";
import { CHALLENGE_STATUS_COLORS, CHALLENGE_STATUS_LABELS } from "@/lib/labels";

export function DashboardChrome({ children }: { children: ReactNode }) {
  const { state, code, connectionStatus } = useRoomState();
  const pathname = usePathname();
  const base = `/rooms/${code}/dashboard`;
  const activeKey = pathname === base ? "overview" : (pathname.split("/dashboard/")[1]?.split("/")[0] ?? "overview");

  const perms = state.viewer.permissions;
  const tabs: TabItem[] = [
    { key: "overview", label: "Übersicht", href: base, icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: "challenge", label: "Challenge", href: `${base}/challenge`, icon: <Gamepad2 className="h-4 w-4" /> },
    { key: "streams", label: "Streams", href: `${base}/streams`, icon: <Tv className="h-4 w-4" /> },
    { key: "stats", label: "Statistiken", href: `${base}/stats`, icon: <BarChart3 className="h-4 w-4" /> },
    { key: "activity", label: "Aktivität", href: `${base}/activity`, icon: <ScrollText className="h-4 w-4" /> },
    { key: "members", label: "Mitglieder", href: `${base}/members`, icon: <Users className="h-4 w-4" /> },
    { key: "overlay", label: "Overlay", href: `${base}/overlay`, icon: <MonitorPlay className="h-4 w-4" />, disabled: !perms.canManageOverlay },
    { key: "settings", label: "Einstellungen", href: `${base}/settings`, icon: <Settings className="h-4 w-4" />, disabled: !perms.canManageRoom },
  ];

  return (
    <div className="min-h-dvh">
      <ConnectionBanner status={connectionStatus} />

      <header className="sticky top-0 z-30 border-b border-base-border bg-base-raised/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Avatar name={state.room.name} src={state.room.logoUrl} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base font-bold text-ink sm:text-lg">{state.room.name}</h1>
                <Badge className={CHALLENGE_STATUS_COLORS[state.challenge?.status ?? "LOBBY"]}>
                  {CHALLENGE_STATUS_LABELS[state.challenge?.status ?? "LOBBY"]}
                </Badge>
                {state.room.isDemo && <Badge className="bg-warning/15 text-warning">Demo</Badge>}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <span className="font-mono">{state.room.code}</span>
                <CopyButton value={state.room.code} label="Kopieren" className="h-6 px-2 text-[11px]" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ChallengeTimer challenge={state.challenge} />
            <NotificationBell />
            <Link href={`/rooms/${code}/live`} className="text-ink-faint hover:text-ink" title="Öffentliche Live-Ansicht öffnen">
              <Eye className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Tabs items={tabs} active={activeKey} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
