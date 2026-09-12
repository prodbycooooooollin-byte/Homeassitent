import { cn } from "@/lib/cn";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="pixel-corners flex h-8 w-8 items-center justify-center bg-accent-strong text-[#04140a]">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 6L8 2L14 6V14H2V6Z" fill="currentColor" opacity="0.9" />
          <rect x="6" y="9" width="4" height="5" fill="#04140a" opacity="0.35" />
        </svg>
      </div>
      <span className="text-base font-bold tracking-tight text-ink">
        Craft<span className="text-accent">board</span>
      </span>
    </div>
  );
}
