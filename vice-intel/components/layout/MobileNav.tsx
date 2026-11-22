"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV } from "./nav";
import { cn } from "@/lib/cn";

export function MobileNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 rounded-3xl lg:hidden"
    >
      <ul className="grid h-[var(--nav-h)] grid-cols-5 items-center">
        {MOBILE_NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const on = active(href);
          const primary = "primary" in rest && rest.primary;
          return (
            <li key={href} className="flex justify-center">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[11px] font-medium transition-colors",
                  on ? "text-violet-300" : "text-fg-faint hover:text-fg",
                )}
              >
                {primary ? (
                  <span className={cn("grid h-11 w-11 place-items-center rounded-2xl border transition", on ? "border-violet-400 bg-violet-500 text-white shadow-glow" : "border-violet-500/40 bg-violet-500/15 text-violet-300")}>
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <Icon className={cn("h-[22px] w-[22px]", on && "drop-shadow-[0_0_8px_rgb(168_85_247)]")} />
                )}
                {primary ? <span className="sr-only">{label}</span> : label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
