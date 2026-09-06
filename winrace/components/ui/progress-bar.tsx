import { cn } from "@/lib/cn";

interface ProgressBarProps {
  percent: number;
  color: string;
  className?: string;
  height?: number;
}

export function ProgressBar({ percent, color, className, height = 10 }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-white/[0.06]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}
