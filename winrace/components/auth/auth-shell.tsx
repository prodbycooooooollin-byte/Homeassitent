import Link from "next/link";
import { Swords } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-grid-fade flex min-h-dvh flex-col items-center justify-center bg-grid px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-ink">
        <Swords className="h-6 w-6 text-brand" />
        <span className="font-display text-xl font-bold tracking-wide">WinRace</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-base-border bg-base-card p-6 shadow-glow sm:p-8">
        <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-faint">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-ink-faint">{footer}</div>}
    </div>
  );
}
