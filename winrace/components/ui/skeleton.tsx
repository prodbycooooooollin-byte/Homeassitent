import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,#111120_25%,#1c1c30_50%,#111120_75%)] bg-[length:200%_100%]",
        className
      )}
      aria-hidden
    />
  );
}
