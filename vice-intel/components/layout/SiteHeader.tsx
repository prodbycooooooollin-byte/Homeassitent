"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, ScanLine, Search } from "lucide-react";
import { Logo } from "./Logo";
import { DESKTOP_NAV } from "./nav";
import { openCommandPalette } from "./CommandPalette";
import { cn } from "@/lib/cn";

export function SiteHeader() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="container-page flex h-14 items-center gap-6 lg:h-16">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {DESKTOP_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={cn(
                "relative rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg",
                active(n.href) && "text-fg after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-violet-400 after:shadow-[0_0_12px_rgb(168_85_247)]",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-3 pr-2 text-sm text-fg-muted transition hover:border-violet-500/40 hover:text-fg md:flex md:w-64"
          >
            <Search className="h-4 w-4" />
            <span>Search intel…</span>
            <kbd className="ml-auto rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[11px]">⌘K</kbd>
          </button>
          <button type="button" onClick={openCommandPalette} aria-label="Search" className="rounded-xl p-2 text-fg-muted hover:bg-white/5 hover:text-fg md:hidden">
            <Search className="h-5 w-5" />
          </button>
          <Link href="/scan" className="hidden items-center gap-2 rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:bg-violet-400 lg:inline-flex">
            <ScanLine className="h-4 w-4" /> Scan
          </Link>
          <Link href="/saved" aria-label="Saved" className="hidden rounded-xl p-2 text-fg-muted hover:bg-white/5 hover:text-fg lg:inline-flex">
            <Bookmark className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
