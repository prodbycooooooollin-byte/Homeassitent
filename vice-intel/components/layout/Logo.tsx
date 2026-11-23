import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" | "xl" }) {
  return (
    <Link href="/" aria-label="VICE INTEL home" className={cn("group inline-flex items-baseline gap-1.5 font-display font-extrabold italic tracking-tight", className)}>
      <span className={cn("text-fg", size === "md" && "text-xl", size === "lg" && "text-3xl", size === "xl" && "text-5xl sm:text-6xl")}>VICE</span>
      <span
        className={cn(
          "bg-gradient-to-r from-violet-400 via-violet-300 to-rose-400 bg-clip-text text-transparent",
          size === "md" && "text-xl",
          size === "lg" && "text-3xl",
          size === "xl" && "text-5xl sm:text-6xl",
        )}
      >
        INTEL
      </span>
    </Link>
  );
}
