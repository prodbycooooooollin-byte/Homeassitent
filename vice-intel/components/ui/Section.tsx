import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionHeader({
  title,
  eyebrow,
  href,
  hrefLabel = "See all",
  icon,
  className,
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  hrefLabel?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="h-display flex items-center gap-2 text-lg sm:text-xl">
          {icon}
          {title}
        </h2>
      </div>
      {href ? (
        <Link href={href} className="group inline-flex items-center gap-0.5 text-sm text-fg-muted hover:text-fg">
          {hrefLabel}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

export function Panel({ title, icon, children, className, action }: { title?: string; icon?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("surface p-4 sm:p-5", className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            {icon ? <span className="text-violet-400">{icon}</span> : null}
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("surface flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 rounded-2xl bg-violet-500/10 p-3 text-violet-400">{icon}</div> : null}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children ? <div className="mt-2 max-w-md text-sm text-fg-muted">{children}</div> : null}
    </div>
  );
}
