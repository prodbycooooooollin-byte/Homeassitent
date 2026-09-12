"use client";

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { NavLinks } from "@/components/layout/nav-links";
import { LogoutForm } from "@/components/layout/logout-form";
import { ConnectionIndicator } from "@/components/layout/connection-indicator";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import type { ConnectionLevel } from "@/lib/server-context";

export function AppShell({
  user,
  connectionLevel,
  children,
}: {
  user: { displayName: string; role: Role; mcUsername?: string | null; mcUuid?: string | null };
  connectionLevel: ConnectionLevel;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-base">
      {/* Desktop-Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-base-raised md:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </div>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <PlayerAvatar username={user.mcUsername ?? user.displayName} uuid={user.mcUuid} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{user.displayName}</p>
              <p className="text-xs text-ink-muted">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <LogoutForm />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-Topbar */}
        <header className="flex items-center justify-between border-b border-line bg-base-raised px-4 py-3 md:hidden">
          <Brand />
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-ink hover:bg-surface-raised"
            aria-label="Menü öffnen"
          >
            <Menu size={22} />
          </button>
        </header>

        {/* Desktop-Topbar */}
        <header className="hidden items-center justify-end border-b border-line bg-base-raised/60 px-6 py-3 md:flex">
          <ConnectionIndicator level={connectionLevel} />
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto flex max-w-6xl flex-col gap-5">{children}</div>
        </main>
      </div>

      {/* Mobile-Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-base-raised p-4 shadow-2xl animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-ink-muted hover:bg-surface-raised"
                aria-label="Menü schließen"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mb-3">
              <ConnectionIndicator level={connectionLevel} alwaysShowLabel />
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="border-t border-line pt-3">
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <PlayerAvatar username={user.mcUsername ?? user.displayName} uuid={user.mcUuid} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{user.displayName}</p>
                  <p className="text-xs text-ink-muted">{ROLE_LABELS[user.role]}</p>
                </div>
              </div>
              <LogoutForm />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
