"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Swords, LogOut, User as UserIcon, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-base-border px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Swords className="h-6 w-6 text-brand" />
          <span className="font-display text-lg font-bold tracking-wide">WinRace</span>
        </Link>
        <nav className="flex items-center gap-2">
          {status === "authenticated" ? (
            <>
              <Link href="/rooms/join">
                <Button variant="ghost" size="sm">
                  Räume
                </Button>
              </Link>
              <Link href="/archive">
                <Button variant="ghost" size="sm">
                  <Archive className="h-4 w-4" /> Archiv
                </Button>
              </Link>
              <Link href="/profile">
                <Button variant="ghost" size="sm">
                  <UserIcon className="h-4 w-4" /> {session.user?.name ?? "Profil"}
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : status === "unauthenticated" ? (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Anmelden
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Registrieren</Button>
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
